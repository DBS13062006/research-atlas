-- RBAC and row-level security, tested the way the web app runs queries: SET LOCAL ROLE to the
-- caller's group role and app.user_id set to the caller. NULL from state_as means "allowed".
BEGIN;
SELECT * FROM no_plan();

-- ── The roles themselves ────────────────────────────────────────────────────────────────────
SELECT has_role('ra_app', 'the login role exists');
SELECT ok((SELECT rolcanlogin AND NOT rolinherit AND NOT rolbypassrls AND NOT rolsuper FROM pg_roles WHERE rolname = 'ra_app'),
          'ra_app can log in but has no inherited privileges, no RLS bypass and no superuser');
SELECT ok(NOT (SELECT rolcanlogin FROM pg_roles WHERE rolname = 'ra_researcher'), 'group roles cannot log in');
SELECT ok(pg_has_role('ra_admin', 'ra_anon', 'USAGE'), 'admin inherits everything down the ladder');
SELECT ok(NOT pg_has_role('ra_researcher', 'ra_curator', 'USAGE'), 'the ladder does not go upwards');
SELECT ok(pg_has_role('ra_app', 'ra_researcher', 'SET') AND NOT pg_has_role('ra_app', 'ra_researcher', 'USAGE'),
          'ra_app may SET ROLE to a group role but does not inherit from it');
SELECT is((SELECT array_agg(db_role_name::TEXT ORDER BY rank) FROM role), ARRAY['ra_researcher', 'ra_curator', 'ra_admin'],
          'every application role maps to a database role');

-- ── Anonymous ──────────────────────────────────────────────────────────────────────────────
SELECT is(ra_test.state_as('ra_anon', NULL, 'SELECT count(*) FROM paper'), NULL, 'anyone can read papers');
SELECT is(ra_test.state_as('ra_anon', NULL, 'SELECT * FROM v_paper_card LIMIT 1'), NULL, 'anyone can read paper cards');
SELECT is(ra_test.state_as('ra_anon', NULL, $$SELECT * FROM fn_search_papers('attention')$$), NULL, 'anyone can search');
SELECT is(ra_test.state_as('ra_anon', NULL, $$INSERT INTO note (user_id, paper_id, note_text) VALUES (3, 1, 'x')$$), '42501',
          'anonymous callers cannot write notes');
SELECT is(ra_test.state_as('ra_anon', NULL, 'SELECT count(*) FROM user_account'), '42501', 'anonymous callers cannot read accounts');
SELECT is(ra_test.state_as('ra_anon', NULL, 'SELECT count(*) FROM user_session'), '42501', 'nobody reads sessions directly');
SELECT is(ra_test.state_as('ra_anon', NULL, 'SELECT count(*) FROM audit_log'), '42501', 'anonymous callers cannot read the audit log');
SELECT is(ra_test.state_as('ra_anon', NULL, $$SELECT fn_record_login_success(3, repeat('f', 64), now() + INTERVAL '1 day')$$),
          '42501', 'a request role cannot mint a session');
SELECT is(ra_test.value_as('ra_anon', NULL, 'SELECT count(*) FROM note'), '1', 'anonymous callers see public notes only');
SELECT is(ra_test.value_as('ra_anon', NULL, 'SELECT string_agg(collection_name, '','') FROM collection'), 'Shared transformer picks',
          'and public collections only');
SELECT is(ra_test.value_as('ra_anon', NULL, 'SELECT count(*) FROM collection_paper'), '2', 'and the entries of public collections');

-- ── Researcher ─────────────────────────────────────────────────────────────────────────────
SELECT is(ra_test.value_as('ra_researcher', 3, 'SELECT count(*) FROM note'), '2', 'researcher 3 sees their own two notes');
SELECT is(ra_test.value_as('ra_researcher', 4, 'SELECT count(*) FROM note'), '3', 'researcher 4 sees their two notes plus one public note');
SELECT is(ra_test.value_as('ra_researcher', 4, 'SELECT count(*) FROM note WHERE user_id = 3 AND is_private'), '0',
          'another user''s private notes are invisible (RLS)');
SELECT is(ra_test.state_as('ra_researcher', 3, $$INSERT INTO note (user_id, paper_id, note_text) VALUES (3, 5, 'mine')$$), NULL,
          'a researcher writes their own note');
SELECT is(ra_test.state_as('ra_researcher', 3, $$INSERT INTO note (user_id, paper_id, note_text) VALUES (4, 5, 'forged')$$), '42501',
          'a researcher cannot write a note as someone else (WITH CHECK)');
SELECT is(ra_test.value_as('ra_researcher', 3, $$WITH u AS (UPDATE note SET note_text = 'hijack' WHERE note_id = 3 RETURNING 1)
                                                SELECT count(*) FROM u$$), '0',
          'updating another user''s note touches no rows');
SELECT is(ra_test.value_as('ra_researcher', 3, 'WITH d AS (DELETE FROM collection WHERE collection_id = 3 RETURNING 1) SELECT count(*) FROM d'),
          '0', 'deleting another user''s collection touches no rows');
SELECT is(ra_test.value_as('ra_researcher', 3, 'SELECT count(*) FROM user_account'), '1', 'a researcher sees only their own account');
SELECT is(ra_test.state_as('ra_researcher', 3, $$UPDATE user_account SET name = 'Rhea' WHERE user_id = 3$$), NULL,
          'a researcher may rename themselves');
SELECT is(ra_test.state_as('ra_researcher', 3, $$UPDATE user_account SET role_id = 3 WHERE user_id = 3$$), '42501',
          'but cannot change their own role (column privilege)');
SELECT is(ra_test.state_as('ra_researcher', 3, 'SELECT password_hash FROM user_account'), '42501',
          'nor read password hashes');
SELECT is(ra_test.state_as('ra_researcher', 3, $$INSERT INTO retraction (paper_id, retraction_date, status) VALUES (5, DATE '2025-01-01', 'RETRACTED')$$),
          '42501', 'a researcher cannot record retractions');
SELECT is(ra_test.state_as('ra_researcher', 3, $$UPDATE paper SET title = 'Vandalised' WHERE paper_id = 1$$), '42501',
          'a researcher cannot edit papers');
SELECT is(ra_test.state_as('ra_researcher', 3, $$CALL sp_import_paper('{"openalex_id": "W1", "title": "x"}', NULL)$$), '42501',
          'a researcher cannot import papers');

-- ── Curator ────────────────────────────────────────────────────────────────────────────────
SELECT is(ra_test.state_as('ra_curator', 2, $$UPDATE paper SET title = 'Corrected title' WHERE paper_id = 1$$), NULL,
          'a curator edits papers');
SELECT is(ra_test.state_as('ra_curator', 2, $$INSERT INTO paper_method (paper_id, method_id, usage_type) VALUES (14, 2, 'USED')$$), NULL,
          'a curator links methods');
SELECT is(ra_test.state_as('ra_curator', 2, $$CALL sp_import_paper('{"openalex_id": "W777", "title": "Imported by a curator"}', NULL)$$),
          NULL, 'a curator imports papers');
SELECT is(ra_test.state_as('ra_curator', 2, 'DELETE FROM paper WHERE paper_id = 30'), '42501', 'a curator cannot delete papers');
SELECT is(ra_test.state_as('ra_curator', 2, $$INSERT INTO retraction (paper_id, retraction_date, status) VALUES (5, DATE '2025-01-01', 'RETRACTED')$$),
          '42501', 'a curator cannot record retractions');
SELECT is(ra_test.state_as('ra_curator', 2, 'SELECT count(*) FROM audit_log'), '42501', 'a curator cannot read the audit log');
SELECT is(ra_test.value_as('ra_curator', 2, 'SELECT count(*) FROM note'), '1', 'a curator has no special access to private notes');

-- ── Admin ──────────────────────────────────────────────────────────────────────────────────
SELECT is(ra_test.state_as('ra_admin', 1, 'DELETE FROM paper WHERE paper_id = 30'), NULL, 'an admin deletes papers');
SELECT is(ra_test.state_as('ra_admin', 1, $$CALL sp_retract_paper(5, DATE '2025-01-01', 'CORRECTED')$$), NULL, 'an admin records retractions');
SELECT is(ra_test.value_as('ra_admin', 1, 'SELECT count(*) FROM note'), '4', 'an admin sees every note');
SELECT is(ra_test.value_as('ra_admin', 1, 'SELECT count(*) FROM user_account'), '4', 'an admin sees every account');
SELECT is(ra_test.state_as('ra_admin', 1, 'SELECT count(*) FROM audit_log'), NULL, 'an admin reads the audit log');
SELECT is(ra_test.state_as('ra_admin', 1, 'CALL sp_refresh_analytics()'), NULL, 'an admin refreshes analytics (MAINTAIN privilege)');
SELECT is(ra_test.state_as('ra_admin', 1, $$CALL sp_set_user_role(4, 'CURATOR')$$), NULL, 'an admin changes roles');
SELECT is(ra_test.state_as('ra_admin', 1, 'SELECT count(*) FROM user_session'), '42501', 'even an admin does not read raw sessions');

-- ── The viva proof ─────────────────────────────────────────────────────────────────────────
SELECT is(ra_test.value_as('ra_researcher', 4, 'SELECT count(*) FROM note WHERE user_id = 4'), '2',
          'as ra_researcher with app.user_id = 4, only that user''s notes are counted');

-- Display names for Neo4j-authored content: names only, for any caller, without opening user_account.
SELECT is(ra_test.value_as('ra_anon', NULL, 'SELECT string_agg(name, '','' ORDER BY user_id) FROM fn_user_display_names(ARRAY[3, 4]::BIGINT[])'),
          'Rhea Researcher,Ravi Researcher', 'anonymous callers can resolve author display names');
SELECT is((SELECT array_to_string(proargnames, ',') FROM pg_proc WHERE proname = 'fn_user_display_names'),
          'p_user_ids,user_id,name', 'and the function returns the id and name, never the email or role');

SELECT * FROM finish();
ROLLBACK;
