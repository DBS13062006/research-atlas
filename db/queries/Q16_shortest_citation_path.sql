-- @id        Q16
-- @title     Shortest citation path between two papers
-- @category  recursive
-- @concepts  breadth-first recursive CTE carrying a path array, stops at the first depth that reaches the target
-- @role      ra_anon
-- @param     from_id bigint = SELECT l.paper_id FROM (SELECT cited_paper_id AS target FROM citation GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1) t, fn_paper_lineage(t.target, 'descendants', 3) l ORDER BY l.depth DESC, l.paper_id LIMIT 1
-- @param     to_id bigint = SELECT cited_paper_id FROM citation GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1
WITH RECURSIVE walk(paper_id, depth, path) AS (
  SELECT $1::BIGINT, 0, ARRAY[$1::BIGINT]
  UNION ALL
  SELECT c.cited_paper_id, w.depth + 1, w.path || c.cited_paper_id
  FROM walk w
  JOIN citation c ON c.citing_paper_id = w.paper_id
  WHERE w.depth < 4
    AND NOT c.cited_paper_id = ANY (w.path)
    AND w.paper_id <> $2
), hits AS (
  SELECT path, depth FROM walk WHERE paper_id = $2
)
SELECT h.depth AS hops,
       (SELECT string_agg(p.title, '  →  ' ORDER BY u.ord)
        FROM unnest(h.path) WITH ORDINALITY AS u(paper_id, ord)
        JOIN paper p ON p.paper_id = u.paper_id) AS chain
FROM hits h
WHERE h.depth = (SELECT min(depth) FROM hits)
LIMIT 3;
