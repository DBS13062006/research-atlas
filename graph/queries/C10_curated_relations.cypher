// @id        C10
// @title     Read: the most recently changed curated relations
// @category  graph-native read
// @concepts  relationships stored only in Neo4j, read in both directions, type(r) and properties
// @role      ra_anon
// @params    none
MATCH (a:Paper)-[r:EXTENDS|IMPROVES_UPON|CONTRADICTS|REPLICATES|RELATED_TO]->(b:Paper)
RETURN type(r) AS relation, a.title AS fromPaper, b.title AS toPaper, r.note AS note, r.confidence AS confidence,
       r.createdBy AS createdBy, toString(r.updatedAt) AS updatedAt
ORDER BY r.updatedAt DESC
LIMIT 25
