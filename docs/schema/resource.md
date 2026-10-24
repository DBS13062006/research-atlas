# resource

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `resource_id` | bigint | NO |  | PK |
| 2 | `paper_id` | bigint | NO |  | FK |
| 3 | `resource_type` | character varying(20) | NO |  |  |
| 4 | `resource_url` | character varying(1000) | NO |  |  |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_resource` | PRIMARY KEY | `PRIMARY KEY (resource_id)` |
| `uq_resource_per_paper` | UNIQUE | `UNIQUE (paper_id, resource_type, resource_url)` |
| `fk_resource_paper` | FOREIGN KEY | `FOREIGN KEY (paper_id) REFERENCES paper(paper_id) ON DELETE CASCADE` |
| `chk_resource_type` | CHECK | `CHECK (((resource_type)::text = ANY ((ARRAY['PDF'::character varying, 'CODE'::character varying, 'DATASET'::character varying, 'PROJECT_PAGE'::character varying, 'SUPPLEMENTARY'::character varying, 'VIDEO'::character varying, 'SLIDES'::character varying, 'OTHER'::character varying])::text[])))` |
| `chk_resource_url_is_http` | CHECK | `CHECK (((resource_url)::text ~* '^https?://'::text))` |

## Indexes

| Name | Definition |
| - | - |
| `pk_resource` | `CREATE UNIQUE INDEX pk_resource ON public.resource USING btree (resource_id)` |
| `uq_resource_per_paper` | `CREATE UNIQUE INDEX uq_resource_per_paper ON public.resource USING btree (paper_id, resource_type, resource_url)` |

[← All tables](README.md)
