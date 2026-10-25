// @id        C06
// @title     Hidden gems: influential papers the raw citation count overlooks
// @category  analytics
// @concepts  ArticleRank (GDS) against citedByCount, each turned into a percentile by sorting once
// @role      ra_anon
// @params    none
MATCH (p:Paper) WHERE p.articleRank IS NOT NULL
WITH p ORDER BY p.articleRank
WITH collect(p) AS byInfluence
UNWIND range(0, size(byInfluence) - 1) AS i
WITH byInfluence[i] AS p, toFloat(i) / size(byInfluence) AS influencePct
ORDER BY p.citedByCount
WITH collect({paper: p, influencePct: influencePct}) AS byCitations
UNWIND range(0, size(byCitations) - 1) AS j
WITH byCitations[j].paper AS p, byCitations[j].influencePct AS influencePct,
     toFloat(j) / size(byCitations) AS citationPct
WHERE influencePct >= 0.9 AND citationPct < 0.6
RETURN p.title AS title, p.year AS year, p.citedByCount AS citedBy, round(influencePct, 3) AS influencePercentile,
       round(citationPct, 3) AS citationPercentile
ORDER BY influencePct - citationPct DESC
LIMIT 15
