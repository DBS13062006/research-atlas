-- @id        D04
-- @title     Mark collection items READ where the user has written notes
-- @category  dml
-- @concepts  UPDATE ... FROM with a join; the read_at trigger fires; RLS limits rows to the caller's
-- @role      ra_researcher
-- @params    none
UPDATE collection_paper cp
SET reading_status = 'READ'
FROM collection c, note n
WHERE c.collection_id = cp.collection_id
  AND n.user_id = c.user_id
  AND n.paper_id = cp.paper_id
  AND cp.reading_status <> 'READ'
RETURNING cp.collection_id, cp.paper_id, cp.reading_status, cp.read_at;
