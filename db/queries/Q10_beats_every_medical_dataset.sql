-- @id        Q10
-- @title     Datasets used more than every dataset in the medical domain
-- @category  nested
-- @concepts  > ALL (sub-query), aggregate in HAVING
-- @role      ra_anon
-- @params    none
SELECT d.dataset_name, d.domain, count(*) AS papers
FROM dataset d
JOIN paper_dataset pd ON pd.dataset_id = d.dataset_id
GROUP BY d.dataset_id
HAVING count(*) > ALL (
  SELECT count(*)
  FROM paper_dataset pd2
  JOIN dataset d2 ON d2.dataset_id = pd2.dataset_id
  WHERE d2.domain ILIKE '%medic%'
  GROUP BY d2.dataset_id)
ORDER BY papers DESC;
