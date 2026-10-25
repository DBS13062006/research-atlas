// @id        C02
// @title     Papers closest in meaning to a given paper, published since 2020
// @category  vector
// @concepts  Cypher 25 SEARCH clause over the vector index with an in-index year filter, cosine score
// @role      ra_anon
// @param     paper_id int = MATCH (p:Paper) WHERE p.embedding IS NOT NULL RETURN p.paperId ORDER BY p.articleRank DESC LIMIT 1
CYPHER 25
MATCH (seed:Paper {paperId: $paper_id})
MATCH (p:Paper)
  SEARCH p IN (VECTOR INDEX paper_embedding FOR seed.embedding WHERE p.year >= 2020 LIMIT 11) SCORE AS score
WITH seed, p, score WHERE p <> seed
RETURN p.paperId AS paperId, p.title AS title, p.year AS year, round(score, 3) AS score
ORDER BY score DESC
LIMIT 10
