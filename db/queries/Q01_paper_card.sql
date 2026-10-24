-- @id        Q01
-- @title     Everything a paper card shows
-- @category  join
-- @concepts  INNER JOIN, LEFT JOIN, string_agg ... ORDER BY, five tables
-- @role      ra_anon
-- @param     paper_id bigint = SELECT paper_id FROM paper ORDER BY local_citation_count DESC, paper_id LIMIT 1
SELECT p.paper_id,
       p.title,
       p.publication_date,
       v.venue_name,
       string_agg(a.author_name, ', ' ORDER BY pa.author_order) AS authors,
       t.topic_name AS primary_topic,
       r.status AS retraction_status,
       p.cited_by_count,
       p.local_citation_count
FROM paper p
LEFT JOIN venue v ON v.venue_id = p.venue_id
LEFT JOIN paper_author pa ON pa.paper_id = p.paper_id
LEFT JOIN author a ON a.author_id = pa.author_id
LEFT JOIN paper_topic pt ON pt.paper_id = p.paper_id AND pt.is_primary
LEFT JOIN topic t ON t.topic_id = pt.topic_id
LEFT JOIN retraction r ON r.paper_id = p.paper_id
WHERE p.paper_id = $1
GROUP BY p.paper_id, v.venue_name, t.topic_name, r.status;
