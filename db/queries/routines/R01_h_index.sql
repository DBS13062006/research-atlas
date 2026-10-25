-- @id        R01
-- @title     An author's h-index
-- @category  routines
-- @concepts  SQL function with a window function inside (fn_author_h_index)
-- @role      ra_anon
-- @param     author_id bigint = SELECT author_id FROM paper_author GROUP BY author_id ORDER BY count(*) DESC, author_id LIMIT 1
SELECT a.author_name,
       fn_author_h_index(a.author_id) AS h_index,
       (SELECT count(*) FROM paper_author pa WHERE pa.author_id = a.author_id) AS papers
FROM author a
WHERE a.author_id = $1;
