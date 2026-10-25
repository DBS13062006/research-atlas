# 1. Requirements

## 1.1 Problem

A researcher entering a field faces thousands of papers and no map. Search engines answer “which papers
mention X”, but not the questions that matter when learning a field: where did this idea come from, what
did it lead to, how are two papers connected, which work is quietly influential, and does anything I rely
on lean on retracted research?

Research Atlas answers those questions over a real corpus of 5,761 papers (spiking neural networks,
transformers, graph learning, vision, clinical machine learning and reinforcement learning) with their
77,024 in-corpus citations, 24,736 authors, the OpenAlex topic hierarchy, methods and datasets from the
Papers with Code archive, and 33 Retraction Watch records.

## 1.2 Users and roles

| Role | Who | What they may do |
| --- | --- | --- |
| Anonymous | Any visitor | Read the catalog, search, explore lineage, paths, fronts and the integrity radar; read public collections, notes and trails |
| Researcher | A signed-up user | Everything above, plus their own collections (Kanban board), notes, reading trails and curated relations; run the Query Lab |
| Curator | Trusted editor | Everything above, plus import papers by DOI, edit paper metadata, link methods and datasets, moderate anyone's relations |
| Administrator | Course staff | Everything above, plus users and roles, retractions, author merges, deletes, the audit trail, graph sync, analytics refresh, and committing Query Lab DML |

Each application role maps to a PostgreSQL role (`ra_anon` < `ra_researcher` < `ra_curator` < `ra_admin`).
Every request runs under that role, so the database itself refuses what a role may not do (chapter 10).

## 1.3 Use cases

| # | Use case | Actor | Main flow | Database features exercised |
| --- | --- | --- | --- | --- |
| UC1 | Find papers | Anyone | Type a query; compare lexical, semantic and hybrid rankings | full-text search (`fn_search_papers`), Neo4j vector index, Reciprocal Rank Fusion |
| UC2 | Trace an idea | Anyone | Pick a paper; see what it builds on and what built on it, by year and hop | recursive CTE with `SEARCH`/`CYCLE` (`fn_paper_lineage`); Cypher variable-length path |
| UC3 | Connect two papers | Anyone | Pick two papers; see the shortest citation chain | breadth-first recursive CTE with a path array; Cypher `SHORTEST` |
| UC4 | Explore a field | Anyone | Browse domain → field → subfield → topic; growth per year | self-referencing table, recursive CTE, `fn_topic_growth`, materialized views |
| UC5 | Spot research fronts and hidden gems | Anyone | Ranked communities and under-cited influential papers | Graph Data Science: Leiden, ArticleRank |
| UC6 | Check integrity | Anyone / researcher | See retracted papers and what cites them within two hops; check one's own library | recursive CTE, `v_retraction_exposure`, RLS-scoped query |
| UC7 | Sign up and sign in | Visitor | Create an account; sign in; lockout after five failures | `sp_register_user`, Argon2id, hashed session tokens, `SECURITY DEFINER` auth functions |
| UC8 | Organise reading | Researcher | Collections as boards (Not read, Reading, Read), priorities, notes | RLS on collections and notes, triggers stamping `read_at`, `sp_add_to_collection` |
| UC9 | Curate relations and trails | Researcher | Assert “A extends B”; build an ordered reading trail | graph-native data in Neo4j with full read, update and delete |
| UC10 | Keep the catalog right | Curator | Import by DOI; correct metadata; link methods and datasets; moderate relations | `sp_import_paper` (MERGE), CHECK constraints, audit and outbox triggers |
| UC11 | Run the atlas | Administrator | Change roles, deactivate users, read the audit trail, sync the graph, refresh analytics | `sp_set_user_role`, last-admin trigger, partitioned `audit_log`, `pg_stat_statements` |
| UC12 | Inspect the database live | Researcher and up | Run any catalog query, DML, constraint proof, routine or trigger demo; see plans and side effects | Query Lab: role-scoped execution, `EXPLAIN ANALYZE`, `fn_lab_side_effects`, Cypher `PROFILE` |

## 1.4 Non-functional requirements

| Requirement | How it is met |
| --- | --- |
| Integrity | Every rule is a named constraint or trigger; 361 pgTAP tests prove each one accepts valid data and refuses invalid data |
| Security | Least-privilege PostgreSQL roles, forced row-level security, hashed session tokens, Argon2id passwords, same-origin checks on writes |
| Consistency across stores | A transactional outbox replays every relational change into Neo4j; `graph:check` reports drift |
| Performance | Lighthouse performance 92–94 on mobile and 100 on desktop for the home and paper pages; indexes on every foreign key and search path |
| Accessibility | WCAG 2.2 AA: axe-core reports no serious or critical issue on any page in either theme |
| Reproducibility | A committed 200-paper fixture and `pnpm setup:fixture` bring a fresh clone to a working atlas; `pnpm verify:all` runs every check |
