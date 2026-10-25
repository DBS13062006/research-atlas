-- @id        P01
-- @title     A paper cites itself
-- @category  constraints
-- @concepts  CHECK constraint across two columns
-- @role      ra_curator
-- @expect    chk_no_self_citation
-- @param     paper_id bigint = SELECT paper_id FROM paper ORDER BY paper_id LIMIT 1
INSERT INTO citation (citing_paper_id, cited_paper_id) VALUES ($1, $1);
