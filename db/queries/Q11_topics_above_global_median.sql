-- @id        Q11
-- @title     Topics whose median citations beat the global median
-- @category  nested
-- @concepts  ordered-set aggregate percentile_cont, sub-query in HAVING
-- @role      ra_anon
-- @params    none
SELECT t.topic_name,
       count(*) AS papers,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY p.cited_by_count) AS median_citations
FROM topic t
JOIN paper_topic pt ON pt.topic_id = t.topic_id
JOIN paper p ON p.paper_id = pt.paper_id
WHERE t.topic_level = 3
GROUP BY t.topic_id
HAVING percentile_cont(0.5) WITHIN GROUP (ORDER BY p.cited_by_count)
       > (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY cited_by_count) FROM paper)
ORDER BY median_citations DESC
LIMIT 25;
