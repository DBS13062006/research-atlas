-- migrate:up
-- 200 · Functions. Each one exists because a feature needs it; see docs/08-advanced-sql.md.
SET ROLE ra_owner;

-- The application user tagged on the current transaction by the web app
-- (SELECT set_config('app.user_id', '42', true)). NULL for anonymous requests.
CREATE FUNCTION app_current_user_id()
RETURNS BIGINT
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::BIGINT
$$;

-- Does this user's role grant this permission? A four-table join; SECURITY DEFINER because
-- row-level security hides other users' accounts from non-admins.
CREATE FUNCTION fn_has_permission(p_user_id BIGINT, p_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_account u
    JOIN role r ON r.role_id = u.role_id
    JOIN role_permission rp ON rp.role_id = r.role_id
    JOIN permission p ON p.permission_id = rp.permission_id
    WHERE u.user_id = p_user_id
      AND u.is_active
      AND p.permission_code = p_code)
$$;

-- Breadcrumb text such as "Physical Sciences › Computer Science › Artificial Intelligence".
-- Recursive CTE walking up the tree from the topic to its root domain.
CREATE FUNCTION fn_topic_path(p_topic_id BIGINT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  WITH RECURSIVE up(topic_id, topic_name, parent_topic_id, depth) AS (
    SELECT topic_id, topic_name, parent_topic_id, 0
    FROM topic WHERE topic_id = p_topic_id
    UNION ALL
    SELECT t.topic_id, t.topic_name, t.parent_topic_id, up.depth + 1
    FROM up JOIN topic t ON t.topic_id = up.parent_topic_id
    WHERE up.depth < 10
  )
  SELECT string_agg(topic_name, ' › ' ORDER BY depth DESC) FROM up
$$;

-- Every topic under p_topic_id (including itself at depth 0). Recursive CTE down the tree.
CREATE FUNCTION fn_topic_descendants(p_topic_id BIGINT)
RETURNS TABLE (topic_id BIGINT, depth INT)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  WITH RECURSIVE down(topic_id, depth) AS (
    SELECT p_topic_id, 0
    UNION ALL
    SELECT t.topic_id, down.depth + 1
    FROM down JOIN topic t ON t.parent_topic_id = down.topic_id
    WHERE down.depth < 10
  )
  SELECT down.topic_id, down.depth FROM down
$$;

-- Citation lineage of a paper. 'ancestors' follows what it cites (where the idea came from),
-- 'descendants' follows who cites it (where the idea went). Breadth-first, with the CYCLE clause
-- guarding against citation loops, and each paper reported once at its shortest depth.
CREATE FUNCTION fn_paper_lineage(p_paper_id BIGINT, p_direction TEXT DEFAULT 'ancestors', p_max_depth INT DEFAULT 3)
RETURNS TABLE (paper_id BIGINT, depth INT, path BIGINT[])
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
BEGIN
  IF p_direction = 'ancestors' THEN
    RETURN QUERY
    WITH RECURSIVE walk(paper_id, depth, path) AS (
      SELECT c.cited_paper_id, 1, ARRAY[p_paper_id]
      FROM citation c WHERE c.citing_paper_id = p_paper_id
      UNION ALL
      SELECT c.cited_paper_id, w.depth + 1, w.path || w.paper_id
      FROM walk w JOIN citation c ON c.citing_paper_id = w.paper_id
      WHERE w.depth < least(p_max_depth, 6)
    ) SEARCH BREADTH FIRST BY paper_id SET bfs_order
      CYCLE paper_id SET is_cycle USING visit_path
    SELECT DISTINCT ON (walk.paper_id) walk.paper_id, walk.depth, walk.path || walk.paper_id
    FROM walk
    WHERE NOT walk.is_cycle AND walk.paper_id <> p_paper_id
    ORDER BY walk.paper_id, walk.depth, walk.bfs_order;
  ELSIF p_direction = 'descendants' THEN
    RETURN QUERY
    WITH RECURSIVE walk(paper_id, depth, path) AS (
      SELECT c.citing_paper_id, 1, ARRAY[p_paper_id]
      FROM citation c WHERE c.cited_paper_id = p_paper_id
      UNION ALL
      SELECT c.citing_paper_id, w.depth + 1, w.path || w.paper_id
      FROM walk w JOIN citation c ON c.cited_paper_id = w.paper_id
      WHERE w.depth < least(p_max_depth, 6)
    ) SEARCH BREADTH FIRST BY paper_id SET bfs_order
      CYCLE paper_id SET is_cycle USING visit_path
    SELECT DISTINCT ON (walk.paper_id) walk.paper_id, walk.depth, walk.path || walk.paper_id
    FROM walk
    WHERE NOT walk.is_cycle AND walk.paper_id <> p_paper_id
    ORDER BY walk.paper_id, walk.depth, walk.bfs_order;
  ELSE
    RAISE EXCEPTION 'direction must be ancestors or descendants, not %', p_direction USING ERRCODE = '22023';
  END IF;
END
$$;

-- h-index: the largest h such that the author has h papers with at least h citations each.
CREATE FUNCTION fn_author_h_index(p_author_id BIGINT)
RETURNS INT
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(max(rn), 0)::INT
  FROM (SELECT p.cited_by_count,
               row_number() OVER (ORDER BY p.cited_by_count DESC) AS rn
        FROM paper_author pa JOIN paper p USING (paper_id)
        WHERE pa.author_id = p_author_id) s
  WHERE s.cited_by_count >= s.rn
$$;

-- Ranked full-text search with highlighted snippets. Falls back to trigram similarity on titles
-- when the query has no full-text hit (for typos such as "transfromer").
CREATE FUNCTION fn_search_papers(p_query TEXT, p_limit INT DEFAULT 20, p_offset INT DEFAULT 0)
RETURNS TABLE (paper_id BIGINT, title TEXT, rank REAL, headline TEXT, matched_by TEXT)
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  q TSQUERY := websearch_to_tsquery('english', p_query);
BEGIN
  RETURN QUERY
  SELECT p.paper_id, p.title::TEXT, ts_rank_cd(p.search_vector, q, 32)::REAL,
         ts_headline('english', coalesce(p.abstract, p.title), q,
                     'MaxFragments=2, MaxWords=28, MinWords=8, StartSel=<mark>, StopSel=</mark>'),
         'fulltext'::TEXT
  FROM paper p
  WHERE p.search_vector @@ q
  ORDER BY 3 DESC, p.cited_by_count DESC, p.paper_id
  LIMIT p_limit OFFSET p_offset;
  IF NOT FOUND AND p_offset = 0 THEN
    RETURN QUERY
    SELECT p.paper_id, p.title::TEXT, similarity(p.title, p_query)::REAL, p.title::TEXT, 'trigram'::TEXT
    FROM paper p
    WHERE p.title % p_query
    ORDER BY 3 DESC, p.paper_id
    LIMIT p_limit;
  END IF;
END
$$;

-- Retracted work within two citation hops of a paper: the paper cites it (1 hop) or cites a paper
-- that cites it (2 hops). Drives the Integrity Radar and "Check my library".
CREATE FUNCTION fn_retraction_exposure(p_paper_id BIGINT)
RETURNS TABLE (retracted_paper_id BIGINT, hops INT, path BIGINT[])
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  WITH RECURSIVE reach(paper_id, hops, path) AS (
    SELECT c.cited_paper_id, 1, ARRAY[p_paper_id, c.cited_paper_id]
    FROM citation c WHERE c.citing_paper_id = p_paper_id
    UNION ALL
    SELECT c.cited_paper_id, r.hops + 1, r.path || c.cited_paper_id
    FROM reach r JOIN citation c ON c.citing_paper_id = r.paper_id
    WHERE r.hops < 2 AND NOT c.cited_paper_id = ANY (r.path)
  )
  SELECT DISTINCT ON (r.paper_id) r.paper_id, r.hops, r.path
  FROM reach r
  JOIN retraction x ON x.paper_id = r.paper_id AND x.status <> 'REINSTATED'
  ORDER BY r.paper_id, r.hops
$$;

-- Papers per year in a topic's whole subtree, with year-on-year growth. generate_series fills
-- years with no papers so LAG() compares consecutive years, not consecutive rows.
CREATE FUNCTION fn_topic_growth(p_topic_id BIGINT, p_from_year INT, p_to_year INT)
RETURNS TABLE (year INT, papers BIGINT, yoy_pct NUMERIC)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  WITH counts AS (
    SELECT EXTRACT(YEAR FROM p.publication_date)::INT AS yr, count(DISTINCT p.paper_id) AS n
    FROM fn_topic_descendants(p_topic_id) d
    JOIN paper_topic pt ON pt.topic_id = d.topic_id
    JOIN paper p ON p.paper_id = pt.paper_id
    WHERE p.publication_date >= make_date(p_from_year, 1, 1)
      AND p.publication_date < make_date(p_to_year + 1, 1, 1)
    GROUP BY 1
  ), series AS (
    SELECT y.yr, coalesce(c.n, 0) AS n
    FROM generate_series(p_from_year, p_to_year) AS y(yr)
    LEFT JOIN counts c ON c.yr = y.yr
  )
  SELECT yr, n,
         CASE WHEN lag(n) OVER w > 0 THEN round(100.0 * (n - lag(n) OVER w) / lag(n) OVER w, 1) END
  FROM series
  WINDOW w AS (ORDER BY yr)
  ORDER BY yr
$$;

-- ── Authentication helpers (SECURITY DEFINER, fixed search_path) ─────────────────────────────
-- These are the only way to read credentials or sessions. Nobody is granted SELECT on
-- user_account.password_hash or on user_session; EXECUTE grants live in 300_rbac.

-- Login step 1: everything needed to verify a password, for one email address.
CREATE FUNCTION fn_auth_lookup(p_email TEXT)
RETURNS TABLE (user_id BIGINT, password_hash TEXT, is_active BOOLEAN, failed_login_count SMALLINT,
               locked_until TIMESTAMPTZ, role_code TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.user_id, u.password_hash::TEXT, u.is_active, u.failed_login_count, u.locked_until, r.role_code::TEXT
  FROM user_account u JOIN role r ON r.role_id = u.role_id
  WHERE u.email = p_email::CITEXT
$$;

-- Every request: who owns this session (by SHA-256 hash of the cookie token), if it is still valid.
CREATE FUNCTION fn_session_user(p_session_hash TEXT)
RETURNS TABLE (user_id BIGINT, public_id UUID, name TEXT, email TEXT, role_code TEXT, db_role_name TEXT,
               expires_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.user_id, u.public_id, u.name::TEXT, u.email::TEXT, r.role_code::TEXT, r.db_role_name::TEXT, s.expires_at
  FROM user_session s
  JOIN user_account u ON u.user_id = s.user_id
  JOIN role r ON r.role_id = u.role_id
  WHERE s.session_id = p_session_hash
    AND s.expires_at > now()
    AND u.is_active
$$;

-- Login step 2a: a wrong password. Five consecutive failures lock the account for 15 minutes.
CREATE FUNCTION fn_record_login_failure(p_user_id BIGINT)
RETURNS TIMESTAMPTZ
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE user_account
  SET failed_login_count = failed_login_count + 1,
      locked_until = CASE WHEN failed_login_count + 1 >= 5 THEN now() + INTERVAL '15 minutes' ELSE locked_until END
  WHERE user_id = p_user_id
  RETURNING locked_until
$$;

-- Login step 2b: the right password. Resets the counter and stores the session hash.
CREATE FUNCTION fn_record_login_success(p_user_id BIGINT, p_session_hash TEXT, p_expires_at TIMESTAMPTZ,
                                        p_ip INET DEFAULT NULL, p_user_agent TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE user_account
  SET failed_login_count = 0, locked_until = NULL, last_login_at = now()
  WHERE user_id = p_user_id;
  INSERT INTO user_session (session_id, user_id, expires_at, ip, user_agent)
  VALUES (p_session_hash, p_user_id, p_expires_at, p_ip, left(p_user_agent, 400));
$$;

-- Sliding expiry: extend a session that is still valid.
CREATE FUNCTION fn_session_extend(p_session_hash TEXT, p_expires_at TIMESTAMPTZ)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE user_session SET expires_at = p_expires_at, last_seen_at = now()
  WHERE session_id = p_session_hash AND expires_at > now()
$$;

-- Logout (one session) and "log out everywhere" (all sessions of the session's owner).
CREATE FUNCTION fn_session_delete(p_session_hash TEXT, p_everywhere BOOLEAN DEFAULT FALSE)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH target AS (SELECT user_id FROM user_session WHERE session_id = p_session_hash),
  gone AS (
    DELETE FROM user_session s
    WHERE (NOT p_everywhere AND s.session_id = p_session_hash)
       OR (p_everywhere AND s.user_id = (SELECT user_id FROM target))
    RETURNING 1)
  SELECT count(*)::INT FROM gone
$$;

RESET ROLE;

-- migrate:down
SET ROLE ra_owner;
DROP FUNCTION IF EXISTS fn_session_delete(TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS fn_session_extend(TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS fn_record_login_success(BIGINT, TEXT, TIMESTAMPTZ, INET, TEXT);
DROP FUNCTION IF EXISTS fn_record_login_failure(BIGINT);
DROP FUNCTION IF EXISTS fn_session_user(TEXT);
DROP FUNCTION IF EXISTS fn_auth_lookup(TEXT);
DROP FUNCTION IF EXISTS fn_topic_growth(BIGINT, INT, INT);
DROP FUNCTION IF EXISTS fn_retraction_exposure(BIGINT);
DROP FUNCTION IF EXISTS fn_search_papers(TEXT, INT, INT);
DROP FUNCTION IF EXISTS fn_author_h_index(BIGINT);
DROP FUNCTION IF EXISTS fn_paper_lineage(BIGINT, TEXT, INT);
DROP FUNCTION IF EXISTS fn_topic_descendants(BIGINT);
DROP FUNCTION IF EXISTS fn_topic_path(BIGINT);
DROP FUNCTION IF EXISTS fn_has_permission(BIGINT, TEXT);
DROP FUNCTION IF EXISTS app_current_user_id();
RESET ROLE;
