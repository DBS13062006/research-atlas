# 13. Technology choices

Each decision record gives the context, the options we weighed, what we chose and what follows from it.
Versions are pinned exactly in `package.json`, `docker-compose.yml` and `db/Dockerfile`.

| Layer           | Version                                                        |
| --------------- | -------------------------------------------------------------- |
| Node.js         | 24.22 LTS                                                      |
| Next.js / React | 16.4.3 / 19.3                                                  |
| PostgreSQL      | 18 (with pgTAP for tests)                                      |
| Neo4j           | 2026.09 Community, APOC, Graph Data Science                    |
| Embeddings      | Ollama `embeddinggemma` (768-d); Transformers.js ONNX fallback |
| Migrations      | dbmate                                                         |
| SQL client      | postgres.js                                                    |
| Validation      | Zod 4                                                          |
| UI              | Tailwind CSS 4, shadcn/ui 4 on Base UI, d3, Recharts           |
| Tests           | pgTAP, Vitest, Playwright, axe-core, Lighthouse                |
| Lint and format | Biome, TypeScript strict                                       |
| Containers      | OrbStack + Docker Compose                                      |

## ADR 1 · PostgreSQL 18 rather than the 19 release candidate

**Context.** The course is graded on SQL depth; the database must be stable for months of development and
a live demo. **Options.** PostgreSQL 18 (current stable); PostgreSQL 19 (release candidate, with SQL/PGQ
graph queries planned). **Decision.** PostgreSQL 18. **Consequences.** We use 18's new features where they
help — `uuidv7()`, virtual generated columns, `RETURNING old.* / new.*` (D05), `MERGE … RETURNING
merge_action()` (D08) — and do graph work in Neo4j instead of a release candidate's preview feature.

## ADR 2 · Neo4j as the NoSQL store, rather than MongoDB or pgvector alone

**Context.** The NoSQL part must add capabilities the relational model lacks, with real read, update and
delete. **Options.** MongoDB (documents); pgvector inside PostgreSQL; Neo4j (property graph with a native
vector index and a graph-algorithms library). **Decision.** Neo4j. **Consequences.** One engine gives
multi-hop traversal, `SHORTEST` paths, vector `SEARCH` with in-index filters, and ArticleRank/Leiden/
betweenness. Documents would have duplicated the relational data without adding a new kind of query, and
pgvector alone would cover similarity but not the graph algorithms. The cost is a second store to keep
consistent, solved with the outbox (chapter 9).

## ADR 3 · SQL first, no ORM

**Context.** Evaluators must see the SQL. **Options.** Prisma or Drizzle; postgres.js tagged templates with
migrations in plain SQL. **Decision.** postgres.js and dbmate. **Consequences.** Every query is visible SQL,
parameterised by the tagged template (no string concatenation). Business rules live in the database as
constraints, functions, procedures and triggers, where an ORM would have pulled them into application code.

## ADR 4 · Our own session authentication rather than an auth library

**Context.** Authentication and role-based access are graded inside the database. **Options.** Better
Auth or Auth.js; sessions written by hand following the Copenhagen Book. **Decision.** Our own: Argon2id
passwords, 256-bit tokens stored as SHA-256 hashes, lockout, renewal. **Consequences.** The schema keeps
our `user_account`, `role`, `permission` and `user_session` tables, the session functions are
`SECURITY DEFINER` and testable in pgTAP, and every request runs under a PostgreSQL role. We own the
security code, so it is covered by unit, integration and end-to-end tests.

## ADR 5 · Local embeddings with Ollama rather than a paid API

**Context.** Semantic search needs embeddings for 5,761 papers and for every query. **Options.** A hosted
embedding API; SPECTER2 (science-tuned, Python only); EmbeddingGemma through Ollama. **Decision.** Ollama
`embeddinggemma`, with a Transformers.js build of the same model as a fallback. **Consequences.** No cost,
no key, no data leaving the laptop; the corpus embeds in under two minutes on the GPU; results on our
probe queries are on topic (chapter 9). The fallback agrees with Ollama at cosine 0.996.

## ADR 6 · OrbStack and Docker Compose rather than Docker Desktop

**Context.** Development happens on a 16 GB MacBook Air that also runs the build, Neo4j and Ollama.
**Options.** Docker Desktop; OrbStack. **Decision.** OrbStack, with Compose files that work under either.
**Consequences.** Lower memory overhead; memory caps in Compose (PostgreSQL 1 GB, Neo4j 3 GB) keep the
machine responsive.

## ADR 7 · Next.js 16.4 with Cache Components

**Context.** One application must serve pages, an API and the Query Lab. **Options.** A separate API
server plus a single-page app; Next.js with server components and route handlers. **Decision.** Next.js
16.4. **Consequences.** Pages render on the server with their data, static shells are prerendered and
user-specific parts stream in, catalog reads are cached by tag and invalidated on writes, and the API lives
in the same codebase as the pages it serves. 16.4.1 fixed two critical vulnerabilities, so nothing older is
allowed.

## ADR 8 · d3 for network graphs rather than Sigma.js

**Context.** The plan proposed Sigma.js (WebGL) for networks. Our graphs show at most a few hundred nodes,
and every node must be reachable by keyboard and screen reader. **Decision.** d3-force rendered to SVG,
with each node a real link, and a canvas for the 5,761-point atlas. **Consequences.** Graphs pass axe-core
checks and are navigable with Tab; the atlas map stays fast on canvas.

## ADR 9 · Embeddings stored as lists of floats

**Context.** Neo4j's native `VECTOR` type needs the block store format, which only the Enterprise edition
offers. **Decision.** Store `LIST<FLOAT>` and index it with a vector index. **Consequences.** The same index,
`SEARCH` clause and filters work; only storage is less compact.

<!-- chapter-nav -->

---

[← Architecture](12-architecture.md) · [Documentation index](README.md) · [Testing →](14-testing.md)
