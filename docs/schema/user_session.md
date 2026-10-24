# user_session

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `session_id` | character(64) | NO |  | PK |
| 2 | `user_id` | bigint | NO |  | FK |
| 3 | `created_at` | timestamp with time zone | NO | `now()` |  |
| 4 | `last_seen_at` | timestamp with time zone | NO | `now()` |  |
| 5 | `expires_at` | timestamp with time zone | NO |  |  |
| 6 | `ip` | inet | yes |  |  |
| 7 | `user_agent` | text | yes |  |  |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_user_session` | PRIMARY KEY | `PRIMARY KEY (session_id)` |
| `fk_user_session_user` | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES user_account(user_id) ON DELETE CASCADE` |
| `chk_user_session_expiry_after_creation` | CHECK | `CHECK ((expires_at > created_at))` |
| `chk_user_session_id_is_sha256_hex` | CHECK | `CHECK ((session_id ~ '^[0-9a-f]{64}$'::text))` |

## Indexes

| Name | Definition |
| - | - |
| `ix_user_session_expires_at` | `CREATE INDEX ix_user_session_expires_at ON public.user_session USING btree (expires_at)` |
| `ix_user_session_user_id` | `CREATE INDEX ix_user_session_user_id ON public.user_session USING btree (user_id)` |
| `pk_user_session` | `CREATE UNIQUE INDEX pk_user_session ON public.user_session USING btree (session_id)` |

[← All tables](README.md)
