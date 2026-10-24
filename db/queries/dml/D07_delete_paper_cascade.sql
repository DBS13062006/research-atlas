-- @id        D07
-- @title     Delete a paper and show what cascaded
-- @category  dml
-- @concepts  ON DELETE CASCADE across seven child tables, row counts before and after
-- @role      ra_admin
-- @param     paper_id bigint = SELECT paper_id FROM paper ORDER BY local_citation_count DESC, paper_id LIMIT 1
CREATE TEMP TABLE before_counts ON COMMIT DROP AS
SELECT 'paper_author' AS child, count(*) AS n FROM paper_author WHERE paper_id = $1
UNION ALL SELECT 'citation', count(*) FROM citation WHERE $1 IN (citing_paper_id, cited_paper_id)
UNION ALL SELECT 'paper_topic', count(*) FROM paper_topic WHERE paper_id = $1
UNION ALL SELECT 'paper_method', count(*) FROM paper_method WHERE paper_id = $1
UNION ALL SELECT 'paper_dataset', count(*) FROM paper_dataset WHERE paper_id = $1
UNION ALL SELECT 'resource', count(*) FROM resource WHERE paper_id = $1
UNION ALL SELECT 'collection_paper', count(*) FROM collection_paper WHERE paper_id = $1;
DELETE FROM paper WHERE paper_id = $1;
SELECT b.child,
       b.n AS rows_before,
       CASE b.child
         WHEN 'paper_author' THEN (SELECT count(*) FROM paper_author WHERE paper_id = $1)
         WHEN 'citation' THEN (SELECT count(*) FROM citation WHERE $1 IN (citing_paper_id, cited_paper_id))
         WHEN 'paper_topic' THEN (SELECT count(*) FROM paper_topic WHERE paper_id = $1)
         WHEN 'paper_method' THEN (SELECT count(*) FROM paper_method WHERE paper_id = $1)
         WHEN 'paper_dataset' THEN (SELECT count(*) FROM paper_dataset WHERE paper_id = $1)
         WHEN 'resource' THEN (SELECT count(*) FROM resource WHERE paper_id = $1)
         WHEN 'collection_paper' THEN (SELECT count(*) FROM collection_paper WHERE paper_id = $1)
       END AS rows_after
FROM before_counts b;
