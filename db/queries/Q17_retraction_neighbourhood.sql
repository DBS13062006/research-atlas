-- @id        Q17
-- @title     Papers within two hops of retracted work
-- @category  recursive
-- @concepts  recursive CTE seeded from a join with retraction, hop counting, DISTINCT ON
-- @role      ra_anon
-- @params    none
WITH RECURSIVE exposure(paper_id, retracted_id, hops) AS (
  SELECT c.citing_paper_id, r.paper_id, 1
  FROM retraction r
  JOIN citation c ON c.cited_paper_id = r.paper_id
  WHERE r.status <> 'REINSTATED'
  UNION ALL
  SELECT c.citing_paper_id, e.retracted_id, e.hops + 1
  FROM exposure e
  JOIN citation c ON c.cited_paper_id = e.paper_id
  WHERE e.hops < 2
)
SELECT DISTINCT ON (e.paper_id) p.title AS exposed_paper, e.hops, rp.title AS retracted_paper
FROM exposure e
JOIN paper p ON p.paper_id = e.paper_id
JOIN paper rp ON rp.paper_id = e.retracted_id
ORDER BY e.paper_id, e.hops
LIMIT 100;
