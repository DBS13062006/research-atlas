// @id        C04
// @title     What a paper builds on, three levels deep
// @category  traversal
// @concepts  variable-length path (:Paper)-[:CITES]->{1,3}, shortest depth per ancestor with min()
// @role      ra_anon
// @param     paper_id int = MATCH (p:Paper)-[c:CITES]->() WITH p, count(c) AS n RETURN p.paperId ORDER BY n DESC LIMIT 1
MATCH path = (:Paper {paperId: $paper_id})-[:CITES]->{1,3}(ancestor:Paper)
WITH ancestor, min(length(path)) AS depth
RETURN ancestor.paperId AS paperId, ancestor.title AS title, ancestor.year AS year, depth
ORDER BY depth, ancestor.citedByCount DESC
LIMIT 100
