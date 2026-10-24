# collection

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `collection_id` | bigint | NO |  | PK |
| 2 | `public_id` | uuid | NO | `uuidv7()` |  |
| 3 | `user_id` | bigint | NO |  | FK |
| 4 | `collection_name` | character varying(150) | NO |  |  |
| 5 | `description` | text | yes |  |  |
| 6 | `is_public` | boolean | NO | `false` |  |
| 7 | `created_at` | timestamp with time zone | NO | `now()` |  |
| 8 | `updated_at` | timestamp with time zone | NO | `now()` |  |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_collection` | PRIMARY KEY | `PRIMARY KEY (collection_id)` |
| `uq_collection_public_id` | UNIQUE | `UNIQUE (public_id)` |
| `uq_user_collection_name` | UNIQUE | `UNIQUE (user_id, collection_name)` |
| `fk_collection_user` | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES user_account(user_id) ON DELETE CASCADE` |
| `chk_collection_name_not_blank` | CHECK | `CHECK ((length(btrim((collection_name)::text)) > 0))` |

## Indexes

| Name | Definition |
| - | - |
| `ix_collection_user_id` | `CREATE INDEX ix_collection_user_id ON public.collection USING btree (user_id)` |
| `pk_collection` | `CREATE UNIQUE INDEX pk_collection ON public.collection USING btree (collection_id)` |
| `uq_collection_public_id` | `CREATE UNIQUE INDEX uq_collection_public_id ON public.collection USING btree (public_id)` |
| `uq_user_collection_name` | `CREATE UNIQUE INDEX uq_user_collection_name ON public.collection USING btree (user_id, collection_name)` |

[← All tables](README.md)
