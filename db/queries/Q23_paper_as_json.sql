-- @id        Q23
-- @title     A paper with nested authors and topics as one JSON document
-- @category  JSON
-- @concepts  jsonb_build_object, jsonb_agg with ORDER BY, correlated sub-queries producing arrays
-- @role      ra_anon
-- @param     paper_id bigint = SELECT paper_id FROM paper ORDER BY local_citation_count DESC, paper_id LIMIT 1
SELECT jsonb_pretty(jsonb_build_object(
  'paper_id', p.paper_id,
  'title', p.title,
  'doi', p.doi,
  'year', p.publication_year,
  'venue', (SELECT jsonb_build_object('name', v.venue_name, 'type', v.venue_type) FROM venue v WHERE v.venue_id = p.venue_id),
  'authors', (SELECT jsonb_agg(jsonb_build_object('order', pa.author_order, 'name', a.author_name,
                                                  'corresponding', pa.is_corresponding) ORDER BY pa.author_order)
              FROM paper_author pa JOIN author a ON a.author_id = pa.author_id WHERE pa.paper_id = p.paper_id),
  'topics', (SELECT jsonb_agg(jsonb_build_object('name', t.topic_name, 'path', fn_topic_path(t.topic_id),
                                                 'score', pt.relevance_score) ORDER BY pt.relevance_score DESC NULLS LAST)
             FROM paper_topic pt JOIN topic t ON t.topic_id = pt.topic_id WHERE pt.paper_id = p.paper_id),
  'cites', (SELECT count(*) FROM citation c WHERE c.citing_paper_id = p.paper_id),
  'cited_by', p.local_citation_count)) AS document
FROM paper p
WHERE p.paper_id = $1;
