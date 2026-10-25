# 14. Testing

Every rule is tested where it lives: database rules in SQL with pgTAP, application code with Vitest,
pages in a real browser with Playwright. One command, `pnpm verify:all`, runs everything without touching
the data in the development database, and GitHub Actions runs the database tests, the static checks and a
production build on every push.

## 14.1 What is tested where

| Layer                    | Tool                   | What it proves                                                                                                         | Count         | Command                |
| ------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------- |
| Constraints              | pgTAP                  | each named constraint accepts valid rows and refuses invalid ones; a meta-test fails if a constraint has no test       | 163           | `pnpm db:test`         |
| Functions and procedures | pgTAP                  | known answers on a hand-built seed (h-index, lineage depth, topic path, exposure hops), error codes                    | in the 361    | `pnpm db:test`         |
| Triggers                 | pgTAP                  | derived columns, guards, audit rows, outbox rows, side-effect reader                                                   | in the 361    | `pnpm db:test`         |
| Views                    | pgTAP                  | `security_invoker` behaviour, materialized view contents                                                               | in the 361    | `pnpm db:test`         |
| RBAC and RLS             | pgTAP with `SET ROLE`  | allowed actions succeed, forbidden ones raise 42501, other users' rows are invisible                                   | in the 361    | `pnpm db:test`         |
| Migrations               | dbmate                 | a fresh database rolls back to zero and migrates up again                                                              | 18 migrations | `pnpm verify:all`      |
| SQL catalog              | Node runner            | all 55 files run as their role; read queries return rows on the real corpus; proofs fail with the constraint they name | 55            | `pnpm queries:run`     |
| Cypher catalog           | Node runner            | all 12 files run and return rows (writes rolled back)                                                                  | 12            | `pnpm cypher:run`      |
| Graph consistency        | `graph:check`          | 17 counts match between PostgreSQL and Neo4j, derived co-authorship included                                           | 17            | `pnpm graph:check`     |
| Units                    | Vitest                 | password hashing, session tokens, RRF fusion, SQLSTATE mapping, Zod schemas, the arXiv date rule                       |               | `pnpm test`            |
| API                      | Vitest                 | every endpoint × every role (264 cases), lockout, cookie flags, cross-site refusal, `/api/docs`                        |               | `pnpm test`            |
| Graph services           | Vitest + Neo4j         | every read, update and delete path of relations and trails, ownership refusals, incremental co-author sync             |               | `pnpm test`            |
| Query Lab                | Vitest                 | role-scoped runs, plans, proofs, NOTICE capture, side effects, rollback, commit refusal                                |               | `pnpm test`            |
| Pages                    | Playwright             | every page renders for the right role with no console errors; wrong roles get 403 or a sign-in redirect                | 22 pages      | `pnpm test:e2e`        |
| Interactions             | Playwright             | Query Lab runs, command palette search                                                                                 |               | `pnpm test:e2e`        |
| Accessibility            | axe-core in Playwright | no serious or critical WCAG 2.2 AA violation on any page, dark and light                                               | 44 scans      | `pnpm test:e2e`        |
| Performance              | Lighthouse             | performance, accessibility, best practices and SEO ≥ 90 on home and a paper page, mobile and desktop                   | 16 scores     | `pnpm perf:lighthouse` |

Vitest totals 327 tests in 9 files; Playwright runs 67 tests.

## 14.2 Negative tests double as demo material

The constraint proofs in the Query Lab (P01–P10) and in chapter 5 are actions the database must refuse:
a paper citing itself, a retraction dated before publication, a topic made its own grandparent, a
plaintext password, two authors in the same position, an open-access flag contradicting its status, a
malformed DOI, demoting the last administrator, a researcher recording a retraction, and reading other
people's private notes. Each is refused by a named constraint, trigger or privilege, and pgTAP checks the
same cases.

## 14.3 Latest `pnpm verify:all`

Run on 25 October 2026 on the development machine:

```text
verify:all: all 15 steps passed in 98 s
  ok     0.1 s  lint
  ok     1.3 s  typecheck
  ok     0.2 s  db:migrate
  ok     1.3 s  migrations: fresh test database, roll back to zero, migrate up again
  ok     1.1 s  db:test (test database rebuilt from zero, seeded, pgTAP)
  ok     0.3 s  queries:run --test
  ok     2.0 s  queries:run --require-rows
  ok     5.6 s  graph:rebuild
  ok     0.3 s  graph:check
  ok     0.4 s  cypher:run --require-rows
  ok     4.1 s  test
  ok     4.1 s  build
  ok     0.6 s  next start on port 3101
  ok    49.2 s  test:e2e
  ok    27.2 s  perf:lighthouse --base http://localhost:3101
```

Lighthouse scores from the same run (production build, local server):

```text
ok   mobile  /              performance 92  accessibility 100  best-practices 100  seo 100   LCP 3.4 s  TBT 20 ms  CLS 0
ok   mobile  /papers/952    performance 94  accessibility 100  best-practices 100  seo 90   LCP 3.1 s  TBT 10 ms  CLS 0
ok   desktop /              performance 100  accessibility 100  best-practices 100  seo 100   LCP 0.7 s  TBT 0 ms  CLS 0
ok   desktop /papers/952    performance 100  accessibility 100  best-practices 100  seo 90   LCP 0.7 s  TBT 0 ms  CLS 0
```

## 14.4 Continuous integration

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every push to `main`: install, lint,
type-check, the pgTAP suite against a PostgreSQL 18 service container built with pgTAP, the SQL catalog
on the test seed, and a production build. Tests that need Neo4j, Ollama or the full corpus run locally
through `pnpm verify:all`.
