-- @id        Q12
-- @title     Users with notes on papers outside all their collections
-- @category  nested
-- @concepts  correlated NOT EXISTS across two tables; needs ra_admin because RLS hides other users' rows
-- @role      ra_admin
-- @params    none
SELECT u.name, p.title, n.updated_at
FROM note n
JOIN user_account u ON u.user_id = n.user_id
JOIN paper p ON p.paper_id = n.paper_id
WHERE NOT EXISTS (
  SELECT 1
  FROM collection c
  JOIN collection_paper cp ON cp.collection_id = c.collection_id
  WHERE c.user_id = n.user_id AND cp.paper_id = n.paper_id)
ORDER BY u.name, n.updated_at DESC;
