# paper

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `paper_id` | bigint | NO |  | PK |
| 2 | `openalex_id` | character varying(20) | yes |  |  |
| 3 | `doi` | character varying(255) | yes |  |  |
| 4 | `arxiv_id` | character varying(30) | yes |  |  |
| 5 | `title` | character varying(1000) | NO |  |  |
| 6 | `abstract` | text | yes |  |  |
| 7 | `publication_date` | date | yes |  |  |
| 8 | `publication_year` | smallint | yes | `GENERATED ALWAYS AS ((EXTRACT(year FROM publication_date))::smallint) VIRTUAL` |  |
| 9 | `venue_id` | bigint | yes |  | FK |
| 10 | `work_type` | character varying(20) | NO | `'ARTICLE'::character varying` |  |
| 11 | `open_access` | boolean | NO | `false` |  |
| 12 | `oa_status` | character varying(10) | yes |  |  |
| 13 | `cited_by_count` | integer | NO | `0` |  |
| 14 | `local_citation_count` | integer | NO | `0` |  |
| 15 | `paper_url` | character varying(1000) | yes |  |  |
| 16 | `search_vector` | tsvector | yes | `GENERATED ALWAYS AS ((setweight(to_tsvector('english'::regconfig, (COALESCE(title, ''::character varying))::text), 'A'::"char") \|\| setweight(to_tsvector('english'::regconfig, COALESCE(abstract, ''::text)), 'B'::"char"))) STORED` |  |
| 17 | `created_at` | timestamp with time zone | NO | `now()` |  |
| 18 | `updated_at` | timestamp with time zone | NO | `now()` |  |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_paper` | PRIMARY KEY | `PRIMARY KEY (paper_id)` |
| `uq_paper_arxiv_id` | UNIQUE | `UNIQUE (arxiv_id)` |
| `uq_paper_doi` | UNIQUE | `UNIQUE (doi)` |
| `uq_paper_openalex_id` | UNIQUE | `UNIQUE (openalex_id)` |
| `fk_paper_venue` | FOREIGN KEY | `FOREIGN KEY (venue_id) REFERENCES venue(venue_id) ON DELETE SET NULL` |
| `chk_paper_cited_by_count_non_negative` | CHECK | `CHECK ((cited_by_count >= 0))` |
| `chk_paper_doi_format` | CHECK | `CHECK (((doi)::text ~* '^10\.\d{4,9}/\S+$'::text))` |
| `chk_paper_doi_lowercase` | CHECK | `CHECK (((doi)::text = lower((doi)::text)))` |
| `chk_paper_local_citation_count_non_negative` | CHECK | `CHECK ((local_citation_count >= 0))` |
| `chk_paper_oa_status` | CHECK | `CHECK (((oa_status)::text = ANY ((ARRAY['DIAMOND'::character varying, 'GOLD'::character varying, 'GREEN'::character varying, 'HYBRID'::character varying, 'BRONZE'::character varying, 'CLOSED'::character varying])::text[])))` |
| `chk_paper_oa_status_matches_flag` | CHECK | `CHECK (((oa_status IS NULL) OR (((oa_status)::text = 'CLOSED'::text) <> open_access)))` |
| `chk_paper_publication_date_floor` | CHECK | `CHECK ((publication_date >= '1665-01-01'::date))` |
| `chk_paper_title_not_blank` | CHECK | `CHECK ((length(btrim((title)::text)) > 0))` |
| `chk_paper_work_type` | CHECK | `CHECK (((work_type)::text = ANY ((ARRAY['ARTICLE'::character varying, 'PREPRINT'::character varying, 'PROCEEDINGS'::character varying, 'REVIEW'::character varying, 'BOOK_CHAPTER'::character varying, 'DATASET'::character varying, 'OTHER'::character varying])::text[])))` |

## Indexes

| Name | Definition |
| - | - |
| `ix_paper_cited_by_keyset` | `CREATE INDEX ix_paper_cited_by_keyset ON public.paper USING btree (cited_by_count DESC, paper_id DESC)` |
| `ix_paper_open_access_date` | `CREATE INDEX ix_paper_open_access_date ON public.paper USING btree (publication_date) WHERE open_access` |
| `ix_paper_publication_date` | `CREATE INDEX ix_paper_publication_date ON public.paper USING btree (publication_date)` |
| `ix_paper_search_vector` | `CREATE INDEX ix_paper_search_vector ON public.paper USING gin (search_vector)` |
| `ix_paper_title_trgm` | `CREATE INDEX ix_paper_title_trgm ON public.paper USING gin (title gin_trgm_ops)` |
| `ix_paper_venue_id` | `CREATE INDEX ix_paper_venue_id ON public.paper USING btree (venue_id)` |
| `pk_paper` | `CREATE UNIQUE INDEX pk_paper ON public.paper USING btree (paper_id)` |
| `uq_paper_arxiv_id` | `CREATE UNIQUE INDEX uq_paper_arxiv_id ON public.paper USING btree (arxiv_id)` |
| `uq_paper_doi` | `CREATE UNIQUE INDEX uq_paper_doi ON public.paper USING btree (doi)` |
| `uq_paper_openalex_id` | `CREATE UNIQUE INDEX uq_paper_openalex_id ON public.paper USING btree (openalex_id)` |

[← All tables](README.md)
