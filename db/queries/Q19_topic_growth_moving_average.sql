-- @id        Q19
-- @title     Topic growth and three-year moving average
-- @category  analytics
-- @concepts  LAG(), AVG() OVER (ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), function call in FROM
-- @role      ra_anon
-- @param     topic_id bigint = SELECT pt.topic_id FROM paper_topic pt JOIN topic t ON t.topic_id = pt.topic_id WHERE t.topic_level = 3 GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1
SELECT g.year,
       g.papers,
       g.papers - lag(g.papers) OVER (ORDER BY g.year) AS change,
       g.yoy_pct,
       round(avg(g.papers) OVER (ORDER BY g.year ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 1) AS moving_avg_3y
FROM fn_topic_growth($1, 2012, EXTRACT(YEAR FROM now())::INT) g
ORDER BY g.year;
