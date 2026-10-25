-- @id        R02
-- @title     Every topic under a subfield, with its full path
-- @category  routines
-- @concepts  set-returning function (fn_topic_descendants) and a scalar recursive function (fn_topic_path)
-- @role      ra_anon
-- @param     topic_id bigint = SELECT t.topic_id FROM topic t WHERE t.topic_level = 2 ORDER BY (SELECT count(*) FROM topic c WHERE c.parent_topic_id = t.topic_id) DESC, t.topic_id LIMIT 1
SELECT d.depth, t.topic_name, fn_topic_path(t.topic_id) AS path
FROM fn_topic_descendants($1) d
JOIN topic t USING (topic_id)
ORDER BY d.depth, t.topic_name;
