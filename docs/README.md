# Documentation

The design, the evidence, and how to use Research Atlas. Chapters 5–7 are generated from the live database by
`pnpm docs:catalog`; the report is assembled from the chapters by `pnpm docs:report`.

## Chapters

|     | Chapter                                        | Covers                                                             |
| --- | ---------------------------------------------- | ------------------------------------------------------------------ |
| 1   | [Requirements](01-requirements.md)             | problem, roles, 12 use cases, non-functional requirements          |
| 2   | [ER model](02-er-model.md)                     | Chen diagram, entities, relationships, participation               |
| 3   | [Relational schema](03-relational-schema.md)   | mapping rules, keys, constraints, delete rules, indexes            |
| 4   | [Normalization](04-normalization.md)           | functional dependencies and BCNF per table                         |
| 5   | [DDL and constraints](05-ddl.md)               | migrations, 125 constraints, indexes, 30 triggers, proofs          |
| 6   | [DML](06-dml.md)                               | D01–D10 with outputs                                               |
| 7   | [Queries](07-queries.md)                       | Q01–Q25 with outputs and plans                                     |
| 8   | [Advanced SQL](08-advanced-sql.md)             | functions, procedures, triggers, views, CTE patterns               |
| 9   | [NoSQL and vectors](09-nosql.md)               | graph model, outbox, vector search, algorithms, read/update/delete |
| 10  | [Authentication and RBAC](10-auth-rbac.md)     | sessions, role ladder, privileges, row-level security, psql proof  |
| 11  | [API](11-api.md)                               | conventions, errors, all endpoints                                 |
| 12  | [Architecture](12-architecture.md)             | components, rendering, consistency model, layout                   |
| 13  | [Technology choices](13-tech-justification.md) | decision records                                                   |
| 14  | [Testing](14-testing.md)                       | strategy and the latest `verify:all`                               |
| 15  | [User guide](15-user-guide.md)                 | tour, demo accounts, troubleshooting                               |

## Artefacts

| Folder                        | Contents                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------- |
| [`er/`](er)                   | Chen ER diagram: draw.io source, PNG and SVG                                 |
| [`schema/`](schema/README.md) | per-table schema reference and diagram, generated from the database          |
| [`screenshots/`](screenshots) | every page in both themes                                                    |
| [`report/`](report)           | the project report: [`report.pdf`](report/report.pdf), its source and assets |
| [`assets/`](assets)           | README artwork and architecture diagrams (`pnpm docs:brand`)                 |
