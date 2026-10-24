-- @id        Q21
-- @title     Open versus closed access per venue
-- @category  analytics
-- @concepts  conditional aggregation with count(*) FILTER (WHERE ...)
-- @role      ra_anon
-- @params    none
SELECT v.venue_name,
       count(*) AS papers,
       count(*) FILTER (WHERE p.open_access) AS open_access,
       count(*) FILTER (WHERE NOT p.open_access) AS closed,
       round(100.0 * count(*) FILTER (WHERE p.open_access) / count(*), 1) AS open_pct
FROM paper p
JOIN venue v ON v.venue_id = p.venue_id
GROUP BY v.venue_id
HAVING count(*) >= 3
ORDER BY papers DESC
LIMIT 20;
