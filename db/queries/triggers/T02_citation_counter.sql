-- @id        T02
-- @title     Add a citation and watch the counter move
-- @category  triggers
-- @concepts  statement-level AFTER INSERT trigger with a transition table keeps local_citation_count exact
-- @role      ra_curator
-- @param     cited_id bigint = SELECT paper_id FROM paper ORDER BY local_citation_count DESC, paper_id LIMIT 1
-- @param     citing_id bigint = SELECT p.paper_id FROM paper p WHERE p.paper_id <> (SELECT paper_id FROM paper ORDER BY local_citation_count DESC, paper_id LIMIT 1) AND NOT EXISTS (SELECT 1 FROM citation c WHERE c.citing_paper_id = p.paper_id AND c.cited_paper_id = (SELECT paper_id FROM paper ORDER BY local_citation_count DESC, paper_id LIMIT 1)) ORDER BY p.paper_id LIMIT 1
SELECT paper_id, local_citation_count AS before FROM paper WHERE paper_id = $1;
INSERT INTO citation (citing_paper_id, cited_paper_id) VALUES ($2, $1);
SELECT paper_id, local_citation_count AS after FROM paper WHERE paper_id = $1;
