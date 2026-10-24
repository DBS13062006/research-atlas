-- @id        Q18
-- @title     Rank papers inside each topic
-- @category  analytics
-- @concepts  window functions DENSE_RANK and PERCENT_RANK partitioned by topic
-- @role      ra_anon
-- @params    none
SELECT *
FROM (
  SELECT t.topic_name,
         p.title,
         p.cited_by_count,
         dense_rank() OVER w AS rank_in_topic,
         round(percent_rank() OVER w::NUMERIC, 3) AS percent_rank
  FROM paper_topic pt
  JOIN topic t ON t.topic_id = pt.topic_id
  JOIN paper p ON p.paper_id = pt.paper_id
  WHERE pt.is_primary
  WINDOW w AS (PARTITION BY t.topic_id ORDER BY p.cited_by_count DESC)
) ranked
WHERE rank_in_topic <= 5
ORDER BY topic_name, rank_in_topic;
