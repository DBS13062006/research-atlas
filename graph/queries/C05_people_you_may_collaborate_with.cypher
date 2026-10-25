// @id        C05
// @title     Co-authors of my co-authors I have not worked with
// @category  recommendation
// @concepts  two-hop pattern over COAUTHOR, NOT pattern predicate, ranking by shared neighbours
// @role      ra_anon
// @param     author_id int = MATCH (a:Author)-[c:COAUTHOR]-() WITH a, count(c) AS n RETURN a.authorId ORDER BY n DESC LIMIT 1
MATCH (me:Author {authorId: $author_id})-[:COAUTHOR]-(friend:Author)-[:COAUTHOR]-(candidate:Author)
WHERE candidate <> me AND NOT (me)-[:COAUTHOR]-(candidate)
RETURN candidate.name AS candidate, count(DISTINCT friend) AS sharedCoauthors,
       collect(DISTINCT friend.name)[0..3] AS via
ORDER BY sharedCoauthors DESC, candidate
LIMIT 10
