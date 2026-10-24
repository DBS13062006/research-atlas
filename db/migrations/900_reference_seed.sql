-- migrate:up
-- 900 · Reference data every installation needs: the three application roles, the permission
-- vocabulary, and which role holds which permission. Higher roles hold everything lower roles do.
SET ROLE ra_owner;

INSERT INTO role (role_code, role_name, db_role_name, rank) VALUES
  ('RESEARCHER', 'Researcher', 'ra_researcher', 1),
  ('CURATOR',    'Curator',    'ra_curator',    2),
  ('ADMIN',      'Administrator', 'ra_admin',   3);

INSERT INTO permission (permission_code, description) VALUES
  ('papers:read',        'Read the catalog'),
  ('papers:write',       'Create and edit papers'),
  ('papers:delete',      'Delete papers'),
  ('catalog:write',      'Edit authors, topics, methods, datasets and links'),
  ('import:run',         'Import papers by DOI'),
  ('relations:write',    'Create curated relations between papers'),
  ('relations:moderate', 'Edit or delete any curated relation'),
  ('collections:own',    'Own collections'),
  ('notes:own',          'Write notes'),
  ('trails:own',         'Create reading trails'),
  ('retractions:manage', 'Record and change retractions'),
  ('users:manage',       'Manage users and roles'),
  ('audit:read',         'Read the audit log'),
  ('graph:sync',         'Drain the graph outbox and rebuild the graph'),
  ('lab:run',            'Run catalog queries in the Query Lab'),
  ('lab:dml',            'Commit DML from the Query Lab');

-- Each permission is granted to the lowest role that needs it, and to every role above it.
INSERT INTO role_permission (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM (VALUES
        ('papers:read', 1), ('collections:own', 1), ('notes:own', 1), ('trails:own', 1),
        ('relations:write', 1), ('lab:run', 1),
        ('papers:write', 2), ('catalog:write', 2), ('import:run', 2), ('relations:moderate', 2),
        ('papers:delete', 3), ('retractions:manage', 3), ('users:manage', 3), ('audit:read', 3),
        ('graph:sync', 3), ('lab:dml', 3)
     ) AS g(permission_code, min_rank)
JOIN permission p ON p.permission_code = g.permission_code
JOIN role r ON r.rank >= g.min_rank;

RESET ROLE;

-- migrate:down
SET ROLE ra_owner;
DELETE FROM role_permission;
DELETE FROM permission;
DELETE FROM role;
RESET ROLE;
