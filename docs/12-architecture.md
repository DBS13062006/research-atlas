# 12. Architecture

Research Atlas is a polyglot system with one door in. PostgreSQL 18 is the system of record, Neo4j 2026.09
is the knowledge graph and vector index, and a Next.js 16.4 application is the only client of either.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/architecture-dark.png">
  <img alt="Architecture: Browser → Next.js → PostgreSQL (system of record) → outbox → Neo4j; pipeline scripts feed both" src="assets/architecture-light.png">
</picture>

## 12.1 Components

| Component         | Responsibility                                                                           | Code                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Proxy             | Redirects anonymous visitors away from signed-in pages; nothing more                     | [`src/proxy.ts`](../src/proxy.ts)                                           |
| Data access layer | Validates the session cookie once per request and turns the user into a database context | [`src/server/auth/dal.ts`](../src/server/auth/dal.ts)                       |
| Database client   | Runs each unit of work in a transaction under the caller's role                          | [`src/server/db/client.ts`](../src/server/db/client.ts)                     |
| Services          | Plain functions holding the SQL and Cypher, shared by pages and the API                  | [`src/server/services/`](../src/server/services)                            |
| API               | One registry, one wrapper; validation, role gate, errors, OpenAPI                        | [`src/server/api/`](../src/server/api)                                      |
| Graph layer       | Driver, projections, outbox drain, relations, trails                                     | [`src/server/graph/`](../src/server/graph)                                  |
| Embeddings        | Ollama provider with a Transformers.js fallback                                          | [`src/server/embeddings/provider.ts`](../src/server/embeddings/provider.ts) |
| Pipeline scripts  | Ingest, embed, lay out, analyse, sync, verify                                            | [`scripts/`](../scripts)                                                    |

## 12.2 Why two databases

Relational integrity, transactions, constraints and role-based access belong in PostgreSQL. Multi-hop
traversal, graph algorithms (ArticleRank, Leiden, betweenness) and vector similarity belong in a graph
engine. Rather than writing to both from the application, PostgreSQL triggers write change rows to an
outbox in the same transaction, and a drain replays them into Neo4j (chapter 9). If Neo4j is lost,
`pnpm graph:rebuild` restores it from PostgreSQL in about six seconds.

| Data                                                                           | Lives in                                     | Why                                                                 |
| ------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------- |
| Papers, people, topics, methods, citations, retractions                        | PostgreSQL, projected to Neo4j               | integrity and transactions first; traversals in the graph           |
| Accounts, roles, sessions, collections, notes                                  | PostgreSQL only                              | access control and row-level security                               |
| Audit trail                                                                    | PostgreSQL (`audit_log`, monthly partitions) | written by triggers, read by administrators                         |
| Trails, curated relations                                                      | Neo4j only                                   | ordered paths and typed paper-to-paper edges are natural graph data |
| Embeddings, map coordinates, influence, communities, similarity, co-authorship | Neo4j only                                   | computed by jobs over the graph                                     |

## 12.3 Rendering and caching

Pages are React Server Components with Cache Components enabled. Each page is prerendered as a static
shell; anything that depends on the visitor (the session, their library) streams in through `Suspense`.
Anonymous catalog reads (a paper, a topic, the atlas points, research fronts) are wrapped in `"use cache"`
with `cacheLife("hours")` and a tag. Every write path calls `invalidateCatalog()`, which expires the
`catalog` and `graph` tags. Heavy client code (the atlas canvas, graphs, the command palette, the Markdown
renderer) loads on demand.

## 12.4 Consistency model

| Path                          | Guarantee                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Within PostgreSQL             | ACID; every rule enforced by constraints, triggers and RLS in the same transaction                             |
| PostgreSQL → Neo4j projection | at-least-once, in commit order; eventually consistent within one drain                                         |
| Derived graph data            | `COAUTHOR` refreshed for affected authors on every drain; ranks and communities refreshed by `graph:analytics` |
| Graph-native data             | single-store transactions in Neo4j; ownership checked inside the Cypher                                        |
| Drift detection               | `pnpm graph:check` compares 17 counts and fails on any difference                                              |

## 12.5 Repository layout

```text
db/
  migrations/      dbmate migrations 001–900, each with up and down
  tests/           pgTAP suites 10–60 and helpers
  queries/         Q01–Q25, dml/D01–D10, proofs/P01–P10, routines/R01–R06, triggers/T01–T04
  seed/            committed 200-paper fixture and the pgTAP seed
graph/             schema.cypher and the Cypher catalog C01–C12
scripts/           ingest, embed, layout, graph, db, docs, setup and verify tooling
src/
  app/             pages and /api/v1 route handlers
  components/      shell, common states, atlas, graphs, charts, lab, library, paper, ui (shadcn/ui on Base UI)
  lib/             shared types, Zod schemas, formatting, API client, query-catalog parser
  server/          auth, db, graph, api, services, embeddings (server-only)
tests/             unit, integration (Vitest) and e2e (Playwright + axe)
docs/              these chapters, ER and schema diagrams, screenshots, report
```

<!-- chapter-nav -->

---

[← API](11-api.md) · [Documentation index](README.md) · [Technology choices →](13-tech-justification.md)
