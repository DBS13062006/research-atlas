PES University · Department of Computer Science and Engineering

Database Management System · Aug–Dec 2026 · Experiential Learning Level 3 mini-project

# Research Atlas

**See how an idea travelled: a map of research papers, their citations, topics and lineage**

| Member            | SRN           | Section |
| ----------------- | ------------- | ------- |
| Daruru Bhuvan Sai | PES1UG24AM356 | F       |
| Deeptanshu Kumar  | PES1UG24AM357 | F       |

Repository: `github.com/DBS13062006/research-atlas`

@body

# 1. Abstract

Research Atlas is a research-discovery platform built on two databases. PostgreSQL 18 is the system of
record for 5,761 real papers in six themes (spiking networks, transformers, graph learning, vision,
clinical machine learning and reinforcement learning), their 77,024 in-corpus citations, 24,736 authors,
the four-level OpenAlex topic hierarchy, methods and datasets from the Papers with Code archive, and 33
Retraction Watch records. Its rules live in the database: 125 named constraints, 18 functions, 8
procedures, 30 triggers (11 trigger functions), 3 views and 2 materialized views, and role-based access with forced row-level
security, so every request runs under the caller's own PostgreSQL role. Neo4j 2026.09 holds the same
catalog as a knowledge graph, fed by a transactional outbox, with a 768-dimension vector index over local
EmbeddingGemma embeddings, graph algorithms (ArticleRank, Leiden, betweenness), and two graph-native
features with full read, update and delete: reading trails and curated relations. A Next.js 16.4
application and a 66-endpoint REST API are the only way in. A Query Lab runs every catalog query, DML
statement, constraint proof, routine and trigger demo live, with plans. 361 pgTAP tests, 327 Vitest
tests and 67 browser tests verify it.

# 2. Problem and objectives

@include ../01-requirements.md#1.1 Problem level=2

## Objectives

1. Model the domain properly: a Chen ER model mapped to a BCNF relational schema in which every rule is
   a named constraint or trigger.
2. Exercise the full range of SQL: DDL with constraints, every DML form, joins, nested and correlated
   subqueries, recursive CTEs, analytics, procedures, functions, triggers and views.
3. Enforce authentication and role-based access **inside PostgreSQL**, with GRANTs and row-level
   security, not only in application code.
4. Add a NoSQL and vector store that does what SQL does poorly — graph algorithms, vector search,
   graph-native data — and keep it consistent without dual writes.
5. Build a usable, accessible application and API over both, and prove everything with automated tests.

@include ../01-requirements.md#1.3 Use cases level=2

# 3. ER diagram (rubric 1)

![ER diagram in Chen notation: 15 entities and 17 relationships](../er/research-atlas-er.svg)

@include ../02-er-model.md#2.2 Relationships level=2

@include ../02-er-model.md#2.3 Cardinality and participation decisions level=2

# 4. Relational schema (rubric 2)

The 15 entities and 17 relationships map to 24 tables: 22 domain tables plus `audit_log` and
`graph_outbox`. The diagram below is generated from the live database.

![Relational schema generated from the database catalog](../schema/schema.svg)

@include ../03-relational-schema.md#3.1 Mapping rules used level=2

@include ../03-relational-schema.md#3.2 Keys level=2

@include ../03-relational-schema.md#3.4 Delete rules level=2

# 5. Normalization

@include ../04-normalization.md#4.1 Method level=2

@include ../04-normalization.md#4.3 Every table level=2

@include ../04-normalization.md#4.4 The two deliberate denormalizations level=2

# 6. DDL with constraints (rubric 3)

@include ../05-ddl.md#5.1 Migrations level=2

## Constraints, indexes and triggers

The schema has 125 named constraints, 28 secondary indexes and 30 triggers; chapter 5 of the
documentation lists every one with its definition. The psql snapshot below shows one table as PostgreSQL describes it.

![psql \d+ citation](assets/ddl/citation.png)

@include ../05-ddl.md#5.4 Triggers level=2

## Constraint proofs

Each proof is an action the database must refuse. They run live in the Query Lab and as pgTAP tests.

@include ../05-ddl.md#P01 level=3

@include ../05-ddl.md#P09 level=3

# 7. NoSQL and vector database creation (rubric 4)

@include ../09-nosql.md#9.1 Graph model level=2

@include ../09-nosql.md#9.2 Schema level=2

@include ../09-nosql.md#9.3 Keeping Neo4j consistent level=2

# 8. Technology justification (rubric 5)

@include ../13-tech-justification.md#ADR 1 level=2

@include ../13-tech-justification.md#ADR 2 level=2

@include ../13-tech-justification.md#ADR 3 level=2

@include ../13-tech-justification.md#ADR 4 level=2

@include ../13-tech-justification.md#ADR 5 level=2

# 9. DML (rubric 6)

Ten DML files, one per technique. Each ran as its declared role inside a transaction that was rolled
back, so the outputs are real but changed nothing.

@include ../06-dml.md#D05 level=2

@include ../06-dml.md#D07 level=2

@include ../06-dml.md#D08 level=2

@include ../06-dml.md#D09 level=2

# 10. Nested, correlated, recursive and join queries (rubric 7)

Twenty-five queries: seven joins, six nested and correlated, four recursive, and analytics, set
operations, JSON and search. All 25 with outputs and plans are in chapter 7 of the documentation; a
representative set follows. Outputs are from the loaded corpus.

## Joins

@include ../07-queries.md#Q03 level=3

@include ../07-queries.md#Q04 level=3

## Nested and correlated

@include ../07-queries.md#Q09 level=3

## Recursive

@include ../07-queries.md#Q15 level=3

@include ../07-queries.md#Q16 level=3

## Analytics

@include ../07-queries.md#Q20 level=3

# 11. Procedures, functions, triggers and CTEs (rubric 8)

@include ../08-advanced-sql.md#8.1 Functions level=2

@include ../08-advanced-sql.md#8.2 Procedures level=2

@include ../08-advanced-sql.md#8.3 Triggers level=2

@include ../08-advanced-sql.md#8.4 Views and materialized views level=2

@include ../08-advanced-sql.md#8.5 CTE patterns used level=2

## Triggers at work

Correcting a paper's title in the Query Lab (demo T01, as a curator). Below the result are the
`audit_log` and `graph_outbox` rows the triggers wrote in the same transaction, which was then rolled
back.

![Trigger demo T01 in the Query Lab](assets/lab-trigger.png)

# 12. NoSQL and vector features with read, update and delete (rubric 9)

@include ../09-nosql.md#9.4 Vector search level=2

@include ../09-nosql.md#9.5 Graph algorithms level=2

@include ../09-nosql.md#9.6 Read, update and delete level=2

@include ../09-nosql.md#9.7 The same question level=2

# 13. Application and API (rubrics 10 and 11)

The application has 22 pages, works in a dark and a light theme, is usable by keyboard, and passes
axe-core's WCAG 2.2 AA checks on every page in both themes. Lighthouse scores it 92–100 for performance
and 100 for accessibility.

Figures, left to right and top to bottom: the atlas; a paper page; search; the lineage timeline;
the Integrity Radar; the library board; the curation workbench; the admin console.

![Atlas: every paper placed by meaning](../screenshots/atlas-light.png)
![Paper page with lineage, neighbourhood, similar papers, relations and notes](../screenshots/paper-dark.png)
![Search: lexical, semantic and hybrid](../screenshots/search-light.png)
![Lineage timeline: PostgreSQL and Neo4j answer the same question](../screenshots/lineage-dark.png)
![Integrity Radar](../screenshots/integrity-light.png)
![Library as a Kanban board](../screenshots/library-dark.png)
![Curation workbench](../screenshots/curate-light.png)
![Admin console](../screenshots/admin-dark.png)

![Query Lab: EXPLAIN ANALYZE as a plan tree](assets/lab-plan.png)

@include ../11-api.md#11.1 One registry level=2

@include ../11-api.md#11.2 Conventions level=2

@include ../11-api.md#11.3 Database errors level=2

# 14. Authentication and RBAC in the database (rubric 12)

@include ../10-auth-rbac.md#10.1 Accounts level=2

@include ../10-auth-rbac.md#10.2 Sessions level=2

@include ../10-auth-rbac.md#10.4 The role ladder level=2

@include ../10-auth-rbac.md#10.5 Privilege matrix level=2

@include ../10-auth-rbac.md#10.6 Row-level security level=2

@include ../10-auth-rbac.md#10.7 Proof in psql level=2

# 15. Testing

@include ../14-testing.md#14.1 What is tested where level=2

@include ../14-testing.md#14.3 Latest level=2

# 16. Git workflow and contributions (rubrics 13 and 14)

## Workflow

- One repository on GitHub; work is committed in small steps with Conventional Commit messages
  (`feat(db): …`, `test(rbac): …`, `docs: …`) and pushed to `main`.
- Every push runs the CI workflow: lint, type check and production build, plus a database job that
  migrates from zero and back, runs all pgTAP suites and the SQL catalog.
- Secrets never enter the repository: `.env.local` is ignored and `.env.example` holds placeholders.
- Generated artefacts (schema docs, the ER export, chapters 5–7, this report) are produced by scripts, so
  they always match the code.

## History

@git-stats

## Ownership

| Area              | Daruru Bhuvan Sai                                                                                                  | Deeptanshu Kumar                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Owns and presents | ER model, relational schema, constraints, normalization, advanced SQL, RBAC and row-level security, authentication | Neo4j model, outbox sync, embeddings and vector search, graph algorithms, graph-native features, explore pages, Query Lab |
| Report chapters   | 2–6, 9–11, 14                                                                                                      | 7, 8, 12, 13, 15                                                                                                          |

## Originality

- **The Query Lab**: every catalog file runs live as the visitor's own database role, with an
  `EXPLAIN ANALYZE` or `PROFILE` plan tree, captured `NOTICE`s, and the audit and outbox rows the run's
  triggers wrote — read back through a narrow `SECURITY DEFINER` function that only sees the caller's own
  transaction.
- **The same question in both databases**, side by side with timings (lineage, shortest path).
- **Integrity Radar**: retracted work and everything within two citation hops, including a check of the
  user's own library under row-level security.
- **Hidden gems and research fronts** from ArticleRank and Leiden over the real citation graph.

# 17. Conclusion and future work

Research Atlas meets every rubric row with working, tested code: the database enforces its own
integrity and access rules; the graph store adds traversal, vector search and algorithms without
compromising consistency; and the application makes both visible, down to query plans and trigger side
effects.

Future work:
1. **Continuous sync**: a long-running worker that `LISTEN`s on the `graph_outbox` channel instead of
   draining after each write.
2. **Larger corpus**: the pipeline is incremental and cached; the main limits are the OpenAlex allowance
   and embedding time.
3. **PostgreSQL 19's SQL/PGQ**, when it ships, to compare property-graph queries inside PostgreSQL with
   Neo4j on the same data.
4. **Citation-context relations**: suggest curated relations from the sentences around each citation.

# 18. Appendix: changes from the proposal

| #   | In the proposal                                              | In the final design                                                                                                |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 1   | Citations only described in prose; no recursive SQL possible | `citation` table (self-referencing M:N) with `chk_no_self_citation`; lineage, paths and exposure as recursive CTEs |
| 2   | `citation_count` in the spec but not the DDL                 | `cited_by_count` (from OpenAlex) and trigger-maintained `local_citation_count`                                     |
| 3   | `INT` keys, nothing generated                                | `BIGINT GENERATED ALWAYS AS IDENTITY`; `uuidv7()` public ids where URLs are shared                                 |
| 4   | Topic names unique globally                                  | unique within the parent (`UNIQUE NULLS NOT DISTINCT`)                                                             |
| 5   | Self-parent blocked, cycles not                              | trigger walks ancestors and refuses cycles and level inversions                                                    |
| 6   | “Retraction after publication” stated, not enforced          | `trg_retraction_date_guard`                                                                                        |
| 7   | RBAC was one `role` table                                    | `role`, `permission`, `role_permission` plus PostgreSQL roles, GRANTs and forced row-level security                |
| 8   | Case-sensitive email uniqueness                              | `email CITEXT UNIQUE`                                                                                              |
| 9   | Foreign keys without indexes                                 | every foreign key indexed                                                                                          |
| 10  | DDL only as screenshots of typed commands                    | versioned migrations with up and down; snapshots regenerated from them                                             |
| 11  | ER mixed notations and omitted CITES                         | pure Chen notation with CITES and SUBTOPIC_OF as recursive relationships                                           |
| 12  | Graph relationships listed, no NoSQL implementation          | Neo4j knowledge graph with vector index, outbox sync, graph algorithms and graph-native features                   |
| 13  | No normalization argument                                    | functional dependencies and a BCNF check per table, two documented denormalizations                                |
