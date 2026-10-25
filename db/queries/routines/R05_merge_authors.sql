-- @id        R05
-- @title     Merge a duplicate author into the canonical record
-- @category  routines
-- @concepts  procedure with row locks taken in a fixed order (FOR UPDATE), DELETE ... USING, identifier carry-over
-- @role      ra_admin
-- @param     keep_id bigint = SELECT author_id FROM paper_author GROUP BY author_id ORDER BY count(*) DESC, author_id LIMIT 1
-- @param     dup_id bigint = SELECT a.author_id FROM author a WHERE a.author_id <> (SELECT author_id FROM paper_author GROUP BY author_id ORDER BY count(*) DESC, author_id LIMIT 1) ORDER BY a.author_id LIMIT 1
SELECT author_id, author_name, (SELECT count(*) FROM paper_author pa WHERE pa.author_id = a.author_id) AS papers
FROM author a
WHERE author_id IN ($1, $2);
CALL sp_merge_authors($1, $2);
SELECT author_id, author_name, (SELECT count(*) FROM paper_author pa WHERE pa.author_id = a.author_id) AS papers
FROM author a
WHERE author_id IN ($1, $2);
