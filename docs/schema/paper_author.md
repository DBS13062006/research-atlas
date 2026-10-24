# paper_author

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `paper_id` | bigint | NO |  | PK, FK |
| 2 | `author_id` | bigint | NO |  | PK, FK |
| 3 | `author_order` | smallint | NO |  |  |
| 4 | `is_corresponding` | boolean | NO | `false` |  |
| 5 | `affiliation_institution_id` | bigint | yes |  | FK |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_paper_author` | PRIMARY KEY | `PRIMARY KEY (paper_id, author_id)` |
| `uq_paper_author_order` | UNIQUE | `UNIQUE (paper_id, author_order) DEFERRABLE` |
| `fk_paper_author_author` | FOREIGN KEY | `FOREIGN KEY (author_id) REFERENCES author(author_id) ON DELETE RESTRICT` |
| `fk_paper_author_institution` | FOREIGN KEY | `FOREIGN KEY (affiliation_institution_id) REFERENCES institution(institution_id) ON DELETE SET NULL` |
| `fk_paper_author_paper` | FOREIGN KEY | `FOREIGN KEY (paper_id) REFERENCES paper(paper_id) ON DELETE CASCADE` |
| `chk_paper_author_order_positive` | CHECK | `CHECK ((author_order > 0))` |

## Indexes

| Name | Definition |
| - | - |
| `ix_paper_author_affiliation` | `CREATE INDEX ix_paper_author_affiliation ON public.paper_author USING btree (affiliation_institution_id)` |
| `ix_paper_author_author_id` | `CREATE INDEX ix_paper_author_author_id ON public.paper_author USING btree (author_id)` |
| `pk_paper_author` | `CREATE UNIQUE INDEX pk_paper_author ON public.paper_author USING btree (paper_id, author_id)` |
| `uq_paper_author_order` | `CREATE UNIQUE INDEX uq_paper_author_order ON public.paper_author USING btree (paper_id, author_order)` |

[← All tables](README.md)
