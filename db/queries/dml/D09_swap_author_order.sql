-- @id        D09
-- @title     Swap two authors' positions safely
-- @category  dml
-- @concepts  SAVEPOINT, SET CONSTRAINTS ... DEFERRED on a DEFERRABLE UNIQUE constraint, RELEASE SAVEPOINT
-- @role      ra_curator
-- @param     paper_id bigint = SELECT paper_id FROM paper_author GROUP BY paper_id HAVING count(*) >= 2 ORDER BY paper_id LIMIT 1
SAVEPOINT before_swap;
-- Positions 1 and 2 would collide halfway through; deferring the check to the end of the
-- transaction lets both rows move.
SET CONSTRAINTS uq_paper_author_order DEFERRED;
UPDATE paper_author SET author_order = 3 - author_order WHERE paper_id = $1 AND author_order IN (1, 2);
SET CONSTRAINTS uq_paper_author_order IMMEDIATE;
RELEASE SAVEPOINT before_swap;
SELECT pa.author_order, a.author_name
FROM paper_author pa JOIN author a ON a.author_id = pa.author_id
WHERE pa.paper_id = $1
ORDER BY pa.author_order;
