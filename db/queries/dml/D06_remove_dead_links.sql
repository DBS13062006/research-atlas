-- @id        D06
-- @title     Remove dead resource links
-- @category  dml
-- @concepts  DELETE ... USING a temporary table of URLs found to be dead
-- @role      ra_curator
-- @params    none
CREATE TEMP TABLE dead_link (resource_url TEXT PRIMARY KEY) ON COMMIT DROP;
INSERT INTO dead_link
SELECT resource_url FROM resource WHERE resource_type = 'PDF' ORDER BY resource_id LIMIT 3;
DELETE FROM resource r
USING dead_link d
WHERE r.resource_url = d.resource_url
RETURNING r.resource_id, r.paper_id, r.resource_url;
