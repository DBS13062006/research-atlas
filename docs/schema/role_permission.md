# role_permission

Kind: table.

## Columns

| # | Column | Type | Null | Default / generated | Key |
| - | - | - | - | - | - |
| 1 | `role_id` | integer | NO |  | PK, FK |
| 2 | `permission_id` | integer | NO |  | PK, FK |

## Constraints

| Name | Kind | Definition |
| - | - | - |
| `pk_role_permission` | PRIMARY KEY | `PRIMARY KEY (role_id, permission_id)` |
| `fk_role_permission_permission` | FOREIGN KEY | `FOREIGN KEY (permission_id) REFERENCES permission(permission_id) ON DELETE CASCADE` |
| `fk_role_permission_role` | FOREIGN KEY | `FOREIGN KEY (role_id) REFERENCES role(role_id) ON DELETE CASCADE` |

## Indexes

| Name | Definition |
| - | - |
| `ix_role_permission_permission_id` | `CREATE INDEX ix_role_permission_permission_id ON public.role_permission USING btree (permission_id)` |
| `pk_role_permission` | `CREATE UNIQUE INDEX pk_role_permission ON public.role_permission USING btree (role_id, permission_id)` |

[← All tables](README.md)
