# paper_dataset

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `paper_id` | bigint | NO |  | PK, FK |
| 2 | `dataset_id` | bigint | NO |  | PK, FK |
| 3 | `usage_type` | character varying(20) | NO |  |  |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_paper_dataset` | PRIMARY KEY | `PRIMARY KEY (paper_id, dataset_id)` |
| `fk_paper_dataset_dataset` | FOREIGN KEY | `FOREIGN KEY (dataset_id) REFERENCES dataset(dataset_id) ON DELETE RESTRICT` |
| `fk_paper_dataset_paper` | FOREIGN KEY | `FOREIGN KEY (paper_id) REFERENCES paper(paper_id) ON DELETE CASCADE` |
| `chk_paper_dataset_usage_type` | CHECK | `CHECK (((usage_type)::text = ANY ((ARRAY['TRAINING'::character varying, 'VALIDATION'::character varying, 'TESTING'::character varying, 'BENCHMARKING'::character varying, 'OTHER'::character varying])::text[])))` |

## Indexes

| Name | Definition |
| - | - |
| `ix_paper_dataset_dataset_id` | `CREATE INDEX ix_paper_dataset_dataset_id ON public.paper_dataset USING btree (dataset_id)` |
| `pk_paper_dataset` | `CREATE UNIQUE INDEX pk_paper_dataset ON public.paper_dataset USING btree (paper_id, dataset_id)` |

[← All tables](README.md)
