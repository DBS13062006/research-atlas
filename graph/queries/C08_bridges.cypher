// @id        C08
// @title     Papers that connect research fronts
// @category  analytics
// @concepts  betweenness centrality (GDS, sampled) and the number of distinct communities a paper touches
// @role      ra_anon
// @params    none
MATCH (p:Paper)-[:CITES]-(n:Paper)
WHERE p.betweenness > 0 AND n.community <> p.community
WITH p, count(DISTINCT n.community) AS frontsTouched
RETURN p.title AS title, p.year AS year, round(p.betweenness) AS betweenness, frontsTouched
ORDER BY p.betweenness DESC
LIMIT 15
