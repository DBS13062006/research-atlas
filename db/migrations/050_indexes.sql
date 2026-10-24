-- migrate:up
-- 050 · Indexes beyond keys.
-- PostgreSQL does not index foreign-key columns automatically; every FK not led by a primary key
-- gets one so joins and ON DELETE checks stay fast.
SET ROLE ra_owner;

CREATE INDEX ix_author_institution_id ON author (institution_id);
CREATE INDEX ix_paper_venue_id ON paper (venue_id);
CREATE INDEX ix_paper_author_author_id ON paper_author (author_id);
CREATE INDEX ix_paper_author_affiliation ON paper_author (affiliation_institution_id);
CREATE INDEX ix_citation_cited_paper_id ON citation (cited_paper_id);
CREATE INDEX ix_topic_parent_topic_id ON topic (parent_topic_id);
CREATE INDEX ix_paper_topic_topic_id ON paper_topic (topic_id);
CREATE INDEX ix_paper_method_method_id ON paper_method (method_id);
CREATE INDEX ix_paper_dataset_dataset_id ON paper_dataset (dataset_id);
CREATE INDEX ix_retraction_recorded_by ON retraction (recorded_by);
CREATE INDEX ix_note_user_paper ON note (user_id, paper_id);
CREATE INDEX ix_note_paper_id ON note (paper_id);
CREATE INDEX ix_user_session_user_id ON user_session (user_id);
CREATE INDEX ix_user_session_expires_at ON user_session (expires_at);
CREATE INDEX ix_user_account_role_id ON user_account (role_id);
CREATE INDEX ix_collection_user_id ON collection (user_id);
CREATE INDEX ix_collection_paper_paper_id ON collection_paper (paper_id);
CREATE INDEX ix_role_permission_permission_id ON role_permission (permission_id);

-- Search: full-text (GIN on the stored tsvector) and fuzzy matching (GIN trigram).
CREATE INDEX ix_paper_search_vector ON paper USING GIN (search_vector);
CREATE INDEX ix_paper_title_trgm ON paper USING GIN (title gin_trgm_ops);
CREATE INDEX ix_author_name_trgm ON author USING GIN (author_name gin_trgm_ops);

-- Time filters. publication_year is VIRTUAL and cannot be indexed, so year filters use date ranges.
CREATE INDEX ix_paper_publication_date ON paper (publication_date);
CREATE INDEX ix_paper_open_access_date ON paper (publication_date) WHERE open_access;

-- Keyset pagination for list endpoints: ORDER BY cited_by_count DESC, paper_id DESC.
CREATE INDEX ix_paper_cited_by_keyset ON paper (cited_by_count DESC, paper_id DESC);

-- The audit trail is append-only and time-ordered, which suits a tiny BRIN index.
CREATE INDEX ix_audit_log_occurred_at_brin ON audit_log USING BRIN (occurred_at);

RESET ROLE;

-- migrate:down
SET ROLE ra_owner;
DROP INDEX IF EXISTS ix_audit_log_occurred_at_brin;
DROP INDEX IF EXISTS ix_paper_cited_by_keyset;
DROP INDEX IF EXISTS ix_paper_open_access_date;
DROP INDEX IF EXISTS ix_paper_publication_date;
DROP INDEX IF EXISTS ix_author_name_trgm;
DROP INDEX IF EXISTS ix_paper_title_trgm;
DROP INDEX IF EXISTS ix_paper_search_vector;
DROP INDEX IF EXISTS ix_role_permission_permission_id;
DROP INDEX IF EXISTS ix_collection_paper_paper_id;
DROP INDEX IF EXISTS ix_collection_user_id;
DROP INDEX IF EXISTS ix_user_account_role_id;
DROP INDEX IF EXISTS ix_user_session_expires_at;
DROP INDEX IF EXISTS ix_user_session_user_id;
DROP INDEX IF EXISTS ix_note_paper_id;
DROP INDEX IF EXISTS ix_note_user_paper;
DROP INDEX IF EXISTS ix_retraction_recorded_by;
DROP INDEX IF EXISTS ix_paper_dataset_dataset_id;
DROP INDEX IF EXISTS ix_paper_method_method_id;
DROP INDEX IF EXISTS ix_paper_topic_topic_id;
DROP INDEX IF EXISTS ix_topic_parent_topic_id;
DROP INDEX IF EXISTS ix_citation_cited_paper_id;
DROP INDEX IF EXISTS ix_paper_author_affiliation;
DROP INDEX IF EXISTS ix_paper_author_author_id;
DROP INDEX IF EXISTS ix_paper_venue_id;
DROP INDEX IF EXISTS ix_author_institution_id;
RESET ROLE;
