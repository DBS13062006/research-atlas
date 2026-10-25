# 11. API

Everything the interface does goes through a versioned REST API under `/api/v1`, so the same rules apply
to the browser, scripts and anyone testing with `curl`. The API is described by an OpenAPI 3.1 document at
[`/api/v1/openapi.json`](http://localhost:3000/api/v1/openapi.json), browsable at
[`/api/docs`](http://localhost:3000/api/docs) (Scalar).

## 11.1 One registry, four uses

Every endpoint is one entry in [`src/server/api/registry.ts`](../src/server/api/registry.ts): its summary,
tag, minimum role, and the Zod schemas for its query string and body. That single entry drives
1. **validation** of every request (Zod 4);
2. **the role gate**, before any database work;
3. **the OpenAPI document**, generated from the same Zod schemas with `z.toJSONSchema`;
4. **the role-matrix test**, which calls every endpoint as every role (264 cases) and checks the status.

Route files are one line each; the shared wrapper `route()` in
[`src/server/api/handler.ts`](../src/server/api/handler.ts) does the rest.

## 11.2 Conventions

| Aspect                | Convention                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication        | the `ra_session` cookie set by `POST /auth/login` or `/auth/signup`                                                                                           |
| Cross-site protection | non-GET requests must carry a same-origin `Origin` header, else 403                                                                                           |
| Status codes          | 200 read, 201 created, 204 deleted, 401 not signed in, 403 role too low or refused by PostgreSQL, 404 missing, 409 conflict, 422 invalid input or broken rule |
| Errors                | `application/problem+json` (RFC 9457) with `type`, `title`, `status`, `detail`, and for database rules `constraint` and `sqlstate`                            |
| Database access       | every handler runs inside one transaction under the caller's PostgreSQL role (chapter 10)                                                                     |
| Graph consistency     | handlers that change projected data drain the outbox into Neo4j before answering                                                                              |
| Caching               | anonymous catalog reads are cached and invalidated by tag after any write                                                                                     |

## 11.3 Database errors become readable problems

[`src/server/db/errors.ts`](../src/server/db/errors.ts) maps SQLSTATEs to HTTP and names the broken rule
in plain words:

| SQLSTATE                                   | HTTP | Title                                    |
| ------------------------------------------ | ---- | ---------------------------------------- |
| 23505 unique violation                     | 409  | Already exists                           |
| 23001 restrict violation                   | 409  | Still in use                             |
| 23503 foreign key violation                | 422  | Refers to something that does not exist  |
| 23514 check violation (and trigger guards) | 422  | Breaks a data rule                       |
| 23502 not-null violation                   | 422  | A required value is missing              |
| 42501 insufficient privilege               | 403  | Not allowed                              |
| RA001 (custom)                             | 409  | Email already registered                 |
| RA002 (custom)                             | 409  | The last administrator cannot be removed |

For example, a curator gives a paper a DOI that another paper already has:

```http
PATCH /api/v1/papers/952
Content-Type: application/json

{"doi": "10.1145/3495161"}
```

```json
{
  "type": "https://research-atlas.test/problems/sqlstate-23505",
  "title": "Already exists",
  "status": 409,
  "detail": "Another paper already has this DOI.",
  "constraint": "uq_paper_doi",
  "sqlstate": "23505"
}
```

Constraints without a plain-language explanation return PostgreSQL's own message, which always names the
constraint, because every constraint has a name.

## 11.4 Endpoints

66 endpoints. The minimum role is enforced by the API and again by PostgreSQL.
### Auth

| Method | Path                  | Minimum role | What it does                                                      |
| ------ | --------------------- | ------------ | ----------------------------------------------------------------- |
| `POST` | `/api/v1/auth/signup` | anonymous    | Create a researcher account and start a session                   |
| `POST` | `/api/v1/auth/login`  | anonymous    | Log in; sets the ra_session cookie                                |
| `POST` | `/api/v1/auth/logout` | researcher   | End this session (everywhere=true ends every session of the user) |
| `GET`  | `/api/v1/auth/me`     | researcher   | The signed-in user                                                |

### Papers

| Method   | Path                             | Minimum role | What it does                                                     |
| -------- | -------------------------------- | ------------ | ---------------------------------------------------------------- |
| `GET`    | `/api/v1/papers`                 | anonymous    | List papers with keyset pagination on (cited_by_count, paper_id) |
| `POST`   | `/api/v1/papers`                 | curator      | Create a paper                                                   |
| `GET`    | `/api/v1/papers/{id}`            | anonymous    | One paper with authors, topics, methods, datasets and resources  |
| `PATCH`  | `/api/v1/papers/{id}`            | curator      | Edit a paper                                                     |
| `DELETE` | `/api/v1/papers/{id}`            | admin        | Delete a paper (cascades to its links)                           |
| `POST`   | `/api/v1/papers/{id}/retraction` | admin        | Record a retraction (sp_retract_paper)                           |

### Graph

| Method | Path                                | Minimum role | What it does                                                             |
| ------ | ----------------------------------- | ------------ | ------------------------------------------------------------------------ |
| `GET`  | `/api/v1/papers/{id}/lineage`       | anonymous    | Ancestors or descendants, computed in SQL (recursive CTE) or Cypher      |
| `GET`  | `/api/v1/papers/{id}/neighbourhood` | anonymous    | One-hop citation neighbourhood and curated relations, as nodes and edges |
| `GET`  | `/api/v1/papers/{id}/similar`       | anonymous    | Nearest papers by embedding                                              |
| `GET`  | `/api/v1/graph/path`                | anonymous    | Shortest citation chain between two papers, in Cypher and SQL            |

### Curation

| Method   | Path                                       | Minimum role | What it does                                          |
| -------- | ------------------------------------------ | ------------ | ----------------------------------------------------- |
| `POST`   | `/api/v1/papers/{id}/methods`              | curator      | Link a method to a paper                              |
| `DELETE` | `/api/v1/papers/{id}/methods/{methodId}`   | curator      | Unlink a method from a paper                          |
| `POST`   | `/api/v1/papers/{id}/datasets`             | curator      | Link a dataset to a paper                             |
| `DELETE` | `/api/v1/papers/{id}/datasets/{datasetId}` | curator      | Unlink a dataset from a paper                         |
| `POST`   | `/api/v1/import/doi`                       | curator      | Import a paper from OpenAlex by DOI (sp_import_paper) |

### Catalog

| Method | Path               | Minimum role | What it does                   |
| ------ | ------------------ | ------------ | ------------------------------ |
| `GET`  | `/api/v1/methods`  | anonymous    | All methods with paper counts  |
| `GET`  | `/api/v1/datasets` | anonymous    | All datasets with paper counts |

### Relations

| Method   | Path                            | Minimum role | What it does                                         |
| -------- | ------------------------------- | ------------ | ---------------------------------------------------- |
| `GET`    | `/api/v1/relations`             | anonymous    | The most recently changed curated relations          |
| `GET`    | `/api/v1/papers/{id}/relations` | anonymous    | Curated relations of a paper                         |
| `POST`   | `/api/v1/papers/{id}/relations` | researcher   | Assert a curated relation from this paper to another |
| `GET`    | `/api/v1/relations/{id}`        | anonymous    | One curated relation                                 |
| `PATCH`  | `/api/v1/relations/{id}`        | researcher   | Edit a curated relation (creator or curator)         |
| `DELETE` | `/api/v1/relations/{id}`        | researcher   | Delete a curated relation (creator or curator)       |

### Search

| Method | Path             | Minimum role | What it does                                                |
| ------ | ---------------- | ------------ | ----------------------------------------------------------- |
| `GET`  | `/api/v1/search` | anonymous    | Lexical, semantic or hybrid (reciprocal rank fusion) search |

### Authors

| Method | Path                    | Minimum role | What it does                                                     |
| ------ | ----------------------- | ------------ | ---------------------------------------------------------------- |
| `GET`  | `/api/v1/authors`       | anonymous    | Find authors by name, tolerating typos (pg_trgm)                 |
| `GET`  | `/api/v1/authors/{id}`  | anonymous    | An author with papers, output per year and topics                |
| `POST` | `/api/v1/authors/merge` | admin        | Merge a duplicate author into a canonical one (sp_merge_authors) |

### Topics

| Method | Path                  | Minimum role | What it does                                 |
| ------ | --------------------- | ------------ | -------------------------------------------- |
| `GET`  | `/api/v1/topics`      | anonymous    | The topic tree with paper counts             |
| `GET`  | `/api/v1/topics/{id}` | anonymous    | A topic with growth, children and top papers |

### Library

| Method   | Path                                        | Minimum role | What it does                                                         |
| -------- | ------------------------------------------- | ------------ | -------------------------------------------------------------------- |
| `GET`    | `/api/v1/collections`                       | researcher   | Your collections with reading counts                                 |
| `POST`   | `/api/v1/collections`                       | researcher   | Create a collection                                                  |
| `GET`    | `/api/v1/collections/{id}`                  | anonymous    | A collection and its papers (row-level security applies)             |
| `PATCH`  | `/api/v1/collections/{id}`                  | researcher   | Rename or publish a collection                                       |
| `DELETE` | `/api/v1/collections/{id}`                  | researcher   | Delete a collection                                                  |
| `POST`   | `/api/v1/collections/{id}/papers`           | researcher   | Add a paper to a collection (sp_add_to_collection)                   |
| `PATCH`  | `/api/v1/collections/{id}/papers/{paperId}` | researcher   | Move a card: reading status, priority or position                    |
| `DELETE` | `/api/v1/collections/{id}/papers/{paperId}` | researcher   | Remove a paper from a collection                                     |
| `GET`    | `/api/v1/notes`                             | researcher   | Your notes, or notes on one paper (public ones from others included) |
| `POST`   | `/api/v1/notes`                             | researcher   | Write a note                                                         |
| `PATCH`  | `/api/v1/notes/{id}`                        | researcher   | Edit your note                                                       |
| `DELETE` | `/api/v1/notes/{id}`                        | researcher   | Delete your note                                                     |

### Trails

| Method   | Path                                   | Minimum role | What it does                                    |
| -------- | -------------------------------------- | ------------ | ----------------------------------------------- |
| `GET`    | `/api/v1/trails`                       | anonymous    | Public trails and your own                      |
| `POST`   | `/api/v1/trails`                       | researcher   | Create a reading trail                          |
| `GET`    | `/api/v1/trails/{id}`                  | anonymous    | A trail with its ordered steps                  |
| `PATCH`  | `/api/v1/trails/{id}`                  | researcher   | Rename a trail or change its visibility (owner) |
| `DELETE` | `/api/v1/trails/{id}`                  | researcher   | Delete a trail (owner)                          |
| `POST`   | `/api/v1/trails/{id}/steps`            | researcher   | Add a stop to the end of a trail                |
| `PUT`    | `/api/v1/trails/{id}/steps`            | researcher   | Reorder all stops in one transaction            |
| `PATCH`  | `/api/v1/trails/{id}/steps/{position}` | researcher   | Annotate a stop                                 |
| `DELETE` | `/api/v1/trails/{id}/steps/{position}` | researcher   | Remove a stop; later stops move up              |

### Integrity

| Method | Path                           | Minimum role | What it does                                                 |
| ------ | ------------------------------ | ------------ | ------------------------------------------------------------ |
| `GET`  | `/api/v1/integrity`            | anonymous    | Retracted papers and how much of the corpus cites them       |
| `GET`  | `/api/v1/integrity/my-library` | researcher   | Papers in your collections within two hops of retracted work |

### Admin

| Method  | Path                              | Minimum role | What it does                                               |
| ------- | --------------------------------- | ------------ | ---------------------------------------------------------- |
| `GET`   | `/api/v1/admin/users`             | admin        | All users with roles and activity                          |
| `PATCH` | `/api/v1/admin/users/{id}`        | admin        | Change a user's role or deactivate them (sp_set_user_role) |
| `GET`   | `/api/v1/admin/audit`             | admin        | The audit log                                              |
| `GET`   | `/api/v1/admin/outbox`            | admin        | Graph outbox health                                        |
| `POST`  | `/api/v1/admin/analytics/refresh` | admin        | Refresh the materialized views (sp_refresh_analytics)      |
| `GET`   | `/api/v1/admin/slow-queries`      | admin        | Slowest statements from pg_stat_statements                 |
| `POST`  | `/api/v1/admin/graph-sync`        | admin        | Drain the graph outbox into Neo4j now                      |

### Query Lab

| Method | Path                  | Minimum role | What it does                                                                          |
| ------ | --------------------- | ------------ | ------------------------------------------------------------------------------------- |
| `GET`  | `/api/v1/lab/catalog` | researcher   | Every Query Lab catalog file: SQL queries, DML, proofs, routines, triggers and Cypher |
| `POST` | `/api/v1/lab/run`     | researcher   | Run a SQL catalog file as your database role (rolled back unless an admin commits)    |
| `POST` | `/api/v1/lab/cypher`  | researcher   | Run a Cypher catalog file (always rolled back); mode=profile returns the PROFILE plan |
