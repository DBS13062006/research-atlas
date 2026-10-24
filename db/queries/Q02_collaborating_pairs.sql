-- @id        Q02
-- @title     Which author pairs collaborate most
-- @category  join
-- @concepts  self-join, a1.author_id < a2.author_id to count each pair once, GROUP BY
-- @role      ra_anon
-- @params    none
SELECT a1.author_name AS author_a,
       a2.author_name AS author_b,
       count(*) AS shared_papers
FROM paper_author x
JOIN paper_author y ON y.paper_id = x.paper_id AND x.author_id < y.author_id
JOIN author a1 ON a1.author_id = x.author_id
JOIN author a2 ON a2.author_id = y.author_id
GROUP BY a1.author_id, a2.author_id
ORDER BY shared_papers DESC, author_a, author_b
LIMIT 20;
