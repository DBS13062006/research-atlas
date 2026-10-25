# `scripts/` — tooling

Every script is a `pnpm` command; see `package.json` for the exact invocation. Scripts that touch the
database read `.env.local` at run time and never print secrets.

| Folder                                  | Commands                                                                                     | Purpose                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [`ingest/`](ingest)                     | `ingest:topics` · `works` · `expand` · `load` · `methods` · `retractions`                    | build the corpus from OpenAlex, the Papers with Code archive and Retraction Watch; cached and idempotent |
| [`data/`](data)                         | `data:all` · `data:report` · `data:fixture` · `seed:demo` · `demo:reset`                     | the whole pipeline, its quality gate, the committed fixture, and the demo accounts                       |
| [`embed/`](embed) · [`layout/`](layout) | `embed:papers` · `layout:umap`                                                               | EmbeddingGemma vectors (cached) and the seeded UMAP map                                                  |
| [`graph/`](graph)                       | `graph:schema` · `sync` · `rebuild` · `check` · `analytics` · `export-native` · `cypher:run` | Neo4j schema, outbox drain, rebuild, drift check, graph algorithms                                       |
| [`db/`](db)                             | `db:migrate` · `db:reset` · `db:rollback-all` · `db:test` · `db:seed:fixture`                | migrations (dbmate), pgTAP, the fixture loader, the test-seed generator                                  |
| [`queries/`](queries)                   | `queries:run`                                                                                | run the SQL catalog as each file's role, rolled back                                                     |
| [`docs/`](docs)                         | `docs:catalog` · `docs:schema` · `docs:ddl` · `docs:report` · `docs:brand`                   | generate chapters 5–7, schema docs, psql snapshots, the PDF report and the README artwork                |
| [`er/`](er)                             | `docs:er`                                                                                    | generate the Chen ER diagram for draw.io                                                                 |
| [`setup/`](setup) · [`verify/`](verify) | `setup:fixture` · `verify:all`                                                               | fresh-clone setup and the all-in-one check                                                               |
| [`perf/`](perf)                         | `perf:lighthouse`                                                                            | Lighthouse gate on the home and a paper page                                                             |
| [`lib/`](lib)                           | —                                                                                            | shared step runner                                                                                       |
