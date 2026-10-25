-- @id        P03
-- @title     Make a topic the child of its own grandchild
-- @category  constraints
-- @concepts  BEFORE UPDATE trigger walking the hierarchy with a recursive query
-- @role      ra_curator
-- @expect    trg_topic_hierarchy_guard
-- @param     topic_id bigint = SELECT t.topic_id FROM topic t WHERE t.topic_level = 1 AND EXISTS (SELECT 1 FROM fn_topic_descendants(t.topic_id) d WHERE d.depth = 2) ORDER BY t.topic_id LIMIT 1
UPDATE topic
SET parent_topic_id = (SELECT d.topic_id FROM fn_topic_descendants($1) d WHERE d.depth = 2 ORDER BY d.topic_id LIMIT 1)
WHERE topic_id = $1;
