-- @id        P07
-- @title     Save a DOI that is not a DOI
-- @category  constraints
-- @concepts  CHECK with a regular expression on the DOI syntax
-- @role      ra_curator
-- @expect    chk_paper_doi_format
-- @param     paper_id bigint = SELECT paper_id FROM paper ORDER BY paper_id LIMIT 1
UPDATE paper SET doi = 'not-a-doi' WHERE paper_id = $1;
