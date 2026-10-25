// @id        C03
// @title     How are these two papers connected?
// @category  traversal
// @concepts  SHORTEST 1 path pattern over CITES in either direction, quantified relationship -+
// @role      ra_anon
// @param     from_id int = MATCH (p:Paper)-[:CITES]->() RETURN p.paperId ORDER BY p.year DESC, p.citedByCount DESC LIMIT 1
// @param     to_id int = MATCH (p:Paper) RETURN p.paperId ORDER BY p.localCitations DESC LIMIT 1
MATCH path = SHORTEST 1 (a:Paper {paperId: $from_id})-[:CITES]-+(b:Paper {paperId: $to_id})
RETURN length(path) AS hops, [n IN nodes(path) | n.title] AS chain
