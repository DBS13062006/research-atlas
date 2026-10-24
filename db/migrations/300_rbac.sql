-- migrate:up
-- 300 · Role-based access control enforced by PostgreSQL itself.
--
-- Application roles (table `role`) map to PostgreSQL group roles via role.db_role_name. The web app
-- logs in as ra_app, which owns no privileges of its own for data (NOINHERIT): every request runs
-- in a transaction that does SET LOCAL ROLE <caller's group role> and tags app.user_id, so GRANTs
-- and row-level security decide what the request may see and change.

-- Privilege ladder: each role inherits everything below it.
GRANT ra_anon       TO ra_researcher WITH INHERIT TRUE;
GRANT ra_researcher TO ra_curator    WITH INHERIT TRUE;
GRANT ra_curator    TO ra_admin      WITH INHERIT TRUE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ra_app') THEN
    -- The password is applied from .env.local by scripts/db/migrate.ts, never stored in a migration.
    CREATE ROLE ra_app LOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;
GRANT ra_anon, ra_researcher, ra_curator, ra_admin TO ra_app WITH INHERIT FALSE, SET TRUE;

SET ROLE ra_owner;

GRANT USAGE ON SCHEMA public TO ra_anon, ra_app;

-- ── Functions: nothing is executable by PUBLIC; each grant is deliberate ────────────────────
REVOKE EXECUTE ON FUNCTION
  app_current_user_id(), fn_has_permission(BIGINT, TEXT), fn_topic_path(BIGINT), fn_topic_descendants(BIGINT),
  fn_paper_lineage(BIGINT, TEXT, INT), fn_author_h_index(BIGINT), fn_search_papers(TEXT, INT, INT),
  fn_retraction_exposure(BIGINT), fn_topic_growth(BIGINT, INT, INT), fn_auth_lookup(TEXT), fn_session_user(TEXT),
  fn_record_login_failure(BIGINT), fn_record_login_success(BIGINT, TEXT, TIMESTAMPTZ, INET, TEXT),
  fn_session_extend(TEXT, TIMESTAMPTZ), fn_session_delete(TEXT, BOOLEAN), fn_ensure_audit_partition(TIMESTAMPTZ)
FROM PUBLIC;
REVOKE EXECUTE ON PROCEDURE
  sp_register_user(TEXT, TEXT, TEXT, TEXT, BIGINT), sp_import_paper(JSONB, BIGINT),
  sp_retract_paper(BIGINT, DATE, TEXT, TEXT, TEXT), sp_merge_authors(BIGINT, BIGINT),
  sp_add_to_collection(BIGINT, BIGINT, TEXT), sp_set_user_role(BIGINT, TEXT), sp_refresh_analytics(),
  sp_purge_expired_sessions(INT)
FROM PUBLIC;

-- Read-side functions and the two credential readers are open to everyone (anonymous included).
GRANT EXECUTE ON FUNCTION
  app_current_user_id(), fn_has_permission(BIGINT, TEXT), fn_topic_path(BIGINT), fn_topic_descendants(BIGINT),
  fn_paper_lineage(BIGINT, TEXT, INT), fn_author_h_index(BIGINT), fn_search_papers(TEXT, INT, INT),
  fn_retraction_exposure(BIGINT), fn_topic_growth(BIGINT, INT, INT), fn_auth_lookup(TEXT), fn_session_user(TEXT)
TO ra_anon;
GRANT EXECUTE ON PROCEDURE sp_register_user(TEXT, TEXT, TEXT, TEXT, BIGINT) TO ra_anon;

-- Session writes belong to the authentication service only: ra_app calls them directly, outside
-- any SET ROLE, and only after it has verified the password itself. No request role can mint a session.
GRANT EXECUTE ON FUNCTION
  fn_auth_lookup(TEXT), fn_session_user(TEXT), fn_record_login_failure(BIGINT),
  fn_record_login_success(BIGINT, TEXT, TIMESTAMPTZ, INET, TEXT), fn_session_extend(TEXT, TIMESTAMPTZ),
  fn_session_delete(TEXT, BOOLEAN), app_current_user_id(), fn_has_permission(BIGINT, TEXT)
TO ra_app;
GRANT EXECUTE ON PROCEDURE sp_register_user(TEXT, TEXT, TEXT, TEXT, BIGINT) TO ra_app;

GRANT EXECUTE ON PROCEDURE sp_add_to_collection(BIGINT, BIGINT, TEXT) TO ra_researcher;
GRANT EXECUTE ON PROCEDURE sp_import_paper(JSONB, BIGINT) TO ra_curator;
GRANT EXECUTE ON PROCEDURE
  sp_retract_paper(BIGINT, DATE, TEXT, TEXT, TEXT), sp_merge_authors(BIGINT, BIGINT), sp_set_user_role(BIGINT, TEXT),
  sp_refresh_analytics(), sp_purge_expired_sessions(INT)
TO ra_admin;
GRANT EXECUTE ON FUNCTION fn_ensure_audit_partition(TIMESTAMPTZ) TO ra_admin;

-- ── ra_anon: read the catalog ───────────────────────────────────────────────────────────────
GRANT SELECT ON institution, author, venue, paper, paper_author, citation, topic, paper_topic, method,
                paper_method, dataset, paper_dataset, resource, retraction, role, permission, role_permission
TO ra_anon;
GRANT SELECT ON v_paper_card, v_retraction_exposure, mv_topic_year_stats, mv_author_stats TO ra_anon;
-- Public collections and public notes are readable by anyone; RLS filters the rest.
GRANT SELECT ON collection, collection_paper, note TO ra_anon;

-- ── ra_researcher: own collections and notes, own account ───────────────────────────────────
GRANT INSERT, UPDATE, DELETE ON collection, collection_paper, note TO ra_researcher;
GRANT SELECT ON v_my_library TO ra_researcher;
GRANT SELECT (user_id, public_id, name, email, role_id, is_active, last_login_at, created_at, updated_at)
  ON user_account TO ra_researcher;
GRANT UPDATE (name) ON user_account TO ra_researcher;

-- ── ra_curator: edit the catalog ────────────────────────────────────────────────────────────
GRANT INSERT, UPDATE ON institution, author, venue, paper, topic, method, dataset TO ra_curator;
GRANT INSERT, UPDATE, DELETE ON paper_author, citation, paper_topic, paper_method, paper_dataset, resource
TO ra_curator;

-- ── ra_admin: delete papers, manage retractions, users, audit and the outbox ────────────────
GRANT DELETE ON institution, author, venue, paper, topic, method, dataset TO ra_admin;
GRANT INSERT, UPDATE, DELETE ON retraction TO ra_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_account TO ra_admin;
GRANT INSERT, DELETE ON role_permission TO ra_admin;
GRANT SELECT ON audit_log TO ra_admin;
GRANT SELECT, UPDATE ON graph_outbox TO ra_admin;
GRANT MAINTAIN ON mv_topic_year_stats, mv_author_stats TO ra_admin;

-- ── Row-level security ─────────────────────────────────────────────────────────────────────
-- FORCE makes the policies apply to the table owner too; only ra_owner (BYPASSRLS) and the
-- SECURITY DEFINER functions it owns see every row.
ALTER TABLE note ENABLE ROW LEVEL SECURITY;
ALTER TABLE note FORCE ROW LEVEL SECURITY;
CREATE POLICY note_public_read ON note FOR SELECT TO ra_anon USING (NOT is_private);
CREATE POLICY note_owner_all ON note FOR ALL TO ra_researcher
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
CREATE POLICY note_admin_all ON note FOR ALL TO ra_admin USING (TRUE) WITH CHECK (TRUE);

ALTER TABLE collection ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection FORCE ROW LEVEL SECURITY;
CREATE POLICY collection_public_read ON collection FOR SELECT TO ra_anon USING (is_public);
CREATE POLICY collection_owner_all ON collection FOR ALL TO ra_researcher
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
CREATE POLICY collection_admin_all ON collection FOR ALL TO ra_admin USING (TRUE) WITH CHECK (TRUE);

-- An entry follows its collection: the EXISTS sub-query is itself filtered by collection's policies.
ALTER TABLE collection_paper ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_paper FORCE ROW LEVEL SECURITY;
CREATE POLICY collection_paper_public_read ON collection_paper FOR SELECT TO ra_anon
  USING (EXISTS (SELECT 1 FROM collection c WHERE c.collection_id = collection_paper.collection_id AND c.is_public));
CREATE POLICY collection_paper_owner_all ON collection_paper FOR ALL TO ra_researcher
  USING (EXISTS (SELECT 1 FROM collection c WHERE c.collection_id = collection_paper.collection_id
                 AND c.user_id = app_current_user_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM collection c WHERE c.collection_id = collection_paper.collection_id
                      AND c.user_id = app_current_user_id()));
CREATE POLICY collection_paper_admin_all ON collection_paper FOR ALL TO ra_admin USING (TRUE) WITH CHECK (TRUE);

ALTER TABLE user_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_account FORCE ROW LEVEL SECURITY;
CREATE POLICY user_account_self ON user_account FOR ALL TO ra_researcher
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
CREATE POLICY user_account_admin_all ON user_account FOR ALL TO ra_admin USING (TRUE) WITH CHECK (TRUE);

-- Sessions have no policies and no grants: only the SECURITY DEFINER auth functions reach them.
ALTER TABLE user_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_session FORCE ROW LEVEL SECURITY;

RESET ROLE;

-- migrate:down
SET ROLE ra_owner;
ALTER TABLE user_session NO FORCE ROW LEVEL SECURITY;
ALTER TABLE user_session DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_account_admin_all ON user_account;
DROP POLICY IF EXISTS user_account_self ON user_account;
ALTER TABLE user_account NO FORCE ROW LEVEL SECURITY;
ALTER TABLE user_account DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS collection_paper_admin_all ON collection_paper;
DROP POLICY IF EXISTS collection_paper_owner_all ON collection_paper;
DROP POLICY IF EXISTS collection_paper_public_read ON collection_paper;
ALTER TABLE collection_paper NO FORCE ROW LEVEL SECURITY;
ALTER TABLE collection_paper DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS collection_admin_all ON collection;
DROP POLICY IF EXISTS collection_owner_all ON collection;
DROP POLICY IF EXISTS collection_public_read ON collection;
ALTER TABLE collection NO FORCE ROW LEVEL SECURITY;
ALTER TABLE collection DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS note_admin_all ON note;
DROP POLICY IF EXISTS note_owner_all ON note;
DROP POLICY IF EXISTS note_public_read ON note;
ALTER TABLE note NO FORCE ROW LEVEL SECURITY;
ALTER TABLE note DISABLE ROW LEVEL SECURITY;
RESET ROLE;
-- Revoked as the superuser: "ALL TABLES" also matches dbmate's schema_migrations, which ra_owner does not own.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ra_anon, ra_researcher, ra_curator, ra_admin;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM ra_anon, ra_researcher, ra_curator, ra_admin, ra_app;
REVOKE ALL ON ALL PROCEDURES IN SCHEMA public FROM ra_anon, ra_researcher, ra_curator, ra_admin, ra_app;
REVOKE USAGE ON SCHEMA public FROM ra_anon, ra_app;
REVOKE ra_anon, ra_researcher, ra_curator, ra_admin FROM ra_app;
REVOKE ra_curator FROM ra_admin;
REVOKE ra_researcher FROM ra_curator;
REVOKE ra_anon FROM ra_researcher;
-- ra_app is dropped only when no other database still depends on it (see 005_owner).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ra_app')
     AND NOT EXISTS (SELECT 1 FROM pg_shdepend d JOIN pg_roles r ON r.oid = d.refobjid
                     WHERE r.rolname = 'ra_app'
                       AND d.dbid <> (SELECT oid FROM pg_database WHERE datname = current_database())) THEN
    DROP ROLE ra_app;
  END IF;
END
$$;
