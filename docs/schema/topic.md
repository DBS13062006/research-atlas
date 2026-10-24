# topic

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `topic_id` | bigint | NO |  | PK |
| 2 | `openalex_id` | character varying(20) | yes |  |  |
| 3 | `topic_name` | character varying(200) | NO |  |  |
| 4 | `topic_level` | smallint | NO |  |  |
| 5 | `description` | text | yes |  |  |
| 6 | `parent_topic_id` | bigint | yes |  | FK |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_topic` | PRIMARY KEY | `PRIMARY KEY (topic_id)` |
| `uq_topic_name_in_parent` | UNIQUE | `UNIQUE NULLS NOT DISTINCT (parent_topic_id, topic_name)` |
| `uq_topic_openalex_id` | UNIQUE | `UNIQUE (openalex_id)` |
| `fk_topic_parent` | FOREIGN KEY | `FOREIGN KEY (parent_topic_id) REFERENCES topic(topic_id) ON DELETE RESTRICT` |
| `chk_topic_level_range` | CHECK | `CHECK (((topic_level >= 0) AND (topic_level <= 3)))` |
| `chk_topic_not_own_parent` | CHECK | `CHECK (((parent_topic_id IS NULL) OR (parent_topic_id <> topic_id)))` |
| `chk_topic_only_domains_are_roots` | CHECK | `CHECK (((topic_level = 0) = (parent_topic_id IS NULL)))` |

## Indexes

| Name | Definition |
| - | - |
| `ix_topic_parent_topic_id` | `CREATE INDEX ix_topic_parent_topic_id ON public.topic USING btree (parent_topic_id)` |
| `pk_topic` | `CREATE UNIQUE INDEX pk_topic ON public.topic USING btree (topic_id)` |
| `uq_topic_name_in_parent` | `CREATE UNIQUE INDEX uq_topic_name_in_parent ON public.topic USING btree (parent_topic_id, topic_name) NULLS NOT DISTINCT` |
| `uq_topic_openalex_id` | `CREATE UNIQUE INDEX uq_topic_openalex_id ON public.topic USING btree (openalex_id)` |

[← All tables](README.md)
