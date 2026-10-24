-- @id        Q03
-- @title     Which methods are benchmarked on which datasets, including unpaired ones
-- @category  join
-- @concepts  FULL OUTER JOIN keeps methods with no dataset and datasets with no method
-- @role      ra_anon
-- @params    none
WITH used_together AS (
  SELECT pm.method_id, pd.dataset_id, count(DISTINCT pm.paper_id) AS papers
  FROM paper_method pm
  JOIN paper_dataset pd ON pd.paper_id = pm.paper_id
  GROUP BY pm.method_id, pd.dataset_id
), methods AS (
  SELECT m.method_id, m.method_name, u.dataset_id, u.papers
  FROM method m
  LEFT JOIN used_together u ON u.method_id = m.method_id
)
SELECT coalesce(methods.method_name, '— no method —') AS method,
       coalesce(d.dataset_name, '— no dataset —') AS dataset,
       coalesce(methods.papers, 0) AS papers
FROM methods
FULL OUTER JOIN dataset d ON d.dataset_id = methods.dataset_id
ORDER BY papers DESC, method, dataset;
