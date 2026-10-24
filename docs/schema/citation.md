# citation

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `citing_paper_id` | bigint | NO |  | PK, FK |
| 2 | `cited_paper_id` | bigint | NO |  | PK, FK |
| 3 | `created_at` | timestamp with time zone | NO | `now()` |  |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_citation` | PRIMARY KEY | `PRIMARY KEY (citing_paper_id, cited_paper_id)` |
| `fk_citation_cited` | FOREIGN KEY | `FOREIGN KEY (cited_paper_id) REFERENCES paper(paper_id) ON DELETE CASCADE` |
| `fk_citation_citing` | FOREIGN KEY | `FOREIGN KEY (citing_paper_id) REFERENCES paper(paper_id) ON DELETE CASCADE` |
| `chk_no_self_citation` | CHECK | `CHECK ((citing_paper_id <> cited_paper_id))` |

## Indexes

| Name | Definition |
| - | - |
| `ix_citation_cited_paper_id` | `CREATE INDEX ix_citation_cited_paper_id ON public.citation USING btree (cited_paper_id)` |
| `pk_citation` | `CREATE UNIQUE INDEX pk_citation ON public.citation USING btree (citing_paper_id, cited_paper_id)` |

[← All tables](README.md)
