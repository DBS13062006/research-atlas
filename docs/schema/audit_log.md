# audit_log

Kind: partitioned table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `audit_id` | bigint | NO |  | PK |
| 2 | `occurred_at` | timestamp with time zone | NO | `now()` | PK |
| 3 | `table_name` | name | NO |  |  |
| 4 | `operation` | character(1) | NO |  |  |
| 5 | `row_pk` | jsonb | NO |  |  |
| 6 | `old_row` | jsonb | yes |  |  |
| 7 | `new_row` | jsonb | yes |  |  |
| 8 | `actor_user_id` | bigint | yes |  |  |
| 9 | `db_role` | name | NO | `CURRENT_USER` |  |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_audit_log` | PRIMARY KEY | `PRIMARY KEY (audit_id, occurred_at)` |
| `chk_audit_log_operation` | CHECK | `CHECK ((operation = ANY (ARRAY['I'::bpchar, 'U'::bpchar, 'D'::bpchar])))` |

## Indexes

| Name | Definition |
| - | - |
| `ix_audit_log_occurred_at_brin` | `CREATE INDEX ix_audit_log_occurred_at_brin ON ONLY public.audit_log USING brin (occurred_at)` |
| `pk_audit_log` | `CREATE UNIQUE INDEX pk_audit_log ON ONLY public.audit_log USING btree (audit_id, occurred_at)` |

[← All tables](README.md)
