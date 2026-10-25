# 7. Queries

Twenty-five read queries, each a standalone file in [`db/queries/`](../db/queries) with a metadata header. The SQL,
the sample output and the plan summary below were produced from the loaded corpus by `pnpm docs:catalog`
on 2026-10-25: each query ran as its declared role inside a transaction that was rolled back, and its plan
comes from `EXPLAIN (ANALYZE, BUFFERS)`. The same files run live in the Query Lab (`/lab`).

| Group | Queries |
| --- | --- |
| join | Q01, Q02, Q03, Q04, Q05, Q06, Q07 |
| nested | Q08, Q09, Q10, Q11, Q12, Q13 |
| recursive | Q14, Q15, Q16, Q17 |
| analytics | Q18, Q19, Q20, Q21 |
| set operations | Q22 |
| JSON | Q23 |
| search | Q24, Q25 |

## Join queries

### Q01 · Everything a paper card shows

**Technique:** INNER JOIN, LEFT JOIN, string_agg ... ORDER BY, five tables · **runs as** `ra_anon` · [`Q01_paper_card.sql`](../db/queries/Q01_paper_card.sql)

Parameters (computed from the data): `paper_id` = 4897

```sql
SELECT p.paper_id,
       p.title,
       p.publication_date,
       v.venue_name,
       string_agg(a.author_name, ', ' ORDER BY pa.author_order) AS authors,
       t.topic_name AS primary_topic,
       r.status AS retraction_status,
       p.cited_by_count,
       p.local_citation_count
FROM paper p
LEFT JOIN venue v ON v.venue_id = p.venue_id
LEFT JOIN paper_author pa ON pa.paper_id = p.paper_id
LEFT JOIN author a ON a.author_id = pa.author_id
LEFT JOIN paper_topic pt ON pt.paper_id = p.paper_id AND pt.is_primary
LEFT JOIN topic t ON t.topic_id = pt.topic_id
LEFT JOIN retraction r ON r.paper_id = p.paper_id
WHERE p.paper_id = $1
GROUP BY p.paper_id, v.venue_name, t.topic_name, r.status;
```

| paper_id | title | publication_date | venue_name | authors | primary_topic | retraction_status | cited_by_count | local_citation_count |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4897 | Deep Residual Learning for Image Recognition | 2016-06-01 | IEEE Computer Society Conference on Computer Vision and Pattern Recog… | Kaiming He, Xiangyu Zhang, Shaoqing Ren, Jian Sun | Advanced Neural Network Applications | NULL | 234936 | 826 |

**Plan:** Aggregate · planning 0.61 ms · execution 0.15 ms · operators: Aggregate, Sort, Nested Loop, Index Scan using pk_paper, Index Scan using pk_venue, Index Scan using uq_one_primary_topic, Index Scan using pk_topic, Index Scan using uq_retraction_paper, …

### Q02 · Which author pairs collaborate most

**Technique:** self-join, a1.author_id < a2.author_id to count each pair once, GROUP BY · **runs as** `ra_anon` · [`Q02_collaborating_pairs.sql`](../db/queries/Q02_collaborating_pairs.sql)

```sql
SELECT a1.author_name AS author_a,
       a2.author_name AS author_b,
       count(*) AS shared_papers
FROM paper_author x
JOIN paper_author y ON y.paper_id = x.paper_id AND x.author_id < y.author_id
JOIN author a1 ON a1.author_id = x.author_id
JOIN author a2 ON a2.author_id = y.author_id
GROUP BY a1.author_id, a2.author_id
ORDER BY shared_papers DESC, author_a, author_b
LIMIT 20;
```

| author_a | author_b | shared_papers |
| --- | --- | --- |
| Su‐Ting Han | Ye Zhou | 19 |
| Qiangfei Xia | Zhongrui Wang | 18 |
| Ross Girshick | Kaiming He | 18 |
| Qiangfei Xia | Hao Jiang | 16 |
| Qiangfei Xia | Can Li | 15 |

_20 rows; the first 5 are shown._

**Plan:** Limit · planning 0.28 ms · execution 63.94 ms · operators: Limit, Sort, Aggregate, Hash Join, Seq Scan on paper_author, Hash, Seq Scan on author

### Q03 · Which methods are benchmarked on which datasets, including unpaired ones

**Technique:** FULL OUTER JOIN keeps methods with no dataset and datasets with no method · **runs as** `ra_anon` · [`Q03_method_dataset_pairs.sql`](../db/queries/Q03_method_dataset_pairs.sql)

```sql
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
```

| method | dataset | papers |
| --- | --- | --- |
| Convolution | COCO | 64 |
| Convolution | ImageNet | 61 |
| Convolutional Neural Network | ImageNet | 58 |
| Softmax | ImageNet | 58 |
| Residual Connection | COCO | 57 |

_1168 rows; the first 5 are shown._

**Plan:** Sort · planning 0.10 ms · execution 2.22 ms · operators: Sort, Hash Join, Aggregate, Seq Scan on paper_method, Hash, Seq Scan on paper_dataset, Seq Scan on method, Seq Scan on dataset

### Q04 · Top 3 papers in every leaf topic

**Technique:** CROSS JOIN LATERAL with ORDER BY ... LIMIT inside, per-group top-N · **runs as** `ra_anon` · [`Q04_top3_per_topic.sql`](../db/queries/Q04_top3_per_topic.sql)

```sql
SELECT t.topic_name, top3.title, top3.cited_by_count
FROM topic t
CROSS JOIN LATERAL (
  SELECT p.title, p.cited_by_count
  FROM paper_topic pt
  JOIN paper p ON p.paper_id = pt.paper_id
  WHERE pt.topic_id = t.topic_id
  ORDER BY p.cited_by_count DESC, p.paper_id
  LIMIT 3
) AS top3
WHERE t.topic_level = 3
ORDER BY t.topic_name, top3.cited_by_count DESC;
```

| topic_name | title | cited_by_count |
| --- | --- | --- |
| 2D Materials and Applications | Electric Field Effect in Atomically Thin Carbon Films | 66784 |
| 2D Materials and Applications | Two-dimensional materials for next-generation computing technologies | 1047 |
| 2D Materials and Applications | Multi-terminal memtransistors from polycrystalline monolayer molybden… | 1025 |
| 3D IC and TSV technologies | Three-dimensional integration of nanotechnologies for computing and d… | 865 |
| 3D IC and TSV technologies | Neurocube | 342 |

_2053 rows; the first 5 are shown._

**Plan:** Sort · planning 0.11 ms · execution 14.95 ms · operators: Sort, Nested Loop, Seq Scan on topic, Limit, Bitmap Heap Scan on paper_topic, Bitmap Index Scan using ix_paper_topic_topic_id, Index Scan using pk_paper

### Q05 · Papers with no topic, found two ways

**Technique:** anti-join: LEFT JOIN ... IS NULL versus NOT EXISTS (the planner turns both into a Hash Anti Join) · **runs as** `ra_anon` · [`Q05_papers_without_topic.sql`](../db/queries/Q05_papers_without_topic.sql)

```sql
SELECT 'LEFT JOIN … IS NULL' AS technique, count(*) AS papers_without_topic
FROM paper p
LEFT JOIN paper_topic pt ON pt.paper_id = p.paper_id
WHERE pt.paper_id IS NULL
UNION ALL
SELECT 'NOT EXISTS', count(*)
FROM paper p
WHERE NOT EXISTS (SELECT 1 FROM paper_topic pt WHERE pt.paper_id = p.paper_id);
```

| technique | papers_without_topic |
| --- | --- |
| LEFT JOIN … IS NULL | 0 |
| NOT EXISTS | 0 |

**Plan:** Append · planning 0.08 ms · execution 2.65 ms · operators: Append, Aggregate, Hash Join, Index Only Scan using pk_paper, Hash, Seq Scan on paper_topic

### Q06 · Authors with both journal and conference papers

**Technique:** semi-join with two EXISTS sub-queries · **runs as** `ra_anon` · [`Q06_journal_and_conference_authors.sql`](../db/queries/Q06_journal_and_conference_authors.sql)

```sql
SELECT a.author_id, a.author_name
FROM author a
WHERE EXISTS (SELECT 1 FROM paper_author pa JOIN paper p ON p.paper_id = pa.paper_id
              JOIN venue v ON v.venue_id = p.venue_id
              WHERE pa.author_id = a.author_id AND v.venue_type = 'JOURNAL')
  AND EXISTS (SELECT 1 FROM paper_author pa JOIN paper p ON p.paper_id = pa.paper_id
              JOIN venue v ON v.venue_id = p.venue_id
              WHERE pa.author_id = a.author_id AND v.venue_type = 'CONFERENCE')
ORDER BY a.author_name
LIMIT 50;
```

| author_id | author_name |
| --- | --- |
| 30348 | Abdelrahman Mohamed |
| 15053 | Adela Barriuso |
| 14664 | Aditya Khosla |
| 16539 | Àgata Lapedriza |
| 9028 | Alaaeldin El-Nouby |

_50 rows; the first 5 are shown._

**Plan:** Limit · planning 0.32 ms · execution 3.26 ms · operators: Limit, Sort, Nested Loop, Aggregate, Seq Scan on venue, Index Scan using ix_paper_venue_id, Index Only Scan using pk_paper_author, Index Scan using pk_author, …

### Q07 · Institution leaderboard by papers and citations

**Technique:** multi-table join, GROUP BY, HAVING, COUNT(DISTINCT) · **runs as** `ra_anon` · [`Q07_institution_leaderboard.sql`](../db/queries/Q07_institution_leaderboard.sql)

```sql
SELECT i.institution_name,
       i.country_code,
       count(DISTINCT pa.paper_id) AS papers,
       sum(p.cited_by_count) AS citations,
       count(DISTINCT pa.author_id) AS authors
FROM institution i
JOIN paper_author pa ON pa.affiliation_institution_id = i.institution_id
JOIN paper p ON p.paper_id = pa.paper_id
GROUP BY i.institution_id
HAVING count(DISTINCT pa.paper_id) >= 2
ORDER BY citations DESC, papers DESC
LIMIT 20;
```

| institution_name | country_code | papers | citations | authors |
| --- | --- | --- | --- | --- |
| Google (United States) | US | 203 | 4538945 | 531 |
| Google DeepMind (United Kingdom) | GB | 58 | 3002394 | 270 |
| Microsoft (United States) | US | 71 | 1449115 | 156 |
| Meta (United States) | US | 58 | 1247028 | 94 |
| Stanford University | US | 145 | 1169724 | 285 |

_20 rows; the first 5 are shown._

**Plan:** Limit · planning 0.14 ms · execution 13.10 ms · operators: Limit, Sort, Aggregate, Hash Join, Seq Scan on paper_author, Hash, Seq Scan on institution, Index Only Scan using ix_paper_cited_by_keyset

## Nested queries

### Q08 · Papers cited above their own venue's average

**Technique:** correlated scalar sub-query re-evaluated per outer row · **runs as** `ra_anon` · [`Q08_above_venue_average.sql`](../db/queries/Q08_above_venue_average.sql)

```sql
SELECT p.title,
       v.venue_name,
       p.cited_by_count,
       round((SELECT avg(p2.cited_by_count) FROM paper p2 WHERE p2.venue_id = p.venue_id), 1) AS venue_average
FROM paper p
JOIN venue v ON v.venue_id = p.venue_id
WHERE p.cited_by_count > (SELECT avg(p2.cited_by_count) FROM paper p2 WHERE p2.venue_id = p.venue_id)
ORDER BY p.cited_by_count - (SELECT avg(p2.cited_by_count) FROM paper p2 WHERE p2.venue_id = p.venue_id) DESC
LIMIT 25;
```

| title | venue_name | cited_by_count | venue_average |
| --- | --- | --- | --- |
| Deep Residual Learning for Image Recognition | IEEE Computer Society Conference on Computer Vision and Pattern Recog… | 234936 | 11211.1 |
| Random Forests | Machine Learning | 132569 | 24669.9 |
| Adam: A Method for Stochastic Optimization | arXiv (Cornell University) | 99043 | 1878.0 |
| Long Short-Term Memory | Neural Computation | 102073 | 13118.3 |
| U-Net: Convolutional Networks for Biomedical Image Segmentation | Lecture notes in computer science | 99143 | 10313.3 |

_25 rows; the first 5 are shown._

**Plan:** Limit · planning 0.13 ms · execution 160.61 ms · operators: Limit, Result, Sort, Nested Loop, Seq Scan on paper, Aggregate, Index Scan using ix_paper_venue_id, Index Scan using pk_venue

### Q09 · Authors active in every year 2021-2024

**Technique:** relational division, double NOT EXISTS, generate_series · **runs as** `ra_anon` · [`Q09_active_every_year.sql`](../db/queries/Q09_active_every_year.sql)

```sql
SELECT a.author_id, a.author_name
FROM author a
WHERE NOT EXISTS (
  SELECT 1 FROM generate_series(2021, 2024) AS y(yr)
  WHERE NOT EXISTS (
    SELECT 1
    FROM paper_author pa
    JOIN paper p USING (paper_id)
    WHERE pa.author_id = a.author_id
      AND p.publication_date >= make_date(y.yr, 1, 1)
      AND p.publication_date < make_date(y.yr + 1, 1, 1)))
ORDER BY a.author_name;
```

| author_id | author_name |
| --- | --- |
| 989 | Bai Tao Sun |
| 11088 | Demis Hassabis |
| 9455 | Deng-Ping Fan |
| 6958 | Fahad Shahbaz Khan |
| 991 | Guangdong Zhou |

_29 rows; the first 5 are shown._

**Plan:** Sort · planning 0.13 ms · execution 61.01 ms · operators: Sort, Nested Loop, Seq Scan on author, Function Scan, Index Scan using ix_paper_author_author_id, Index Scan using pk_paper

### Q10 · Datasets used more than every dataset in the medical domain

**Technique:** > ALL (sub-query), aggregate in HAVING · **runs as** `ra_anon` · [`Q10_beats_every_medical_dataset.sql`](../db/queries/Q10_beats_every_medical_dataset.sql)

```sql
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
```

| dataset_name | domain | papers |
| --- | --- | --- |
| ImageNet | Computer vision | 164 |
| COCO | Computer vision | 133 |
| PASCAL VOC | Computer vision | 69 |
| MNIST | Computer vision | 68 |
| CIFAR-10 | Computer vision | 54 |

_6 rows; the first 5 are shown._

**Plan:** Sort · planning 0.07 ms · execution 0.20 ms · operators: Sort, Aggregate, Hash Join, Seq Scan on paper_dataset, Hash, Seq Scan on dataset, Materialize

### Q11 · Topics whose median citations beat the global median

**Technique:** ordered-set aggregate percentile_cont, sub-query in HAVING · **runs as** `ra_anon` · [`Q11_topics_above_global_median.sql`](../db/queries/Q11_topics_above_global_median.sql)

```sql
SELECT t.topic_name,
       count(*) AS papers,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY p.cited_by_count) AS median_citations
FROM topic t
JOIN paper_topic pt ON pt.topic_id = t.topic_id
JOIN paper p ON p.paper_id = pt.paper_id
WHERE t.topic_level = 3
GROUP BY t.topic_id
HAVING percentile_cont(0.5) WITHIN GROUP (ORDER BY p.cited_by_count)
       > (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY cited_by_count) FROM paper)
ORDER BY median_citations DESC
LIMIT 25;
```

| topic_name | papers | median_citations |
| --- | --- | --- |
| Delphi Technique in Research | 1 | 107088 |
| Surface and Thin Film Phenomena | 1 | 66784 |
| Advanced Statistical Methods and Models | 1 | 51405 |
| Ion channel regulation and function | 1 | 23189 |
| Ion Transport and Channel Regulation | 1 | 23189 |

_25 rows; the first 5 are shown._

**Plan:** Limit · planning 0.12 ms · execution 5.66 ms · operators: Limit, Aggregate, Index Only Scan using ix_paper_cited_by_keyset, Sort, Hash Join, Seq Scan on paper_topic, Hash, Seq Scan on topic

### Q12 · Users with notes on papers outside all their collections

**Technique:** correlated NOT EXISTS across two tables; needs ra_admin because RLS hides other users' rows · **runs as** `ra_admin` · [`Q12_notes_outside_collections.sql`](../db/queries/Q12_notes_outside_collections.sql)

```sql
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
```

| name | title | updated_at |
| --- | --- | --- |
| Rhea Researcher | Continuous control with deep reinforcement learning | 2026-10-25T07:06:09.483Z |

**Plan:** Sort · planning 0.15 ms · execution 0.03 ms · operators: Sort, Nested Loop, Hash Join, Seq Scan on collection_paper, Hash, Seq Scan on collection, Seq Scan on note, Seq Scan on user_account, …

### Q13 · Most-cited paper per year

**Technique:** correlated MAX sub-query; the window-function rewrite is in the comment below · **runs as** `ra_anon` · [`Q13_most_cited_per_year.sql`](../db/queries/Q13_most_cited_per_year.sql)

```sql
-- Window rewrite (one pass instead of one sub-query per row):
--   SELECT year, title, cited_by_count FROM (
--     SELECT publication_year AS year, title, cited_by_count,
--            rank() OVER (PARTITION BY publication_year ORDER BY cited_by_count DESC) AS r
--     FROM paper WHERE publication_date IS NOT NULL) s WHERE r = 1 ORDER BY year;
SELECT p.publication_year AS year, p.title, p.cited_by_count
FROM paper p
WHERE p.publication_date IS NOT NULL
  AND p.cited_by_count = (
    SELECT max(p2.cited_by_count)
    FROM paper p2
    WHERE p2.publication_date >= date_trunc('year', p.publication_date)
      AND p2.publication_date < date_trunc('year', p.publication_date) + INTERVAL '1 year')
ORDER BY year;
```

| year | title | cited_by_count |
| --- | --- | --- |
| 1943 | A logical calculus of the ideas immanent in nervous activity | 18551 |
| 1950 | I.—COMPUTING MACHINERY AND INTELLIGENCE | 10271 |
| 1951 | On Information and Sufficiency | 20169 |
| 1952 | A quantitative description of membrane current and its application to… | 23189 |
| 1958 | The perceptron: A probabilistic model for information storage and org… | 12270 |

_55 rows; the first 5 are shown._

**Plan:** Sort · planning 0.10 ms · execution 640.63 ms · operators: Sort, Seq Scan on paper, Aggregate, Bitmap Heap Scan on paper, Bitmap Index Scan using ix_paper_publication_date

## Recursive queries

### Q14 · A topic's full subtree with depth and path

**Technique:** recursive CTE walking down a self-referencing foreign key, path accumulation · **runs as** `ra_anon` · [`Q14_topic_subtree.sql`](../db/queries/Q14_topic_subtree.sql)

Parameters (computed from the data): `topic_id` = 2220

```sql
WITH RECURSIVE subtree(topic_id, topic_name, topic_level, depth, path) AS (
  SELECT topic_id, topic_name, topic_level, 0, topic_name::TEXT
  FROM topic WHERE topic_id = $1
  UNION ALL
  SELECT t.topic_id, t.topic_name, t.topic_level, s.depth + 1, s.path || ' › ' || t.topic_name
  FROM subtree s
  JOIN topic t ON t.parent_topic_id = s.topic_id
)
SELECT depth, repeat('  ', depth) || topic_name AS topic, path
FROM subtree
ORDER BY path;
```

| depth | topic | path |
| --- | --- | --- |
| 0 | Medicine | Medicine |
| 1 |  Anesthesiology and Pain Medicine | Medicine › Anesthesiology and Pain Medicine |
| 2 |  Anesthesia and Sedative Agents | Medicine › Anesthesiology and Pain Medicine › Anesthesia and Sedative… |
| 2 |  Pain Management and Opioid Use | Medicine › Anesthesiology and Pain Medicine › Pain Management and Opi… |
| 2 |  Pain Management and Treatment | Medicine › Anesthesiology and Pain Medicine › Pain Management and Tre… |

_176 rows; the first 5 are shown._

**Plan:** Sort · planning 0.03 ms · execution 0.92 ms · operators: Sort, Recursive Union, Index Scan using pk_topic, Hash Join, Seq Scan on topic, Hash, WorkTable Scan, CTE Scan

### Q15 · What a paper builds on, three levels deep

**Technique:** recursive CTE with SEARCH BREADTH FIRST and CYCLE clauses, DISTINCT ON for the shortest depth · **runs as** `ra_anon` · [`Q15_lineage.sql`](../db/queries/Q15_lineage.sql)

Parameters (computed from the data): `paper_id` = 60

```sql
WITH RECURSIVE ancestors(paper_id, depth) AS (
  SELECT c.cited_paper_id, 1 FROM citation c WHERE c.citing_paper_id = $1
  UNION ALL
  SELECT c.cited_paper_id, a.depth + 1
  FROM ancestors a JOIN citation c ON c.citing_paper_id = a.paper_id
  WHERE a.depth < 3
) SEARCH BREADTH FIRST BY paper_id SET bfs_order
  CYCLE paper_id SET is_cycle USING visit_path
SELECT DISTINCT ON (a.paper_id) a.paper_id, a.depth, p.title, p.publication_year
FROM ancestors a
JOIN paper p ON p.paper_id = a.paper_id
WHERE NOT a.is_cycle
ORDER BY a.paper_id, a.depth
LIMIT 100;
```

| paper_id | depth | title | publication_year |
| --- | --- | --- | --- |
| 1 | 2 | Loihi: A Neuromorphic Manycore Processor with On-Chip Learning | 2018 |
| 2 | 1 | Training and operation of an integrated neuromorphic network based on… | 2015 |
| 4 | 1 | Memristors with diffusive dynamics as synaptic emulators for neuromor… | 2016 |
| 7 | 2 | The future of electronics based on memristive systems | 2017 |
| 8 | 1 | Organic electrochemical transistors | 2018 |

_100 rows; the first 5 are shown._

**Plan:** Limit · planning 0.11 ms · execution 28.18 ms · operators: Limit, Recursive Union, Index Only Scan using pk_citation, Nested Loop, WorkTable Scan, Unique, Sort, Hash Join, …

### Q16 · Shortest citation path between two papers

**Technique:** breadth-first recursive CTE carrying a path array, stops at the first depth that reaches the target · **runs as** `ra_anon` · [`Q16_shortest_citation_path.sql`](../db/queries/Q16_shortest_citation_path.sql)

Parameters (computed from the data): `from_id` = 1, `to_id` = 4897

```sql
WITH RECURSIVE walk(paper_id, depth, path) AS (
  SELECT $1::BIGINT, 0, ARRAY[$1::BIGINT]
  UNION ALL
  SELECT c.cited_paper_id, w.depth + 1, w.path || c.cited_paper_id
  FROM walk w
  JOIN citation c ON c.citing_paper_id = w.paper_id
  WHERE w.depth < 4
    AND NOT c.cited_paper_id = ANY (w.path)
    AND w.paper_id <> $2
), hits AS (
  SELECT path, depth FROM walk WHERE paper_id = $2
)
SELECT h.depth AS hops,
       (SELECT string_agg(p.title, '  →  ' ORDER BY u.ord)
        FROM unnest(h.path) WITH ORDINALITY AS u(paper_id, ord)
        JOIN paper p ON p.paper_id = u.paper_id) AS chain
FROM hits h
WHERE h.depth = (SELECT min(depth) FROM hits)
LIMIT 3;
```

| hops | chain |
| --- | --- |
| 3 | Loihi: A Neuromorphic Manycore Processor with On-Chip Learning → Even… |
| 3 | Loihi: A Neuromorphic Manycore Processor with On-Chip Learning → Even… |
| 3 | Loihi: A Neuromorphic Manycore Processor with On-Chip Learning → Even… |

**Plan:** Limit · planning 0.07 ms · execution 0.94 ms · operators: Limit, Recursive Union, Result, Nested Loop, WorkTable Scan, Index Only Scan using pk_citation, CTE Scan, Aggregate, …

### Q17 · Papers within two hops of retracted work

**Technique:** recursive CTE seeded from a join with retraction, hop counting, DISTINCT ON · **runs as** `ra_anon` · [`Q17_retraction_neighbourhood.sql`](../db/queries/Q17_retraction_neighbourhood.sql)

```sql
WITH RECURSIVE exposure(paper_id, retracted_id, hops) AS (
  SELECT c.citing_paper_id, r.paper_id, 1
  FROM retraction r
  JOIN citation c ON c.cited_paper_id = r.paper_id
  WHERE r.status <> 'REINSTATED'
  UNION ALL
  SELECT c.citing_paper_id, e.retracted_id, e.hops + 1
  FROM exposure e
  JOIN citation c ON c.cited_paper_id = e.paper_id
  WHERE e.hops < 2
)
SELECT DISTINCT ON (e.paper_id) p.title AS exposed_paper, e.hops, rp.title AS retracted_paper
FROM exposure e
JOIN paper p ON p.paper_id = e.paper_id
JOIN paper rp ON rp.paper_id = e.retracted_id
ORDER BY e.paper_id, e.hops
LIMIT 100;
```

| exposed_paper | hops | retracted_paper |
| --- | --- | --- |
| A Comprehensive Survey of Deep Learning Approaches in Image Processing | 2 | Deep Learning Model for the Automatic Classification of White Blood C… |
| MA-Net: A Multi-Scale Attention Network for Liver and Tumor Segmentat… | 2 | U-Net-Based Medical Image Segmentation |
| Machine learning techniques for IoT security: Current research and fu… | 2 | RETRACTED ARTICLE: Maintaining Security and Privacy in Health Care Sy… |
| CSWin-UNet: Transformer UNet with cross-shaped windows for medical im… | 2 | Deep Neural Networks for Medical Image Segmentation |
| Permissioned Blockchain and Deep Learning for Secure and Efficient Da… | 2 | RETRACTED ARTICLE: Securing e-health records using keyless signature … |

_100 rows; the first 5 are shown._

**Plan:** Limit · planning 0.16 ms · execution 82.47 ms · operators: Limit, Recursive Union, Hash Join, Seq Scan on citation, Hash, Seq Scan on retraction, Merge Join, Index Scan using ix_citation_cited_paper_id, …

## Analytics queries

### Q18 · Rank papers inside each topic

**Technique:** window functions DENSE_RANK and PERCENT_RANK partitioned by topic · **runs as** `ra_anon` · [`Q18_rank_within_topic.sql`](../db/queries/Q18_rank_within_topic.sql)

```sql
SELECT *
FROM (
  SELECT t.topic_name,
         p.title,
         p.cited_by_count,
         dense_rank() OVER w AS rank_in_topic,
         round(percent_rank() OVER w::NUMERIC, 3) AS percent_rank
  FROM paper_topic pt
  JOIN topic t ON t.topic_id = pt.topic_id
  JOIN paper p ON p.paper_id = pt.paper_id
  WHERE pt.is_primary
  WINDOW w AS (PARTITION BY t.topic_id ORDER BY p.cited_by_count DESC)
) ranked
WHERE rank_in_topic <= 5
ORDER BY topic_name, rank_in_topic;
```

| topic_name | title | cited_by_count | rank_in_topic | percent_rank |
| --- | --- | --- | --- | --- |
| 2D Materials and Applications | Two-dimensional materials for next-generation computing technologies | 1047 | 1 | 0.000 |
| 2D Materials and Applications | Transistors based on two-dimensional materials for future integrated … | 988 | 2 | 0.045 |
| 2D Materials and Applications | 2D Heterostructures for Ubiquitous Electronics and Optoelectronics: P… | 716 | 3 | 0.091 |
| 2D Materials and Applications | Bioinspired in-sensor visual adaptation for accurate perception | 611 | 4 | 0.136 |
| 2D Materials and Applications | Human eye-inspired soft optoelectronic device using high-density MoS2… | 541 | 5 | 0.182 |

_1118 rows; the first 5 are shown._

**Plan:** Sort · planning 0.13 ms · execution 3.93 ms · operators: Sort, Subquery Scan, WindowAgg, Hash Join, Index Scan using uq_one_primary_topic, Hash, Seq Scan on topic, Seq Scan on paper

### Q19 · Topic growth and three-year moving average

**Technique:** LAG(), AVG() OVER (ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), function call in FROM · **runs as** `ra_anon` · [`Q19_topic_growth_moving_average.sql`](../db/queries/Q19_topic_growth_moving_average.sql)

Parameters (computed from the data): `topic_id` = 51

```sql
SELECT g.year,
       g.papers,
       g.papers - lag(g.papers) OVER (ORDER BY g.year) AS change,
       g.yoy_pct,
       round(avg(g.papers) OVER (ORDER BY g.year ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 1) AS moving_avg_3y
FROM fn_topic_growth($1, 2012, EXTRACT(YEAR FROM now())::INT) g
ORDER BY g.year;
```

| year | papers | change | yoy_pct | moving_avg_3y |
| --- | --- | --- | --- | --- |
| 2012 | 9 | NULL | NULL | 9.0 |
| 2013 | 15 | 6 | 66.7 | 12.0 |
| 2014 | 39 | 24 | 160.0 | 21.0 |
| 2015 | 43 | 4 | 10.3 | 32.3 |
| 2016 | 73 | 30 | 69.8 | 51.7 |

_15 rows; the first 5 are shown._

**Plan:** WindowAgg · planning 0.01 ms · execution 1.20 ms · operators: WindowAgg, Sort, Function Scan

### Q20 · Papers by field and year with subtotals

**Technique:** GROUPING SETS with a grand total, GROUPING() to label subtotal rows · **runs as** `ra_anon` · [`Q20_topic_year_rollup.sql`](../db/queries/Q20_topic_year_rollup.sql)

```sql
SELECT CASE WHEN grouping(f.topic_name) = 1 THEN 'All fields' ELSE f.topic_name END AS field,
       CASE WHEN grouping(p.publication_year) = 1 THEN 'All years' ELSE p.publication_year::TEXT END AS year,
       count(DISTINCT p.paper_id) AS papers
FROM paper p
JOIN paper_topic pt ON pt.paper_id = p.paper_id AND pt.is_primary
JOIN topic t ON t.topic_id = pt.topic_id
JOIN topic sf ON sf.topic_id = t.parent_topic_id
JOIN topic f ON f.topic_id = sf.parent_topic_id
WHERE p.publication_date >= make_date(EXTRACT(YEAR FROM now())::INT - 5, 1, 1)
GROUP BY GROUPING SETS ((f.topic_name, p.publication_year), (f.topic_name), ())
ORDER BY grouping(f.topic_name), field, grouping(p.publication_year), year;
```

| field | year | papers |
| --- | --- | --- |
| Agricultural and Biological Sciences | 2021 | 1 |
| Agricultural and Biological Sciences | 2022 | 2 |
| Agricultural and Biological Sciences | 2023 | 8 |
| Agricultural and Biological Sciences | 2024 | 6 |
| Agricultural and Biological Sciences | 2025 | 2 |

_109 rows; the first 5 are shown._

**Plan:** Sort · planning 0.17 ms · execution 3.31 ms · operators: Sort, Aggregate, Hash Join, Index Scan using uq_one_primary_topic, Hash, Seq Scan on paper, Seq Scan on topic

### Q21 · Open versus closed access per venue

**Technique:** conditional aggregation with count(*) FILTER (WHERE ...) · **runs as** `ra_anon` · [`Q21_open_access_by_venue.sql`](../db/queries/Q21_open_access_by_venue.sql)

```sql
SELECT v.venue_name,
       count(*) AS papers,
       count(*) FILTER (WHERE p.open_access) AS open_access,
       count(*) FILTER (WHERE NOT p.open_access) AS closed,
       round(100.0 * count(*) FILTER (WHERE p.open_access) / count(*), 1) AS open_pct
FROM paper p
JOIN venue v ON v.venue_id = p.venue_id
GROUP BY v.venue_id
HAVING count(*) >= 3
ORDER BY papers DESC
LIMIT 20;
```

| venue_name | papers | open_access | closed | open_pct |
| --- | --- | --- | --- | --- |
| arXiv (Cornell University) | 779 | 779 | 0 | 100.0 |
| Nature Communications | 149 | 149 | 0 | 100.0 |
| IEEE Transactions on Pattern Analysis and Machine Intelligence | 145 | 105 | 40 | 72.4 |
| Advanced Materials | 120 | 41 | 79 | 34.2 |
| IEEE Access | 115 | 115 | 0 | 100.0 |

_20 rows; the first 5 are shown._

**Plan:** Limit · planning 0.05 ms · execution 1.23 ms · operators: Limit, Sort, Aggregate, Hash Join, Seq Scan on paper, Hash, Seq Scan on venue

## Set operations queries

### Q22 · Authors in two topics, and in one but not the other

**Technique:** INTERSECT and EXCEPT over the same projection · **runs as** `ra_anon` · [`Q22_authors_across_topics.sql`](../db/queries/Q22_authors_across_topics.sql)

Parameters (computed from the data): `topic_a` = 6, `topic_b` = 47606

```sql
(SELECT 'both topics' AS membership, a.author_name
 FROM author a JOIN paper_author pa USING (author_id) JOIN paper_topic pt USING (paper_id) WHERE pt.topic_id = $1
 INTERSECT
 SELECT 'both topics', a.author_name
 FROM author a JOIN paper_author pa USING (author_id) JOIN paper_topic pt USING (paper_id) WHERE pt.topic_id = $2)
UNION ALL
(SELECT 'first topic only', a.author_name
 FROM author a JOIN paper_author pa USING (author_id) JOIN paper_topic pt USING (paper_id) WHERE pt.topic_id = $1
 EXCEPT
 SELECT 'first topic only', a.author_name
 FROM author a JOIN paper_author pa USING (author_id) JOIN paper_topic pt USING (paper_id) WHERE pt.topic_id = $2)
ORDER BY membership, author_name
LIMIT 60;
```

| membership | author_name |
| --- | --- |
| first topic only | Aapo Kyrola |
| first topic only | Aaron Jaffey |
| first topic only | Adam K. Lerer |
| first topic only | Adam Paszke |
| first topic only | Aditya Gilra |

_60 rows; the first 5 are shown._

## JSON queries

### Q23 · A paper with nested authors and topics as one JSON document

**Technique:** jsonb_build_object, jsonb_agg with ORDER BY, correlated sub-queries producing arrays · **runs as** `ra_anon` · [`Q23_paper_as_json.sql`](../db/queries/Q23_paper_as_json.sql)

Parameters (computed from the data): `paper_id` = 4897

```sql
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
```

| document |
| --- |
| { "doi": "10.1109/cvpr.2016.90", "year": 2016, "cites": 26, "title": … |

**Plan:** Index Scan using pk_paper · planning 0.09 ms · execution 0.15 ms · operators: Index Scan using pk_paper, Index Scan using pk_venue, Aggregate, Nested Loop, Index Scan using uq_paper_author_order, Index Scan using pk_author, Sort, Index Scan using pk_paper_topic, …

## Search queries

### Q24 · Fuzzy author lookup that survives typos

**Technique:** pg_trgm % operator (uses the GIN trigram index) and similarity() for ranking · **runs as** `ra_anon` · [`Q24_fuzzy_author_lookup.sql`](../db/queries/Q24_fuzzy_author_lookup.sql)

Parameters (computed from the data): `name` = Quxc Viet Le

```sql
SELECT a.author_name,
       round(similarity(a.author_name, $1)::NUMERIC, 3) AS similarity,
       (SELECT count(*) FROM paper_author pa WHERE pa.author_id = a.author_id) AS papers
FROM author a
WHERE a.author_name % $1
ORDER BY similarity DESC, papers DESC
LIMIT 10;
```

| author_name | similarity | papers |
| --- | --- | --- |
| Quoc Viet Le | 0.625 | 38 |

**Plan:** Limit · planning 0.25 ms · execution 0.15 ms · operators: Limit, Sort, Bitmap Heap Scan on author, Bitmap Index Scan using ix_author_name_trgm, Aggregate, Index Only Scan using ix_paper_author_author_id

### Q25 · Ranked full-text search with highlights

**Technique:** websearch_to_tsquery, ts_rank_cd over a weighted tsvector, ts_headline, GIN index · **runs as** `ra_anon` · [`Q25_ranked_full_text_search.sql`](../db/queries/Q25_ranked_full_text_search.sql)

Parameters (computed from the data): `query` = energy efficient spiking

```sql
SELECT p.title,
       round(ts_rank_cd(p.search_vector, q)::NUMERIC, 4) AS rank,
       ts_headline('english', coalesce(p.abstract, p.title), q,
                   'MaxFragments=1, MaxWords=24, MinWords=8, StartSel=«, StopSel=»') AS snippet
FROM paper p, websearch_to_tsquery('english', $1) AS q
WHERE p.search_vector @@ q
ORDER BY rank DESC, p.cited_by_count DESC
LIMIT 10;
```

| title | rank | snippet |
| --- | --- | --- |
| SIBoLS: Robust and Energy-Efficient Learning for Spike-Based Machine … | 0.6977 | theories to derive learning algorithms for improving the robustness a… |
| An artificial visual neuron with multiplexed rate and time-to-first-s… | 0.6063 | Human visual neurons rely on event-driven, «energy»-«efficient» «spik… |
| A Spiking Neural Network With Adaptive Graph Convolution and LSTM for… | 0.4156 | classification is essential for the brain-computer interface (BCI). R… |
| Magnetic skyrmion-based artificial neuron device | 0.4000 | artificial neuron may enable us to build a dense and «energy»-«effici… |
| High-performance deep spiking neural networks with 0.3 spikes per neu… | 0.1844 | Communication by rare, binary «spikes» is a key factor for the «energ… |

_10 rows; the first 5 are shown._

**Plan:** Limit · planning 0.04 ms · execution 1.06 ms · operators: Limit, Result, Sort, Bitmap Heap Scan on paper, Bitmap Index Scan using ix_paper_search_vector

<!-- chapter-nav -->

---

[← DML](06-dml.md) · [Documentation index](README.md) · [Advanced SQL →](08-advanced-sql.md)
