# paper_topic

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `paper_id` | bigint | NO |  | PK, FK |
| 2 | `topic_id` | bigint | NO |  | PK, FK |
| 3 | `relevance_score` | numeric(5,4) | yes |  |  |
| 4 | `is_primary` | boolean | NO | `false` |  |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_paper_topic` | PRIMARY KEY | `PRIMARY KEY (paper_id, topic_id)` |
| `fk_paper_topic_paper` | FOREIGN KEY | `FOREIGN KEY (paper_id) REFERENCES paper(paper_id) ON DELETE CASCADE` |
| `fk_paper_topic_topic` | FOREIGN KEY | `FOREIGN KEY (topic_id) REFERENCES topic(topic_id) ON DELETE RESTRICT` |
| `chk_paper_topic_relevance_range` | CHECK | `CHECK (((relevance_score >= (0)::numeric) AND (relevance_score <= (1)::numeric)))` |

## Indexes

| Name | Definition |
| - | - |
| `ix_paper_topic_topic_id` | `CREATE INDEX ix_paper_topic_topic_id ON public.paper_topic USING btree (topic_id)` |
| `pk_paper_topic` | `CREATE UNIQUE INDEX pk_paper_topic ON public.paper_topic USING btree (paper_id, topic_id)` |
| `uq_one_primary_topic` | `CREATE UNIQUE INDEX uq_one_primary_topic ON public.paper_topic USING btree (paper_id) WHERE is_primary` |

[← All tables](README.md)
