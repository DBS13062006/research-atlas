-- migrate:up
-- 210 · Stored procedures. Business operations that must happen as one unit live in the database,
-- so every client (web app, API, scripts, psql) gets the same rules.
SET ROLE ra_owner;

-- Sign-up and admin user creation. Anyone may create a RESEARCHER account; creating a more
-- privileged account needs users:manage. A duplicate email raises the custom SQLSTATE RA001.
-- SECURITY DEFINER because anonymous callers have no INSERT on user_account.
CREATE PROCEDURE sp_register_user(
  p_name TEXT, p_email TEXT, p_password_hash TEXT, p_role_code TEXT DEFAULT 'RESEARCHER',
  INOUT p_user_id BIGINT DEFAULT NULL)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role_id INT;
BEGIN
  SELECT role_id INTO v_role_id FROM role WHERE role_code = upper(p_role_code);
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'unknown role %', p_role_code USING ERRCODE = '22023';
  END IF;
  IF upper(p_role_code) <> 'RESEARCHER'
     AND NOT coalesce(fn_has_permission(app_current_user_id(), 'users:manage'), FALSE) THEN
    RAISE EXCEPTION 'only an administrator can create % accounts', upper(p_role_code)
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM user_account WHERE email = p_email::CITEXT) THEN
    RAISE EXCEPTION 'an account with this email already exists'
      USING ERRCODE = 'RA001', CONSTRAINT = 'uq_user_account_email';
  END IF;
  INSERT INTO user_account (name, email, password_hash, role_id)
  VALUES (btrim(p_name), btrim(p_email), p_password_hash, v_role_id)
  RETURNING user_id INTO p_user_id;
EXCEPTION
  WHEN unique_violation THEN
    -- Two sign-ups racing for the same email: report it the same way as the check above.
    RAISE EXCEPTION 'an account with this email already exists'
      USING ERRCODE = 'RA001', CONSTRAINT = 'uq_user_account_email';
END
$$;

-- Upserts one OpenAlex work with its venue, institutions, authors, topic hierarchy, authorships,
-- topic links, resources and in-corpus citations, in a single call. Idempotent: importing the
-- same payload twice changes nothing. Payload shape is documented in scripts/ingest/transform.ts.
CREATE PROCEDURE sp_import_paper(p_payload JSONB, INOUT p_paper_id BIGINT DEFAULT NULL)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_venue_id BIGINT;
  v_doi TEXT := lower(nullif(p_payload ->> 'doi', ''));
  v_arxiv TEXT := nullif(p_payload ->> 'arxiv_id', '');
  v_action TEXT;
BEGIN
  IF coalesce(p_payload ->> 'openalex_id', '') = '' OR coalesce(btrim(p_payload ->> 'title'), '') = '' THEN
    RAISE EXCEPTION 'payload needs openalex_id and title' USING ERRCODE = '22023';
  END IF;

  -- Venue, matched on its OpenAlex id. MERGE reports whether it inserted or updated.
  IF jsonb_typeof(p_payload -> 'venue') = 'object' THEN
    MERGE INTO venue v
    USING (SELECT p_payload #>> '{venue,openalex_id}' AS openalex_id,
                  left(p_payload #>> '{venue,venue_name}', 250) AS venue_name,
                  coalesce(p_payload #>> '{venue,venue_type}', 'OTHER') AS venue_type,
                  left(p_payload #>> '{venue,publisher}', 200) AS publisher,
                  p_payload #>> '{venue,issn_l}' AS issn_l) s
    ON v.openalex_id = s.openalex_id
    WHEN MATCHED THEN
      UPDATE SET venue_name = s.venue_name, venue_type = s.venue_type,
                 publisher = coalesce(s.publisher, v.publisher)
    WHEN NOT MATCHED THEN
      INSERT (openalex_id, venue_name, venue_type, publisher, issn_l)
      VALUES (s.openalex_id, s.venue_name, s.venue_type, s.publisher,
              CASE WHEN NOT EXISTS (SELECT 1 FROM venue x WHERE x.issn_l = s.issn_l) THEN s.issn_l END)
    RETURNING v.venue_id INTO v_venue_id;
  END IF;

  -- A DOI or arXiv id already owned by a different work is dropped rather than failing the import.
  IF v_doi IS NOT NULL AND EXISTS (SELECT 1 FROM paper WHERE doi = v_doi AND openalex_id <> p_payload ->> 'openalex_id') THEN
    v_doi := NULL;
  END IF;
  IF v_arxiv IS NOT NULL AND EXISTS (SELECT 1 FROM paper WHERE arxiv_id = v_arxiv AND openalex_id <> p_payload ->> 'openalex_id') THEN
    v_arxiv := NULL;
  END IF;

  MERGE INTO paper p
  USING (SELECT p_payload ->> 'openalex_id' AS openalex_id,
                left(btrim(p_payload ->> 'title'), 1000) AS title,
                nullif(p_payload ->> 'abstract', '') AS abstract,
                (p_payload ->> 'publication_date')::DATE AS publication_date,
                coalesce(p_payload ->> 'work_type', 'ARTICLE') AS work_type,
                coalesce((p_payload ->> 'open_access')::BOOLEAN, FALSE) AS open_access,
                p_payload ->> 'oa_status' AS oa_status,
                coalesce((p_payload ->> 'cited_by_count')::INT, 0) AS cited_by_count,
                left(p_payload ->> 'paper_url', 1000) AS paper_url) s
  ON p.openalex_id = s.openalex_id
  WHEN MATCHED THEN
    UPDATE SET title = s.title, abstract = coalesce(s.abstract, p.abstract), publication_date = s.publication_date,
               venue_id = coalesce(v_venue_id, p.venue_id), work_type = s.work_type, open_access = s.open_access,
               oa_status = s.oa_status, cited_by_count = s.cited_by_count, paper_url = coalesce(s.paper_url, p.paper_url),
               doi = coalesce(v_doi, p.doi), arxiv_id = coalesce(v_arxiv, p.arxiv_id)
  WHEN NOT MATCHED THEN
    INSERT (openalex_id, doi, arxiv_id, title, abstract, publication_date, venue_id, work_type, open_access,
            oa_status, cited_by_count, paper_url)
    VALUES (s.openalex_id, v_doi, v_arxiv, s.title, s.abstract, s.publication_date, v_venue_id, s.work_type,
            s.open_access, s.oa_status, s.cited_by_count, s.paper_url)
  RETURNING p.paper_id, merge_action() INTO p_paper_id, v_action;

  -- Institutions and authors, upserted with data-modifying CTEs over jsonb_to_recordset.
  WITH a AS (
    SELECT * FROM jsonb_to_recordset(coalesce(p_payload -> 'authors', '[]'))
      AS a(openalex_id TEXT, author_name TEXT, orcid TEXT, "order" INT, is_corresponding BOOLEAN, institution JSONB)
  ), inst AS (
    SELECT DISTINCT ON (i.openalex_id) i.*
    FROM a, jsonb_to_record(a.institution)
      AS i(openalex_id TEXT, ror_id TEXT, institution_name TEXT, country_code TEXT, institution_type TEXT)
    WHERE jsonb_typeof(a.institution) = 'object' AND i.openalex_id IS NOT NULL
  )
  INSERT INTO institution (openalex_id, ror_id, institution_name, country_code, institution_type)
  SELECT inst.openalex_id,
         CASE WHEN NOT EXISTS (SELECT 1 FROM institution x WHERE x.ror_id = inst.ror_id) THEN inst.ror_id END,
         left(inst.institution_name, 200), inst.country_code, inst.institution_type
  FROM inst
  ON CONFLICT (openalex_id) DO UPDATE
    SET institution_name = EXCLUDED.institution_name,
        country_code = coalesce(EXCLUDED.country_code, institution.country_code),
        institution_type = coalesce(EXCLUDED.institution_type, institution.institution_type);

  WITH a AS (
    SELECT DISTINCT ON (x.openalex_id) x.*
    FROM jsonb_to_recordset(coalesce(p_payload -> 'authors', '[]'))
      AS x(openalex_id TEXT, author_name TEXT, orcid TEXT, "order" INT, is_corresponding BOOLEAN, institution JSONB)
    WHERE x.openalex_id IS NOT NULL
    ORDER BY x.openalex_id, x."order"
  )
  INSERT INTO author (openalex_id, orcid, author_name, institution_id)
  SELECT a.openalex_id,
         CASE WHEN NOT EXISTS (SELECT 1 FROM author y WHERE y.orcid = a.orcid) THEN a.orcid END,
         left(a.author_name, 200),
         (SELECT i.institution_id FROM institution i WHERE i.openalex_id = a.institution ->> 'openalex_id')
  FROM a
  ON CONFLICT (openalex_id) DO UPDATE
    SET author_name = EXCLUDED.author_name,
        institution_id = coalesce(EXCLUDED.institution_id, author.institution_id);

  -- Authorships are replaced wholesale; positions are renumbered 1..n in payload order.
  DELETE FROM paper_author WHERE paper_id = p_paper_id;
  INSERT INTO paper_author (paper_id, author_id, author_order, is_corresponding, affiliation_institution_id)
  SELECT p_paper_id, au.author_id, row_number() OVER (ORDER BY x."order"), coalesce(x.is_corresponding, FALSE),
         (SELECT i.institution_id FROM institution i WHERE i.openalex_id = x.institution ->> 'openalex_id')
  FROM (SELECT DISTINCT ON (r.openalex_id) r.*
        FROM jsonb_to_recordset(coalesce(p_payload -> 'authors', '[]'))
          AS r(openalex_id TEXT, "order" INT, is_corresponding BOOLEAN, institution JSONB)
        ORDER BY r.openalex_id, r."order") x
  JOIN author au ON au.openalex_id = x.openalex_id;

  -- Topic hierarchy: domain (0) → field (1) → subfield (2) → topic (3), each matched on OpenAlex id.
  INSERT INTO topic (openalex_id, topic_name, topic_level)
  SELECT DISTINCT t #>> '{domain,openalex_id}', t #>> '{domain,name}', 0
  FROM jsonb_array_elements(coalesce(p_payload -> 'topics', '[]')) t
  WHERE t #>> '{domain,openalex_id}' IS NOT NULL
  ON CONFLICT (openalex_id) DO NOTHING;
  INSERT INTO topic (openalex_id, topic_name, topic_level, parent_topic_id)
  SELECT DISTINCT t #>> '{field,openalex_id}', t #>> '{field,name}', 1, d.topic_id
  FROM jsonb_array_elements(coalesce(p_payload -> 'topics', '[]')) t
  JOIN topic d ON d.openalex_id = t #>> '{domain,openalex_id}'
  ON CONFLICT (openalex_id) DO NOTHING;
  INSERT INTO topic (openalex_id, topic_name, topic_level, parent_topic_id)
  SELECT DISTINCT t #>> '{subfield,openalex_id}', t #>> '{subfield,name}', 2, f.topic_id
  FROM jsonb_array_elements(coalesce(p_payload -> 'topics', '[]')) t
  JOIN topic f ON f.openalex_id = t #>> '{field,openalex_id}'
  ON CONFLICT (openalex_id) DO NOTHING;
  INSERT INTO topic (openalex_id, topic_name, topic_level, parent_topic_id, description)
  SELECT DISTINCT ON (t ->> 'openalex_id') t ->> 'openalex_id', left(t ->> 'topic_name', 200), 3, sf.topic_id,
         t ->> 'description'
  FROM jsonb_array_elements(coalesce(p_payload -> 'topics', '[]')) t
  JOIN topic sf ON sf.openalex_id = t #>> '{subfield,openalex_id}'
  ON CONFLICT (openalex_id) DO NOTHING;

  DELETE FROM paper_topic WHERE paper_id = p_paper_id;
  INSERT INTO paper_topic (paper_id, topic_id, relevance_score, is_primary)
  SELECT p_paper_id, tp.topic_id, least(greatest((t ->> 'score')::NUMERIC, 0), 1),
         -- exactly one primary: the payload's own flag if present, otherwise the best score
         row_number() OVER (ORDER BY coalesce((t ->> 'is_primary')::BOOLEAN, FALSE) DESC,
                                     (t ->> 'score')::NUMERIC DESC NULLS LAST) = 1
  FROM (SELECT DISTINCT ON (e ->> 'openalex_id') e AS t
        FROM jsonb_array_elements(coalesce(p_payload -> 'topics', '[]')) e) d
  JOIN topic tp ON tp.openalex_id = d.t ->> 'openalex_id';

  -- Resources (open-access PDFs, code links).
  INSERT INTO resource (paper_id, resource_type, resource_url)
  SELECT DISTINCT p_paper_id, r ->> 'resource_type', left(r ->> 'resource_url', 1000)
  FROM jsonb_array_elements(coalesce(p_payload -> 'resources', '[]')) r
  WHERE r ->> 'resource_url' ~* '^https?://'
  ON CONFLICT DO NOTHING;

  -- Citations to works already in the corpus. Works imported later are linked by the loader's
  -- second pass, which re-runs this procedure.
  INSERT INTO citation (citing_paper_id, cited_paper_id)
  SELECT p_paper_id, c.paper_id
  FROM paper c
  WHERE c.openalex_id IN (SELECT jsonb_array_elements_text(coalesce(p_payload -> 'referenced_works', '[]')))
    AND c.paper_id <> p_paper_id
  ON CONFLICT DO NOTHING;

  RAISE DEBUG 'sp_import_paper % → paper % (%)', p_payload ->> 'openalex_id', p_paper_id, v_action;
END
$$;

-- Records (or updates) a retraction. The date guard, audit and graph-outbox triggers fire on the
-- insert; the NOTICE tells the caller how much of the corpus now cites retracted work.
CREATE PROCEDURE sp_retract_paper(
  p_paper_id BIGINT, p_retraction_date DATE, p_status TEXT DEFAULT 'RETRACTED',
  p_reason TEXT DEFAULT NULL, p_notice_url TEXT DEFAULT NULL)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_exposed INT;
BEGIN
  INSERT INTO retraction (paper_id, retraction_date, status, reason, notice_url, source, recorded_by)
  VALUES (p_paper_id, p_retraction_date, p_status, p_reason, p_notice_url, 'MANUAL', app_current_user_id())
  ON CONFLICT (paper_id) DO UPDATE
    SET retraction_date = EXCLUDED.retraction_date, status = EXCLUDED.status,
        reason = coalesce(EXCLUDED.reason, retraction.reason),
        notice_url = coalesce(EXCLUDED.notice_url, retraction.notice_url),
        recorded_by = EXCLUDED.recorded_by;

  SELECT count(DISTINCT x.paper_id) INTO v_exposed
  FROM (SELECT c1.citing_paper_id AS paper_id FROM citation c1 WHERE c1.cited_paper_id = p_paper_id
        UNION
        SELECT c2.citing_paper_id FROM citation c1 JOIN citation c2 ON c2.cited_paper_id = c1.citing_paper_id
        WHERE c1.cited_paper_id = p_paper_id) x
  WHERE x.paper_id <> p_paper_id;
  RAISE NOTICE 'paper % recorded as %; % papers cite it within two hops', p_paper_id, p_status, v_exposed;
END
$$;

-- Folds a duplicate author into the canonical one. Both rows are locked FOR UPDATE in id order, so two
-- concurrent merges of the same pair cannot deadlock.
CREATE PROCEDURE sp_merge_authors(p_keep_id BIGINT, p_dup_id BIGINT)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_locked INT;
  v_dup author%ROWTYPE;
BEGIN
  IF p_keep_id = p_dup_id THEN
    RAISE EXCEPTION 'cannot merge an author into itself' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM author WHERE author_id IN (p_keep_id, p_dup_id) ORDER BY author_id FOR UPDATE;
  GET DIAGNOSTICS v_locked = ROW_COUNT;
  IF v_locked <> 2 THEN
    RAISE EXCEPTION 'both authors must exist' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_dup FROM author WHERE author_id = p_dup_id;

  -- Papers both share: the canonical authorship stays, the duplicate's is dropped.
  DELETE FROM paper_author d
  USING paper_author k
  WHERE d.author_id = p_dup_id AND k.author_id = p_keep_id AND k.paper_id = d.paper_id;
  -- Remaining papers move over keeping their author positions.
  UPDATE paper_author SET author_id = p_keep_id WHERE author_id = p_dup_id;

  -- Keep identifiers the canonical row lacks (unique columns are released from the duplicate first).
  DELETE FROM author WHERE author_id = p_dup_id;
  UPDATE author
  SET orcid = coalesce(orcid, v_dup.orcid),
      openalex_id = coalesce(openalex_id, v_dup.openalex_id),
      institution_id = coalesce(institution_id, v_dup.institution_id),
      profile_url = coalesce(profile_url, v_dup.profile_url)
  WHERE author_id = p_keep_id;
END
$$;

-- Appends a paper to the end of a collection. Ownership is proven by row-level security: a caller
-- who does not own the collection cannot see it, so the insert is rejected by its WITH CHECK policy.
CREATE PROCEDURE sp_add_to_collection(p_collection_id BIGINT, p_paper_id BIGINT, p_priority TEXT DEFAULT 'MEDIUM')
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO collection_paper (collection_id, paper_id, priority, position)
  SELECT p_collection_id, p_paper_id, upper(p_priority),
         coalesce((SELECT max(position) + 1 FROM collection_paper WHERE collection_id = p_collection_id), 0)
  ON CONFLICT (collection_id, paper_id) DO UPDATE SET priority = EXCLUDED.priority;
END
$$;

-- An administrator changes a user's role. trg_protect_last_admin refuses to demote the last admin.
CREATE PROCEDURE sp_set_user_role(p_user_id BIGINT, p_role_code TEXT)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role_id INT;
BEGIN
  IF NOT coalesce(fn_has_permission(app_current_user_id(), 'users:manage'), FALSE) THEN
    RAISE EXCEPTION 'users:manage permission required' USING ERRCODE = '42501';
  END IF;
  SELECT role_id INTO v_role_id FROM role WHERE role_code = upper(p_role_code);
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'unknown role %', p_role_code USING ERRCODE = '22023';
  END IF;
  UPDATE user_account SET role_id = v_role_id WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no user %', p_user_id USING ERRCODE = 'P0002';
  END IF;
END
$$;

-- Refreshes both materialized views without blocking readers (needs their unique indexes).
CREATE PROCEDURE sp_refresh_analytics()
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_topic_year_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_author_stats;
END
$$;

-- Deletes expired sessions and reports how many went.
CREATE PROCEDURE sp_purge_expired_sessions(INOUT p_deleted INT DEFAULT NULL)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  WITH gone AS (DELETE FROM user_session WHERE expires_at <= now() RETURNING 1)
  SELECT count(*) INTO p_deleted FROM gone;
END
$$;

RESET ROLE;

-- migrate:down
SET ROLE ra_owner;
DROP PROCEDURE IF EXISTS sp_purge_expired_sessions(INT);
DROP PROCEDURE IF EXISTS sp_refresh_analytics();
DROP PROCEDURE IF EXISTS sp_set_user_role(BIGINT, TEXT);
DROP PROCEDURE IF EXISTS sp_add_to_collection(BIGINT, BIGINT, TEXT);
DROP PROCEDURE IF EXISTS sp_merge_authors(BIGINT, BIGINT);
DROP PROCEDURE IF EXISTS sp_retract_paper(BIGINT, DATE, TEXT, TEXT, TEXT);
DROP PROCEDURE IF EXISTS sp_import_paper(JSONB, BIGINT);
DROP PROCEDURE IF EXISTS sp_register_user(TEXT, TEXT, TEXT, TEXT, BIGINT);
RESET ROLE;
