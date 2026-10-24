# role

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `role_id` | integer | NO |  | PK |
| 2 | `role_code` | character varying(30) | NO |  |  |
| 3 | `role_name` | character varying(50) | NO |  |  |
| 4 | `db_role_name` | name | NO |  |  |
| 5 | `rank` | smallint | NO |  |  |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_role` | PRIMARY KEY | `PRIMARY KEY (role_id)` |
| `uq_role_code` | UNIQUE | `UNIQUE (role_code)` |
| `uq_role_db_role_name` | UNIQUE | `UNIQUE (db_role_name)` |
| `uq_role_name` | UNIQUE | `UNIQUE (role_name)` |
| `uq_role_rank` | UNIQUE | `UNIQUE (rank)` |
| `chk_role_code_format` | CHECK | `CHECK (((role_code)::text ~ '^[A-Z_]+$'::text))` |
| `chk_role_rank_positive` | CHECK | `CHECK ((rank > 0))` |

## Indexes

| Name | Definition |
| - | - |
| `pk_role` | `CREATE UNIQUE INDEX pk_role ON public.role USING btree (role_id)` |
| `uq_role_code` | `CREATE UNIQUE INDEX uq_role_code ON public.role USING btree (role_code)` |
| `uq_role_db_role_name` | `CREATE UNIQUE INDEX uq_role_db_role_name ON public.role USING btree (db_role_name)` |
| `uq_role_name` | `CREATE UNIQUE INDEX uq_role_name ON public.role USING btree (role_name)` |
| `uq_role_rank` | `CREATE UNIQUE INDEX uq_role_rank ON public.role USING btree (rank)` |

[← All tables](README.md)
