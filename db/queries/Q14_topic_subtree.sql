-- @id        Q14
-- @title     A topic's full subtree with depth and path
-- @category  recursive
-- @concepts  recursive CTE walking down a self-referencing foreign key, path accumulation
-- @role      ra_anon
-- @param     topic_id bigint = SELECT t.topic_id FROM topic t WHERE t.topic_level = 1 ORDER BY (SELECT count(*) FROM topic c WHERE c.parent_topic_id = t.topic_id) DESC, t.topic_id LIMIT 1
WITH RECURSIVE subtree(topic_id, topic_name, topic_level, depth, path) AS (
  SELECT topic_id, topic_name, topic_level, 0, topic_name::TEXT
  FROM topic WHERE topic_id = $1
  UNION ALL
  SELECT t.topic_id, t.topic_name, t.topic_level, s.depth + 1, s.path || ' › ' || t.topic_name
  FROM subtree s
  JOIN topic t ON t.parent_topic_id = s.topic_id
)
SELECT depth, repeat('  ', depth) || topic_name AS topic, path
FROM subtree
ORDER BY path;
