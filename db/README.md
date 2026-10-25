# `db/` — the system of record

Everything PostgreSQL needs: the schema, the rules, the tests and the query catalog. The database enforces its
own integrity and access control, so most of the project's logic lives here.

```text
db/
├── Dockerfile           postgres:18 with pgTAP, used by docker-compose
├── migrations/          dbmate migrations, applied in order
├── queries/             the catalog the Query Lab, the runner and the docs all read
│   ├── Q01–Q25          read queries: joins, nested and correlated, recursive, analytics, set ops, JSON, search
│   ├── dml/             D01–D10, one DML technique each (D10 loads dml/D10_citations.csv with COPY)
│   ├── proofs/          P01–P10, actions the database must refuse, each naming the rule that refuses it
│   ├── routines/        R01–R06, functions and procedures at work
│   └── triggers/        T01–T04, trigger demos whose audit and outbox rows the Lab shows
├── seed/
│   ├── fixture.sql      200 real papers and their citations (pnpm data:fixture)
│   └── test_seed.sql    the hand-built pgTAP seed (scripts/db/gen-test-seed.py)
└── tests/               pgTAP suites, run with pg_prove inside the container
```

## Migrations

| Range       | Contents                                                                               |
| ----------- | -------------------------------------------------------------------------------------- |
| `001`–`005` | extensions (`citext`, `pg_trgm`, `pg_stat_statements`) and the database roles          |
| `010`–`050` | tables (access control, catalog, user content, audit and outbox) and secondary indexes |
| `200`–`230` | functions, procedures, triggers, views and materialized views                          |
| `300`–`330` | GRANTs and row-level security, admin statistics, display names, Query Lab side effects |
| `900`       | reference data: roles, permissions and the permission matrix                           |

Every migration has `-- migrate:up` and `-- migrate:down`; `pnpm verify:all` rolls a fresh database back to
zero and up again. Objects are owned by `ra_owner`; migrations switch to it with `SET ROLE`.

## Catalog file header

```sql
-- @id        Q15
-- @title     What a paper builds on, three levels deep
-- @category  recursive
-- @concepts  recursive CTE with SEARCH BREADTH FIRST and CYCLE clauses
-- @role      ra_anon
-- @param     paper_id bigint = SELECT … (the default is computed from the data)
-- @expect    chk_no_self_citation        (proofs only: the rule that must refuse it)
```

## Commands

| Command                                            | What it does                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm db:up`                                       | start PostgreSQL and Neo4j                                                                 |
| `pnpm db:migrate` · `db:rollback-all` · `db:reset` | apply · roll back to zero · drop, create and migrate (`--test` targets the test database)  |
| `pnpm db:test`                                     | rebuild the test database, load the seed and run every pgTAP suite                         |
| `pnpm queries:run`                                 | run every catalog file as its role, rolled back (`--test`, `--require-rows`, `--only Q15`) |
| `pnpm db:seed:fixture`                             | load the fixture into an empty database                                                    |

Chapters [3](../docs/03-relational-schema.md), [5](../docs/05-ddl.md), [6](../docs/06-dml.md),
[7](../docs/07-queries.md), [8](../docs/08-advanced-sql.md) and [10](../docs/10-auth-rbac.md) explain the design.
