-- migrate:up
-- 230 · Views and materialized views. Plain views use security_invoker so row-level security is
-- evaluated for the caller, not for the view owner.
SET ROLE ra_owner;

-- Everything a paper card shows, read by every list page.
CREATE VIEW v_paper_card WITH (security_invoker = true) AS
SELECT p.paper_id,
       p.openalex_id,
       p.doi,
       p.arxiv_id,
       p.title,
       p.publication_date,
       p.publication_year,
       p.work_type,
       p.open_access,
       p.oa_status,
       p.cited_by_count,
       p.local_citation_count,
       v.venue_id,
       v.venue_name,
       v.venue_type,
       authors.author_names,
       authors.author_count,
       pt.topic_id AS primary_topic_id,
       t.topic_name AS primary_topic_name,
       fn_topic_path(pt.topic_id) AS primary_topic_path,
       r.status AS retraction_status,
       r.retraction_date
FROM paper p
LEFT JOIN venue v ON v.venue_id = p.venue_id
LEFT JOIN LATERAL (
  SELECT string_agg(a.author_name, ', ' ORDER BY pa.author_order) AS author_names,
         count(*)::INT AS author_count
  FROM paper_author pa JOIN author a ON a.author_id = pa.author_id
  WHERE pa.paper_id = p.paper_id
) authors ON TRUE
LEFT JOIN paper_topic pt ON pt.paper_id = p.paper_id AND pt.is_primary
LEFT JOIN topic t ON t.topic_id = pt.topic_id
LEFT JOIN retraction r ON r.paper_id = p.paper_id;

-- Papers that cite retracted work directly (1 hop) or through one intermediate paper (2 hops).
CREATE VIEW v_retraction_exposure WITH (security_invoker = true) AS
WITH RECURSIVE reach(paper_id, retracted_paper_id, hops, path) AS (
  SELECT c.citing_paper_id, r.paper_id, 1, ARRAY[c.citing_paper_id, r.paper_id]
  FROM retraction r JOIN citation c ON c.cited_paper_id = r.paper_id
  WHERE r.status <> 'REINSTATED'
  UNION ALL
  SELECT c.citing_paper_id, reach.retracted_paper_id, reach.hops + 1, c.citing_paper_id || reach.path
  FROM reach JOIN citation c ON c.cited_paper_id = reach.paper_id
  WHERE reach.hops < 2 AND NOT c.citing_paper_id = ANY (reach.path)
)
SELECT DISTINCT ON (paper_id, retracted_paper_id) paper_id, retracted_paper_id, hops, path
FROM reach
ORDER BY paper_id, retracted_paper_id, hops;

-- The signed-in user's collections with counts by reading status. Relies on row-level security
-- and app_current_user_id(), so the same query returns different rows for different users.
CREATE VIEW v_my_library WITH (security_invoker = true) AS
SELECT c.collection_id,
       c.public_id,
       c.collection_name,
       c.description,
       c.is_public,
       c.updated_at,
       count(cp.paper_id)::INT AS papers,
       (count(*) FILTER (WHERE cp.reading_status = 'NOT_READ'))::INT AS not_read,
       (count(*) FILTER (WHERE cp.reading_status = 'READING'))::INT AS reading,
       (count(*) FILTER (WHERE cp.reading_status = 'READ'))::INT AS read
FROM collection c
LEFT JOIN collection_paper cp ON cp.collection_id = c.collection_id
WHERE c.user_id = app_current_user_id()
GROUP BY c.collection_id;

-- Papers, citations and open-access share per topic and year, counted over each topic's whole
-- subtree (a paper in "Spiking Neural Networks" also counts for "Artificial Intelligence").
CREATE MATERIALIZED VIEW mv_topic_year_stats AS
WITH RECURSIVE closure(ancestor_id, topic_id) AS (
  SELECT topic_id, topic_id FROM topic
  UNION ALL
  SELECT closure.ancestor_id, t.topic_id
  FROM closure JOIN topic t ON t.parent_topic_id = closure.topic_id
), linked AS (
  SELECT DISTINCT cl.ancestor_id AS topic_id, p.paper_id,
         EXTRACT(YEAR FROM p.publication_date)::INT AS year,
         p.cited_by_count, p.open_access
  FROM closure cl
  JOIN paper_topic pt ON pt.topic_id = cl.topic_id
  JOIN paper p ON p.paper_id = pt.paper_id
  WHERE p.publication_date IS NOT NULL
)
SELECT topic_id, year,
       count(*)::INT AS papers,
       sum(cited_by_count)::BIGINT AS citations,
       round(avg(open_access::INT), 3) AS open_access_share
FROM linked
GROUP BY topic_id, year
WITH DATA;
CREATE UNIQUE INDEX uq_mv_topic_year_stats ON mv_topic_year_stats (topic_id, year);

CREATE MATERIALIZED VIEW mv_author_stats AS
SELECT a.author_id,
       count(pa.paper_id)::INT AS papers,
       coalesce(sum(p.cited_by_count), 0)::BIGINT AS citations,
       fn_author_h_index(a.author_id) AS h_index,
       min(EXTRACT(YEAR FROM p.publication_date))::INT AS first_year,
       max(EXTRACT(YEAR FROM p.publication_date))::INT AS last_year
FROM author a
LEFT JOIN paper_author pa ON pa.author_id = a.author_id
LEFT JOIN paper p ON p.paper_id = pa.paper_id
GROUP BY a.author_id
WITH DATA;
CREATE UNIQUE INDEX uq_mv_author_stats ON mv_author_stats (author_id);
CREATE INDEX ix_mv_author_stats_h_index ON mv_author_stats (h_index DESC);

RESET ROLE;

-- migrate:down
SET ROLE ra_owner;
DROP MATERIALIZED VIEW IF EXISTS mv_author_stats;
DROP MATERIALIZED VIEW IF EXISTS mv_topic_year_stats;
DROP VIEW IF EXISTS v_my_library;
DROP VIEW IF EXISTS v_retraction_exposure;
DROP VIEW IF EXISTS v_paper_card;
RESET ROLE;
