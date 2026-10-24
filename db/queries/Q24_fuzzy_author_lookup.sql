-- @id        Q24
-- @title     Fuzzy author lookup that survives typos
-- @category  search
-- @concepts  pg_trgm % operator (uses the GIN trigram index) and similarity() for ranking
-- @role      ra_anon
-- @param     name text = SELECT overlay(a.author_name placing 'x' from 3 for 1) FROM author a JOIN paper_author pa USING (author_id) GROUP BY a.author_id ORDER BY count(*) DESC, a.author_id LIMIT 1
SELECT a.author_name,
       round(similarity(a.author_name, $1)::NUMERIC, 3) AS similarity,
       (SELECT count(*) FROM paper_author pa WHERE pa.author_id = a.author_id) AS papers
FROM author a
WHERE a.author_name % $1
ORDER BY similarity DESC, papers DESC
LIMIT 10;
