-- @id        D05
-- @title     Raise a priority and show the before and after values
-- @category  dml
-- @concepts  UPDATE ... RETURNING old.* and new.* (PostgreSQL 18)
-- @role      ra_researcher
-- @param     collection_id bigint = SELECT collection_id FROM collection WHERE user_id = app_current_user_id() ORDER BY collection_id LIMIT 1
UPDATE collection_paper
SET priority = CASE priority WHEN 'LOW' THEN 'MEDIUM' ELSE 'HIGH' END
WHERE collection_id = $1
RETURNING paper_id, old.priority AS priority_before, new.priority AS priority_after;
