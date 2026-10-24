-- @id        Q20
-- @title     Papers by field and year with subtotals
-- @category  analytics
-- @concepts  GROUPING SETS with a grand total, GROUPING() to label subtotal rows
-- @role      ra_anon
-- @params    none
SELECT CASE WHEN grouping(f.topic_name) = 1 THEN 'All fields' ELSE f.topic_name END AS field,
       CASE WHEN grouping(p.publication_year) = 1 THEN 'All years' ELSE p.publication_year::TEXT END AS year,
       count(DISTINCT p.paper_id) AS papers
FROM paper p
JOIN paper_topic pt ON pt.paper_id = p.paper_id AND pt.is_primary
JOIN topic t ON t.topic_id = pt.topic_id
JOIN topic sf ON sf.topic_id = t.parent_topic_id
JOIN topic f ON f.topic_id = sf.parent_topic_id
WHERE p.publication_date >= make_date(EXTRACT(YEAR FROM now())::INT - 5, 1, 1)
GROUP BY GROUPING SETS ((f.topic_name, p.publication_year), (f.topic_name), ())
ORDER BY grouping(f.topic_name), field, grouping(p.publication_year), year;
