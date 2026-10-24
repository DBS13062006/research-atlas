-- @id        Q06
-- @title     Authors with both journal and conference papers
-- @category  join
-- @concepts  semi-join with two EXISTS sub-queries
-- @role      ra_anon
-- @params    none
SELECT a.author_id, a.author_name
FROM author a
WHERE EXISTS (SELECT 1 FROM paper_author pa JOIN paper p ON p.paper_id = pa.paper_id
              JOIN venue v ON v.venue_id = p.venue_id
              WHERE pa.author_id = a.author_id AND v.venue_type = 'JOURNAL')
  AND EXISTS (SELECT 1 FROM paper_author pa JOIN paper p ON p.paper_id = pa.paper_id
              JOIN venue v ON v.venue_id = p.venue_id
              WHERE pa.author_id = a.author_id AND v.venue_type = 'CONFERENCE')
ORDER BY a.author_name
LIMIT 50;
