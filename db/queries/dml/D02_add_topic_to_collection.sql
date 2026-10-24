-- @id        D02
-- @title     Add every paper of a topic to a collection
-- @category  dml
-- @concepts  INSERT ... SELECT with a window function for positions, ON CONFLICT DO NOTHING, RLS-checked
-- @role      ra_researcher
-- @param     collection_id bigint = SELECT collection_id FROM collection WHERE user_id = app_current_user_id() ORDER BY collection_id LIMIT 1
-- @param     topic_id bigint = SELECT pt.topic_id FROM paper_topic pt GROUP BY 1 ORDER BY count(*), 1 LIMIT 1
INSERT INTO collection_paper (collection_id, paper_id, position)
SELECT $1, pt.paper_id,
       coalesce((SELECT max(position) FROM collection_paper WHERE collection_id = $1), -1)
         + row_number() OVER (ORDER BY p.cited_by_count DESC)
FROM paper_topic pt
JOIN paper p ON p.paper_id = pt.paper_id
WHERE pt.topic_id = $2
ON CONFLICT (collection_id, paper_id) DO NOTHING
RETURNING collection_id, paper_id, position;
