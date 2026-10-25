# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [semantic versioning](https://semver.org).

## [1.0.0] — 2026-10-25

First complete release.

### Database

- 16 migrations: 24 tables, 125 named constraints, 18 functions, 8 procedures, 30 triggers, 3 views and
  2 materialized views, a monthly-partitioned audit log and a transactional outbox.
- Role-based access in PostgreSQL: `ra_anon` < `ra_researcher` < `ra_curator` < `ra_admin`, GRANTs and forced
  row-level security on collections, notes, accounts and sessions.
- Catalog of 25 queries, 10 DML statements, 10 constraint proofs, 6 routine demos and 4 trigger demos.
- 361 pgTAP tests.

### Data

- 5,761 OpenAlex papers with 77,024 citations, 24,736 authors and 1,189 topics; methods and datasets from the
  Papers with Code archive; 33 Retraction Watch records; a committed 200-paper fixture.

### Graph and vectors

- Neo4j knowledge graph fed by the outbox, with a drift check and a six-second rebuild.
- 768-dimension EmbeddingGemma vectors with a filtered vector index; ArticleRank, Leiden, betweenness,
  co-authorship and similarity.
- Reading trails and curated relations with full read, update and delete.

### Application

- 22 pages: atlas, search (lexical, semantic, hybrid), paper, author, topics, lineage, connect, research fronts,
  hidden gems, observatory, integrity radar, trails, library, curate, admin, account, Query Lab and more.
- 66-endpoint REST API with Zod validation, RFC 9457 errors and OpenAPI 3.1 docs.
- Query Lab and Cypher Lab with plan trees and trigger side effects.
- Dark and light themes; WCAG 2.2 AA (axe-core); Lighthouse 92–100.

### Tooling

- `pnpm verify:all`, `setup:fixture`, `demo:reset`, generated documentation chapters and a PDF report.
- GitHub Actions: lint, types, build, and a database job (migrations, pgTAP, catalog).

[1.0.0]: https://github.com/DBS13062006/research-atlas/commits/main
