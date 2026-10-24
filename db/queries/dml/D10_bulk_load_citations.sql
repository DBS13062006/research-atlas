-- @id        D10
-- @title     Bulk-load citations from a CSV file
-- @category  dml
-- @concepts  COPY ... FROM STDIN into a staging table (psql: \copy), then INSERT ... SELECT with joins and ON CONFLICT
-- @role      ra_curator
-- @stdin     dml/D10_citations.csv
-- @params    none
CREATE TEMP TABLE citation_staging (citing_openalex_id TEXT, cited_openalex_id TEXT) ON COMMIT DROP;
COPY citation_staging FROM STDIN WITH (FORMAT csv, HEADER true);
INSERT INTO citation (citing_paper_id, cited_paper_id)
SELECT citing.paper_id, cited.paper_id
FROM citation_staging s
JOIN paper citing ON citing.openalex_id = s.citing_openalex_id
JOIN paper cited ON cited.openalex_id = s.cited_openalex_id
WHERE citing.paper_id <> cited.paper_id
ON CONFLICT DO NOTHING
RETURNING citing_paper_id, cited_paper_id;
