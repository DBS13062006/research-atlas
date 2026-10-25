# 5. DDL and constraints

The schema is built by dbmate migrations in [`db/migrations/`](../db/migrations). Each has an `up` and a
`down` section, and `pnpm verify:all` rolls a fresh database back to zero and up again. Every constraint,
index and trigger has a name, so an error message says which rule was broken. Tables below were read from
the live catalog (`pg_constraint`, `pg_trigger`, `pg_indexes`) by `pnpm docs:catalog` on 2026-10-25.
The psql snapshots in [`docs/report/assets/ddl/`](report/assets/ddl) show the same objects with `\d+`.

## 5.1 Migrations

| Migration                                                                     | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`001_extensions.sql`](../db/migrations/001_extensions.sql)                   | Extensions used by the schema: case-insensitive email, trigram search, query statistics.                                                                                                                                                                                                                                                                                                                                              |
| [`005_owner.sql`](../db/migrations/005_owner.sql)                             | Database roles. ra_owner owns every schema object; later migrations switch to it with SET ROLE so ownership never sits with the superuser. BYPASSRLS lets SECURITY DEFINER functions owned by it read tables whose row-level security is FORCED. The four group roles form the application privilege ladder; their grants live in 300_rbac. Roles are cluster-wide, so creation is idempotent (the test database shares the cluster). |
| [`010_rbac_tables.sql`](../db/migrations/010_rbac_tables.sql)                 | Access-control and account tables.                                                                                                                                                                                                                                                                                                                                                                                                    |
| [`020_catalog_tables.sql`](../db/migrations/020_catalog_tables.sql)           | The research catalog: institutions, authors, venues, papers and everything linked to them.                                                                                                                                                                                                                                                                                                                                            |
| [`030_user_content_tables.sql`](../db/migrations/030_user_content_tables.sql) | Content owned by individual users: collections, their papers, and notes.                                                                                                                                                                                                                                                                                                                                                              |
| [`040_system_tables.sql`](../db/migrations/040_system_tables.sql)             | System tables: the partitioned audit trail and the transactional outbox that feeds Neo4j.                                                                                                                                                                                                                                                                                                                                             |
| [`050_indexes.sql`](../db/migrations/050_indexes.sql)                         | Indexes beyond keys. PostgreSQL does not index foreign-key columns automatically; every FK not led by a primary key gets one so joins and ON DELETE checks stay fast.                                                                                                                                                                                                                                                                 |
| [`200_functions.sql`](../db/migrations/200_functions.sql)                     | Functions. Each one exists because a feature needs it; see docs/08-advanced-sql.md.                                                                                                                                                                                                                                                                                                                                                   |
| [`210_procedures.sql`](../db/migrations/210_procedures.sql)                   | Stored procedures. Business operations that must happen as one unit live in the database, so every client (web app, API, scripts, psql) gets the same rules.                                                                                                                                                                                                                                                                          |
| [`220_triggers.sql`](../db/migrations/220_triggers.sql)                       | Triggers. Rules a CHECK cannot express (they read other rows or tables), derived columns, the audit trail and the outbox that keeps Neo4j in step with PostgreSQL.                                                                                                                                                                                                                                                                    |
| [`230_views.sql`](../db/migrations/230_views.sql)                             | Views and materialized views. Plain views use security_invoker so row-level security is evaluated for the caller, not for the view owner.                                                                                                                                                                                                                                                                                             |
| [`300_rbac.sql`](../db/migrations/300_rbac.sql)                               | Role-based access control enforced by PostgreSQL itself.                                                                                                                                                                                                                                                                                                                                                                              |
| [`310_admin_stats.sql`](../db/migrations/310_admin_stats.sql)                 | Administrators may read query statistics (pg_stat_statements) for every role, which the admin page uses to list the slowest queries. pg_read_all_stats is a predefined read-only role.                                                                                                                                                                                                                                                |
| [`320_display_names.sql`](../db/migrations/320_display_names.sql)             | Public display names. Trails and curated relations live in Neo4j and record only the author's user_id. user_account is behind forced RLS, so this narrow SECURITY DEFINER function returns the one column that is safe to show next to public content: the name. No email, no role.                                                                                                                                                   |
| [`330_lab_side_effects.sql`](../db/migrations/330_lab_side_effects.sql)       | Query Lab side effects. After a lab run (always inside a transaction), the lab shows the audit_log and graph_outbox rows that the run's triggers wrote. Only administrators may read those tables, so this SECURITY DEFINER function returns exactly the rows created by the caller's own current transaction (xmin = its transaction id) and nothing older or anyone else's.                                                         |
| [`900_reference_seed.sql`](../db/migrations/900_reference_seed.sql)           | Reference data every installation needs: the three application roles, the permission vocabulary, and which role holds which permission. Higher roles hold everything lower roles do.                                                                                                                                                                                                                                                  |

## 5.2 Named constraints (125)

| Table            | Constraint                                    | Kind        | Rule                                                                                                                                                                                                                                                                                                                  |
| ---------------- | --------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| audit_log        | `pk_audit_log`                                | primary key | `PRIMARY KEY (audit_id, occurred_at)`                                                                                                                                                                                                                                                                                 |
| audit_log        | `chk_audit_log_operation`                     | check       | `CHECK ((operation = ANY (ARRAY['I'::bpchar, 'U'::bpchar, 'D'::bpchar])))`                                                                                                                                                                                                                                            |
| author           | `pk_author`                                   | primary key | `PRIMARY KEY (author_id)`                                                                                                                                                                                                                                                                                             |
| author           | `uq_author_openalex_id`                       | unique      | `UNIQUE (openalex_id)`                                                                                                                                                                                                                                                                                                |
| author           | `uq_author_orcid`                             | unique      | `UNIQUE (orcid)`                                                                                                                                                                                                                                                                                                      |
| author           | `fk_author_institution`                       | foreign key | `FOREIGN KEY (institution_id) REFERENCES institution(institution_id) ON DELETE SET NULL`                                                                                                                                                                                                                              |
| author           | `chk_author_name_not_blank`                   | check       | `CHECK ((length(btrim((author_name)::text)) > 0))`                                                                                                                                                                                                                                                                    |
| author           | `chk_author_orcid_format`                     | check       | `CHECK (((orcid)::text ~ '^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$'::text))`                                                                                                                                                                                                                                                    |
| citation         | `pk_citation`                                 | primary key | `PRIMARY KEY (citing_paper_id, cited_paper_id)`                                                                                                                                                                                                                                                                       |
| citation         | `fk_citation_cited`                           | foreign key | `FOREIGN KEY (cited_paper_id) REFERENCES paper(paper_id) ON DELETE CASCADE`                                                                                                                                                                                                                                           |
| citation         | `fk_citation_citing`                          | foreign key | `FOREIGN KEY (citing_paper_id) REFERENCES paper(paper_id) ON DELETE CASCADE`                                                                                                                                                                                                                                          |
| citation         | `chk_no_self_citation`                        | check       | `CHECK ((citing_paper_id <> cited_paper_id))`                                                                                                                                                                                                                                                                         |
| collection       | `pk_collection`                               | primary key | `PRIMARY KEY (collection_id)`                                                                                                                                                                                                                                                                                         |
| collection       | `uq_collection_public_id`                     | unique      | `UNIQUE (public_id)`                                                                                                                                                                                                                                                                                                  |
| collection       | `uq_user_collection_name`                     | unique      | `UNIQUE (user_id, collection_name)`                                                                                                                                                                                                                                                                                   |
| collection       | `fk_collection_user`                          | foreign key | `FOREIGN KEY (user_id) REFERENCES user_account(user_id) ON DELETE CASCADE`                                                                                                                                                                                                                                            |
| collection       | `chk_collection_name_not_blank`               | check       | `CHECK ((length(btrim((collection_name)::text)) > 0))`                                                                                                                                                                                                                                                                |
| collection_paper | `pk_collection_paper`                         | primary key | `PRIMARY KEY (collection_id, paper_id)`                                                                                                                                                                                                                                                                               |
| collection_paper | `fk_collection_paper_collection`              | foreign key | `FOREIGN KEY (collection_id) REFERENCES collection(collection_id) ON DELETE CASCADE`                                                                                                                                                                                                                                  |
| collection_paper | `fk_collection_paper_paper`                   | foreign key | `FOREIGN KEY (paper_id) REFERENCES paper(paper_id) ON DELETE CASCADE`                                                                                                                                                                                                                                                 |
| collection_paper | `chk_collection_paper_position_non_negative`  | check       | `CHECK (("position" >= 0))`                                                                                                                                                                                                                                                                                           |
| collection_paper | `chk_collection_paper_priority`               | check       | `CHECK (((priority)::text = ANY ((ARRAY['LOW'::character varying, 'MEDIUM'::character varying, 'HIGH'::character varying])::text[])))`                                                                                                                                                                                |
| collection_paper | `chk_collection_paper_read_at_matches_status` | check       | `CHECK ((((reading_status)::text = 'READ'::text) = (read_at IS NOT NULL)))`                                                                                                                                                                                                                                           |
| collection_paper | `chk_collection_paper_reading_status`         | check       | `CHECK (((reading_status)::text = ANY ((ARRAY['NOT_READ'::character varying, 'READING'::character varying, 'READ'::character varying])::text[])))`                                                                                                                                                                    |
| dataset          | `pk_dataset`                                  | primary key | `PRIMARY KEY (dataset_id)`                                                                                                                                                                                                                                                                                            |
| dataset          | `uq_dataset_name`                             | unique      | `UNIQUE (dataset_name)`                                                                                                                                                                                                                                                                                               |
| dataset          | `uq_dataset_pwc_slug`                         | unique      | `UNIQUE (pwc_slug)`                                                                                                                                                                                                                                                                                                   |
| graph_outbox     | `pk_graph_outbox`                             | primary key | `PRIMARY KEY (outbox_id)`                                                                                                                                                                                                                                                                                             |
| graph_outbox     | `chk_graph_outbox_attempts_non_negative`      | check       | `CHECK ((attempts >= 0))`                                                                                                                                                                                                                                                                                             |
| graph_outbox     | `chk_graph_outbox_operation`                  | check       | `CHECK (((operation)::text = ANY ((ARRAY['UPSERT'::character varying, 'DELETE'::character varying])::text[])))`                                                                                                                                                                                                       |
| institution      | `pk_institution`                              | primary key | `PRIMARY KEY (institution_id)`                                                                                                                                                                                                                                                                                        |
| institution      | `uq_institution_openalex_id`                  | unique      | `UNIQUE (openalex_id)`                                                                                                                                                                                                                                                                                                |
| institution      | `uq_institution_ror_id`                       | unique      | `UNIQUE (ror_id)`                                                                                                                                                                                                                                                                                                     |
| institution      | `chk_institution_country_code`                | check       | `CHECK ((country_code ~ '^[A-Z]{2}$'::text))`                                                                                                                                                                                                                                                                         |
| institution      | `chk_institution_type`                        | check       | `CHECK (((institution_type)::text = ANY ((ARRAY['EDUCATION'::character varying, 'COMPANY'::character varying, 'GOVERNMENT'::character varying, 'FACILITY'::character varying, 'NONPROFIT'::character varying, 'HEALTHCARE'::character varying, 'ARCHIVE'::character varying, 'OTHER'::character varying])::text[])))` |
| method           | `pk_method`                                   | primary key | `PRIMARY KEY (method_id)`                                                                                                                                                                                                                                                                                             |
| method           | `uq_method_name`                              | unique      | `UNIQUE (method_name)`                                                                                                                                                                                                                                                                                                |
| method           | `uq_method_pwc_slug`                          | unique      | `UNIQUE (pwc_slug)`                                                                                                                                                                                                                                                                                                   |
| method           | `chk_method_introduced_year`                  | check       | `CHECK (((introduced_year >= 1900) AND (introduced_year <= 2100)))`                                                                                                                                                                                                                                                   |
| note             | `pk_note`                                     | primary key | `PRIMARY KEY (note_id)`                                                                                                                                                                                                                                                                                               |
| note             | `fk_note_paper`                               | foreign key | `FOREIGN KEY (paper_id) REFERENCES paper(paper_id) ON DELETE CASCADE`                                                                                                                                                                                                                                                 |
| note             | `fk_note_user`                                | foreign key | `FOREIGN KEY (user_id) REFERENCES user_account(user_id) ON DELETE CASCADE`                                                                                                                                                                                                                                            |
| note             | `chk_note_text_length`                        | check       | `CHECK (((length(btrim(note_text)) >= 1) AND (length(btrim(note_text)) <= 20000)))`                                                                                                                                                                                                                                   |
| note             | `chk_note_updated_after_created`              | check       | `CHECK ((updated_at >= created_at))`                                                                                                                                                                                                                                                                                  |
| paper            | `pk_paper`                                    | primary key | `PRIMARY KEY (paper_id)`                                                                                                                                                                                                                                                                                              |
| paper            | `uq_paper_arxiv_id`                           | unique      | `UNIQUE (arxiv_id)`                                                                                                                                                                                                                                                                                                   |
| paper            | `uq_paper_doi`                                | unique      | `UNIQUE (doi)`                                                                                                                                                                                                                                                                                                        |
| paper            | `uq_paper_openalex_id`                        | unique      | `UNIQUE (openalex_id)`                                                                                                                                                                                                                                                                                                |
| paper            | `fk_paper_venue`                              | foreign key | `FOREIGN KEY (venue_id) REFERENCES venue(venue_id) ON DELETE SET NULL`                                                                                                                                                                                                                                                |
| paper            | `chk_paper_cited_by_count_non_negative`       | check       | `CHECK ((cited_by_count >= 0))`                                                                                                                                                                                                                                                                                       |
| paper            | `chk_paper_doi_format`                        | check       | `CHECK (((doi)::text ~* '^10\.\d{4,9}/\S+$'::text))`                                                                                                                                                                                                                                                                  |
| paper            | `chk_paper_doi_lowercase`                     | check       | `CHECK (((doi)::text = lower((doi)::text)))`                                                                                                                                                                                                                                                                          |
| paper            | `chk_paper_local_citation_count_non_negative` | check       | `CHECK ((local_citation_count >= 0))`                                                                                                                                                                                                                                                                                 |
| paper            | `chk_paper_oa_status`                         | check       | `CHECK (((oa_status)::text = ANY ((ARRAY['DIAMOND'::character varying, 'GOLD'::character varying, 'GREEN'::character varying, 'HYBRID'::character varying, 'BRONZE'::character varying, 'CLOSED'::character varying])::text[])))`                                                                                     |
| paper            | `chk_paper_oa_status_matches_flag`            | check       | `CHECK (((oa_status IS NULL) OR (((oa_status)::text = 'CLOSED'::text) <> open_access)))`                                                                                                                                                                                                                              |
| paper            | `chk_paper_publication_date_floor`            | check       | `CHECK ((publication_date >= '1665-01-01'::date))`                                                                                                                                                                                                                                                                    |
| paper            | `chk_paper_title_not_blank`                   | check       | `CHECK ((length(btrim((title)::text)) > 0))`                                                                                                                                                                                                                                                                          |
| paper            | `chk_paper_work_type`                         | check       | `CHECK (((work_type)::text = ANY ((ARRAY['ARTICLE'::character varying, 'PREPRINT'::character varying, 'PROCEEDINGS'::character varying, 'REVIEW'::character varying, 'BOOK_CHAPTER'::character varying, 'DATASET'::character varying, 'OTHER'::character varying])::text[])))`                                        |
| paper_author     | `pk_paper_author`                             | primary key | `PRIMARY KEY (paper_id, author_id)`                                                                                                                                                                                                                                                                                   |
| paper_author     | `uq_paper_author_order`                       | unique      | `UNIQUE (paper_id, author_order) DEFERRABLE`                                                                                                                                                                                                                                                                          |
| paper_author     | `fk_paper_author_author`                      | foreign key | `FOREIGN KEY (author_id) REFERENCES author(author_id) ON DELETE RESTRICT`                                                                                                                                                                                                                                             |
| paper_author     | `fk_paper_author_institution`                 | foreign key | `FOREIGN KEY (affiliation_institution_id) REFERENCES institution(institution_id) ON DELETE SET NULL`                                                                                                                                                                                                                  |
| paper_author     | `fk_paper_author_paper`                       | foreign key | `FOREIGN KEY (paper_id) REFERENCES paper(paper_id) ON DELETE CASCADE`                                                                                                                                                                                                                                                 |
| paper_author     | `chk_paper_author_order_positive`             | check       | `CHECK ((author_order > 0))`                                                                                                                                                                                                                                                                                          |
| paper_dataset    | `pk_paper_dataset`                            | primary key | `PRIMARY KEY (paper_id, dataset_id)`                                                                                                                                                                                                                                                                                  |
| paper_dataset    | `fk_paper_dataset_dataset`                    | foreign key | `FOREIGN KEY (dataset_id) REFERENCES dataset(dataset_id) ON DELETE RESTRICT`                                                                                                                                                                                                                                          |
| paper_dataset    | `fk_paper_dataset_paper`                      | foreign key | `FOREIGN KEY (paper_id) REFERENCES paper(paper_id) ON DELETE CASCADE`                                                                                                                                                                                                                                                 |
| paper_dataset    | `chk_paper_dataset_usage_type`                | check       | `CHECK (((usage_type)::text = ANY ((ARRAY['TRAINING'::character varying, 'VALIDATION'::character varying, 'TESTING'::character varying, 'BENCHMARKING'::character varying, 'OTHER'::character varying])::text[])))`                                                                                                   |
| paper_method     | `pk_paper_method`                             | primary key | `PRIMARY KEY (paper_id, method_id)`                                                                                                                                                                                                                                                                                   |
| paper_method     | `fk_paper_method_method`                      | foreign key | `FOREIGN KEY (method_id) REFERENCES method(method_id) ON DELETE RESTRICT`                                                                                                                                                                                                                                             |
| paper_method     | `fk_paper_method_paper`                       | foreign key | `FOREIGN KEY (paper_id) REFERENCES paper(paper_id) ON DELETE CASCADE`                                                                                                                                                                                                                                                 |
| paper_method     | `chk_paper_method_usage_type`                 | check       | `CHECK (((usage_type)::text = ANY ((ARRAY['PROPOSED'::character varying, 'USED'::character varying, 'COMPARED'::character varying, 'EXTENDED'::character varying, 'BASELINE'::character varying, 'OTHER'::character varying])::text[])))`                                                                             |
| paper_topic      | `pk_paper_topic`                              | primary key | `PRIMARY KEY (paper_id, topic_id)`                                                                                                                                                                                                                                                                                    |
| paper_topic      | `fk_paper_topic_paper`                        | foreign key | `FOREIGN KEY (paper_id) REFERENCES paper(paper_id) ON DELETE CASCADE`                                                                                                                                                                                                                                                 |
| paper_topic      | `fk_paper_topic_topic`                        | foreign key | `FOREIGN KEY (topic_id) REFERENCES topic(topic_id) ON DELETE RESTRICT`                                                                                                                                                                                                                                                |
| paper_topic      | `chk_paper_topic_relevance_range`             | check       | `CHECK (((relevance_score >= (0)::numeric) AND (relevance_score <= (1)::numeric)))`                                                                                                                                                                                                                                   |
| permission       | `pk_permission`                               | primary key | `PRIMARY KEY (permission_id)`                                                                                                                                                                                                                                                                                         |
| permission       | `uq_permission_code`                          | unique      | `UNIQUE (permission_code)`                                                                                                                                                                                                                                                                                            |
| permission       | `chk_permission_code_format`                  | check       | `CHECK (((permission_code)::text ~ '^[a-z_]+:[a-z_]+$'::text))`                                                                                                                                                                                                                                                       |
| resource         | `pk_resource`                                 | primary key | `PRIMARY KEY (resource_id)`                                                                                                                                                                                                                                                                                           |
| resource         | `uq_resource_per_paper`                       | unique      | `UNIQUE (paper_id, resource_type, resource_url)`                                                                                                                                                                                                                                                                      |
| resource         | `fk_resource_paper`                           | foreign key | `FOREIGN KEY (paper_id) REFERENCES paper(paper_id) ON DELETE CASCADE`                                                                                                                                                                                                                                                 |
| resource         | `chk_resource_type`                           | check       | `CHECK (((resource_type)::text = ANY ((ARRAY['PDF'::character varying, 'CODE'::character varying, 'DATASET'::character varying, 'PROJECT_PAGE'::character varying, 'SUPPLEMENTARY'::character varying, 'VIDEO'::character varying, 'SLIDES'::character varying, 'OTHER'::character varying])::text[])))`              |
| resource         | `chk_resource_url_is_http`                    | check       | `CHECK (((resource_url)::text ~* '^https?://'::text))`                                                                                                                                                                                                                                                                |
| retraction       | `pk_retraction`                               | primary key | `PRIMARY KEY (retraction_id)`                                                                                                                                                                                                                                                                                         |
| retraction       | `uq_retraction_paper`                         | unique      | `UNIQUE (paper_id)`                                                                                                                                                                                                                                                                                                   |
| retraction       | `uq_retraction_rw_record_id`                  | unique      | `UNIQUE (rw_record_id)`                                                                                                                                                                                                                                                                                               |
| retraction       | `fk_retraction_paper`                         | foreign key | `FOREIGN KEY (paper_id) REFERENCES paper(paper_id) ON DELETE CASCADE`                                                                                                                                                                                                                                                 |
| retraction       | `fk_retraction_recorded_by`                   | foreign key | `FOREIGN KEY (recorded_by) REFERENCES user_account(user_id) ON DELETE SET NULL`                                                                                                                                                                                                                                       |
| retraction       | `chk_retraction_source`                       | check       | `CHECK (((source)::text = ANY ((ARRAY['RETRACTION_WATCH'::character varying, 'OPENALEX'::character varying, 'MANUAL'::character varying])::text[])))`                                                                                                                                                                 |
| retraction       | `chk_retraction_status`                       | check       | `CHECK (((status)::text = ANY ((ARRAY['RETRACTED'::character varying, 'CORRECTED'::character varying, 'EXPRESSION_OF_CONCERN'::character varying, 'REINSTATED'::character varying])::text[])))`                                                                                                                       |
| role             | `pk_role`                                     | primary key | `PRIMARY KEY (role_id)`                                                                                                                                                                                                                                                                                               |
| role             | `uq_role_code`                                | unique      | `UNIQUE (role_code)`                                                                                                                                                                                                                                                                                                  |
| role             | `uq_role_db_role_name`                        | unique      | `UNIQUE (db_role_name)`                                                                                                                                                                                                                                                                                               |
| role             | `uq_role_name`                                | unique      | `UNIQUE (role_name)`                                                                                                                                                                                                                                                                                                  |
| role             | `uq_role_rank`                                | unique      | `UNIQUE (rank)`                                                                                                                                                                                                                                                                                                       |
| role             | `chk_role_code_format`                        | check       | `CHECK (((role_code)::text ~ '^[A-Z_]+$'::text))`                                                                                                                                                                                                                                                                     |
| role             | `chk_role_rank_positive`                      | check       | `CHECK ((rank > 0))`                                                                                                                                                                                                                                                                                                  |
| role_permission  | `pk_role_permission`                          | primary key | `PRIMARY KEY (role_id, permission_id)`                                                                                                                                                                                                                                                                                |
| role_permission  | `fk_role_permission_permission`               | foreign key | `FOREIGN KEY (permission_id) REFERENCES permission(permission_id) ON DELETE CASCADE`                                                                                                                                                                                                                                  |
| role_permission  | `fk_role_permission_role`                     | foreign key | `FOREIGN KEY (role_id) REFERENCES role(role_id) ON DELETE CASCADE`                                                                                                                                                                                                                                                    |
| topic            | `pk_topic`                                    | primary key | `PRIMARY KEY (topic_id)`                                                                                                                                                                                                                                                                                              |
| topic            | `uq_topic_name_in_parent`                     | unique      | `UNIQUE NULLS NOT DISTINCT (parent_topic_id, topic_name)`                                                                                                                                                                                                                                                             |
| topic            | `uq_topic_openalex_id`                        | unique      | `UNIQUE (openalex_id)`                                                                                                                                                                                                                                                                                                |
| topic            | `fk_topic_parent`                             | foreign key | `FOREIGN KEY (parent_topic_id) REFERENCES topic(topic_id) ON DELETE RESTRICT`                                                                                                                                                                                                                                         |
| topic            | `chk_topic_level_range`                       | check       | `CHECK (((topic_level >= 0) AND (topic_level <= 3)))`                                                                                                                                                                                                                                                                 |
| topic            | `chk_topic_not_own_parent`                    | check       | `CHECK (((parent_topic_id IS NULL) OR (parent_topic_id <> topic_id)))`                                                                                                                                                                                                                                                |
| topic            | `chk_topic_only_domains_are_roots`            | check       | `CHECK (((topic_level = 0) = (parent_topic_id IS NULL)))`                                                                                                                                                                                                                                                             |
| user_account     | `pk_user_account`                             | primary key | `PRIMARY KEY (user_id)`                                                                                                                                                                                                                                                                                               |
| user_account     | `uq_user_account_email`                       | unique      | `UNIQUE (email)`                                                                                                                                                                                                                                                                                                      |
| user_account     | `uq_user_account_public_id`                   | unique      | `UNIQUE (public_id)`                                                                                                                                                                                                                                                                                                  |
| user_account     | `fk_user_account_role`                        | foreign key | `FOREIGN KEY (role_id) REFERENCES role(role_id) ON UPDATE CASCADE ON DELETE RESTRICT`                                                                                                                                                                                                                                 |
| user_account     | `chk_user_account_email_format`               | check       | `CHECK ((email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'::citext))`                                                                                                                                                                                                                                                              |
| user_account     | `chk_user_account_failed_logins_non_negative` | check       | `CHECK ((failed_login_count >= 0))`                                                                                                                                                                                                                                                                                   |
| user_account     | `chk_user_account_name_not_blank`             | check       | `CHECK ((length(btrim((name)::text)) > 0))`                                                                                                                                                                                                                                                                           |
| user_account     | `chk_user_account_password_is_argon2id`       | check       | `CHECK (((password_hash)::text ~~ '$argon2id$%'::text))`                                                                                                                                                                                                                                                              |
| user_session     | `pk_user_session`                             | primary key | `PRIMARY KEY (session_id)`                                                                                                                                                                                                                                                                                            |
| user_session     | `fk_user_session_user`                        | foreign key | `FOREIGN KEY (user_id) REFERENCES user_account(user_id) ON DELETE CASCADE`                                                                                                                                                                                                                                            |
| user_session     | `chk_user_session_expiry_after_creation`      | check       | `CHECK ((expires_at > created_at))`                                                                                                                                                                                                                                                                                   |
| user_session     | `chk_user_session_id_is_sha256_hex`           | check       | `CHECK ((session_id ~ '^[0-9a-f]{64}$'::text))`                                                                                                                                                                                                                                                                       |
| venue            | `pk_venue`                                    | primary key | `PRIMARY KEY (venue_id)`                                                                                                                                                                                                                                                                                              |
| venue            | `uq_venue_issn_l`                             | unique      | `UNIQUE (issn_l)`                                                                                                                                                                                                                                                                                                     |
| venue            | `uq_venue_openalex_id`                        | unique      | `UNIQUE (openalex_id)`                                                                                                                                                                                                                                                                                                |
| venue            | `chk_venue_issn_l_format`                     | check       | `CHECK ((issn_l ~ '^\d{4}-\d{3}[\dX]$'::text))`                                                                                                                                                                                                                                                                       |
| venue            | `chk_venue_type`                              | check       | `CHECK (((venue_type)::text = ANY ((ARRAY['JOURNAL'::character varying, 'CONFERENCE'::character varying, 'WORKSHOP'::character varying, 'REPOSITORY'::character varying, 'BOOK_SERIES'::character varying, 'OTHER'::character varying])::text[])))`                                                                   |

## 5.3 Secondary indexes (28)

| Table             | Index                              | Definition                                             |
| ----------------- | ---------------------------------- | ------------------------------------------------------ |
| audit_log         | `ix_audit_log_occurred_at_brin`    | `USING brin (occurred_at)`                             |
| author            | `ix_author_institution_id`         | `USING btree (institution_id)`                         |
| author            | `ix_author_name_trgm`              | `USING gin (author_name gin_trgm_ops)`                 |
| citation          | `ix_citation_cited_paper_id`       | `USING btree (cited_paper_id)`                         |
| collection        | `ix_collection_user_id`            | `USING btree (user_id)`                                |
| collection_paper  | `ix_collection_paper_paper_id`     | `USING btree (paper_id)`                               |
| graph_outbox      | `ix_outbox_pending`                | `USING btree (outbox_id) WHERE (processed_at IS NULL)` |
| mv_author_stats   | `ix_mv_author_stats_h_index`       | `USING btree (h_index DESC)`                           |
| note              | `ix_note_paper_id`                 | `USING btree (paper_id)`                               |
| note              | `ix_note_user_paper`               | `USING btree (user_id, paper_id)`                      |
| paper             | `ix_paper_cited_by_keyset`         | `USING btree (cited_by_count DESC, paper_id DESC)`     |
| paper             | `ix_paper_open_access_date`        | `USING btree (publication_date) WHERE open_access`     |
| paper             | `ix_paper_publication_date`        | `USING btree (publication_date)`                       |
| paper             | `ix_paper_search_vector`           | `USING gin (search_vector)`                            |
| paper             | `ix_paper_title_trgm`              | `USING gin (title gin_trgm_ops)`                       |
| paper             | `ix_paper_venue_id`                | `USING btree (venue_id)`                               |
| paper_author      | `ix_paper_author_affiliation`      | `USING btree (affiliation_institution_id)`             |
| paper_author      | `ix_paper_author_author_id`        | `USING btree (author_id)`                              |
| paper_dataset     | `ix_paper_dataset_dataset_id`      | `USING btree (dataset_id)`                             |
| paper_method      | `ix_paper_method_method_id`        | `USING btree (method_id)`                              |
| paper_topic       | `ix_paper_topic_topic_id`          | `USING btree (topic_id)`                               |
| retraction        | `ix_retraction_recorded_by`        | `USING btree (recorded_by)`                            |
| role_permission   | `ix_role_permission_permission_id` | `USING btree (permission_id)`                          |
| schema_migrations | `schema_migrations_pkey`           | `USING btree (version)`                                |
| topic             | `ix_topic_parent_topic_id`         | `USING btree (parent_topic_id)`                        |
| user_account      | `ix_user_account_role_id`          | `USING btree (role_id)`                                |
| user_session      | `ix_user_session_expires_at`       | `USING btree (expires_at)`                             |
| user_session      | `ix_user_session_user_id`          | `USING btree (user_id)`                                |

## 5.4 Triggers (30)

| Table            | Trigger                      | When                                   | Function                    |
| ---------------- | ---------------------------- | -------------------------------------- | --------------------------- |
| author           | `trg_graph_outbox`           | AFTER INSERT OR UPDATE OR DELETE · row | `fn_graph_outbox`           |
| citation         | `trg_citation_count_del`     | AFTER DELETE · statement               | `fn_citation_count_del`     |
| citation         | `trg_citation_count_ins`     | AFTER INSERT · statement               | `fn_citation_count_ins`     |
| citation         | `trg_citation_count_upd`     | AFTER UPDATE · statement               | `fn_citation_count_upd`     |
| citation         | `trg_graph_outbox`           | AFTER INSERT OR UPDATE OR DELETE · row | `fn_graph_outbox`           |
| collection       | `trg_audit`                  | AFTER INSERT OR UPDATE OR DELETE · row | `fn_audit`                  |
| collection       | `trg_set_updated_at`         | BEFORE UPDATE · row                    | `fn_set_updated_at`         |
| collection_paper | `trg_reading_status_read_at` | BEFORE INSERT OR UPDATE · row          | `fn_reading_status_read_at` |
| dataset          | `trg_graph_outbox`           | AFTER INSERT OR UPDATE OR DELETE · row | `fn_graph_outbox`           |
| institution      | `trg_graph_outbox`           | AFTER INSERT OR UPDATE OR DELETE · row | `fn_graph_outbox`           |
| method           | `trg_graph_outbox`           | AFTER INSERT OR UPDATE OR DELETE · row | `fn_graph_outbox`           |
| note             | `trg_note_owner_immutable`   | BEFORE UPDATE · row                    | `fn_note_owner_immutable`   |
| note             | `trg_set_updated_at`         | BEFORE UPDATE · row                    | `fn_set_updated_at`         |
| paper            | `trg_audit`                  | AFTER INSERT OR UPDATE OR DELETE · row | `fn_audit`                  |
| paper            | `trg_graph_outbox`           | AFTER INSERT OR UPDATE OR DELETE · row | `fn_graph_outbox`           |
| paper            | `trg_set_updated_at`         | BEFORE UPDATE · row                    | `fn_set_updated_at`         |
| paper_author     | `trg_graph_outbox`           | AFTER INSERT OR UPDATE OR DELETE · row | `fn_graph_outbox`           |
| paper_dataset    | `trg_graph_outbox`           | AFTER INSERT OR UPDATE OR DELETE · row | `fn_graph_outbox`           |
| paper_method     | `trg_graph_outbox`           | AFTER INSERT OR UPDATE OR DELETE · row | `fn_graph_outbox`           |
| paper_topic      | `trg_graph_outbox`           | AFTER INSERT OR UPDATE OR DELETE · row | `fn_graph_outbox`           |
| retraction       | `trg_audit`                  | AFTER INSERT OR UPDATE OR DELETE · row | `fn_audit`                  |
| retraction       | `trg_graph_outbox`           | AFTER INSERT OR UPDATE OR DELETE · row | `fn_graph_outbox`           |
| retraction       | `trg_retraction_date_guard`  | BEFORE INSERT OR UPDATE · row          | `fn_retraction_date_guard`  |
| role_permission  | `trg_audit`                  | AFTER INSERT OR UPDATE OR DELETE · row | `fn_audit`                  |
| topic            | `trg_graph_outbox`           | AFTER INSERT OR UPDATE OR DELETE · row | `fn_graph_outbox`           |
| topic            | `trg_topic_hierarchy_guard`  | BEFORE INSERT OR UPDATE · row          | `fn_topic_hierarchy_guard`  |
| user_account     | `trg_audit`                  | AFTER INSERT OR UPDATE OR DELETE · row | `fn_audit`                  |
| user_account     | `trg_protect_last_admin`     | BEFORE UPDATE OR DELETE · row          | `fn_protect_last_admin`     |
| user_account     | `trg_set_updated_at`         | BEFORE UPDATE · row                    | `fn_set_updated_at`         |
| venue            | `trg_graph_outbox`           | AFTER INSERT OR UPDATE OR DELETE · row | `fn_graph_outbox`           |

## 5.5 Constraint proofs

Each proof is an action the rules must refuse. It runs as the role a real user would have; the message
is what PostgreSQL returned (pgTAP checks the same cases in `db/tests/10_constraints.sql`).

### P01 · A paper cites itself

**Technique:** CHECK constraint across two columns · **runs as** `ra_curator` · [`proofs/P01_self_citation.sql`](../db/queries/proofs/P01_self_citation.sql)

Parameters (computed from the data): `paper_id` = 1

```sql
INSERT INTO citation (citing_paper_id, cited_paper_id) VALUES ($1, $1);
```

**Refused, as intended,** by `chk_no_self_citation`:

```text
new row for relation "citation" violates check constraint "chk_no_self_citation"
```

### P02 · Retract a paper a month before it was published

**Technique:** BEFORE INSERT trigger that compares with another table, RAISE ... USING CONSTRAINT · **runs as** `ra_admin` · [`proofs/P02_retracted_before_published.sql`](../db/queries/proofs/P02_retracted_before_published.sql)

Parameters (computed from the data): `paper_id` = 1

```sql
INSERT INTO retraction (paper_id, retraction_date, status, reason)
SELECT paper_id, publication_date - 30, 'RETRACTED', 'Query Lab proof'
FROM paper
WHERE paper_id = $1;
```

**Refused, as intended,** by `trg_retraction_date_guard`:

```text
retraction date 2017-12-02 is before the paper's publication date 2018-01-01
```

### P03 · Make a topic the child of its own grandchild

**Technique:** BEFORE UPDATE trigger walking the hierarchy with a recursive query · **runs as** `ra_curator` · [`proofs/P03_topic_cycle.sql`](../db/queries/proofs/P03_topic_cycle.sql)

Parameters (computed from the data): `topic_id` = 2

```sql
UPDATE topic
SET parent_topic_id = (SELECT d.topic_id FROM fn_topic_descendants($1) d WHERE d.depth = 2 ORDER BY d.topic_id LIMIT 1)
WHERE topic_id = $1;
```

**Refused, as intended,** by `trg_topic_hierarchy_guard`:

```text
a level-1 topic cannot sit under a level-3 topic
```

### P04 · Store a plaintext password

**Technique:** CHECK with a regular expression: only Argon2id PHC strings are accepted · **runs as** `ra_admin` · [`proofs/P04_plaintext_password.sql`](../db/queries/proofs/P04_plaintext_password.sql)

```sql
UPDATE user_account
SET password_hash = 'correct horse battery staple'
WHERE user_id = app_current_user_id();
```

**Refused, as intended,** by `chk_user_account_password_is_argon2id`:

```text
new row for relation "user_account" violates check constraint "chk_user_account_password_is_argon2id"
```

### P05 · Give two authors of one paper the same position

**Technique:** composite UNIQUE (paper_id, author_order), deferrable for swaps (see D09) · **runs as** `ra_curator` · [`proofs/P05_same_author_position.sql`](../db/queries/proofs/P05_same_author_position.sql)

Parameters (computed from the data): `paper_id` = 1

```sql
UPDATE paper_author SET author_order = 1 WHERE paper_id = $1 AND author_order = 2;
```

**Refused, as intended,** by `uq_paper_author_order`:

```text
duplicate key value violates unique constraint "uq_paper_author_order"
```

### P06 · Flag a paper open access while its status says closed

**Technique:** CHECK constraint tying two columns together · **runs as** `ra_curator` · [`proofs/P06_open_access_closed.sql`](../db/queries/proofs/P06_open_access_closed.sql)

Parameters (computed from the data): `paper_id` = 1

```sql
UPDATE paper SET open_access = TRUE, oa_status = 'CLOSED' WHERE paper_id = $1;
```

**Refused, as intended,** by `chk_paper_oa_status_matches_flag`:

```text
new row for relation "paper" violates check constraint "chk_paper_oa_status_matches_flag"
```

### P07 · Save a DOI that is not a DOI

**Technique:** CHECK with a regular expression on the DOI syntax · **runs as** `ra_curator` · [`proofs/P07_malformed_doi.sql`](../db/queries/proofs/P07_malformed_doi.sql)

Parameters (computed from the data): `paper_id` = 1

```sql
UPDATE paper SET doi = 'not-a-doi' WHERE paper_id = $1;
```

**Refused, as intended,** by `chk_paper_doi_format`:

```text
new row for relation "paper" violates check constraint "chk_paper_doi_format"
```

### P08 · Demote every administrator at once

**Technique:** statement-level AFTER trigger with a transition table, custom SQLSTATE RA002 · **runs as** `ra_admin` · [`proofs/P08_last_admin.sql`](../db/queries/proofs/P08_last_admin.sql)

```sql
UPDATE user_account
SET role_id = (SELECT role_id FROM role WHERE role_code = 'RESEARCHER')
WHERE role_id = (SELECT role_id FROM role WHERE role_code = 'ADMIN');
```

**Refused, as intended,** by `trg_protect_last_admin`:

```text
cannot remove the last active administrator
```

### P09 · A researcher tries to record a retraction

**Technique:** GRANT-based access control: ra_researcher has no INSERT on retraction (SQLSTATE 42501) · **runs as** `ra_researcher` · [`proofs/P09_researcher_records_retraction.sql`](../db/queries/proofs/P09_researcher_records_retraction.sql)

Parameters (computed from the data): `paper_id` = 1

```sql
INSERT INTO retraction (paper_id, retraction_date, status) VALUES ($1, CURRENT_DATE, 'RETRACTED');
```

**Refused, as intended,** by SQLSTATE `42501`:

```text
permission denied for table retraction
```

### P10 · Count other people's private notes

**Technique:** row-level security (FORCE ROW LEVEL SECURITY): the rows exist but the policy hides them · **runs as** `ra_researcher` · [`proofs/P10_other_users_private_notes.sql`](../db/queries/proofs/P10_other_users_private_notes.sql)

```sql
SELECT count(*) AS private_notes_of_others_visible_to_me
FROM note
WHERE user_id <> app_current_user_id() AND is_private;
```

| private_notes_of_others_visible_to_me |
| ------------------------------------- |
| 0                                     |
