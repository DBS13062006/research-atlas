# venue

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `venue_id` | bigint | NO |  | PK |
| 2 | `openalex_id` | character varying(20) | yes |  |  |
| 3 | `venue_name` | character varying(250) | NO |  |  |
| 4 | `venue_type` | character varying(20) | NO |  |  |
| 5 | `publisher` | character varying(200) | yes |  |  |
| 6 | `issn_l` | character(9) | yes |  |  |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_venue` | PRIMARY KEY | `PRIMARY KEY (venue_id)` |
| `uq_venue_issn_l` | UNIQUE | `UNIQUE (issn_l)` |
| `uq_venue_openalex_id` | UNIQUE | `UNIQUE (openalex_id)` |
| `chk_venue_issn_l_format` | CHECK | `CHECK ((issn_l ~ '^\d{4}-\d{3}[\dX]$'::text))` |
| `chk_venue_type` | CHECK | `CHECK (((venue_type)::text = ANY ((ARRAY['JOURNAL'::character varying, 'CONFERENCE'::character varying, 'WORKSHOP'::character varying, 'REPOSITORY'::character varying, 'BOOK_SERIES'::character varying, 'OTHER'::character varying])::text[])))` |

## Indexes

| Name | Definition |
| - | - |
| `pk_venue` | `CREATE UNIQUE INDEX pk_venue ON public.venue USING btree (venue_id)` |
| `uq_venue_issn_l` | `CREATE UNIQUE INDEX uq_venue_issn_l ON public.venue USING btree (issn_l)` |
| `uq_venue_openalex_id` | `CREATE UNIQUE INDEX uq_venue_openalex_id ON public.venue USING btree (openalex_id)` |

[← All tables](README.md)
