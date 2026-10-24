-- @id        D08
-- @title     Sync a subfield's topics from a staging table
-- @category  dml
-- @concepts  MERGE with WHEN MATCHED, WHEN NOT MATCHED and WHEN NOT MATCHED BY SOURCE, RETURNING merge_action()
-- @role      ra_curator
-- @param     subfield_id bigint = SELECT parent_topic_id FROM topic WHERE topic_level = 3 GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1
CREATE TEMP TABLE topic_staging (topic_name TEXT PRIMARY KEY, description TEXT) ON COMMIT DROP;
-- The latest taxonomy keeps two existing topics (with new descriptions) and adds one new topic.
INSERT INTO topic_staging
SELECT topic_name, 'Description refreshed from the latest taxonomy'
FROM topic WHERE parent_topic_id = $1 ORDER BY topic_id LIMIT 2;
INSERT INTO topic_staging VALUES ('Neuro-symbolic Reasoning', 'Added by the latest taxonomy');
MERGE INTO topic t
USING topic_staging s
ON t.parent_topic_id = $1 AND t.topic_name = s.topic_name
WHEN MATCHED THEN
  UPDATE SET description = s.description
WHEN NOT MATCHED THEN
  INSERT (topic_name, topic_level, parent_topic_id, description) VALUES (s.topic_name, 3, $1, s.description)
WHEN NOT MATCHED BY SOURCE AND t.parent_topic_id = $1 THEN
  UPDATE SET description = 'Not in the latest taxonomy'
RETURNING merge_action() AS action, t.topic_id, t.topic_name, t.description;
