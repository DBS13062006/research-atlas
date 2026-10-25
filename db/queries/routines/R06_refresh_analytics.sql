-- @id        R06
-- @title     Refresh the analytics materialized views
-- @category  routines
-- @concepts  procedure running REFRESH MATERIALIZED VIEW CONCURRENTLY over unique indexes
-- @role      ra_admin
-- @params    none
CALL sp_refresh_analytics();
SELECT 'mv_topic_year_stats' AS view, count(*) AS rows FROM mv_topic_year_stats
UNION ALL
SELECT 'mv_author_stats', count(*) FROM mv_author_stats;
