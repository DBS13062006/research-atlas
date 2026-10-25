# 10. Authentication and access control

Access control is enforced twice: once by the application (which hides what a role cannot do) and once,
authoritatively, by PostgreSQL. Every request runs under the caller's own database role, so a bug in the
application cannot leak another user's notes or let a researcher record a retraction: the database refuses.

## 10.1 Accounts and passwords

- **Sign-up** calls the procedure `sp_register_user`, which validates the email, refuses duplicates with a
  named error (SQLSTATE `RA001`) and assigns the researcher role.
- **Passwords** are hashed with **Argon2id** (`@node-rs/argon2`, memory 19 MiB, 2 iterations, parallelism 1:
  the OWASP minimum). `chk_user_account_password_is_argon2id` refuses anything that is not an Argon2id PHC
  string, so a plaintext password cannot be stored even by mistake (constraint proof P04).
- **Lockout.** Five failed sign-ins in a row lock the account for fifteen minutes, even for the right
  password (`fn_record_login_failure`). The error message does not reveal whether the email exists.

## 10.2 Sessions

Sessions follow the Copenhagen Book design:

| Aspect            | Design                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| Token             | 256 random bits, base64url, sent only as the `ra_session` cookie                                          |
| Storage           | the database stores **SHA-256 of the token** as the session id; a leaked session table cannot be replayed |
| Cookie            | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production, 30-day expiry                               |
| Renewal           | extended to 30 days whenever fewer than 15 remain                                                         |
| Sign out          | deletes this session, or every session of the user (“sign out everywhere”)                                |
| Cross-site writes | every non-GET API call must come from the same origin, or it gets 403                                     |

`user_session` has forced row-level security, **no policies and no grants**. Only six `SECURITY DEFINER`
functions owned by `ra_owner` (`fn_auth_lookup`, `fn_session_user`, `fn_record_login_success`,
`fn_record_login_failure`, `fn_session_extend`, `fn_session_delete`) can touch it, and only the
connection role `ra_app` may call the session-writing ones, after it has verified the password itself.

## 10.3 Request lifecycle

```mermaid
sequenceDiagram
  participant B as Browser
  participant N as Next.js (proxy, DAL, route)
  participant P as PostgreSQL
  B->>N: request with ra_session cookie
  N->>N: proxy.ts: no cookie on /library, /curate, /admin, /lab, /account → redirect to /login
  N->>P: SELECT * FROM fn_session_user(sha256(token))  (as ra_app)
  P-->>N: user, role, db role name
  N->>P: BEGIN; set_config('role', 'ra_researcher', true); set_config('app.user_id', '3', true)
  N->>P: the page's queries
  P-->>N: rows allowed by GRANTs and RLS
  N->>P: COMMIT
  N-->>B: page
```

The proxy only redirects; it is a convenience, not a security boundary. The Data Access Layer
([`src/server/auth/dal.ts`](../src/server/auth/dal.ts)) decides who is calling, and PostgreSQL decides what
they may do. `set_config('role', …, true)` is `SET LOCAL ROLE` with a bound parameter, and the role name
always comes from a fixed allow-list.

## 10.4 The role ladder

| PostgreSQL role | Login   | Inherits        | Application role                                                                         |
| --------------- | ------- | --------------- | ---------------------------------------------------------------------------------------- |
| `ra_owner`      | no      | —               | owns every object, `BYPASSRLS`; used only by migrations and `SECURITY DEFINER` functions |
| `ra_app`        | **yes** | `NOINHERIT`     | the web server's connection; no data privileges of its own                               |
| `ra_anon`       | no      | —               | visitors                                                                                 |
| `ra_researcher` | no      | `ra_anon`       | signed-up users                                                                          |
| `ra_curator`    | no      | `ra_researcher` | curators                                                                                 |
| `ra_admin`      | no      | `ra_curator`    | administrators                                                                           |

Because `ra_app` is `NOINHERIT`, it holds no privileges until a request switches to one of the four group
roles.

## 10.5 Privilege matrix

| Object                                                                                                          | anon                 | researcher                                            | curator                  | admin                          |
| --------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------- | ------------------------ | ------------------------------ |
| Catalog tables (paper, author, citation, topic, …)                                                              | SELECT               | SELECT                                                | + INSERT, UPDATE         | + DELETE                       |
| Link tables (paper_author, citation, paper_topic, paper_method, paper_dataset, resource)                        | SELECT               | SELECT                                                | + INSERT, UPDATE, DELETE | same                           |
| `retraction`                                                                                                    | SELECT               | SELECT                                                | SELECT                   | + INSERT, UPDATE, DELETE       |
| `collection`, `collection_paper`, `note`                                                                        | SELECT (public rows) | + INSERT, UPDATE, DELETE (own rows)                   | same                     | all rows                       |
| `user_account`                                                                                                  | —                    | SELECT own row (no password columns), UPDATE own name | same                     | SELECT, INSERT, UPDATE, DELETE |
| `role_permission`                                                                                               | SELECT               | SELECT                                                | SELECT                   | + INSERT, DELETE               |
| `audit_log`                                                                                                     | —                    | —                                                     | —                        | SELECT                         |
| `graph_outbox`                                                                                                  | —                    | —                                                     | —                        | SELECT, UPDATE                 |
| Materialized views                                                                                              | SELECT               | SELECT                                                | SELECT                   | + MAINTAIN (refresh)           |
| `sp_add_to_collection`                                                                                          | —                    | EXECUTE                                               | EXECUTE                  | EXECUTE                        |
| `sp_import_paper`                                                                                               | —                    | —                                                     | EXECUTE                  | EXECUTE                        |
| `sp_retract_paper`, `sp_merge_authors`, `sp_set_user_role`, `sp_refresh_analytics`, `sp_purge_expired_sessions` | —                    | —                                                     | —                        | EXECUTE                        |

Nothing is executable by `PUBLIC`; every grant in [`300_rbac.sql`](../db/migrations/300_rbac.sql) is
deliberate. The application's permission vocabulary lives in the `permission` and `role_permission` tables
(`papers:write`, `relations:moderate`, `lab:dml`, …) and drives what the interface shows.

## 10.6 Row-level security

Five tables have **forced** row-level security, so even the table owner is filtered (only `ra_owner`, with
`BYPASSRLS`, and its `SECURITY DEFINER` functions see every row):

| Table              | Policy                                                                     | Applies to                     | Rule                                                                                                    |
| ------------------ | -------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `note`             | `note_public_read`                                                         | anon (and every role above it) | `SELECT` where `NOT is_private`                                                                         |
|                    | `note_owner_all`                                                           | researcher                     | all commands where `user_id = app_current_user_id()`, checked on write too                              |
|                    | `note_admin_all`                                                           | admin                          | everything                                                                                              |
| `collection`       | `collection_public_read` / `collection_owner_all` / `collection_admin_all` | as above                       | `is_public` / owner / everything                                                                        |
| `collection_paper` | `…_public_read` / `…_owner_all` / `…_admin_all`                            | as above                       | an entry follows its collection, through an `EXISTS` that is itself filtered by the collection policies |
| `user_account`     | `user_account_self` / `user_account_admin_all`                             | researcher / admin             | own row / everything                                                                                    |
| `user_session`     | none                                                                       | —                              | unreachable except through the auth functions                                                           |

Views that read these tables (`v_my_library`, `v_paper_card`, `v_retraction_exposure`) use
`security_invoker`, so the policies are evaluated for the caller, not the view owner.

## 10.7 Proof in psql

The same rules, seen directly in `psql` as the database superuser switching roles. Rhea is a researcher
with five notes; Ravi is another researcher.

```text
BEGIN;
BEGIN
SET LOCAL ROLE ra_anon;
SET
SELECT count(*) AS public_notes FROM note;
 public_notes 
--------------
            2
(1 row)

SELECT count(*) FROM user_account;
ERROR:  permission denied for table user_account
ROLLBACK;
ROLLBACK
BEGIN;
BEGIN
SELECT set_config('app.user_id', (SELECT user_id::TEXT FROM user_account WHERE email = 'rhea@research-atlas.test'), true) AS acting_as;
 acting_as 
-----------
 3
(1 row)

SET LOCAL ROLE ra_researcher;
SET
SELECT count(*) AS visible_notes, count(*) FILTER (WHERE user_id = app_current_user_id()) AS mine FROM note;
 visible_notes | mine 
---------------+------
             6 |    5
(1 row)

INSERT INTO note (user_id, paper_id, note_text) VALUES (4, 1, 'written in Ravi''s name');
ERROR:  new row violates row-level security policy for table "note"
INSERT INTO retraction (paper_id, retraction_date, status) VALUES (1, CURRENT_DATE, 'RETRACTED');
ERROR:  permission denied for table retraction
ROLLBACK;
ROLLBACK
BEGIN;
BEGIN
SET LOCAL ROLE ra_admin;
SET
SELECT count(*) AS all_notes FROM note;
 all_notes 
-----------
         8
(1 row)

ROLLBACK;
ROLLBACK
```

As anonymous, two public notes are visible and accounts are off limits. As Rhea, she sees her five notes
and one public note of someone else; writing a note in Ravi's name violates the policy's `WITH CHECK`; and
recording a retraction is not granted to researchers at all. The administrator sees all eight notes.
The same cases run as pgTAP tests in [`db/tests/60_rbac.sql`](../db/tests/60_rbac.sql), and the Query Lab
shows them live: run proof P09 or P10 as a researcher.

## 10.8 Where each rule is tested

| Rule                                                        | Test                                             |
| ----------------------------------------------------------- | ------------------------------------------------ |
| Grants and RLS per role                                     | `db/tests/60_rbac.sql` (pgTAP, using `SET ROLE`) |
| Every API endpoint × every role returns the expected status | `tests/integration/api-roles.test.ts`            |
| Lockout, cookie flags, cross-site refusal                   | `tests/integration/api-roles.test.ts`            |
| Pages redirect or show 403 for the wrong role               | `tests/e2e/access.spec.ts`                       |

<!-- chapter-nav -->

---

[← NoSQL and vectors](09-nosql.md) · [Documentation index](README.md) · [API →](11-api.md)
