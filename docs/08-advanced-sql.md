# 8. Procedures, functions, triggers and CTEs

The advanced layer lives in four migrations — [`200_functions.sql`](../db/migrations/200_functions.sql),
[`210_procedures.sql`](../db/migrations/210_procedures.sql), [`220_triggers.sql`](../db/migrations/220_triggers.sql)
and [`230_views.sql`](../db/migrations/230_views.sql) — and every object exists because a feature uses it.
Each is covered by pgTAP tests in [`db/tests/`](../db/tests); the test file is named in the tables below.

## 8.1 Functions

| Function                                           | Returns                                            | Technique                                                                 | Used by                         | Tests                      |
| -------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------- | -------------------------- |
| `app_current_user_id()`                            | bigint                                             | `current_setting('app.user_id', true)`, `STABLE`                          | RLS policies, audit, procedures | `20_functions`             |
| `fn_has_permission(user_id, code)`                 | boolean                                            | four-table join, `SECURITY DEFINER`                                       | procedures, UI gating           | `20_functions`             |
| `fn_topic_path(topic_id)`                          | text                                               | recursive CTE up the tree, `string_agg … ORDER BY depth DESC`             | breadcrumbs, `v_paper_card`     | `20_functions`             |
| `fn_topic_descendants(topic_id)`                   | table(topic_id, depth)                             | recursive CTE down the tree                                               | topic pages, `fn_topic_growth`  | `20_functions`             |
| `fn_paper_lineage(paper_id, direction, max_depth)` | table(paper_id, depth, path)                       | recursive CTE with `SEARCH BREADTH FIRST` and `CYCLE`, `DISTINCT ON`      | Lineage view, API               | `20_functions`             |
| `fn_author_h_index(author_id)`                     | int                                                | `row_number()` window                                                     | author page, `mv_author_stats`  | `20_functions`, `50_views` |
| `fn_search_papers(query, limit, offset)`           | table(paper_id, title, rank, headline, matched_by) | `websearch_to_tsquery`, `ts_rank_cd`, `ts_headline`, trigram fallback     | lexical search                  | `20_functions`             |
| `fn_retraction_exposure(paper_id)`                 | table(retracted_paper_id, hops, path)              | recursive CTE limited to 2 hops, joined to `retraction`                   | Integrity Radar                 | `20_functions`             |
| `fn_topic_growth(topic_id, from, to)`              | table(year, papers, yoy_pct)                       | `generate_series` fills empty years, `LAG()`                              | Research fronts, Q19            | `20_functions`             |
| `fn_ensure_audit_partition(ts)`                    | text                                               | dynamic DDL with `format('%I', …)`                                        | audit partitions                | migration                  |
| `fn_user_display_names(ids)`                       | table(user_id, name)                               | narrow `SECURITY DEFINER` read past forced RLS: names only                | trail and relation bylines      | `60_rbac`                  |
| `fn_lab_side_effects()`                            | table(source, row_id, target, operation, detail)   | rows whose `xmin` is the current transaction, with a changed-columns diff | Query Lab trigger demos         | `40_triggers`              |

### The lineage walk

```sql
WITH RECURSIVE walk(paper_id, depth, path) AS (
  SELECT c.cited_paper_id, 1, ARRAY[p_paper_id]
  FROM citation c WHERE c.citing_paper_id = p_paper_id
  UNION ALL
  SELECT c.cited_paper_id, w.depth + 1, w.path || w.paper_id
  FROM walk w JOIN citation c ON c.citing_paper_id = w.paper_id
  WHERE w.depth < least(p_max_depth, 6)
) SEARCH BREADTH FIRST BY paper_id SET bfs_order
  CYCLE paper_id SET is_cycle USING visit_path
SELECT DISTINCT ON (walk.paper_id) walk.paper_id, walk.depth, walk.path || walk.paper_id
FROM walk WHERE NOT walk.is_cycle AND walk.paper_id <> p_paper_id
ORDER BY walk.paper_id, walk.depth, walk.bfs_order;
```

_Termination:_ the recursive term stops producing rows once `depth` reaches the limit; the `CYCLE`
clause additionally marks a row whose `paper_id` already appears on its own path, so a citation loop
cannot recurse forever. `SEARCH BREADTH FIRST` orders the rows level by level, and `DISTINCT ON` keeps
each paper once, at the shallowest depth at which it was reached.

### Authentication functions (SECURITY DEFINER)

`fn_auth_lookup`, `fn_session_user`, `fn_record_login_failure`, `fn_record_login_success`,
`fn_session_extend` and `fn_session_delete` are the only way to read password hashes or touch
`user_session`. They are owned by `ra_owner`, run with `SET search_path = pg_catalog, public` so a
caller cannot shadow a table with one of their own, return only the columns the login flow needs, and
are granted narrowly: the two readers to `ra_anon`, the writers only to `ra_app` itself (chapter 10).

## 8.2 Procedures

| Procedure                                                       | What it does                  | Technique                                                                                                        | Tests                        |
| --------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `sp_register_user(name, email, hash, role_code, INOUT user_id)` | creates an account            | custom SQLSTATE `RA001` for a duplicate email; only `users:manage` may create non-researchers                    | `30_procedures`              |
| `sp_import_paper(payload, INOUT paper_id)`                      | upserts a whole OpenAlex work | `MERGE … RETURNING merge_action()`, data-modifying CTEs over `jsonb_to_recordset`, idempotent                    | `30_procedures` (3 fixtures) |
| `sp_retract_paper(paper_id, date, status, reason, url)`         | records a retraction          | `INSERT … ON CONFLICT DO UPDATE`; date-guard, audit and outbox triggers fire; `RAISE NOTICE` with exposure count | `30_procedures`, `60_rbac`   |
| `sp_merge_authors(keep_id, dup_id)`                             | folds a duplicate author      | `SELECT … FOR UPDATE` in id order (deadlock-safe), `DELETE … USING`                                              | `30_procedures`              |
| `sp_add_to_collection(collection_id, paper_id, priority)`       | appends a paper               | position = max + 1; ownership proven by RLS `WITH CHECK`                                                         | `30_procedures`              |
| `sp_set_user_role(user_id, role_code)`                          | changes a role                | permission check, then `trg_protect_last_admin`                                                                  | `30_procedures`              |
| `sp_refresh_analytics()`                                        | refreshes both MVs            | `REFRESH MATERIALIZED VIEW CONCURRENTLY` (needs the unique indexes)                                              | `30_procedures`, `60_rbac`   |
| `sp_purge_expired_sessions(INOUT deleted)`                      | deletes expired sessions      | data-modifying CTE `DELETE … RETURNING` counted                                                                  | `30_procedures`              |

**Why `sp_merge_authors` cannot deadlock.** Two administrators merging the same pair in opposite
directions would, with naive locking, each lock one row and wait for the other. Locking both rows with
`ORDER BY author_id FOR UPDATE` makes every caller acquire the locks in the same order, so the second
caller simply waits for the first to finish.

## 8.3 Triggers

| Trigger                            | Table · timing · level                                                                                             | Purpose                                                                                   | Tests                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------ |
| `trg_set_updated_at`               | user_account, paper, collection, note · BEFORE UPDATE · row (with `WHEN (OLD IS DISTINCT FROM NEW)` where allowed) | keeps `updated_at` honest                                                                 | `40_triggers`                  |
| `trg_retraction_date_guard`        | retraction · BEFORE INSERT OR UPDATE OF retraction_date, paper_id · row                                            | rejects a retraction dated before publication (23514) — a CHECK cannot read another table | `40_triggers`                  |
| `trg_topic_hierarchy_guard`        | topic · BEFORE INSERT OR UPDATE OF parent_topic_id, topic_level · row                                              | child level = parent level + 1; no cycles (recursive walk)                                | `40_triggers`                  |
| `trg_citation_count_ins/_del/_upd` | citation · AFTER · **statement**, with transition tables                                                           | one aggregated UPDATE per statement keeps `local_citation_count` exact                    | `40_triggers`                  |
| `trg_reading_status_read_at`       | collection_paper · BEFORE INSERT OR UPDATE OF reading_status · row                                                 | sets or clears `read_at`                                                                  | `40_triggers`                  |
| `trg_protect_last_admin`           | user_account · BEFORE UPDATE OF role_id, is_active OR DELETE · row                                                 | never leaves zero active admins (`RA002`)                                                 | `40_triggers`, `30_procedures` |
| `trg_note_owner_immutable`         | note · BEFORE UPDATE OF user_id, paper_id · row                                                                    | a note cannot move to another user or paper                                               | `40_triggers`                  |
| `trg_audit`                        | paper, retraction, user_account, role_permission, collection · AFTER I/U/D · row                                   | writes `audit_log` with before/after images, minus `password_hash`                        | `40_triggers`                  |
| `trg_graph_outbox`                 | 13 catalog tables · AFTER I/U/D · row                                                                              | writes `graph_outbox` and `pg_notify('graph_outbox', id)`                                 | `40_triggers`                  |

### Row-level versus statement-level

A row-level trigger runs once per affected row; a statement-level trigger runs once per statement.
Loading 5,000 citations with one `INSERT … SELECT` would run a row-level counter 5,000 times, each an
`UPDATE paper`. The statement-level version sees all inserted rows at once through the transition table
`new_rows` and does a single grouped update:

```sql
CREATE TRIGGER trg_citation_count_ins AFTER INSERT ON citation
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION fn_citation_count_ins();

UPDATE paper p SET local_citation_count = p.local_citation_count + d.n
FROM (SELECT cited_paper_id, count(*) AS n FROM new_rows GROUP BY cited_paper_id) d
WHERE p.paper_id = d.cited_paper_id;
```

`40_triggers.sql` asserts that after inserts, deletes and an update, every stored count equals the real
count.

### The outbox and why there are no dual writes

If the web app wrote to PostgreSQL and then to Neo4j, a crash between the two writes would leave them
inconsistent. Instead the triggers write an outbox row **in the same transaction** as the change; if the
transaction rolls back, so does the outbox row. A worker (`pnpm graph:sync`) replays pending rows into
Neo4j with idempotent `MERGE` statements and marks them processed (chapter 9).

## 8.4 Views and materialized views

| View                    | Kind                                | Notes                                                                                                                                         |
| ----------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `v_paper_card`          | view, `security_invoker`            | paper + venue + ordered author list (`LATERAL` + `string_agg … ORDER BY author_order`) + primary topic path + retraction status               |
| `v_retraction_exposure` | view, `security_invoker`, recursive | papers citing retracted work within two hops                                                                                                  |
| `v_my_library`          | view, `security_invoker`            | caller's collections with counts per reading status via `count(*) FILTER (…)`                                                                 |
| `mv_topic_year_stats`   | materialized                        | papers, citations and open-access share per topic and year over each topic's subtree (recursive closure); unique index for concurrent refresh |
| `mv_author_stats`       | materialized                        | papers, citations, h-index, first and last year per author                                                                                    |

**View versus materialized view.** A view is a stored query, recomputed on every read, so it is always
current. A materialized view stores its result; reads are fast but the data is as old as the last
refresh. `REFRESH MATERIALIZED VIEW CONCURRENTLY` rebuilds it without locking out readers by computing
the new result and applying the difference row by row — which needs a unique index to match old and
new rows.

**`security_invoker`.** By default a view runs with its owner's privileges, so row-level security on the
underlying tables would be evaluated for `ra_owner` (who bypasses it). `security_invoker = true` makes
PostgreSQL evaluate permissions and policies for the caller, so `v_my_library` returns different rows
for different users.

## 8.5 CTE patterns used

| Pattern                                            | Where                                            |
| -------------------------------------------------- | ------------------------------------------------ |
| Recursive CTE down a tree                          | `fn_topic_descendants`, Q14                      |
| Recursive CTE up a tree                            | `fn_topic_path`, `trg_topic_hierarchy_guard`     |
| Recursive CTE over a graph with `SEARCH` / `CYCLE` | `fn_paper_lineage`, Q15                          |
| Breadth-first shortest path with a path array      | Q16                                              |
| Recursive transitive closure                       | `mv_topic_year_stats`                            |
| Data-modifying CTE (`DELETE … RETURNING` counted)  | `sp_purge_expired_sessions`, `fn_session_delete` |
| Non-recursive CTE chains for readability           | Q03, `fn_topic_growth`                           |

## 8.6 Seeing it run: the Query Lab

Every object in this chapter can be exercised live at `/lab` as the signed-in user's own role:
routines R01–R06 call the functions and procedures (R04's `RAISE NOTICE` is shown), trigger demos T01–T04
show the rows the triggers wrote to `audit_log` and `graph_outbox` (read back through
`fn_lab_side_effects`), and constraint proofs P01–P10 show each guard refusing bad data. All runs are
rolled back unless an administrator commits.

## 8.7 Errors a caller can see

| SQLSTATE                        | Raised by                                             | HTTP status in the API |
| ------------------------------- | ----------------------------------------------------- | ---------------------- |
| `23505` unique_violation        | UNIQUE / PRIMARY KEY constraints                      | 409                    |
| `23503` foreign_key_violation   | foreign keys on insert/update                         | 422                    |
| `23001` restrict_violation      | `ON DELETE RESTRICT`                                  | 409                    |
| `23514` check_violation         | CHECK constraints, date and hierarchy guard triggers  | 422                    |
| `42501` insufficient_privilege  | GRANTs, RLS `WITH CHECK`, procedure permission checks | 403                    |
| `RA001`                         | `sp_register_user`: email already registered          | 409                    |
| `RA002`                         | `trg_protect_last_admin`                              | 409                    |
| `22023` invalid_parameter_value | procedures validating their arguments                 | 400                    |

<!-- chapter-nav -->

---

[← Queries](07-queries.md) · [Documentation index](README.md) · [NoSQL and vectors →](09-nosql.md)
