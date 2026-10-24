# method

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `method_id` | bigint | NO |  | PK |
| 2 | `method_name` | character varying(200) | NO |  |  |
| 3 | `method_category` | character varying(80) | yes |  |  |
| 4 | `description` | text | yes |  |  |
| 5 | `introduced_year` | smallint | yes |  |  |
| 6 | `pwc_slug` | character varying(200) | yes |  |  |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_method` | PRIMARY KEY | `PRIMARY KEY (method_id)` |
| `uq_method_name` | UNIQUE | `UNIQUE (method_name)` |
| `uq_method_pwc_slug` | UNIQUE | `UNIQUE (pwc_slug)` |
| `chk_method_introduced_year` | CHECK | `CHECK (((introduced_year >= 1900) AND (introduced_year <= 2100)))` |

## Indexes

| Name | Definition |
| - | - |
| `pk_method` | `CREATE UNIQUE INDEX pk_method ON public.method USING btree (method_id)` |
| `uq_method_name` | `CREATE UNIQUE INDEX uq_method_name ON public.method USING btree (method_name)` |
| `uq_method_pwc_slug` | `CREATE UNIQUE INDEX uq_method_pwc_slug ON public.method USING btree (pwc_slug)` |

[← All tables](README.md)
