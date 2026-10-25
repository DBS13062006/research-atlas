-- @id        P06
-- @title     Flag a paper open access while its status says closed
-- @category  constraints
-- @concepts  CHECK constraint tying two columns together
-- @role      ra_curator
-- @expect    chk_paper_oa_status_matches_flag
-- @param     paper_id bigint = SELECT paper_id FROM paper ORDER BY paper_id LIMIT 1
UPDATE paper SET open_access = TRUE, oa_status = 'CLOSED' WHERE paper_id = $1;
