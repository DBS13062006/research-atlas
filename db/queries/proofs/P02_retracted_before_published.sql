-- @id        P02
-- @title     Retract a paper a month before it was published
-- @category  constraints
-- @concepts  BEFORE INSERT trigger that compares with another table, RAISE ... USING CONSTRAINT
-- @role      ra_admin
-- @expect    trg_retraction_date_guard
-- @param     paper_id bigint = SELECT p.paper_id FROM paper p WHERE p.publication_date IS NOT NULL AND NOT EXISTS (SELECT 1 FROM retraction r WHERE r.paper_id = p.paper_id) ORDER BY p.paper_id LIMIT 1
INSERT INTO retraction (paper_id, retraction_date, status, reason)
SELECT paper_id, publication_date - 30, 'RETRACTED', 'Query Lab proof'
FROM paper
WHERE paper_id = $1;
