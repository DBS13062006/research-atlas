-- Procedure tests. sp_import_paper is exercised with three payloads: a new paper, the same paper
-- again (idempotent re-import), and a paper citing one already in the corpus.
BEGIN;
SELECT * FROM no_plan();

-- ── sp_register_user ────────────────────────────────────────────────────────────────────────
SELECT lives_ok($$CALL sp_register_user('New Researcher', 'new.researcher@atlas.test', '$argon2id$v=19$m=19456,t=2,p=1$YQ$Yg', 'RESEARCHER', NULL)$$,
                'anyone can register a researcher');
SELECT is((SELECT r.role_code FROM user_account u JOIN role r USING (role_id) WHERE u.email = 'new.researcher@atlas.test'),
          'RESEARCHER', 'the new account has the researcher role');
SELECT throws_ok($$CALL sp_register_user('Dup', 'RHEA@atlas.test', '$argon2id$x', 'RESEARCHER', NULL)$$,
                 'RA001', 'an account with this email already exists', 'a duplicate email raises the custom SQLSTATE RA001');
SELECT throws_ok($$CALL sp_register_user('Sneaky', 'sneaky@atlas.test', '$argon2id$x', 'ADMIN', NULL)$$,
                 '42501', NULL, 'an anonymous caller cannot create an admin');
SELECT set_config('app.user_id', '1', TRUE);
SELECT lives_ok($$CALL sp_register_user('Second Curator', 'curator2@atlas.test', '$argon2id$x', 'CURATOR', NULL)$$,
                'an admin can create a curator');
SELECT set_config('app.user_id', '', TRUE);

-- ── sp_import_paper ─────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE fixture (name TEXT PRIMARY KEY, payload JSONB);
INSERT INTO fixture VALUES
('new', $json${
  "openalex_id": "W900001", "doi": "10.5555/Atlas.Test.1", "title": "Spiking graph networks for event streams",
  "abstract": "We combine spiking neurons with graph attention.", "publication_date": "2025-05-01",
  "work_type": "ARTICLE", "open_access": true, "oa_status": "GOLD", "cited_by_count": 3,
  "venue": {"openalex_id": "S900", "venue_name": "Journal of Test Results", "venue_type": "JOURNAL", "publisher": "Test Press"},
  "authors": [
    {"openalex_id": "A900", "author_name": "Nina Patel", "order": 1, "is_corresponding": true,
     "institution": {"openalex_id": "I900", "institution_name": "Test University", "country_code": "IN", "institution_type": "EDUCATION"}},
    {"openalex_id": "A1", "author_name": "Asha Rao", "order": 2, "institution": {"openalex_id": "I3", "institution_name": "Indian Institute of Science"}}
  ],
  "topics": [
    {"openalex_id": "T4", "topic_name": "Spiking Neural Networks", "score": 0.97, "is_primary": true,
     "subfield": {"openalex_id": "T3", "name": "Artificial Intelligence"}, "field": {"openalex_id": "T2", "name": "Computer Science"},
     "domain": {"openalex_id": "T1", "name": "Physical Sciences"}},
    {"openalex_id": "T900", "topic_name": "Graph Neural Networks", "score": 0.81,
     "subfield": {"openalex_id": "T3", "name": "Artificial Intelligence"}, "field": {"openalex_id": "T2", "name": "Computer Science"},
     "domain": {"openalex_id": "T1", "name": "Physical Sciences"}}
  ],
  "referenced_works": ["W4", "W12", "W999999"],
  "resources": [{"resource_type": "PDF", "resource_url": "https://example.org/pdf/900001.pdf"}]
}$json$),
('citing', $json${
  "openalex_id": "W900002", "title": "Follow-up on spiking graph networks", "publication_date": "2025-09-01",
  "work_type": "PREPRINT", "open_access": true, "oa_status": "GREEN",
  "authors": [{"openalex_id": "A900", "author_name": "Nina Patel", "order": 1}],
  "topics": [], "referenced_works": ["W900001"]
}$json$);

-- CALL arguments cannot contain sub-queries, so fixtures are imported through a small wrapper.
CREATE FUNCTION pg_temp.import_fixture(p_name TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
AS $f$
DECLARE
  v_payload JSONB;
  v_id BIGINT;
BEGIN
  SELECT payload INTO v_payload FROM fixture WHERE name = p_name;
  CALL sp_import_paper(v_payload, v_id);
  RETURN v_id;
END
$f$;

SELECT lives_ok($$SELECT pg_temp.import_fixture('new')$$, 'a new work imports');
SELECT is((SELECT doi FROM paper WHERE openalex_id = 'W900001'), '10.5555/atlas.test.1', 'the DOI is stored in lower case');
SELECT is((SELECT venue_name FROM paper p JOIN venue v USING (venue_id) WHERE p.openalex_id = 'W900001'),
          'Journal of Test Results', 'its venue is created');
SELECT results_eq($$SELECT a.openalex_id::TEXT, pa.author_order::INT FROM paper p JOIN paper_author pa USING (paper_id)
                    JOIN author a USING (author_id) WHERE p.openalex_id = 'W900001' ORDER BY pa.author_order$$,
                  $$VALUES ('A900', 1), ('A1', 2)$$, 'authors are linked in order, reusing existing authors');
SELECT is((SELECT count(*)::INT FROM citation c JOIN paper p ON p.paper_id = c.citing_paper_id WHERE p.openalex_id = 'W900001'),
          2, 'only references already in the corpus become citations');
SELECT is((SELECT t.topic_name FROM paper p JOIN paper_topic pt USING (paper_id) JOIN topic t USING (topic_id)
           WHERE p.openalex_id = 'W900001' AND pt.is_primary), 'Spiking Neural Networks'::VARCHAR, 'the primary topic is set');
SELECT is((SELECT topic_level FROM topic WHERE openalex_id = 'T900'), 3::SMALLINT,
          'a new topic is created at level 3 under its subfield');
SELECT is((SELECT local_citation_count FROM paper WHERE paper_id = 12), 3, 'the cited paper''s local count went up');

CREATE TEMP TABLE counts_before AS
SELECT (SELECT count(*) FROM paper) AS papers, (SELECT count(*) FROM author) AS authors,
       (SELECT count(*) FROM paper_author) AS authorships, (SELECT count(*) FROM citation) AS citations,
       (SELECT count(*) FROM topic) AS topics, (SELECT count(*) FROM resource) AS resources;
SELECT lives_ok($$SELECT pg_temp.import_fixture('new')$$, 'the same work imports again');
SELECT results_eq(
  $$SELECT (SELECT count(*) FROM paper), (SELECT count(*) FROM author), (SELECT count(*) FROM paper_author),
           (SELECT count(*) FROM citation), (SELECT count(*) FROM topic), (SELECT count(*) FROM resource)$$,
  $$SELECT papers, authors, authorships, citations, topics, resources FROM counts_before$$,
  're-importing is idempotent: no row counts change');

SELECT lives_ok($$SELECT pg_temp.import_fixture('citing')$$,
                'a work citing the earlier import imports');
SELECT is((SELECT local_citation_count FROM paper WHERE openalex_id = 'W900001'), 1,
          'the citation to an existing paper is recorded and counted');
SELECT throws_ok($$CALL sp_import_paper('{"title": "no id"}', NULL)$$, '22023', NULL, 'a payload without an id is refused');

-- ── sp_retract_paper ────────────────────────────────────────────────────────────────────────
SELECT set_config('app.user_id', '1', TRUE);
SELECT lives_ok($$CALL sp_retract_paper(24, DATE '2025-02-01', 'RETRACTED', 'Image duplication', NULL)$$,
                'an admin records a retraction');
SELECT is((SELECT recorded_by FROM retraction WHERE paper_id = 24), 1::BIGINT, 'the retraction records who entered it');
SELECT lives_ok($$CALL sp_retract_paper(24, DATE '2025-03-01', 'REINSTATED')$$, 'calling again updates the record');
SELECT is((SELECT status FROM retraction WHERE paper_id = 24), 'REINSTATED'::VARCHAR, 'the status changed in place');
SELECT throws_ok($$CALL sp_retract_paper(24, DATE '2020-01-01')$$, '23514', NULL,
                 'the date guard trigger still applies through the procedure');
SELECT set_config('app.user_id', '', TRUE);

-- ── sp_merge_authors ────────────────────────────────────────────────────────────────────────
INSERT INTO author (author_id, author_name, orcid) OVERRIDING SYSTEM VALUE VALUES (50, 'A. Rao', '0000-0009-0000-0001');
INSERT INTO paper_author (paper_id, author_id, author_order) VALUES (3, 50, 2), (12, 50, 2);
SELECT lives_ok($$CALL sp_merge_authors(1, 50)$$, 'a duplicate author is merged into the canonical one');
SELECT is_empty($$SELECT 1 FROM author WHERE author_id = 50$$, 'the duplicate is gone');
SELECT ok(EXISTS (SELECT 1 FROM paper_author WHERE paper_id = 3 AND author_id = 1 AND author_order = 2),
          'its paper moved to the canonical author, keeping the position');
SELECT is((SELECT count(*)::INT FROM paper_author WHERE paper_id = 12 AND author_id = 1), 1,
          'on a shared paper the canonical authorship is kept once');
SELECT is((SELECT orcid FROM author WHERE author_id = 1), '0000-0001-2345-6789'::VARCHAR,
          'the canonical ORCID is not overwritten');
SELECT throws_ok($$CALL sp_merge_authors(1, 1)$$, '22023', NULL, 'an author cannot be merged into itself');

-- ── sp_add_to_collection (run as the owner, so RLS applies) ─────────────────────────────────
SELECT is(ra_test.state_as('ra_researcher', 3, $$CALL sp_add_to_collection(1, 7, 'high')$$), NULL,
          'the owner can add a paper to their collection');
SELECT is(ra_test.state_as('ra_researcher', 4, $$CALL sp_add_to_collection(1, 7, 'high')$$), '42501',
          'another researcher cannot add to it (row-level security)');
CALL sp_add_to_collection(1, 7, 'high');
SELECT is((SELECT position FROM collection_paper WHERE collection_id = 1 AND paper_id = 7), 3,
          'a new entry goes to the end of the collection');

-- ── sp_set_user_role ────────────────────────────────────────────────────────────────────────
SELECT throws_ok($$CALL sp_set_user_role(4, 'CURATOR')$$, '42501', NULL, 'changing roles needs users:manage');
SELECT set_config('app.user_id', '1', TRUE);
SELECT lives_ok($$CALL sp_set_user_role(4, 'CURATOR')$$, 'an admin promotes a researcher');
SELECT is((SELECT role_code FROM user_account JOIN role USING (role_id) WHERE user_id = 4), 'CURATOR'::VARCHAR, 'the role changed');
SELECT throws_ok($$CALL sp_set_user_role(1, 'RESEARCHER')$$, 'RA002', NULL, 'the last admin cannot be demoted');
SELECT set_config('app.user_id', '', TRUE);

-- ── sp_refresh_analytics and sp_purge_expired_sessions ──────────────────────────────────────
SELECT lives_ok($$CALL sp_refresh_analytics()$$, 'both materialized views refresh concurrently');
SELECT is((SELECT h_index FROM mv_author_stats WHERE author_id = 5), 11, 'mv_author_stats reflects the data');
INSERT INTO user_session (session_id, user_id, created_at, expires_at)
VALUES (repeat('1', 64), 3, now() - INTERVAL '40 days', now() - INTERVAL '10 days'),
       (repeat('2', 64), 3, now(), now() + INTERVAL '1 day');
CREATE TEMP TABLE purge_result (n INT);
DO $$ DECLARE n INT; BEGIN CALL sp_purge_expired_sessions(n); INSERT INTO purge_result VALUES (n); END $$;
SELECT is((SELECT n FROM purge_result), 1, 'only the expired session is purged');
SELECT ok(EXISTS (SELECT 1 FROM user_session WHERE session_id = repeat('2', 64)), 'live sessions are kept');

SELECT * FROM finish();
ROLLBACK;
