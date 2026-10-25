# 6. Data manipulation

Ten DML files in [`db/queries/dml/`](../db/queries/dml), one per technique. Each ran as its declared role
on 2026-10-25 inside a transaction that was rolled back, so the outputs below are real but changed nothing.
In the Query Lab an administrator may switch on “Commit for real”.

| File | Statement                                                   | Demonstrates                                                                                              |
| ---- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| D01  | Add new methods in one statement                            | multi-row INSERT, column defaults, RETURNING                                                              |
| D02  | Add every paper of a topic to a collection                  | INSERT ... SELECT with a window function for positions, ON CONFLICT DO NOTHING, RLS-checked               |
| D03  | Re-score a paper's topics                                   | INSERT ... ON CONFLICT (key) DO UPDATE SET ... = EXCLUDED.... (upsert)                                    |
| D04  | Mark collection items READ where the user has written notes | UPDATE ... FROM with a join; the read_at trigger fires; RLS limits rows to the caller's                   |
| D05  | Raise a priority and show the before and after values       | UPDATE ... RETURNING old.* and new.* (PostgreSQL 18)                                                      |
| D06  | Remove dead resource links                                  | DELETE ... USING a temporary table of URLs found to be dead                                               |
| D07  | Delete a paper and show what cascaded                       | ON DELETE CASCADE across seven child tables, row counts before and after                                  |
| D08  | Sync a subfield's topics from a staging table               | MERGE with WHEN MATCHED, WHEN NOT MATCHED and WHEN NOT MATCHED BY SOURCE, RETURNING merge_action()        |
| D09  | Swap two authors' positions safely                          | SAVEPOINT, SET CONSTRAINTS ... DEFERRED on a DEFERRABLE UNIQUE constraint, RELEASE SAVEPOINT              |
| D10  | Bulk-load citations from a CSV file                         | COPY ... FROM STDIN into a staging table (psql: \copy), then INSERT ... SELECT with joins and ON CONFLICT |

## D01 · Add new methods in one statement

**Technique:** multi-row INSERT, column defaults, RETURNING · **runs as** `ra_curator` · [`dml/D01_insert_methods.sql`](../db/queries/dml/D01_insert_methods.sql)

```sql
INSERT INTO method (method_name, method_category, description, introduced_year)
VALUES ('Liquid State Machine', 'Reservoir computing', 'Fixed random spiking reservoir with a trained readout', 2002),
       ('Echo State Network', 'Reservoir computing', 'Fixed random recurrent reservoir with a linear readout', 2001),
       ('Modern Hopfield Network', 'Associative memory', 'Continuous Hopfield network with exponential storage capacity', 2020)
RETURNING method_id, method_name, introduced_year;
```

| method_id | method_name             | introduced_year |
| --------- | ----------------------- | --------------- |
| 522       | Liquid State Machine    | 2002            |
| 523       | Echo State Network      | 2001            |
| 524       | Modern Hopfield Network | 2020            |

## D02 · Add every paper of a topic to a collection

**Technique:** INSERT ... SELECT with a window function for positions, ON CONFLICT DO NOTHING, RLS-checked · **runs as** `ra_researcher` · [`dml/D02_add_topic_to_collection.sql`](../db/queries/dml/D02_add_topic_to_collection.sql)

Parameters (computed from the data): `collection_id` = 21, `topic_id` = 545

```sql
INSERT INTO collection_paper (collection_id, paper_id, position)
SELECT $1, pt.paper_id,
       coalesce((SELECT max(position) FROM collection_paper WHERE collection_id = $1), -1)
         + row_number() OVER (ORDER BY p.cited_by_count DESC)
FROM paper_topic pt
JOIN paper p ON p.paper_id = pt.paper_id
WHERE pt.topic_id = $2
ON CONFLICT (collection_id, paper_id) DO NOTHING
RETURNING collection_id, paper_id, position;
```

| collection_id | paper_id | position |
| ------------- | -------- | -------- |
| 21            | 62       | 7        |

## D03 · Re-score a paper's topics

**Technique:** INSERT ... ON CONFLICT (key) DO UPDATE SET ... = EXCLUDED.... (upsert) · **runs as** `ra_curator` · [`dml/D03_rescore_topics.sql`](../db/queries/dml/D03_rescore_topics.sql)

Parameters (computed from the data): `paper_id` = 1

```sql
INSERT INTO paper_topic (paper_id, topic_id, relevance_score)
SELECT pt.paper_id, pt.topic_id, round(greatest(coalesce(pt.relevance_score, 0.5) - 0.05, 0), 4)
FROM paper_topic pt
WHERE pt.paper_id = $1
ON CONFLICT (paper_id, topic_id) DO UPDATE
  SET relevance_score = EXCLUDED.relevance_score
RETURNING paper_id, topic_id, relevance_score;
```

| paper_id | topic_id | relevance_score |
| -------- | -------- | --------------- |
| 1        | 6        | 0.0000          |
| 1        | 7        | 0.0000          |
| 1        | 8        | 0.9480          |

## D04 · Mark collection items READ where the user has written notes

**Technique:** UPDATE ... FROM with a join; the read_at trigger fires; RLS limits rows to the caller's · **runs as** `ra_researcher` · [`dml/D04_mark_noted_as_read.sql`](../db/queries/dml/D04_mark_noted_as_read.sql)

```sql
UPDATE collection_paper cp
SET reading_status = 'READ'
FROM collection c, note n
WHERE c.collection_id = cp.collection_id
  AND n.user_id = c.user_id
  AND n.paper_id = cp.paper_id
  AND cp.reading_status <> 'READ'
RETURNING cp.collection_id, cp.paper_id, cp.reading_status, cp.read_at;
```

| collection_id | paper_id | reading_status | read_at                  |
| ------------- | -------- | -------------- | ------------------------ |
| 22            | 4911     | READ           | 2026-10-25T07:00:22.322Z |

## D05 · Raise a priority and show the before and after values

**Technique:** UPDATE ... RETURNING old.* and new.* (PostgreSQL 18) · **runs as** `ra_researcher` · [`dml/D05_priority_before_after.sql`](../db/queries/dml/D05_priority_before_after.sql)

Parameters (computed from the data): `collection_id` = 21

```sql
UPDATE collection_paper
SET priority = CASE priority WHEN 'LOW' THEN 'MEDIUM' ELSE 'HIGH' END
WHERE collection_id = $1
RETURNING paper_id, old.priority AS priority_before, new.priority AS priority_after;
```

| paper_id | priority_before | priority_after |
| -------- | --------------- | -------------- |
| 1        | LOW             | MEDIUM         |
| 4933     | MEDIUM          | HIGH           |
| 4934     | HIGH            | HIGH           |
| 4975     | HIGH            | HIGH           |
| 5021     | HIGH            | HIGH           |

_7 rows; the first 5 are shown._

## D06 · Remove dead resource links

**Technique:** DELETE ... USING a temporary table of URLs found to be dead · **runs as** `ra_curator` · [`dml/D06_remove_dead_links.sql`](../db/queries/dml/D06_remove_dead_links.sql)

```sql
CREATE TEMP TABLE dead_link (resource_url TEXT PRIMARY KEY) ON COMMIT DROP;
INSERT INTO dead_link
SELECT resource_url FROM resource WHERE resource_type = 'PDF' ORDER BY resource_id LIMIT 3;
DELETE FROM resource r
USING dead_link d
WHERE r.resource_url = d.resource_url
RETURNING r.resource_id, r.paper_id, r.resource_url;
```

| resource_id | paper_id | resource_url                                              |
| ----------- | -------- | --------------------------------------------------------- |
| 1           | 2        | https://arxiv.org/pdf/1412.0611                           |
| 2           | 3        | https://ieeexplore.ieee.org/ielx7/34/9639876/09138762.pdf |
| 3           | 4        | https://www.osti.gov/biblio/1336121                       |

## D07 · Delete a paper and show what cascaded

**Technique:** ON DELETE CASCADE across seven child tables, row counts before and after · **runs as** `ra_admin` · [`dml/D07_delete_paper_cascade.sql`](../db/queries/dml/D07_delete_paper_cascade.sql)

Parameters (computed from the data): `paper_id` = 4897

```sql
CREATE TEMP TABLE before_counts ON COMMIT DROP AS
SELECT 'paper_author' AS child, count(*) AS n FROM paper_author WHERE paper_id = $1
UNION ALL SELECT 'citation', count(*) FROM citation WHERE $1 IN (citing_paper_id, cited_paper_id)
UNION ALL SELECT 'paper_topic', count(*) FROM paper_topic WHERE paper_id = $1
UNION ALL SELECT 'paper_method', count(*) FROM paper_method WHERE paper_id = $1
UNION ALL SELECT 'paper_dataset', count(*) FROM paper_dataset WHERE paper_id = $1
UNION ALL SELECT 'resource', count(*) FROM resource WHERE paper_id = $1
UNION ALL SELECT 'collection_paper', count(*) FROM collection_paper WHERE paper_id = $1;
DELETE FROM paper WHERE paper_id = $1;
SELECT b.child,
       b.n AS rows_before,
       CASE b.child
         WHEN 'paper_author' THEN (SELECT count(*) FROM paper_author WHERE paper_id = $1)
         WHEN 'citation' THEN (SELECT count(*) FROM citation WHERE $1 IN (citing_paper_id, cited_paper_id))
         WHEN 'paper_topic' THEN (SELECT count(*) FROM paper_topic WHERE paper_id = $1)
         WHEN 'paper_method' THEN (SELECT count(*) FROM paper_method WHERE paper_id = $1)
         WHEN 'paper_dataset' THEN (SELECT count(*) FROM paper_dataset WHERE paper_id = $1)
         WHEN 'resource' THEN (SELECT count(*) FROM resource WHERE paper_id = $1)
         WHEN 'collection_paper' THEN (SELECT count(*) FROM collection_paper WHERE paper_id = $1)
       END AS rows_after
FROM before_counts b;
```

| child         | rows_before | rows_after |
| ------------- | ----------- | ---------- |
| paper_author  | 4           | 0          |
| citation      | 852         | 0          |
| paper_topic   | 3           | 0          |
| paper_method  | 3           | 0          |
| paper_dataset | 3           | 0          |

_7 rows; the first 5 are shown._

## D08 · Sync a subfield's topics from a staging table

**Technique:** MERGE with WHEN MATCHED, WHEN NOT MATCHED and WHEN NOT MATCHED BY SOURCE, RETURNING merge_action() · **runs as** `ra_curator` · [`dml/D08_merge_topics.sql`](../db/queries/dml/D08_merge_topics.sql)

Parameters (computed from the data): `subfield_id` = 5

```sql
CREATE TEMP TABLE topic_staging (topic_name TEXT PRIMARY KEY, description TEXT) ON COMMIT DROP;
-- The latest taxonomy keeps two existing topics (with new descriptions) and adds one new topic.
INSERT INTO topic_staging
SELECT topic_name, 'Description refreshed from the latest taxonomy'
FROM topic WHERE parent_topic_id = $1 ORDER BY topic_id LIMIT 2;
INSERT INTO topic_staging VALUES ('Neuro-symbolic Reasoning', 'Added by the latest taxonomy');
MERGE INTO topic t
USING topic_staging s
ON t.parent_topic_id = $1 AND t.topic_name = s.topic_name
WHEN MATCHED THEN
  UPDATE SET description = s.description
WHEN NOT MATCHED THEN
  INSERT (topic_name, topic_level, parent_topic_id, description) VALUES (s.topic_name, 3, $1, s.description)
WHEN NOT MATCHED BY SOURCE AND t.parent_topic_id = $1 THEN
  UPDATE SET description = 'Not in the latest taxonomy'
RETURNING merge_action() AS action, t.topic_id, t.topic_name, t.description;
```

| action | topic_id | topic_name                                     | description                                    |
| ------ | -------- | ---------------------------------------------- | ---------------------------------------------- |
| UPDATE | 7        | Low-power high-performance VLSI design         | Description refreshed from the latest taxonomy |
| UPDATE | 8        | Advanced Memory and Neural Computing           | Description refreshed from the latest taxonomy |
| UPDATE | 16       | Ferroelectric and Negative Capacitance Devices | Not in the latest taxonomy                     |
| UPDATE | 24       | CCD and CMOS Imaging Sensors                   | Not in the latest taxonomy                     |
| UPDATE | 68       | Organic Electronics and Photovoltaics          | Not in the latest taxonomy                     |

_63 rows; the first 5 are shown._

## D09 · Swap two authors' positions safely

**Technique:** SAVEPOINT, SET CONSTRAINTS ... DEFERRED on a DEFERRABLE UNIQUE constraint, RELEASE SAVEPOINT · **runs as** `ra_curator` · [`dml/D09_swap_author_order.sql`](../db/queries/dml/D09_swap_author_order.sql)

Parameters (computed from the data): `paper_id` = 1

```sql
SAVEPOINT before_swap;
-- Positions 1 and 2 would collide halfway through; deferring the check to the end of the
-- transaction lets both rows move.
SET CONSTRAINTS uq_paper_author_order DEFERRED;
UPDATE paper_author SET author_order = 3 - author_order WHERE paper_id = $1 AND author_order IN (1, 2);
SET CONSTRAINTS uq_paper_author_order IMMEDIATE;
RELEASE SAVEPOINT before_swap;
SELECT pa.author_order, a.author_name
FROM paper_author pa JOIN author a ON a.author_id = pa.author_id
WHERE pa.paper_id = $1
ORDER BY pa.author_order;
```

| author_order | author_name       |
| ------------ | ----------------- |
| 1            | Narayan Srinivasa |
| 2            | Mike Davies       |
| 3            | Gautham N. Chinya |
| 4            | Yongqiang Cao     |
| 5            | Sri Harsha Choday |

_19 rows; the first 5 are shown._

## D10 · Bulk-load citations from a CSV file

**Technique:** COPY ... FROM STDIN into a staging table (psql: \copy), then INSERT ... SELECT with joins and ON CONFLICT · **runs as** `ra_curator` · [`dml/D10_bulk_load_citations.sql`](../db/queries/dml/D10_bulk_load_citations.sql)

```sql
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
```

| citing_paper_id | cited_paper_id |
| --------------- | -------------- |
| 1               | 66             |
| 34              | 4899           |
| 64              | 5560           |
| 108             | 26             |
| 152             | 4935           |

_25 rows; the first 5 are shown._
