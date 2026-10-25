-- @id        P09
-- @title     A researcher tries to record a retraction
-- @category  constraints
-- @concepts  GRANT-based access control: ra_researcher has no INSERT on retraction (SQLSTATE 42501)
-- @role      ra_researcher
-- @expect    42501
-- @param     paper_id bigint = SELECT paper_id FROM paper ORDER BY paper_id LIMIT 1
INSERT INTO retraction (paper_id, retraction_date, status) VALUES ($1, CURRENT_DATE, 'RETRACTED');
