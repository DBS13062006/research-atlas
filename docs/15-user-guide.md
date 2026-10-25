# 15. User guide

## 15.1 Getting started

```bash
pnpm install
pnpm setup:fixture      # containers, migrations, the 200-paper fixture, graph, embeddings, demo accounts
pnpm build && pnpm start
```

Open <http://localhost:3000>. Ollama must be running for embeddings (`ollama pull embeddinggemma`);
without it, set `EMBEDDINGS_PROVIDER=transformers` in `.env.local` and the same model runs on the CPU.
The full 5,761-paper corpus needs an OpenAlex API key and `pnpm data:all`; responses are cached in
`data/raw/`, so re-runs only fetch what is missing.

### Demo accounts

All four share the password you put in `SEED_PASSWORD` in `.env.local`.

| Email                         | Role          | Has                                                                                     |
| ----------------------------- | ------------- | --------------------------------------------------------------------------------------- |
| `admin@research-atlas.test`   | Administrator | everything                                                                              |
| `curator@research-atlas.test` | Curator       | a private collection, one curated relation                                              |
| `rhea@research-atlas.test`    | Researcher    | two collections (one public), five notes, a public reading trail, two curated relations |
| `ravi@research-atlas.test`    | Researcher    | two collections (one public), three notes, a private trail, two curated relations       |

`pnpm demo:reset` restores this state in a couple of seconds after a walkthrough.

## 15.2 A tour of the pages

| Page                                   | Who                            | What you can do                                                                                                                                                                           |
| -------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home** `/`                           | anyone                         | corpus counts and a live preview of the map                                                                                                                                               |
| **Atlas** `/atlas`                     | anyone                         | every paper placed by meaning (UMAP of the embeddings), coloured by research front; light up papers by title, drag the year slider, switch to a list view; arrow keys move between papers |
| **Search** `/search`                   | anyone                         | lexical (PostgreSQL full text), semantic (Neo4j vector index) or hybrid (fused) search, with field, year and open-access filters; each hit shows its rank in both lists                   |
| **Paper** `/papers/{id}`               | anyone                         | abstract, authors, topics, methods and datasets; tabs for lineage, citation neighbourhood, similar papers, curated relations and notes; save to a collection when signed in               |
| **Author** `/authors/{id}`             | anyone                         | papers, h-index, output per year, co-author network                                                                                                                                       |
| **Topics** `/topics`, `/topics/{id}`   | anyone                         | the four-level hierarchy; growth per year with a three-year average, most-cited papers, methods and datasets used                                                                         |
| **Lineage** `/explore/lineage`         | anyone                         | where an idea came from and where it went, on a year-by-hop timeline, with PostgreSQL and Neo4j timings side by side                                                                      |
| **Connect** `/explore/connect`         | anyone                         | the shortest citation chain between two papers                                                                                                                                            |
| **Research fronts** `/explore/fronts`  | anyone                         | Leiden communities as a streamgraph, ranked by recent growth                                                                                                                              |
| **Hidden gems** `/explore/gems`        | anyone                         | papers whose influence (ArticleRank) far exceeds their citation count                                                                                                                     |
| **Observatory** `/explore/observatory` | anyone                         | which methods are tested on which datasets                                                                                                                                                |
| **Integrity Radar** `/integrity`       | anyone                         | retracted papers and everything within two citation hops; signed-in users can check their own library                                                                                     |
| **Reading trails** `/trails`           | anyone (create when signed in) | ordered routes through papers with a note per stop; reorder, annotate, remove stops                                                                                                       |
| **Library** `/library`                 | researcher                     | collections as boards (Not read, Reading, Read): drag cards, set priority, write Markdown notes                                                                                           |
| **Curate** `/curate`                   | curator                        | import a paper by DOI, edit metadata (the database's rules show in plain words), link methods and datasets, moderate relations                                                            |
| **Admin** `/admin`                     | administrator                  | users and roles, the audit trail, the graph outbox, analytics refresh, slowest queries                                                                                                    |
| **Query Lab** `/lab`                   | researcher                     | run any catalog file as your own role: queries, DML, constraint proofs, routines, trigger demos and Cypher, with plans and side effects                                                   |
| **API docs** `/api/docs`               | anyone                         | every endpoint, try them in the browser                                                                                                                                                   |

Press <kbd>⌘K</kbd> (<kbd>Ctrl K</kbd>) anywhere to jump to a page, paper, author or topic. The sun and moon
button switches between the dark Midnight and light Parchment themes.

![The atlas](screenshots/atlas-dark.png)

## 15.3 The Query Lab in five minutes

1. Sign in as Rhea and open **Query Lab**.
2. Pick **Q15** (recursive lineage) and press **Explain analyze**: the plan tree shows each operator's rows
   and its share of the time.
3. Pick **P01** and press **Run**: the database refuses a self-citation with `chk_no_self_citation`.
4. Pick **R06** and press **Run**: as a researcher you get _permission denied_ — PostgreSQL, not the app,
   decided that.
5. Sign in as the curator, pick **T01** and press **Run**: below the result are the `audit_log` and
   `graph_outbox` rows the triggers wrote. Everything was rolled back.
6. Pick **C02** and press **Profile**: Neo4j's plan for a vector search, with db hits per operator.

## 15.4 Troubleshooting

| Symptom                                            | Fix                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm db:up` fails with “set POSTGRES_PASSWORD”    | fill in `.env.local` from `.env.example`                                                                     |
| Pages load but graphs and search are empty         | Neo4j is not ready or not synced: `pnpm graph:rebuild`, then `pnpm graph:check`                              |
| Semantic search fails                              | start Ollama, or set `EMBEDDINGS_PROVIDER=transformers`                                                      |
| Admin shows failing outbox rows                    | press **Sync graph now**, or run `pnpm graph:sync`; the error is shown per row                               |
| Sign-in says “Too many failed attempts”            | wait fifteen minutes, or run `pnpm seed:demo` to reset the demo accounts                                     |
| Changes made in the database do not show on a page | catalog pages are cached; any write through the app or **Sync graph now** clears them, or restart the server |
| `pnpm verify:all` fails at the build               | stop `next dev` first; the build and the dev server compete for memory                                       |

<!-- chapter-nav -->

---

[← Testing](14-testing.md) · [Documentation index](README.md)
