-- @id        Q15
-- @title     What a paper builds on, three levels deep
-- @category  recursive
-- @concepts  recursive CTE with SEARCH BREADTH FIRST and CYCLE clauses, DISTINCT ON for the shortest depth
-- @role      ra_anon
-- @param     paper_id bigint = SELECT citing_paper_id FROM citation GROUP BY citing_paper_id ORDER BY count(*) DESC, citing_paper_id LIMIT 1
WITH RECURSIVE ancestors(paper_id, depth) AS (
  SELECT c.cited_paper_id, 1 FROM citation c WHERE c.citing_paper_id = $1
  UNION ALL
  SELECT c.cited_paper_id, a.depth + 1
  FROM ancestors a JOIN citation c ON c.citing_paper_id = a.paper_id
  WHERE a.depth < 3
) SEARCH BREADTH FIRST BY paper_id SET bfs_order
  CYCLE paper_id SET is_cycle USING visit_path
SELECT DISTINCT ON (a.paper_id) a.paper_id, a.depth, p.title, p.publication_year
FROM ancestors a
JOIN paper p ON p.paper_id = a.paper_id
WHERE NOT a.is_cycle
ORDER BY a.paper_id, a.depth
LIMIT 100;
