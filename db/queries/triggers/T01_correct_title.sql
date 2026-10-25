-- @id        T01
-- @title     Correct a paper's title
-- @category  triggers
-- @concepts  BEFORE UPDATE trigger sets updated_at; AFTER triggers write audit_log and graph_outbox
-- @role      ra_curator
-- @param     paper_id bigint = SELECT paper_id FROM paper ORDER BY cited_by_count DESC, paper_id LIMIT 1
UPDATE paper
SET title = title || ' (corrected)'
WHERE paper_id = $1
RETURNING paper_id, title, updated_at;
