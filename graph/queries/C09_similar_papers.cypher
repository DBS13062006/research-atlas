// @id        C09
// @title     Similar papers from precomputed similarity edges
// @category  vector
// @concepts  SIMILAR_TO edges written by the similarity job from vector-index neighbours
// @role      ra_anon
// @param     paper_id int = MATCH (p:Paper)-[s:SIMILAR_TO]->() WITH p, count(s) AS n RETURN p.paperId ORDER BY n DESC, p.paperId LIMIT 1
MATCH (:Paper {paperId: $paper_id})-[s:SIMILAR_TO]->(q:Paper)
RETURN q.title AS title, q.year AS year, round(s.score, 3) AS score, s.model AS model
ORDER BY s.score DESC
