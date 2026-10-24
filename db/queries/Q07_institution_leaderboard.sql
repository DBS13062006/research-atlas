-- @id        Q07
-- @title     Institution leaderboard by papers and citations
-- @category  join
-- @concepts  multi-table join, GROUP BY, HAVING, COUNT(DISTINCT)
-- @role      ra_anon
-- @params    none
SELECT i.institution_name,
       i.country_code,
       count(DISTINCT pa.paper_id) AS papers,
       sum(p.cited_by_count) AS citations,
       count(DISTINCT pa.author_id) AS authors
FROM institution i
JOIN paper_author pa ON pa.affiliation_institution_id = i.institution_id
JOIN paper p ON p.paper_id = pa.paper_id
GROUP BY i.institution_id
HAVING count(DISTINCT pa.paper_id) >= 2
ORDER BY citations DESC, papers DESC
LIMIT 20;
