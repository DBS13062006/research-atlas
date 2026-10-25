# Security policy

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's
[private vulnerability reporting](https://github.com/DBS13062006/research-atlas/security/advisories/new) with a
description, steps to reproduce and the impact. We aim to reply within three working days.

## Supported versions

Only the latest commit on `main` is supported.

## Security design

| Area                 | Measure                                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access control       | every request runs under the caller's PostgreSQL role; GRANTs and forced row-level security decide access, so an application bug cannot widen it                 |
| Least privilege      | the web server connects as `ra_app`, which is `NOINHERIT` and holds no data privileges of its own                                                                |
| Passwords            | Argon2id (19 MiB, t = 2, p = 1); a CHECK constraint refuses anything that is not an Argon2id hash                                                                |
| Sessions             | 256-bit random tokens; only their SHA-256 is stored; `HttpOnly`, `SameSite=Lax`, `Secure` cookies; 30-day expiry with renewal                                    |
| Brute force          | five failed sign-ins lock an account for fifteen minutes                                                                                                         |
| Cross-site requests  | non-GET API calls must come from the same origin                                                                                                                 |
| SQL injection        | parameterised postgres.js templates only; the only dynamic identifiers are role names from a fixed allow-list; the Query Lab runs catalog files, never typed SQL |
| Privileged functions | `SECURITY DEFINER` functions fix `search_path`, return minimal columns and are granted to specific roles only                                                    |
| Secrets              | kept in `.env.local`, which is ignored by Git; CI uses throwaway credentials per run                                                                             |

See [chapter 10](docs/10-auth-rbac.md) for the full design and its tests.
