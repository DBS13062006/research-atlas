-- @id        P05
-- @title     Give two authors of one paper the same position
-- @category  constraints
-- @concepts  composite UNIQUE (paper_id, author_order), deferrable for swaps (see D09)
-- @role      ra_curator
-- @expect    uq_paper_author_order
-- @param     paper_id bigint = SELECT paper_id FROM paper_author GROUP BY paper_id HAVING count(*) >= 2 ORDER BY paper_id LIMIT 1
UPDATE paper_author SET author_order = 1 WHERE paper_id = $1 AND author_order = 2;
