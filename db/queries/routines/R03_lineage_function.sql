-- @id        R03
-- @title     A paper's ancestors through the lineage function
-- @category  routines
-- @concepts  PL/pgSQL table function wrapping a recursive CTE with SEARCH and CYCLE
-- @role      ra_anon
-- @param     paper_id bigint = SELECT citing_paper_id FROM citation GROUP BY citing_paper_id ORDER BY count(*) DESC, citing_paper_id LIMIT 1
SELECT l.depth, p.title, p.publication_year, l.path
FROM fn_paper_lineage($1, 'ancestors', 2) l
JOIN paper p USING (paper_id)
ORDER BY l.depth, p.cited_by_count DESC
LIMIT 50;
