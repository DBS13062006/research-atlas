# author

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `author_id` | bigint | NO |  | PK |
| 2 | `openalex_id` | character varying(20) | yes |  |  |
| 3 | `orcid` | character varying(19) | yes |  |  |
| 4 | `author_name` | character varying(200) | NO |  |  |
| 5 | `institution_id` | bigint | yes |  | FK |
| 6 | `profile_url` | character varying(500) | yes |  |  |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_author` | PRIMARY KEY | `PRIMARY KEY (author_id)` |
| `uq_author_openalex_id` | UNIQUE | `UNIQUE (openalex_id)` |
| `uq_author_orcid` | UNIQUE | `UNIQUE (orcid)` |
| `fk_author_institution` | FOREIGN KEY | `FOREIGN KEY (institution_id) REFERENCES institution(institution_id) ON DELETE SET NULL` |
| `chk_author_name_not_blank` | CHECK | `CHECK ((length(btrim((author_name)::text)) > 0))` |
| `chk_author_orcid_format` | CHECK | `CHECK (((orcid)::text ~ '^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$'::text))` |

## Indexes

| Name | Definition |
| - | - |
| `ix_author_institution_id` | `CREATE INDEX ix_author_institution_id ON public.author USING btree (institution_id)` |
| `ix_author_name_trgm` | `CREATE INDEX ix_author_name_trgm ON public.author USING gin (author_name gin_trgm_ops)` |
| `pk_author` | `CREATE UNIQUE INDEX pk_author ON public.author USING btree (author_id)` |
| `uq_author_openalex_id` | `CREATE UNIQUE INDEX uq_author_openalex_id ON public.author USING btree (openalex_id)` |
| `uq_author_orcid` | `CREATE UNIQUE INDEX uq_author_orcid ON public.author USING btree (orcid)` |

[← All tables](README.md)
