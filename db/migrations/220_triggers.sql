-- migrate:up
-- 220 · Triggers. Rules a CHECK cannot express (they read other rows or tables), derived columns,
-- the audit trail and the outbox that keeps Neo4j in step with PostgreSQL.
SET ROLE ra_owner;

-- ── trg_set_updated_at: keeps updated_at honest on every real change ─────────────────────────
CREATE FUNCTION fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON user_account
  FOR EACH ROW WHEN (OLD IS DISTINCT FROM NEW) EXECUTE FUNCTION fn_set_updated_at();
-- paper has generated columns, which a BEFORE trigger's WHEN clause may not reference.
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON paper
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON collection
  FOR EACH ROW WHEN (OLD IS DISTINCT FROM NEW) EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON note
  FOR EACH ROW WHEN (OLD IS DISTINCT FROM NEW) EXECUTE FUNCTION fn_set_updated_at();

-- ── trg_retraction_date_guard: a paper cannot be retracted before it was published ───────────
-- A CHECK constraint cannot read paper.publication_date, so this runs as a BEFORE trigger.
CREATE FUNCTION fn_retraction_date_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_published DATE;
BEGIN
  SELECT publication_date INTO v_published FROM paper WHERE paper_id = NEW.paper_id;
  IF v_published IS NOT NULL AND NEW.retraction_date < v_published THEN
    RAISE EXCEPTION 'retraction date % is before the paper''s publication date %', NEW.retraction_date, v_published
      USING ERRCODE = '23514', CONSTRAINT = 'trg_retraction_date_guard';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_retraction_date_guard BEFORE INSERT OR UPDATE OF retraction_date, paper_id ON retraction
  FOR EACH ROW EXECUTE FUNCTION fn_retraction_date_guard();

-- ── trg_topic_hierarchy_guard: no cycles, and a child is exactly one level below its parent ──
CREATE FUNCTION fn_topic_hierarchy_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_parent_level SMALLINT;
BEGIN
  -- Roots and self-parenting are left to chk_topic_only_domains_are_roots / chk_topic_not_own_parent.
  IF NEW.parent_topic_id IS NULL OR NEW.parent_topic_id = NEW.topic_id THEN
    RETURN NEW;
  END IF;
  SELECT topic_level INTO v_parent_level FROM topic WHERE topic_id = NEW.parent_topic_id;
  IF v_parent_level IS NOT NULL AND NEW.topic_level <> v_parent_level + 1 THEN
    RAISE EXCEPTION 'a level-% topic cannot sit under a level-% topic', NEW.topic_level, v_parent_level
      USING ERRCODE = '23514', CONSTRAINT = 'trg_topic_hierarchy_guard';
  END IF;
  IF TG_OP = 'UPDATE' AND EXISTS (
    WITH RECURSIVE up(topic_id, depth) AS (
      SELECT NEW.parent_topic_id, 1
      UNION ALL
      SELECT t.parent_topic_id, up.depth + 1
      FROM up JOIN topic t ON t.topic_id = up.topic_id
      WHERE t.parent_topic_id IS NOT NULL AND up.depth < 20)
    SELECT 1 FROM up WHERE up.topic_id = NEW.topic_id)
  THEN
    RAISE EXCEPTION 'topic % would become its own ancestor', NEW.topic_id
      USING ERRCODE = '23514', CONSTRAINT = 'trg_topic_hierarchy_guard';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_topic_hierarchy_guard BEFORE INSERT OR UPDATE OF parent_topic_id, topic_level ON topic
  FOR EACH ROW EXECUTE FUNCTION fn_topic_hierarchy_guard();

-- ── trg_citation_count_*: statement-level triggers with transition tables ────────────────────
-- One aggregated UPDATE per statement instead of one per row, so a bulk load of thousands of
-- citations costs a single pass. SECURITY DEFINER: the count must stay right whoever writes.
CREATE FUNCTION fn_citation_count_ins()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE paper p SET local_citation_count = p.local_citation_count + d.n
  FROM (SELECT cited_paper_id, count(*) AS n FROM new_rows GROUP BY cited_paper_id) d
  WHERE p.paper_id = d.cited_paper_id;
  RETURN NULL;
END
$$;

CREATE FUNCTION fn_citation_count_del()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE paper p SET local_citation_count = greatest(p.local_citation_count - d.n, 0)
  FROM (SELECT cited_paper_id, count(*) AS n FROM old_rows GROUP BY cited_paper_id) d
  WHERE p.paper_id = d.cited_paper_id;
  RETURN NULL;
END
$$;

CREATE FUNCTION fn_citation_count_upd()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE paper p SET local_citation_count = greatest(p.local_citation_count + d.n, 0)
  FROM (SELECT cited_paper_id, sum(n) AS n
        FROM (SELECT cited_paper_id, 1 AS n FROM new_rows
              UNION ALL
              SELECT cited_paper_id, -1 FROM old_rows) x
        GROUP BY cited_paper_id HAVING sum(n) <> 0) d
  WHERE p.paper_id = d.cited_paper_id;
  RETURN NULL;
END
$$;

CREATE TRIGGER trg_citation_count_ins AFTER INSERT ON citation
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION fn_citation_count_ins();
CREATE TRIGGER trg_citation_count_del AFTER DELETE ON citation
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION fn_citation_count_del();
CREATE TRIGGER trg_citation_count_upd AFTER UPDATE ON citation
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION fn_citation_count_upd();

-- ── trg_reading_status_read_at: read_at follows reading_status ───────────────────────────────
CREATE FUNCTION fn_reading_status_read_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.reading_status = 'READ' THEN
    IF TG_OP = 'INSERT' OR OLD.reading_status <> 'READ' OR NEW.read_at IS NULL THEN
      NEW.read_at := coalesce(NEW.read_at, now());
    END IF;
  ELSE
    NEW.read_at := NULL;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_reading_status_read_at BEFORE INSERT OR UPDATE OF reading_status ON collection_paper
  FOR EACH ROW EXECUTE FUNCTION fn_reading_status_read_at();

-- ── trg_protect_last_admin: there is always at least one active administrator ───────────────
CREATE FUNCTION fn_protect_last_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_admin_role INT := (SELECT role_id FROM role WHERE role_code = 'ADMIN');
BEGIN
  IF OLD.role_id = v_admin_role AND OLD.is_active
     AND (TG_OP = 'DELETE' OR NEW.role_id <> v_admin_role OR NOT NEW.is_active)
     AND NOT EXISTS (SELECT 1 FROM user_account
                     WHERE role_id = v_admin_role AND is_active AND user_id <> OLD.user_id)
  THEN
    RAISE EXCEPTION 'cannot remove the last active administrator'
      USING ERRCODE = 'RA002', CONSTRAINT = 'trg_protect_last_admin';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

CREATE TRIGGER trg_protect_last_admin BEFORE UPDATE OF role_id, is_active OR DELETE ON user_account
  FOR EACH ROW EXECUTE FUNCTION fn_protect_last_admin();

-- ── trg_note_owner_immutable: a note cannot be moved to another user or paper ────────────────
CREATE FUNCTION fn_note_owner_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id <> OLD.user_id OR NEW.paper_id <> OLD.paper_id THEN
    RAISE EXCEPTION 'a note cannot change owner or paper'
      USING ERRCODE = '23514', CONSTRAINT = 'trg_note_owner_immutable';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_note_owner_immutable BEFORE UPDATE OF user_id, paper_id ON note
  FOR EACH ROW EXECUTE FUNCTION fn_note_owner_immutable();

-- ── trg_audit: who changed what, with before and after images ───────────────────────────────
-- Trigger arguments name the primary-key columns. Password hashes and search vectors never reach
-- the audit trail. SECURITY DEFINER: callers have no INSERT on audit_log.
CREATE FUNCTION fn_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_old JSONB := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) - 'password_hash' - 'search_vector' END;
  v_new JSONB := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) - 'password_hash' - 'search_vector' END;
  v_pk JSONB := '{}';
  v_col TEXT;
BEGIN
  FOREACH v_col IN ARRAY TG_ARGV LOOP
    v_pk := v_pk || jsonb_build_object(v_col, coalesce(v_new, v_old) -> v_col);
  END LOOP;
  IF TG_OP = 'UPDATE' AND v_old = v_new THEN
    RETURN NULL;  -- nothing visible changed
  END IF;
  INSERT INTO audit_log (table_name, operation, row_pk, old_row, new_row, actor_user_id, db_role)
  VALUES (TG_TABLE_NAME, left(TG_OP, 1), v_pk, v_old, v_new, app_current_user_id(), session_user);
  RETURN NULL;
END
$$;

CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON paper
  FOR EACH ROW EXECUTE FUNCTION fn_audit('paper_id');
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON retraction
  FOR EACH ROW EXECUTE FUNCTION fn_audit('retraction_id');
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON user_account
  FOR EACH ROW EXECUTE FUNCTION fn_audit('user_id');
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON role_permission
  FOR EACH ROW EXECUTE FUNCTION fn_audit('role_id', 'permission_id');
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON collection
  FOR EACH ROW EXECUTE FUNCTION fn_audit('collection_id');

-- ── trg_graph_outbox: transactional outbox feeding Neo4j ─────────────────────────────────────
-- Every change to a projected catalog table writes one outbox row in the same transaction and
-- wakes the sync worker with NOTIFY. Neo4j is therefore never written directly by the app, and a
-- rolled-back transaction never reaches the graph.
CREATE FUNCTION fn_graph_outbox()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row JSONB := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_key JSONB := '{}';
  v_col TEXT;
  v_id BIGINT;
BEGIN
  FOREACH v_col IN ARRAY TG_ARGV LOOP
    v_key := v_key || jsonb_build_object(v_col, v_row -> v_col);
  END LOOP;
  IF TG_OP = 'UPDATE' AND (to_jsonb(OLD) - 'updated_at' - 'search_vector') = (to_jsonb(NEW) - 'updated_at' - 'search_vector') THEN
    RETURN NULL;
  END IF;
  INSERT INTO graph_outbox (aggregate, aggregate_key, operation, payload)
  VALUES (TG_TABLE_NAME, v_key,
          CASE WHEN TG_OP = 'DELETE' THEN 'DELETE' ELSE 'UPSERT' END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE v_row - 'abstract' - 'search_vector' END)
  RETURNING outbox_id INTO v_id;
  PERFORM pg_notify('graph_outbox', v_id::TEXT);
  RETURN NULL;
END
$$;

CREATE TRIGGER trg_graph_outbox AFTER INSERT OR UPDATE OR DELETE ON paper
  FOR EACH ROW EXECUTE FUNCTION fn_graph_outbox('paper_id');
CREATE TRIGGER trg_graph_outbox AFTER INSERT OR UPDATE OR DELETE ON author
  FOR EACH ROW EXECUTE FUNCTION fn_graph_outbox('author_id');
CREATE TRIGGER trg_graph_outbox AFTER INSERT OR UPDATE OR DELETE ON institution
  FOR EACH ROW EXECUTE FUNCTION fn_graph_outbox('institution_id');
CREATE TRIGGER trg_graph_outbox AFTER INSERT OR UPDATE OR DELETE ON venue
  FOR EACH ROW EXECUTE FUNCTION fn_graph_outbox('venue_id');
CREATE TRIGGER trg_graph_outbox AFTER INSERT OR UPDATE OR DELETE ON topic
  FOR EACH ROW EXECUTE FUNCTION fn_graph_outbox('topic_id');
CREATE TRIGGER trg_graph_outbox AFTER INSERT OR UPDATE OR DELETE ON method
  FOR EACH ROW EXECUTE FUNCTION fn_graph_outbox('method_id');
CREATE TRIGGER trg_graph_outbox AFTER INSERT OR UPDATE OR DELETE ON dataset
  FOR EACH ROW EXECUTE FUNCTION fn_graph_outbox('dataset_id');
CREATE TRIGGER trg_graph_outbox AFTER INSERT OR UPDATE OR DELETE ON paper_author
  FOR EACH ROW EXECUTE FUNCTION fn_graph_outbox('paper_id', 'author_id');
CREATE TRIGGER trg_graph_outbox AFTER INSERT OR UPDATE OR DELETE ON citation
  FOR EACH ROW EXECUTE FUNCTION fn_graph_outbox('citing_paper_id', 'cited_paper_id');
CREATE TRIGGER trg_graph_outbox AFTER INSERT OR UPDATE OR DELETE ON paper_topic
  FOR EACH ROW EXECUTE FUNCTION fn_graph_outbox('paper_id', 'topic_id');
CREATE TRIGGER trg_graph_outbox AFTER INSERT OR UPDATE OR DELETE ON paper_method
  FOR EACH ROW EXECUTE FUNCTION fn_graph_outbox('paper_id', 'method_id');
CREATE TRIGGER trg_graph_outbox AFTER INSERT OR UPDATE OR DELETE ON paper_dataset
  FOR EACH ROW EXECUTE FUNCTION fn_graph_outbox('paper_id', 'dataset_id');
CREATE TRIGGER trg_graph_outbox AFTER INSERT OR UPDATE OR DELETE ON retraction
  FOR EACH ROW EXECUTE FUNCTION fn_graph_outbox('paper_id');

RESET ROLE;

-- migrate:down
SET ROLE ra_owner;
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['paper', 'author', 'institution', 'venue', 'topic', 'method', 'dataset', 'paper_author',
                           'citation', 'paper_topic', 'paper_method', 'paper_dataset', 'retraction'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_graph_outbox ON %I', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['paper', 'retraction', 'user_account', 'role_permission', 'collection'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit ON %I', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['user_account', 'paper', 'collection', 'note'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON %I', t);
  END LOOP;
END
$$;
DROP TRIGGER IF EXISTS trg_note_owner_immutable ON note;
DROP TRIGGER IF EXISTS trg_protect_last_admin ON user_account;
DROP TRIGGER IF EXISTS trg_reading_status_read_at ON collection_paper;
DROP TRIGGER IF EXISTS trg_citation_count_upd ON citation;
DROP TRIGGER IF EXISTS trg_citation_count_del ON citation;
DROP TRIGGER IF EXISTS trg_citation_count_ins ON citation;
DROP TRIGGER IF EXISTS trg_topic_hierarchy_guard ON topic;
DROP TRIGGER IF EXISTS trg_retraction_date_guard ON retraction;
DROP FUNCTION IF EXISTS fn_graph_outbox();
DROP FUNCTION IF EXISTS fn_audit();
DROP FUNCTION IF EXISTS fn_note_owner_immutable();
DROP FUNCTION IF EXISTS fn_protect_last_admin();
DROP FUNCTION IF EXISTS fn_reading_status_read_at();
DROP FUNCTION IF EXISTS fn_citation_count_upd();
DROP FUNCTION IF EXISTS fn_citation_count_del();
DROP FUNCTION IF EXISTS fn_citation_count_ins();
DROP FUNCTION IF EXISTS fn_topic_hierarchy_guard();
DROP FUNCTION IF EXISTS fn_retraction_date_guard();
DROP FUNCTION IF EXISTS fn_set_updated_at();
RESET ROLE;
