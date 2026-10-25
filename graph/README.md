# `graph/` — the Neo4j knowledge graph

| File                             | Purpose                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| [`schema.cypher`](schema.cypher) | constraints, range, full-text and vector indexes; idempotent, applied by `pnpm graph:schema` |
| [`queries/`](queries)            | the Cypher catalog C01–C12, run by `pnpm cypher:run` and the Cypher Lab                      |

The graph is a projection of PostgreSQL plus data that only exists here:
- **projected** — papers, authors, institutions, venues, topics, methods, datasets and their links, written by the
  outbox drain ([`src/server/graph/projection.ts`](../src/server/graph/projection.ts));
- **derived** — `COAUTHOR`, `SIMILAR_TO`, and the `articleRank`, `community`, `betweenness`, `embedding` and map
  coordinates on papers, written by jobs;
- **graph-native** — reading trails and curated relations, written by the app with full read, update and delete.

| Command                                                 | What it does                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm graph:schema`                                     | apply `schema.cypher`                                                    |
| `pnpm graph:sync`                                       | drain pending outbox rows into Neo4j                                     |
| `pnpm graph:rebuild`                                    | reload the projection from PostgreSQL, keeping native and job-owned data |
| `pnpm graph:check`                                      | compare 17 counts with PostgreSQL; fails on drift                        |
| `pnpm embed:papers` · `layout:umap` · `graph:analytics` | embeddings · map layout · ArticleRank, Leiden, betweenness, similarity   |
| `pnpm cypher:run`                                       | run the catalog, always rolled back (`--require-rows`)                   |

Design and walkthroughs: [chapter 9](../docs/09-nosql.md).
