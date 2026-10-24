# institution

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `institution_id` | bigint | NO |  | PK |
| 2 | `openalex_id` | character varying(20) | yes |  |  |
| 3 | `ror_id` | character varying(40) | yes |  |  |
| 4 | `institution_name` | character varying(200) | NO |  |  |
| 5 | `country_code` | character(2) | yes |  |  |
| 6 | `institution_type` | character varying(20) | yes |  |  |
| 7 | `website` | character varying(500) | yes |  |  |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_institution` | PRIMARY KEY | `PRIMARY KEY (institution_id)` |
| `uq_institution_openalex_id` | UNIQUE | `UNIQUE (openalex_id)` |
| `uq_institution_ror_id` | UNIQUE | `UNIQUE (ror_id)` |
| `chk_institution_country_code` | CHECK | `CHECK ((country_code ~ '^[A-Z]{2}$'::text))` |
| `chk_institution_type` | CHECK | `CHECK (((institution_type)::text = ANY ((ARRAY['EDUCATION'::character varying, 'COMPANY'::character varying, 'GOVERNMENT'::character varying, 'FACILITY'::character varying, 'NONPROFIT'::character varying, 'HEALTHCARE'::character varying, 'ARCHIVE'::character varying, 'OTHER'::character varying])::text[])))` |

## Indexes

| Name | Definition |
| - | - |
| `pk_institution` | `CREATE UNIQUE INDEX pk_institution ON public.institution USING btree (institution_id)` |
| `uq_institution_openalex_id` | `CREATE UNIQUE INDEX uq_institution_openalex_id ON public.institution USING btree (openalex_id)` |
| `uq_institution_ror_id` | `CREATE UNIQUE INDEX uq_institution_ror_id ON public.institution USING btree (ror_id)` |

[← All tables](README.md)
