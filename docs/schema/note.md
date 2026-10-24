# note

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `note_id` | bigint | NO |  | PK |
| 2 | `user_id` | bigint | NO |  | FK |
| 3 | `paper_id` | bigint | NO |  | FK |
| 4 | `note_text` | text | NO |  |  |
| 5 | `is_private` | boolean | NO | `true` |  |
| 6 | `created_at` | timestamp with time zone | NO | `now()` |  |
| 7 | `updated_at` | timestamp with time zone | NO | `now()` |  |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_note` | PRIMARY KEY | `PRIMARY KEY (note_id)` |
| `fk_note_paper` | FOREIGN KEY | `FOREIGN KEY (paper_id) REFERENCES paper(paper_id) ON DELETE CASCADE` |
| `fk_note_user` | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES user_account(user_id) ON DELETE CASCADE` |
| `chk_note_text_length` | CHECK | `CHECK (((length(btrim(note_text)) >= 1) AND (length(btrim(note_text)) <= 20000)))` |
| `chk_note_updated_after_created` | CHECK | `CHECK ((updated_at >= created_at))` |

## Indexes

| Name | Definition |
| - | - |
| `ix_note_paper_id` | `CREATE INDEX ix_note_paper_id ON public.note USING btree (paper_id)` |
| `ix_note_user_paper` | `CREATE INDEX ix_note_user_paper ON public.note USING btree (user_id, paper_id)` |
| `pk_note` | `CREATE UNIQUE INDEX pk_note ON public.note USING btree (note_id)` |

[← All tables](README.md)
