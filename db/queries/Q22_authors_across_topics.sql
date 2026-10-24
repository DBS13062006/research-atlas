-- @id        Q22
-- @title     Authors in two topics, and in one but not the other
-- @category  set operations
-- @concepts  INTERSECT and EXCEPT over the same projection
-- @role      ra_anon
-- @param     topic_a bigint = SELECT topic_id FROM topic WHERE topic_level = 3 ORDER BY (topic_name ILIKE '%spiking%') DESC, topic_id LIMIT 1
-- @param     topic_b bigint = SELECT topic_id FROM topic WHERE topic_level = 3 ORDER BY (topic_name ILIKE '%transformer%' OR topic_name ILIKE '%language model%') DESC, topic_id DESC LIMIT 1
(SELECT 'both topics' AS membership, a.author_name
 FROM author a JOIN paper_author pa USING (author_id) JOIN paper_topic pt USING (paper_id) WHERE pt.topic_id = $1
 INTERSECT
 SELECT 'both topics', a.author_name
 FROM author a JOIN paper_author pa USING (author_id) JOIN paper_topic pt USING (paper_id) WHERE pt.topic_id = $2)
UNION ALL
(SELECT 'first topic only', a.author_name
 FROM author a JOIN paper_author pa USING (author_id) JOIN paper_topic pt USING (paper_id) WHERE pt.topic_id = $1
 EXCEPT
 SELECT 'first topic only', a.author_name
 FROM author a JOIN paper_author pa USING (author_id) JOIN paper_topic pt USING (paper_id) WHERE pt.topic_id = $2)
ORDER BY membership, author_name
LIMIT 60;
