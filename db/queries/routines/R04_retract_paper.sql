-- @id        R04
-- @title     Retract a paper through the stored procedure
-- @category  routines
-- @concepts  CALL a procedure: upsert with ON CONFLICT, a two-hop exposure count, RAISE NOTICE
-- @role      ra_admin
-- @param     paper_id bigint = SELECT p.paper_id FROM paper p WHERE p.publication_date IS NOT NULL AND NOT EXISTS (SELECT 1 FROM retraction r WHERE r.paper_id = p.paper_id) ORDER BY p.local_citation_count DESC, p.paper_id LIMIT 1
CALL sp_retract_paper($1, CURRENT_DATE, 'RETRACTED', 'Query Lab demonstration');
SELECT r.paper_id, r.status, r.retraction_date, r.source,
       (SELECT count(*) FROM citation c WHERE c.cited_paper_id = r.paper_id) AS cited_directly_by
FROM retraction r
WHERE r.paper_id = $1;
