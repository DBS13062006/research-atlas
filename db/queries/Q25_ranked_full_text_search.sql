-- @id        Q25
-- @title     Ranked full-text search with highlights
-- @category  search
-- @concepts  websearch_to_tsquery, ts_rank_cd over a weighted tsvector, ts_headline, GIN index
-- @role      ra_anon
-- @param     query text = SELECT 'energy efficient spiking'
SELECT p.title,
       round(ts_rank_cd(p.search_vector, q)::NUMERIC, 4) AS rank,
       ts_headline('english', coalesce(p.abstract, p.title), q,
                   'MaxFragments=1, MaxWords=24, MinWords=8, StartSel=«, StopSel=»') AS snippet
FROM paper p, websearch_to_tsquery('english', $1) AS q
WHERE p.search_vector @@ q
ORDER BY rank DESC, p.cited_by_count DESC
LIMIT 10;
