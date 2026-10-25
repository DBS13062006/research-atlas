// @id        C07
// @title     Research fronts ranked by recent growth
// @category  analytics
// @concepts  Leiden communities (GDS), aggregation per community, growth of the last three years
// @role      ra_anon
// @params    none
MATCH (p:Paper) WHERE p.community IS NOT NULL
WITH p.community AS community, count(*) AS papers,
     count(CASE WHEN p.year >= 2023 THEN 1 END) AS recent,
     collect(p) AS members
WHERE papers >= 20
WITH community, papers, recent, round(100.0 * recent / papers, 1) AS recentShare,
     [m IN members WHERE m.articleRank IS NOT NULL | m] AS ranked
RETURN community, papers, recentShare,
       [m IN apoc.coll.sortNodes(ranked, 'articleRank')[0..3] | m.title] AS anchorPapers
ORDER BY recentShare DESC
LIMIT 12
