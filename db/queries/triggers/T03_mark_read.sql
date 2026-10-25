-- @id        T03
-- @title     Mark a paper as read
-- @category  triggers
-- @concepts  BEFORE UPDATE trigger stamps read_at; CHECK keeps read_at consistent with the status
-- @role      ra_researcher
-- @param     collection_id bigint = SELECT cp.collection_id FROM collection_paper cp JOIN collection c USING (collection_id) WHERE c.user_id = app_current_user_id() AND cp.reading_status <> 'READ' ORDER BY cp.collection_id LIMIT 1
UPDATE collection_paper
SET reading_status = 'READ'
WHERE collection_id = $1
  AND paper_id = (SELECT paper_id FROM collection_paper
                  WHERE collection_id = $1 AND reading_status <> 'READ'
                  ORDER BY paper_id LIMIT 1)
RETURNING collection_id, paper_id, reading_status, read_at;
