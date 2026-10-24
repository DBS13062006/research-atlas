-- @id        Q05
-- @title     Papers with no topic, found two ways
-- @category  join
-- @concepts  anti-join: LEFT JOIN ... IS NULL versus NOT EXISTS (the planner turns both into a Hash Anti Join)
-- @role      ra_anon
-- @params    none
SELECT 'LEFT JOIN … IS NULL' AS technique, count(*) AS papers_without_topic
FROM paper p
LEFT JOIN paper_topic pt ON pt.paper_id = p.paper_id
WHERE pt.paper_id IS NULL
UNION ALL
SELECT 'NOT EXISTS', count(*)
FROM paper p
WHERE NOT EXISTS (SELECT 1 FROM paper_topic pt WHERE pt.paper_id = p.paper_id);
