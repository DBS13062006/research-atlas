-- @id        Q04
-- @title     Top 3 papers in every leaf topic
-- @category  join
-- @concepts  CROSS JOIN LATERAL with ORDER BY ... LIMIT inside, per-group top-N
-- @role      ra_anon
-- @params    none
SELECT t.topic_name, top3.title, top3.cited_by_count
FROM topic t
CROSS JOIN LATERAL (
  SELECT p.title, p.cited_by_count
  FROM paper_topic pt
  JOIN paper p ON p.paper_id = pt.paper_id
  WHERE pt.topic_id = t.topic_id
  ORDER BY p.cited_by_count DESC, p.paper_id
  LIMIT 3
) AS top3
WHERE t.topic_level = 3
ORDER BY t.topic_name, top3.cited_by_count DESC;
