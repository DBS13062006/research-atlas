# paper_method

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `paper_id` | bigint | NO |  | PK, FK |
| 2 | `method_id` | bigint | NO |  | PK, FK |
| 3 | `usage_type` | character varying(20) | NO |  |  |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_paper_method` | PRIMARY KEY | `PRIMARY KEY (paper_id, method_id)` |
| `fk_paper_method_method` | FOREIGN KEY | `FOREIGN KEY (method_id) REFERENCES method(method_id) ON DELETE RESTRICT` |
| `fk_paper_method_paper` | FOREIGN KEY | `FOREIGN KEY (paper_id) REFERENCES paper(paper_id) ON DELETE CASCADE` |
| `chk_paper_method_usage_type` | CHECK | `CHECK (((usage_type)::text = ANY ((ARRAY['PROPOSED'::character varying, 'USED'::character varying, 'COMPARED'::character varying, 'EXTENDED'::character varying, 'BASELINE'::character varying, 'OTHER'::character varying])::text[])))` |

## Indexes

| Name | Definition |
| - | - |
| `ix_paper_method_method_id` | `CREATE INDEX ix_paper_method_method_id ON public.paper_method USING btree (method_id)` |
| `pk_paper_method` | `CREATE UNIQUE INDEX pk_paper_method ON public.paper_method USING btree (paper_id, method_id)` |

[← All tables](README.md)
