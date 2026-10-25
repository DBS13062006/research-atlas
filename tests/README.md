# `tests/`

| Folder                        | Runner                              | Covers                                                                                                                                              |
| ----------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`unit/`](unit)               | Vitest                              | password hashing and session tokens, RRF fusion, SQLSTATE mapping, Zod schemas, the OpenAlex date rule                                              |
| [`integration/`](integration) | Vitest + local PostgreSQL and Neo4j | every endpoint × every role (264 cases), lockout and cookies, graph read/update/delete, incremental sync, Query Lab                                 |
| [`e2e/`](e2e)                 | Playwright                          | every page renders for the right role, access is refused for the wrong one, Query Lab flows, command palette, axe-core on every page in both themes |
| [`setup/`](setup)             | —                                   | Vitest setup                                                                                                                                        |

Database rules are tested in SQL with pgTAP: see [`db/tests/`](../db/tests).

```bash
pnpm test        # Vitest (unit + integration)
pnpm test:e2e    # Playwright against a running server
pnpm db:test     # pgTAP
pnpm verify:all  # all of the above and more
```

E2E tests sign in with the demo accounts (`pnpm seed:demo`) using `SEED_PASSWORD` from `.env.local`.
`pnpm docs:screenshots` runs the page tests with `SCREENSHOTS=1` to refresh `docs/screenshots/`.
