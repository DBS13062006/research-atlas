# permission

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `permission_id` | integer | NO |  | PK |
| 2 | `permission_code` | character varying(60) | NO |  |  |
| 3 | `description` | text | yes |  |  |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_permission` | PRIMARY KEY | `PRIMARY KEY (permission_id)` |
| `uq_permission_code` | UNIQUE | `UNIQUE (permission_code)` |
| `chk_permission_code_format` | CHECK | `CHECK (((permission_code)::text ~ '^[a-z_]+:[a-z_]+$'::text))` |

## Indexes

| Name | Definition |
| - | - |
| `pk_permission` | `CREATE UNIQUE INDEX pk_permission ON public.permission USING btree (permission_id)` |
| `uq_permission_code` | `CREATE UNIQUE INDEX uq_permission_code ON public.permission USING btree (permission_code)` |

[← All tables](README.md)
