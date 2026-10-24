-- @id        Q09
-- @title     Authors active in every year 2021-2024
-- @category  nested
-- @concepts  relational division, double NOT EXISTS, generate_series
-- @role      ra_anon
-- @params    none
SELECT a.author_id, a.author_name
FROM author a
WHERE NOT EXISTS (
  SELECT 1 FROM generate_series(2021, 2024) AS y(yr)
  WHERE NOT EXISTS (
    SELECT 1
    FROM paper_author pa
    JOIN paper p USING (paper_id)
    WHERE pa.author_id = a.author_id
      AND p.publication_date >= make_date(y.yr, 1, 1)
      AND p.publication_date < make_date(y.yr + 1, 1, 1)))
ORDER BY a.author_name;
