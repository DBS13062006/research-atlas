# user_account

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `user_id` | bigint | NO |  | PK |
| 2 | `public_id` | uuid | NO | `uuidv7()` |  |
| 3 | `name` | character varying(120) | NO |  |  |
| 4 | `email` | citext | NO |  |  |
| 5 | `password_hash` | character varying(255) | NO |  |  |
| 6 | `role_id` | integer | NO |  | FK |
| 7 | `is_active` | boolean | NO | `true` |  |
| 8 | `failed_login_count` | smallint | NO | `0` |  |
| 9 | `locked_until` | timestamp with time zone | yes |  |  |
| 10 | `last_login_at` | timestamp with time zone | yes |  |  |
| 11 | `created_at` | timestamp with time zone | NO | `now()` |  |
| 12 | `updated_at` | timestamp with time zone | NO | `now()` |  |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_user_account` | PRIMARY KEY | `PRIMARY KEY (user_id)` |
| `uq_user_account_email` | UNIQUE | `UNIQUE (email)` |
| `uq_user_account_public_id` | UNIQUE | `UNIQUE (public_id)` |
| `fk_user_account_role` | FOREIGN KEY | `FOREIGN KEY (role_id) REFERENCES role(role_id) ON UPDATE CASCADE ON DELETE RESTRICT` |
| `chk_user_account_email_format` | CHECK | `CHECK ((email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'::citext))` |
| `chk_user_account_failed_logins_non_negative` | CHECK | `CHECK ((failed_login_count >= 0))` |
| `chk_user_account_name_not_blank` | CHECK | `CHECK ((length(btrim((name)::text)) > 0))` |
| `chk_user_account_password_is_argon2id` | CHECK | `CHECK (((password_hash)::text ~~ '$argon2id$%'::text))` |

## Indexes

| Name | Definition |
| - | - |
| `ix_user_account_role_id` | `CREATE INDEX ix_user_account_role_id ON public.user_account USING btree (role_id)` |
| `pk_user_account` | `CREATE UNIQUE INDEX pk_user_account ON public.user_account USING btree (user_id)` |
| `uq_user_account_email` | `CREATE UNIQUE INDEX uq_user_account_email ON public.user_account USING btree (email)` |
| `uq_user_account_public_id` | `CREATE UNIQUE INDEX uq_user_account_public_id ON public.user_account USING btree (public_id)` |

[← All tables](README.md)
