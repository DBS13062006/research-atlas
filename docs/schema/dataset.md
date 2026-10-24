# dataset

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `dataset_id` | bigint | NO |  | PK |
| 2 | `dataset_name` | character varying(200) | NO |  |  |
| 3 | `modality` | character varying(40) | yes |  |  |
| 4 | `domain` | character varying(150) | yes |  |  |
| 5 | `dataset_url` | character varying(1000) | yes |  |  |
| 6 | `description` | text | yes |  |  |
| 7 | `pwc_slug` | character varying(200) | yes |  |  |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_dataset` | PRIMARY KEY | `PRIMARY KEY (dataset_id)` |
| `uq_dataset_name` | UNIQUE | `UNIQUE (dataset_name)` |
| `uq_dataset_pwc_slug` | UNIQUE | `UNIQUE (pwc_slug)` |

## Indexes

| Name | Definition |
| - | - |
| `pk_dataset` | `CREATE UNIQUE INDEX pk_dataset ON public.dataset USING btree (dataset_id)` |
| `uq_dataset_name` | `CREATE UNIQUE INDEX uq_dataset_name ON public.dataset USING btree (dataset_name)` |
| `uq_dataset_pwc_slug` | `CREATE UNIQUE INDEX uq_dataset_pwc_slug ON public.dataset USING btree (pwc_slug)` |

[← All tables](README.md)
