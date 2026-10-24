-- @id        D03
-- @title     Re-score a paper's topics
-- @category  dml
-- @concepts  INSERT ... ON CONFLICT (key) DO UPDATE SET ... = EXCLUDED.... (upsert)
-- @role      ra_curator
-- @param     paper_id bigint = SELECT paper_id FROM paper_topic GROUP BY paper_id ORDER BY count(*) DESC, paper_id LIMIT 1
INSERT INTO paper_topic (paper_id, topic_id, relevance_score)
SELECT pt.paper_id, pt.topic_id, round(greatest(coalesce(pt.relevance_score, 0.5) - 0.05, 0), 4)
FROM paper_topic pt
WHERE pt.paper_id = $1
ON CONFLICT (paper_id, topic_id) DO UPDATE
  SET relevance_score = EXCLUDED.relevance_score
RETURNING paper_id, topic_id, relevance_score;
