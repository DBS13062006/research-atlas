-- Constraint tests: one accept and one reject test for every named constraint, plus a meta-test
-- that fails if any constraint in the schema has no test. Runs against db/seed/test_seed.sql.
BEGIN;
SELECT * FROM no_plan();

-- ─── role ───────────────────────────────────────────────────────────────────────────────────
SELECT ra_test.accepts('a new role with a fresh code, name, db role and rank is accepted',
  $$INSERT INTO role (role_code, role_name, db_role_name, rank) VALUES ('VIEWER', 'Viewer', 'ra_viewer', 4)$$,
  'pk_role', 'uq_role_code', 'uq_role_name', 'uq_role_db_role_name', 'uq_role_rank',
  'chk_role_code_format', 'chk_role_rank_positive');
SELECT ra_test.rejects('role ids are unique',
  $$INSERT INTO role (role_id, role_code, role_name, db_role_name, rank) OVERRIDING SYSTEM VALUE
    VALUES (1, 'X', 'X', 'ra_x', 9)$$, '23505', 'pk_role');
SELECT ra_test.rejects('role codes are unique',
  $$INSERT INTO role (role_code, role_name, db_role_name, rank) VALUES ('ADMIN', 'Admin two', 'ra_x', 9)$$,
  '23505', 'uq_role_code');
SELECT ra_test.rejects('role names are unique',
  $$INSERT INTO role (role_code, role_name, db_role_name, rank) VALUES ('XX', 'Administrator', 'ra_x', 9)$$,
  '23505', 'uq_role_name');
SELECT ra_test.rejects('two roles cannot map to the same database role',
  $$INSERT INTO role (role_code, role_name, db_role_name, rank) VALUES ('XX', 'X', 'ra_admin', 9)$$,
  '23505', 'uq_role_db_role_name');
SELECT ra_test.rejects('role ranks are unique',
  $$INSERT INTO role (role_code, role_name, db_role_name, rank) VALUES ('XX', 'X', 'ra_x', 3)$$,
  '23505', 'uq_role_rank');
SELECT ra_test.rejects('role codes are upper snake case',
  $$INSERT INTO role (role_code, role_name, db_role_name, rank) VALUES ('viewer', 'X', 'ra_x', 9)$$,
  '23514', 'chk_role_code_format');
SELECT ra_test.rejects('role rank must be positive',
  $$INSERT INTO role (role_code, role_name, db_role_name, rank) VALUES ('XX', 'X', 'ra_x', 0)$$,
  '23514', 'chk_role_rank_positive');

-- ─── permission and role_permission ─────────────────────────────────────────────────────────
SELECT ra_test.accepts('a new resource:action permission is accepted',
  $$INSERT INTO permission (permission_code, description) VALUES ('venues:write', 'Edit venues')$$,
  'pk_permission', 'uq_permission_code', 'chk_permission_code_format');
SELECT ra_test.rejects('permission ids are unique',
  $$INSERT INTO permission (permission_id, permission_code) OVERRIDING SYSTEM VALUE VALUES (1, 'x:y')$$,
  '23505', 'pk_permission');
SELECT ra_test.rejects('permission codes are unique',
  $$INSERT INTO permission (permission_code) VALUES ('papers:read')$$, '23505', 'uq_permission_code');
SELECT ra_test.rejects('permission codes look like resource:action',
  $$INSERT INTO permission (permission_code) VALUES ('Papers-Read')$$, '23514', 'chk_permission_code_format');

SELECT ra_test.accepts('granting a researcher an extra permission is accepted',
  $$INSERT INTO role_permission
    SELECT r.role_id, p.permission_id FROM role r, permission p
    WHERE r.role_code = 'RESEARCHER' AND p.permission_code = 'import:run'$$,
  'pk_role_permission', 'fk_role_permission_role', 'fk_role_permission_permission');
SELECT ra_test.rejects('a role cannot hold the same permission twice',
  $$INSERT INTO role_permission
    SELECT r.role_id, p.permission_id FROM role r, permission p
    WHERE r.role_code = 'ADMIN' AND p.permission_code = 'papers:read'$$, '23505', 'pk_role_permission');
SELECT ra_test.rejects('role_permission needs an existing role',
  $$INSERT INTO role_permission VALUES (999, 1)$$, '23503', 'fk_role_permission_role');
SELECT ra_test.rejects('role_permission needs an existing permission',
  $$INSERT INTO role_permission VALUES (1, 999)$$, '23503', 'fk_role_permission_permission');

-- ─── user_account and user_session ──────────────────────────────────────────────────────────
SELECT ra_test.accepts('a well-formed account is accepted',
  $$INSERT INTO user_account (name, email, password_hash, role_id)
    VALUES ('New Person', 'new@atlas.test', '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA',
            (SELECT role_id FROM role WHERE role_code = 'RESEARCHER'))$$,
  'pk_user_account', 'uq_user_account_public_id', 'uq_user_account_email', 'fk_user_account_role',
  'chk_user_account_name_not_blank', 'chk_user_account_email_format', 'chk_user_account_password_is_argon2id',
  'chk_user_account_failed_logins_non_negative');
SELECT ra_test.rejects('user ids are unique',
  $$INSERT INTO user_account (user_id, name, email, password_hash, role_id) OVERRIDING SYSTEM VALUE
    VALUES (1, 'X', 'x@atlas.test', '$argon2id$x', 1)$$, '23505', 'pk_user_account');
SELECT ra_test.rejects('public ids are unique',
  $$INSERT INTO user_account (name, email, password_hash, role_id, public_id)
    SELECT 'X', 'x@atlas.test', '$argon2id$x', 1, public_id FROM user_account WHERE user_id = 1$$,
  '23505', 'uq_user_account_public_id');
SELECT ra_test.rejects('emails are unique regardless of case',
  $$INSERT INTO user_account (name, email, password_hash, role_id)
    VALUES ('X', 'ADMIN@Atlas.Test', '$argon2id$x', 1)$$, '23505', 'uq_user_account_email');
SELECT ra_test.rejects('accounts need an existing role',
  $$INSERT INTO user_account (name, email, password_hash, role_id)
    VALUES ('X', 'x@atlas.test', '$argon2id$x', 999)$$, '23503', 'fk_user_account_role');
SELECT ra_test.rejects('a role that still has users cannot be deleted (RESTRICT)',
  $$DELETE FROM role WHERE role_code = 'RESEARCHER'$$, '23001', 'fk_user_account_role');
SELECT ra_test.rejects('names cannot be blank',
  $$INSERT INTO user_account (name, email, password_hash, role_id) VALUES ('   ', 'x@atlas.test', '$argon2id$x', 1)$$,
  '23514', 'chk_user_account_name_not_blank');
SELECT ra_test.rejects('emails must look like emails',
  $$INSERT INTO user_account (name, email, password_hash, role_id) VALUES ('X', 'not-an-email', '$argon2id$x', 1)$$,
  '23514', 'chk_user_account_email_format');
SELECT ra_test.rejects('a plaintext password can never be stored',
  $$INSERT INTO user_account (name, email, password_hash, role_id) VALUES ('X', 'x@atlas.test', 'hunter2', 1)$$,
  '23514', 'chk_user_account_password_is_argon2id');
SELECT ra_test.rejects('failed login count cannot go negative',
  $$UPDATE user_account SET failed_login_count = -1 WHERE user_id = 3$$,
  '23514', 'chk_user_account_failed_logins_non_negative');

SELECT ra_test.accepts('a session keyed by a SHA-256 hex digest is accepted',
  $$INSERT INTO user_session (session_id, user_id, expires_at)
    VALUES (repeat('ab', 32), 3, now() + INTERVAL '30 days')$$,
  'pk_user_session', 'fk_user_session_user', 'chk_user_session_id_is_sha256_hex',
  'chk_user_session_expiry_after_creation');
SELECT ra_test.rejects('session ids are unique',
  $$INSERT INTO user_session (session_id, user_id, expires_at) VALUES
    (repeat('cd', 32), 3, now() + INTERVAL '1 day'), (repeat('cd', 32), 4, now() + INTERVAL '1 day')$$,
  '23505', 'pk_user_session');
SELECT ra_test.rejects('sessions belong to an existing user',
  $$INSERT INTO user_session (session_id, user_id, expires_at) VALUES (repeat('ab', 32), 999, now() + INTERVAL '1 day')$$,
  '23503', 'fk_user_session_user');
SELECT ra_test.rejects('the raw cookie token is never stored as a session id',
  $$INSERT INTO user_session (session_id, user_id, expires_at) VALUES (repeat('Z', 64), 3, now() + INTERVAL '1 day')$$,
  '23514', 'chk_user_session_id_is_sha256_hex');
SELECT ra_test.rejects('a session must expire after it was created',
  $$INSERT INTO user_session (session_id, user_id, expires_at) VALUES (repeat('ab', 32), 3, now() - INTERVAL '1 day')$$,
  '23514', 'chk_user_session_expiry_after_creation');

-- ─── institution, author, venue ─────────────────────────────────────────────────────────────
SELECT ra_test.accepts('a valid institution is accepted',
  $$INSERT INTO institution (openalex_id, ror_id, institution_name, country_code, institution_type)
    VALUES ('I999', 'https://ror.org/000000000', 'Test Institute', 'DE', 'FACILITY')$$,
  'pk_institution', 'uq_institution_openalex_id', 'uq_institution_ror_id', 'chk_institution_country_code',
  'chk_institution_type');
SELECT ra_test.rejects('institution ids are unique',
  $$INSERT INTO institution (institution_id, institution_name) OVERRIDING SYSTEM VALUE VALUES (1, 'X')$$,
  '23505', 'pk_institution');
SELECT ra_test.rejects('institution OpenAlex ids are unique',
  $$INSERT INTO institution (openalex_id, institution_name) VALUES ('I1', 'X')$$, '23505', 'uq_institution_openalex_id');
SELECT ra_test.rejects('ROR ids are unique',
  $$INSERT INTO institution (ror_id, institution_name) VALUES ('https://ror.org/05a28rw58', 'X')$$,
  '23505', 'uq_institution_ror_id');
SELECT ra_test.rejects('country codes are two upper-case letters',
  $$INSERT INTO institution (institution_name, country_code) VALUES ('X', 'in')$$, '23514', 'chk_institution_country_code');
SELECT ra_test.rejects('institution type comes from the closed list',
  $$INSERT INTO institution (institution_name, institution_type) VALUES ('X', 'UNIVERSITY')$$,
  '23514', 'chk_institution_type');

SELECT ra_test.accepts('a valid author with an X-checksum ORCID is accepted',
  $$INSERT INTO author (openalex_id, orcid, author_name, institution_id)
    VALUES ('A999', '0000-0002-9999-000X', 'Test Author', 1)$$,
  'pk_author', 'uq_author_openalex_id', 'uq_author_orcid', 'fk_author_institution', 'chk_author_orcid_format',
  'chk_author_name_not_blank');
SELECT ra_test.rejects('author ids are unique',
  $$INSERT INTO author (author_id, author_name) OVERRIDING SYSTEM VALUE VALUES (1, 'X')$$, '23505', 'pk_author');
SELECT ra_test.rejects('author OpenAlex ids are unique',
  $$INSERT INTO author (openalex_id, author_name) VALUES ('A1', 'X')$$, '23505', 'uq_author_openalex_id');
SELECT ra_test.rejects('ORCIDs are unique',
  $$INSERT INTO author (orcid, author_name) VALUES ('0000-0001-2345-6789', 'X')$$, '23505', 'uq_author_orcid');
SELECT ra_test.rejects('authors point at an existing institution',
  $$INSERT INTO author (author_name, institution_id) VALUES ('X', 999)$$, '23503', 'fk_author_institution');
SELECT ra_test.rejects('ORCIDs follow the 0000-0000-0000-000X pattern',
  $$INSERT INTO author (orcid, author_name) VALUES ('1234', 'X')$$, '23514', 'chk_author_orcid_format');
SELECT ra_test.rejects('author names cannot be blank',
  $$INSERT INTO author (author_name) VALUES ('')$$, '23514', 'chk_author_name_not_blank');

SELECT ra_test.accepts('a valid venue is accepted',
  $$INSERT INTO venue (openalex_id, venue_name, venue_type, issn_l) VALUES ('S999', 'Test Journal', 'JOURNAL', '1234-567X')$$,
  'pk_venue', 'uq_venue_openalex_id', 'uq_venue_issn_l', 'chk_venue_type', 'chk_venue_issn_l_format');
SELECT ra_test.rejects('venue ids are unique',
  $$INSERT INTO venue (venue_id, venue_name, venue_type) OVERRIDING SYSTEM VALUE VALUES (1, 'X', 'OTHER')$$,
  '23505', 'pk_venue');
SELECT ra_test.rejects('venue OpenAlex ids are unique',
  $$INSERT INTO venue (openalex_id, venue_name, venue_type) VALUES ('S1', 'X', 'OTHER')$$, '23505', 'uq_venue_openalex_id');
SELECT ra_test.rejects('ISSN-L values are unique',
  $$INSERT INTO venue (venue_name, venue_type, issn_l) VALUES ('X', 'JOURNAL', '2522-5839')$$, '23505', 'uq_venue_issn_l');
SELECT ra_test.rejects('venue type comes from the closed list',
  $$INSERT INTO venue (venue_name, venue_type) VALUES ('X', 'MAGAZINE')$$, '23514', 'chk_venue_type');
SELECT ra_test.rejects('ISSN-L follows the 0000-000X pattern',
  $$INSERT INTO venue (venue_name, venue_type, issn_l) VALUES ('X', 'JOURNAL', '12345678X')$$,
  '23514', 'chk_venue_issn_l_format');

-- ─── paper ──────────────────────────────────────────────────────────────────────────────────
SELECT ra_test.accepts('a fully described paper is accepted',
  $$INSERT INTO paper (openalex_id, doi, arxiv_id, title, publication_date, venue_id, work_type, open_access,
                       oa_status, cited_by_count, local_citation_count)
    VALUES ('W999', '10.1234/test.999', '2601.99999', 'A valid paper', DATE '2026-01-05', 1, 'ARTICLE', TRUE,
            'GREEN', 0, 0)$$,
  'pk_paper', 'uq_paper_openalex_id', 'uq_paper_doi', 'uq_paper_arxiv_id', 'fk_paper_venue',
  'chk_paper_title_not_blank', 'chk_paper_doi_format', 'chk_paper_doi_lowercase',
  'chk_paper_publication_date_floor', 'chk_paper_work_type', 'chk_paper_oa_status',
  'chk_paper_cited_by_count_non_negative', 'chk_paper_local_citation_count_non_negative',
  'chk_paper_oa_status_matches_flag');
SELECT ra_test.accepts('a closed paper marked not open access is accepted',
  $$INSERT INTO paper (title, open_access, oa_status) VALUES ('Closed paper', FALSE, 'CLOSED')$$,
  'chk_paper_oa_status_matches_flag');
SELECT ra_test.rejects('paper ids are unique',
  $$INSERT INTO paper (paper_id, title) OVERRIDING SYSTEM VALUE VALUES (1, 'X')$$, '23505', 'pk_paper');
SELECT ra_test.rejects('paper OpenAlex ids are unique',
  $$INSERT INTO paper (openalex_id, title) VALUES ('W1', 'X')$$, '23505', 'uq_paper_openalex_id');
SELECT ra_test.rejects('DOIs are unique',
  $$INSERT INTO paper (doi, title) VALUES ('10.3389/fnins.2015.00101', 'X')$$, '23505', 'uq_paper_doi');
SELECT ra_test.rejects('arXiv ids are unique',
  $$INSERT INTO paper (arxiv_id, title) VALUES ('1706.00001', 'X')$$, '23505', 'uq_paper_arxiv_id');
SELECT ra_test.rejects('papers point at an existing venue',
  $$INSERT INTO paper (title, venue_id) VALUES ('X', 999)$$, '23503', 'fk_paper_venue');
SELECT ra_test.rejects('titles cannot be blank',
  $$INSERT INTO paper (title) VALUES ('  ')$$, '23514', 'chk_paper_title_not_blank');
SELECT ra_test.rejects('DOIs are stored without the https://doi.org/ prefix',
  $$INSERT INTO paper (doi, title) VALUES ('https://doi.org/10.1234/abc', 'X')$$, '23514', 'chk_paper_doi_format');
SELECT ra_test.rejects('DOIs are stored in lower case',
  $$INSERT INTO paper (doi, title) VALUES ('10.1234/ABC', 'X')$$, '23514', 'chk_paper_doi_lowercase');
SELECT ra_test.rejects('nothing was published before the first journal (1665)',
  $$INSERT INTO paper (title, publication_date) VALUES ('X', DATE '1600-01-01')$$,
  '23514', 'chk_paper_publication_date_floor');
SELECT ra_test.rejects('work type comes from the closed list',
  $$INSERT INTO paper (title, work_type) VALUES ('X', 'BLOG')$$, '23514', 'chk_paper_work_type');
SELECT ra_test.rejects('open-access status comes from the closed list',
  $$INSERT INTO paper (title, open_access, oa_status) VALUES ('X', TRUE, 'PLATINUM')$$, '23514', 'chk_paper_oa_status');
SELECT ra_test.rejects('global citation count cannot be negative',
  $$INSERT INTO paper (title, cited_by_count) VALUES ('X', -1)$$, '23514', 'chk_paper_cited_by_count_non_negative');
SELECT ra_test.rejects('local citation count cannot be negative',
  $$INSERT INTO paper (title, local_citation_count) VALUES ('X', -1)$$,
  '23514', 'chk_paper_local_citation_count_non_negative');
SELECT ra_test.rejects('a GOLD paper cannot be marked closed access',
  $$INSERT INTO paper (title, open_access, oa_status) VALUES ('X', FALSE, 'GOLD')$$,
  '23514', 'chk_paper_oa_status_matches_flag');

-- ─── paper_author ───────────────────────────────────────────────────────────────────────────
SELECT ra_test.accepts('adding a second author in position 2 is accepted',
  $$INSERT INTO paper_author (paper_id, author_id, author_order, affiliation_institution_id) VALUES (3, 2, 2, 1)$$,
  'pk_paper_author', 'fk_paper_author_paper', 'fk_paper_author_author', 'fk_paper_author_institution',
  'chk_paper_author_order_positive', 'uq_paper_author_order');
SELECT ra_test.accepts('two authors can swap positions when the order check is deferred',
  $sql$DO $do$ BEGIN
      SET CONSTRAINTS uq_paper_author_order DEFERRED;
      UPDATE paper_author SET author_order = 2 WHERE paper_id = 1 AND author_id = 2;
      UPDATE paper_author SET author_order = 1 WHERE paper_id = 1 AND author_id = 6;
      SET CONSTRAINTS uq_paper_author_order IMMEDIATE;
    END $do$$sql$, 'uq_paper_author_order');
SELECT ra_test.rejects('an author is listed once per paper',
  $$INSERT INTO paper_author (paper_id, author_id, author_order) VALUES (1, 2, 9)$$, '23505', 'pk_paper_author');
SELECT ra_test.rejects('authorship needs an existing paper',
  $$INSERT INTO paper_author (paper_id, author_id, author_order) VALUES (999, 1, 1)$$, '23503', 'fk_paper_author_paper');
SELECT ra_test.rejects('authorship needs an existing author',
  $$INSERT INTO paper_author (paper_id, author_id, author_order) VALUES (1, 999, 9)$$, '23503', 'fk_paper_author_author');
SELECT ra_test.rejects('an author with papers cannot be deleted (RESTRICT)',
  $$DELETE FROM author WHERE author_id = 1$$, '23001', 'fk_paper_author_author');
SELECT ra_test.rejects('affiliation must be an existing institution',
  $$INSERT INTO paper_author (paper_id, author_id, author_order, affiliation_institution_id) VALUES (3, 2, 2, 999)$$,
  '23503', 'fk_paper_author_institution');
SELECT ra_test.rejects('author order starts at 1',
  $$INSERT INTO paper_author (paper_id, author_id, author_order) VALUES (3, 2, 0)$$,
  '23514', 'chk_paper_author_order_positive');
SELECT ra_test.rejects('two authors cannot share a position',
  $$INSERT INTO paper_author (paper_id, author_id, author_order) VALUES (1, 3, 1)$$, '23505', 'uq_paper_author_order');

-- ─── citation ───────────────────────────────────────────────────────────────────────────────
SELECT ra_test.accepts('a new citation between two papers is accepted',
  $$INSERT INTO citation (citing_paper_id, cited_paper_id) VALUES (29, 1)$$,
  'pk_citation', 'fk_citation_citing', 'fk_citation_cited', 'chk_no_self_citation');
SELECT ra_test.rejects('a citation is recorded once',
  $$INSERT INTO citation (citing_paper_id, cited_paper_id) VALUES (2, 1)$$, '23505', 'pk_citation');
SELECT ra_test.rejects('the citing paper must exist',
  $$INSERT INTO citation (citing_paper_id, cited_paper_id) VALUES (999, 1)$$, '23503', 'fk_citation_citing');
SELECT ra_test.rejects('the cited paper must exist',
  $$INSERT INTO citation (citing_paper_id, cited_paper_id) VALUES (1, 999)$$, '23503', 'fk_citation_cited');
SELECT ra_test.rejects('a paper cannot cite itself',
  $$INSERT INTO citation (citing_paper_id, cited_paper_id) VALUES (5, 5)$$, '23514', 'chk_no_self_citation');

-- ─── topic and paper_topic ──────────────────────────────────────────────────────────────────
SELECT ra_test.accepts('a new level-3 topic under a subfield is accepted',
  $$INSERT INTO topic (openalex_id, topic_name, topic_level, parent_topic_id) VALUES ('T999', 'Graph Neural Networks', 3, 3)$$,
  'pk_topic', 'uq_topic_openalex_id', 'fk_topic_parent', 'chk_topic_level_range', 'chk_topic_not_own_parent',
  'chk_topic_only_domains_are_roots', 'uq_topic_name_in_parent');
SELECT ra_test.accepts('the same topic name under a different parent is accepted',
  $$INSERT INTO topic (topic_name, topic_level, parent_topic_id) VALUES ('Object Detection', 3, 3)$$,
  'uq_topic_name_in_parent');
SELECT ra_test.rejects('topic ids are unique',
  $$INSERT INTO topic (topic_id, topic_name, topic_level) OVERRIDING SYSTEM VALUE VALUES (1, 'X', 0)$$,
  '23505', 'pk_topic');
SELECT ra_test.rejects('topic OpenAlex ids are unique',
  $$INSERT INTO topic (openalex_id, topic_name, topic_level) VALUES ('T1', 'X', 0)$$, '23505', 'uq_topic_openalex_id');
SELECT ra_test.rejects('a parent topic must exist',
  $$INSERT INTO topic (topic_name, topic_level, parent_topic_id) VALUES ('X', 3, 999)$$, '23503', 'fk_topic_parent');
SELECT ra_test.rejects('a topic with subtopics cannot be deleted (RESTRICT)',
  $$DELETE FROM topic WHERE topic_id = 3$$, '23001', 'fk_topic_parent');
SELECT ra_test.rejects('topic level is between 0 and 3',
  $$INSERT INTO topic (topic_name, topic_level, parent_topic_id) VALUES ('X', 4, 4)$$, '23514', 'chk_topic_level_range');
SELECT ra_test.rejects('a topic cannot be its own parent',
  $$UPDATE topic SET parent_topic_id = topic_id WHERE topic_id = 4$$, '23514', 'chk_topic_not_own_parent');
SELECT ra_test.rejects('only level-0 domains may be roots',
  $$INSERT INTO topic (topic_name, topic_level) VALUES ('Floating subfield', 2)$$,
  '23514', 'chk_topic_only_domains_are_roots');
SELECT ra_test.rejects('two root domains cannot share a name (NULLS NOT DISTINCT)',
  $$INSERT INTO topic (topic_name, topic_level) VALUES ('Physical Sciences', 0)$$, '23505', 'uq_topic_name_in_parent');

SELECT ra_test.accepts('linking a paper to a secondary topic is accepted',
  $$INSERT INTO paper_topic (paper_id, topic_id, relevance_score, is_primary) VALUES (3, 4, 0.25, FALSE)$$,
  'pk_paper_topic', 'fk_paper_topic_paper', 'fk_paper_topic_topic', 'chk_paper_topic_relevance_range',
  'uq_one_primary_topic');
SELECT ra_test.rejects('a paper links to a topic once',
  $$INSERT INTO paper_topic (paper_id, topic_id) VALUES (3, 5)$$, '23505', 'pk_paper_topic');
SELECT ra_test.rejects('topic links need an existing paper',
  $$INSERT INTO paper_topic (paper_id, topic_id) VALUES (999, 5)$$, '23503', 'fk_paper_topic_paper');
SELECT ra_test.rejects('topic links need an existing topic',
  $$INSERT INTO paper_topic (paper_id, topic_id) VALUES (3, 999)$$, '23503', 'fk_paper_topic_topic');
SELECT ra_test.rejects('a topic still linked to papers cannot be deleted (RESTRICT)',
  $$DELETE FROM topic WHERE topic_id = 11$$, '23001', 'fk_paper_topic_topic');
SELECT ra_test.rejects('relevance is a score between 0 and 1',
  $$INSERT INTO paper_topic (paper_id, topic_id, relevance_score) VALUES (3, 4, 1.5)$$,
  '23514', 'chk_paper_topic_relevance_range');
SELECT ra_test.rejects('a paper has at most one primary topic',
  $$INSERT INTO paper_topic (paper_id, topic_id, is_primary) VALUES (3, 4, TRUE)$$, '23505', 'uq_one_primary_topic');

-- ─── method, dataset and their links ────────────────────────────────────────────────────────
SELECT ra_test.accepts('a new method is accepted',
  $$INSERT INTO method (method_name, method_category, introduced_year, pwc_slug) VALUES ('Graph Attention', 'Graphs', 2018, 'gat')$$,
  'pk_method', 'uq_method_name', 'uq_method_pwc_slug', 'chk_method_introduced_year');
SELECT ra_test.rejects('method ids are unique',
  $$INSERT INTO method (method_id, method_name) OVERRIDING SYSTEM VALUE VALUES (1, 'X')$$, '23505', 'pk_method');
SELECT ra_test.rejects('method names are unique',
  $$INSERT INTO method (method_name) VALUES ('LSTM')$$, '23505', 'uq_method_name');
SELECT ra_test.rejects('method slugs are unique',
  $$INSERT INTO method (method_name, pwc_slug) VALUES ('X', 'lstm')$$, '23505', 'uq_method_pwc_slug');
SELECT ra_test.rejects('introduced year is plausible',
  $$INSERT INTO method (method_name, introduced_year) VALUES ('X', 1800)$$, '23514', 'chk_method_introduced_year');

SELECT ra_test.accepts('linking a paper to a method is accepted',
  $$INSERT INTO paper_method (paper_id, method_id, usage_type) VALUES (14, 2, 'COMPARED')$$,
  'pk_paper_method', 'fk_paper_method_paper', 'fk_paper_method_method', 'chk_paper_method_usage_type');
SELECT ra_test.rejects('a paper links to a method once',
  $$INSERT INTO paper_method (paper_id, method_id, usage_type) VALUES (2, 1, 'USED')$$, '23505', 'pk_paper_method');
SELECT ra_test.rejects('method links need an existing paper',
  $$INSERT INTO paper_method (paper_id, method_id, usage_type) VALUES (999, 1, 'USED')$$, '23503', 'fk_paper_method_paper');
SELECT ra_test.rejects('method links need an existing method',
  $$INSERT INTO paper_method (paper_id, method_id, usage_type) VALUES (1, 999, 'USED')$$, '23503', 'fk_paper_method_method');
SELECT ra_test.rejects('a method still used by papers cannot be deleted (RESTRICT)',
  $$DELETE FROM method WHERE method_id = 1$$, '23001', 'fk_paper_method_method');
SELECT ra_test.rejects('method usage comes from the closed list',
  $$INSERT INTO paper_method (paper_id, method_id, usage_type) VALUES (1, 2, 'INSPIRED')$$,
  '23514', 'chk_paper_method_usage_type');

SELECT ra_test.accepts('a new dataset is accepted',
  $$INSERT INTO dataset (dataset_name, modality, domain, pwc_slug) VALUES ('COCO', 'Images', 'Computer vision', 'coco')$$,
  'pk_dataset', 'uq_dataset_name', 'uq_dataset_pwc_slug');
SELECT ra_test.rejects('dataset ids are unique',
  $$INSERT INTO dataset (dataset_id, dataset_name) OVERRIDING SYSTEM VALUE VALUES (1, 'X')$$, '23505', 'pk_dataset');
SELECT ra_test.rejects('dataset names are unique',
  $$INSERT INTO dataset (dataset_name) VALUES ('ImageNet')$$, '23505', 'uq_dataset_name');
SELECT ra_test.rejects('dataset slugs are unique',
  $$INSERT INTO dataset (dataset_name, pwc_slug) VALUES ('X', 'imagenet')$$, '23505', 'uq_dataset_pwc_slug');

SELECT ra_test.accepts('linking a paper to a dataset is accepted',
  $$INSERT INTO paper_dataset (paper_id, dataset_id, usage_type) VALUES (6, 1, 'TRAINING')$$,
  'pk_paper_dataset', 'fk_paper_dataset_paper', 'fk_paper_dataset_dataset', 'chk_paper_dataset_usage_type');
SELECT ra_test.rejects('a paper links to a dataset once',
  $$INSERT INTO paper_dataset (paper_id, dataset_id, usage_type) VALUES (4, 3, 'TESTING')$$, '23505', 'pk_paper_dataset');
SELECT ra_test.rejects('dataset links need an existing paper',
  $$INSERT INTO paper_dataset (paper_id, dataset_id, usage_type) VALUES (999, 1, 'TESTING')$$,
  '23503', 'fk_paper_dataset_paper');
SELECT ra_test.rejects('dataset links need an existing dataset',
  $$INSERT INTO paper_dataset (paper_id, dataset_id, usage_type) VALUES (1, 999, 'TESTING')$$,
  '23503', 'fk_paper_dataset_dataset');
SELECT ra_test.rejects('a dataset still used by papers cannot be deleted (RESTRICT)',
  $$DELETE FROM dataset WHERE dataset_id = 1$$, '23001', 'fk_paper_dataset_dataset');
SELECT ra_test.rejects('dataset usage comes from the closed list',
  $$INSERT INTO paper_dataset (paper_id, dataset_id, usage_type) VALUES (1, 1, 'PLAYING')$$,
  '23514', 'chk_paper_dataset_usage_type');

-- ─── resource and retraction ────────────────────────────────────────────────────────────────
SELECT ra_test.accepts('a code link for a paper is accepted',
  $$INSERT INTO resource (paper_id, resource_type, resource_url) VALUES (11, 'CODE', 'https://github.com/example/vit')$$,
  'pk_resource', 'fk_resource_paper', 'uq_resource_per_paper', 'chk_resource_type', 'chk_resource_url_is_http');
SELECT ra_test.rejects('resource ids are unique',
  $$INSERT INTO resource (resource_id, paper_id, resource_type, resource_url) OVERRIDING SYSTEM VALUE
    SELECT resource_id, 1, 'OTHER', 'https://x.org' FROM resource LIMIT 1$$, '23505', 'pk_resource');
SELECT ra_test.rejects('resources belong to an existing paper',
  $$INSERT INTO resource (paper_id, resource_type, resource_url) VALUES (999, 'PDF', 'https://x.org/a.pdf')$$,
  '23503', 'fk_resource_paper');
SELECT ra_test.rejects('the same link is not stored twice for a paper',
  $$INSERT INTO resource (paper_id, resource_type, resource_url) VALUES (3, 'CODE', 'https://github.com/example/attention')$$,
  '23505', 'uq_resource_per_paper');
SELECT ra_test.rejects('resource type comes from the closed list',
  $$INSERT INTO resource (paper_id, resource_type, resource_url) VALUES (1, 'TWEET', 'https://x.org')$$,
  '23514', 'chk_resource_type');
SELECT ra_test.rejects('resource links must be http(s)',
  $$INSERT INTO resource (paper_id, resource_type, resource_url) VALUES (1, 'PDF', 'ftp://x.org/a.pdf')$$,
  '23514', 'chk_resource_url_is_http');

SELECT ra_test.accepts('a retraction recorded by an admin is accepted',
  $$INSERT INTO retraction (paper_id, retraction_date, status, source, rw_record_id, recorded_by)
    VALUES (24, DATE '2025-01-01', 'EXPRESSION_OF_CONCERN', 'RETRACTION_WATCH', 12345, 1)$$,
  'pk_retraction', 'uq_retraction_paper', 'uq_retraction_rw_record_id', 'fk_retraction_paper',
  'fk_retraction_recorded_by', 'chk_retraction_status', 'chk_retraction_source');
SELECT ra_test.rejects('retraction ids are unique',
  $$INSERT INTO retraction (retraction_id, paper_id, retraction_date, status) OVERRIDING SYSTEM VALUE
    SELECT retraction_id, 24, DATE '2025-01-01', 'RETRACTED' FROM retraction LIMIT 1$$, '23505', 'pk_retraction');
SELECT ra_test.rejects('a paper has at most one retraction record',
  $$INSERT INTO retraction (paper_id, retraction_date, status) VALUES (22, DATE '2025-01-01', 'CORRECTED')$$,
  '23505', 'uq_retraction_paper');
SELECT ra_test.rejects('Retraction Watch record ids are unique',
  $$INSERT INTO retraction (paper_id, retraction_date, status, rw_record_id) VALUES
    (24, DATE '2025-01-01', 'RETRACTED', 7), (27, DATE '2025-01-01', 'RETRACTED', 7)$$,
  '23505', 'uq_retraction_rw_record_id');
SELECT ra_test.rejects('retractions belong to an existing paper',
  $$INSERT INTO retraction (paper_id, retraction_date, status) VALUES (999, DATE '2025-01-01', 'RETRACTED')$$,
  '23503', 'fk_retraction_paper');
SELECT ra_test.rejects('recorded_by is an existing user',
  $$INSERT INTO retraction (paper_id, retraction_date, status, recorded_by) VALUES (24, DATE '2025-01-01', 'RETRACTED', 999)$$,
  '23503', 'fk_retraction_recorded_by');
SELECT ra_test.rejects('retraction status comes from the closed list',
  $$INSERT INTO retraction (paper_id, retraction_date, status) VALUES (24, DATE '2025-01-01', 'WITHDRAWN')$$,
  '23514', 'chk_retraction_status');
SELECT ra_test.rejects('retraction source comes from the closed list',
  $$INSERT INTO retraction (paper_id, retraction_date, status, source) VALUES (24, DATE '2025-01-01', 'RETRACTED', 'TWITTER')$$,
  '23514', 'chk_retraction_source');

-- ─── collection, collection_paper, note ─────────────────────────────────────────────────────
SELECT ra_test.accepts('a new collection is accepted',
  $$INSERT INTO collection (user_id, collection_name, is_public) VALUES (4, 'Vision papers', TRUE)$$,
  'pk_collection', 'uq_collection_public_id', 'fk_collection_user', 'chk_collection_name_not_blank',
  'uq_user_collection_name');
SELECT ra_test.accepts('two users may use the same collection name',
  $$INSERT INTO collection (user_id, collection_name) VALUES (4, 'Spiking reading list')$$, 'uq_user_collection_name');
SELECT ra_test.rejects('collection ids are unique',
  $$INSERT INTO collection (collection_id, user_id, collection_name) OVERRIDING SYSTEM VALUE VALUES (1, 4, 'X')$$,
  '23505', 'pk_collection');
SELECT ra_test.rejects('collection public ids are unique',
  $$INSERT INTO collection (user_id, collection_name, public_id) SELECT 4, 'X', public_id FROM collection WHERE collection_id = 1$$,
  '23505', 'uq_collection_public_id');
SELECT ra_test.rejects('collections belong to an existing user',
  $$INSERT INTO collection (user_id, collection_name) VALUES (999, 'X')$$, '23503', 'fk_collection_user');
SELECT ra_test.rejects('collection names cannot be blank',
  $$INSERT INTO collection (user_id, collection_name) VALUES (4, ' ')$$, '23514', 'chk_collection_name_not_blank');
SELECT ra_test.rejects('a user cannot have two collections with the same name',
  $$INSERT INTO collection (user_id, collection_name) VALUES (3, 'Spiking reading list')$$,
  '23505', 'uq_user_collection_name');

SELECT ra_test.accepts('adding a paper to a collection is accepted',
  $$INSERT INTO collection_paper (collection_id, paper_id, reading_status, priority, position, read_at)
    VALUES (1, 7, 'READ', 'LOW', 3, now())$$,
  'pk_collection_paper', 'fk_collection_paper_collection', 'fk_collection_paper_paper',
  'chk_collection_paper_reading_status', 'chk_collection_paper_priority', 'chk_collection_paper_position_non_negative',
  'chk_collection_paper_read_at_matches_status');
SELECT ra_test.rejects('a paper appears once per collection',
  $$INSERT INTO collection_paper (collection_id, paper_id) VALUES (1, 4)$$, '23505', 'pk_collection_paper');
SELECT ra_test.rejects('collection entries need an existing collection',
  $$INSERT INTO collection_paper (collection_id, paper_id) VALUES (999, 4)$$, '23503', 'fk_collection_paper_collection');
SELECT ra_test.rejects('collection entries need an existing paper',
  $$INSERT INTO collection_paper (collection_id, paper_id) VALUES (1, 999)$$, '23503', 'fk_collection_paper_paper');
SELECT ra_test.rejects('reading status uses the canonical vocabulary',
  $$INSERT INTO collection_paper (collection_id, paper_id, reading_status) VALUES (1, 7, 'Not Read')$$,
  '23514', 'chk_collection_paper_reading_status');
SELECT ra_test.rejects('priority uses the canonical vocabulary',
  $$INSERT INTO collection_paper (collection_id, paper_id, priority) VALUES (1, 7, 'URGENT')$$,
  '23514', 'chk_collection_paper_priority');
SELECT ra_test.rejects('positions are not negative',
  $$INSERT INTO collection_paper (collection_id, paper_id, position) VALUES (1, 7, -1)$$,
  '23514', 'chk_collection_paper_position_non_negative');
SELECT ra_test.rejects('a READ entry must keep its read_at timestamp',
  $$UPDATE collection_paper SET read_at = NULL WHERE collection_id = 1 AND paper_id = 4$$,
  '23514', 'chk_collection_paper_read_at_matches_status');

SELECT ra_test.accepts('a note on a paper is accepted',
  $$INSERT INTO note (user_id, paper_id, note_text) VALUES (3, 7, 'Temporal coding idea worth testing')$$,
  'pk_note', 'fk_note_user', 'fk_note_paper', 'chk_note_text_length', 'chk_note_updated_after_created');
SELECT ra_test.rejects('note ids are unique',
  $$INSERT INTO note (note_id, user_id, paper_id, note_text) OVERRIDING SYSTEM VALUE VALUES (1, 3, 7, 'x')$$,
  '23505', 'pk_note');
SELECT ra_test.rejects('notes belong to an existing user',
  $$INSERT INTO note (user_id, paper_id, note_text) VALUES (999, 7, 'x')$$, '23503', 'fk_note_user');
SELECT ra_test.rejects('notes annotate an existing paper',
  $$INSERT INTO note (user_id, paper_id, note_text) VALUES (3, 999, 'x')$$, '23503', 'fk_note_paper');
SELECT ra_test.rejects('notes cannot be empty',
  $$INSERT INTO note (user_id, paper_id, note_text) VALUES (3, 7, '   ')$$, '23514', 'chk_note_text_length');
SELECT ra_test.rejects('a note cannot be updated before it was created',
  $$INSERT INTO note (user_id, paper_id, note_text, created_at, updated_at)
    VALUES (3, 7, 'x', TIMESTAMPTZ '2026-01-02', TIMESTAMPTZ '2026-01-01')$$,
  '23514', 'chk_note_updated_after_created');

-- ─── audit_log and graph_outbox ─────────────────────────────────────────────────────────────
SELECT ra_test.accepts('an audit row is accepted',
  $$INSERT INTO audit_log (table_name, operation, row_pk) VALUES ('paper', 'U', '{"paper_id": 1}')$$,
  'pk_audit_log', 'chk_audit_log_operation');
SELECT ra_test.rejects('audit ids are unique within a timestamp',
  $$INSERT INTO audit_log (audit_id, occurred_at, table_name, operation, row_pk) OVERRIDING SYSTEM VALUE VALUES
    (1, TIMESTAMPTZ '2026-10-01', 'paper', 'I', '{}'), (1, TIMESTAMPTZ '2026-10-01', 'paper', 'I', '{}')$$,
  '23505', 'pk_audit_log', 'audit_log_%_pkey');
SELECT ra_test.rejects('audit operation is I, U or D',
  $$INSERT INTO audit_log (table_name, operation, row_pk) VALUES ('paper', 'X', '{}')$$, '23514', 'chk_audit_log_operation');

SELECT ra_test.accepts('an outbox row is accepted',
  $$INSERT INTO graph_outbox (aggregate, aggregate_key, operation, payload) VALUES ('paper', '{"paper_id": 1}', 'UPSERT', '{}')$$,
  'pk_graph_outbox', 'chk_graph_outbox_operation', 'chk_graph_outbox_attempts_non_negative');
SELECT ra_test.rejects('outbox ids are unique',
  $$INSERT INTO graph_outbox (outbox_id, aggregate, aggregate_key, operation) OVERRIDING SYSTEM VALUE VALUES
    (1, 'paper', '{}', 'UPSERT'), (1, 'paper', '{}', 'UPSERT')$$, '23505', 'pk_graph_outbox');
SELECT ra_test.rejects('outbox operation is UPSERT or DELETE',
  $$INSERT INTO graph_outbox (aggregate, aggregate_key, operation) VALUES ('paper', '{}', 'MERGE')$$,
  '23514', 'chk_graph_outbox_operation');
SELECT ra_test.rejects('outbox attempts cannot be negative',
  $$INSERT INTO graph_outbox (aggregate, aggregate_key, operation, attempts) VALUES ('paper', '{}', 'UPSERT', -1)$$,
  '23514', 'chk_graph_outbox_attempts_non_negative');

-- ─── Delete rules ───────────────────────────────────────────────────────────────────────────
SELECT ra_test.accepts('deleting a venue keeps its papers (SET NULL)',
  $sql$DO $do$ BEGIN
      DELETE FROM venue WHERE venue_id = 3;
      IF EXISTS (SELECT 1 FROM paper WHERE venue_id = 3) OR NOT EXISTS (SELECT 1 FROM paper WHERE paper_id = 2) THEN
        RAISE EXCEPTION 'venue delete did not SET NULL';
      END IF;
    END $do$$sql$, 'fk_paper_venue');
SELECT ra_test.accepts('deleting a paper cascades to its links',
  $sql$DO $do$ BEGIN
      DELETE FROM paper WHERE paper_id = 12;
      IF EXISTS (SELECT 1 FROM citation WHERE 12 IN (citing_paper_id, cited_paper_id))
         OR EXISTS (SELECT 1 FROM paper_author WHERE paper_id = 12)
         OR EXISTS (SELECT 1 FROM note WHERE paper_id = 12)
         OR EXISTS (SELECT 1 FROM collection_paper WHERE paper_id = 12) THEN
        RAISE EXCEPTION 'paper delete did not cascade';
      END IF;
    END $do$$sql$, 'fk_citation_citing', 'fk_citation_cited', 'fk_paper_author_paper', 'fk_note_paper');

-- ─── Coverage meta-test ─────────────────────────────────────────────────────────────────────
-- Every PK, UNIQUE, FK and CHECK constraint (and every standalone unique index) in the schema must
-- have both an accept and a reject test above.
SELECT is_empty(
  $$
  WITH named AS (
    SELECT c.conname::TEXT AS name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND c.contype IN ('p', 'u', 'f', 'c', 'x')
      AND NOT t.relispartition AND t.relname <> 'schema_migrations'
    UNION
    SELECT i.relname::TEXT
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND x.indisunique AND NOT t.relispartition AND t.relkind IN ('r', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = x.indexrelid)
  )
  SELECT name || ' (' || k.kind || ')'
  FROM named CROSS JOIN (VALUES ('accept'), ('reject')) AS k(kind)
  WHERE NOT EXISTS (SELECT 1 FROM ra_test.covered v WHERE v.constraint_name = named.name AND v.kind = k.kind)
  ORDER BY 1
  $$,
  'every named constraint has an accept and a reject test');

SELECT * FROM finish();
ROLLBACK;
