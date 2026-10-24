-- @id        Q13
-- @title     Most-cited paper per year
-- @category  nested
-- @concepts  correlated MAX sub-query; the window-function rewrite is in the comment below
-- @role      ra_anon
-- @params    none
-- Window rewrite (one pass instead of one sub-query per row):
--   SELECT year, title, cited_by_count FROM (
--     SELECT publication_year AS year, title, cited_by_count,
--            rank() OVER (PARTITION BY publication_year ORDER BY cited_by_count DESC) AS r
--     FROM paper WHERE publication_date IS NOT NULL) s WHERE r = 1 ORDER BY year;
SELECT p.publication_year AS year, p.title, p.cited_by_count
FROM paper p
WHERE p.publication_date IS NOT NULL
  AND p.cited_by_count = (
    SELECT max(p2.cited_by_count)
    FROM paper p2
    WHERE p2.publication_date >= date_trunc('year', p.publication_date)
      AND p2.publication_date < date_trunc('year', p.publication_date) + INTERVAL '1 year')
ORDER BY year;
