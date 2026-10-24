-- @id        Q08
-- @title     Papers cited above their own venue's average
-- @category  nested
-- @concepts  correlated scalar sub-query re-evaluated per outer row
-- @role      ra_anon
-- @params    none
SELECT p.title,
       v.venue_name,
       p.cited_by_count,
       round((SELECT avg(p2.cited_by_count) FROM paper p2 WHERE p2.venue_id = p.venue_id), 1) AS venue_average
FROM paper p
JOIN venue v ON v.venue_id = p.venue_id
WHERE p.cited_by_count > (SELECT avg(p2.cited_by_count) FROM paper p2 WHERE p2.venue_id = p.venue_id)
ORDER BY p.cited_by_count - (SELECT avg(p2.cited_by_count) FROM paper p2 WHERE p2.venue_id = p.venue_id) DESC
LIMIT 25;
