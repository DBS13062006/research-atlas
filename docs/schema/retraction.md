# retraction

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `retraction_id` | bigint | NO |  | PK |
| 2 | `paper_id` | bigint | NO |  | FK |
| 3 | `retraction_date` | date | NO |  |  |
| 4 | `reason` | text | yes |  |  |
| 5 | `notice_url` | character varying(1000) | yes |  |  |
| 6 | `status` | character varying(30) | NO |  |  |
| 7 | `source` | character varying(20) | NO | `'MANUAL'::character varying` |  |
| 8 | `rw_record_id` | integer | yes |  |  |
| 9 | `recorded_by` | bigint | yes |  | FK |
| 10 | `created_at` | timestamp with time zone | NO | `now()` |  |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_retraction` | PRIMARY KEY | `PRIMARY KEY (retraction_id)` |
| `uq_retraction_paper` | UNIQUE | `UNIQUE (paper_id)` |
| `uq_retraction_rw_record_id` | UNIQUE | `UNIQUE (rw_record_id)` |
| `fk_retraction_paper` | FOREIGN KEY | `FOREIGN KEY (paper_id) REFERENCES paper(paper_id) ON DELETE CASCADE` |
| `fk_retraction_recorded_by` | FOREIGN KEY | `FOREIGN KEY (recorded_by) REFERENCES user_account(user_id) ON DELETE SET NULL` |
| `chk_retraction_source` | CHECK | `CHECK (((source)::text = ANY ((ARRAY['RETRACTION_WATCH'::character varying, 'OPENALEX'::character varying, 'MANUAL'::character varying])::text[])))` |
| `chk_retraction_status` | CHECK | `CHECK (((status)::text = ANY ((ARRAY['RETRACTED'::character varying, 'CORRECTED'::character varying, 'EXPRESSION_OF_CONCERN'::character varying, 'REINSTATED'::character varying])::text[])))` |

## Indexes

| Name | Definition |
| - | - |
| `ix_retraction_recorded_by` | `CREATE INDEX ix_retraction_recorded_by ON public.retraction USING btree (recorded_by)` |
| `pk_retraction` | `CREATE UNIQUE INDEX pk_retraction ON public.retraction USING btree (retraction_id)` |
| `uq_retraction_paper` | `CREATE UNIQUE INDEX uq_retraction_paper ON public.retraction USING btree (paper_id)` |
| `uq_retraction_rw_record_id` | `CREATE UNIQUE INDEX uq_retraction_rw_record_id ON public.retraction USING btree (rw_record_id)` |

[← All tables](README.md)
