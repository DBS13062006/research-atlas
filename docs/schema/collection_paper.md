# collection_paper

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `collection_id` | bigint | NO |  | PK, FK |
| 2 | `paper_id` | bigint | NO |  | PK, FK |
| 3 | `reading_status` | character varying(10) | NO | `'NOT_READ'::character varying` |  |
| 4 | `priority` | character varying(10) | NO | `'MEDIUM'::character varying` |  |
| 5 | `position` | integer | NO | `0` |  |
| 6 | `added_at` | timestamp with time zone | NO | `now()` |  |
| 7 | `read_at` | timestamp with time zone | yes |  |  |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_collection_paper` | PRIMARY KEY | `PRIMARY KEY (collection_id, paper_id)` |
| `fk_collection_paper_collection` | FOREIGN KEY | `FOREIGN KEY (collection_id) REFERENCES collection(collection_id) ON DELETE CASCADE` |
| `fk_collection_paper_paper` | FOREIGN KEY | `FOREIGN KEY (paper_id) REFERENCES paper(paper_id) ON DELETE CASCADE` |
| `chk_collection_paper_position_non_negative` | CHECK | `CHECK (("position" >= 0))` |
| `chk_collection_paper_priority` | CHECK | `CHECK (((priority)::text = ANY ((ARRAY['LOW'::character varying, 'MEDIUM'::character varying, 'HIGH'::character varying])::text[])))` |
| `chk_collection_paper_read_at_matches_status` | CHECK | `CHECK ((((reading_status)::text = 'READ'::text) = (read_at IS NOT NULL)))` |
| `chk_collection_paper_reading_status` | CHECK | `CHECK (((reading_status)::text = ANY ((ARRAY['NOT_READ'::character varying, 'READING'::character varying, 'READ'::character varying])::text[])))` |

## Indexes

| Name | Definition |
| - | - |
| `ix_collection_paper_paper_id` | `CREATE INDEX ix_collection_paper_paper_id ON public.collection_paper USING btree (paper_id)` |
| `pk_collection_paper` | `CREATE UNIQUE INDEX pk_collection_paper ON public.collection_paper USING btree (collection_id, paper_id)` |

[← All tables](README.md)
