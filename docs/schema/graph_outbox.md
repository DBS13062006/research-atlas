# graph_outbox

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `outbox_id` | bigint | NO |  | PK |
| 2 | `aggregate` | character varying(30) | NO |  |  |
| 3 | `aggregate_key` | jsonb | NO |  |  |
| 4 | `operation` | character varying(10) | NO |  |  |
| 5 | `payload` | jsonb | yes |  |  |
| 6 | `created_at` | timestamp with time zone | NO | `now()` |  |
| 7 | `processed_at` | timestamp with time zone | yes |  |  |
| 8 | `attempts` | smallint | NO | `0` |  |
| 9 | `last_error` | text | yes |  |  |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_graph_outbox` | PRIMARY KEY | `PRIMARY KEY (outbox_id)` |
| `chk_graph_outbox_attempts_non_negative` | CHECK | `CHECK ((attempts >= 0))` |
| `chk_graph_outbox_operation` | CHECK | `CHECK (((operation)::text = ANY ((ARRAY['UPSERT'::character varying, 'DELETE'::character varying])::text[])))` |

## Indexes

| Name | Definition |
| - | - |
| `ix_outbox_pending` | `CREATE INDEX ix_outbox_pending ON public.graph_outbox USING btree (outbox_id) WHERE (processed_at IS NULL)` |
| `pk_graph_outbox` | `CREATE UNIQUE INDEX pk_graph_outbox ON public.graph_outbox USING btree (outbox_id)` |

[← All tables](README.md)
