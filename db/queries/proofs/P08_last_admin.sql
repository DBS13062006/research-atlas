-- @id        P08
-- @title     Demote every administrator at once
-- @category  constraints
-- @concepts  statement-level AFTER trigger with a transition table, custom SQLSTATE RA002
-- @role      ra_admin
-- @expect    trg_protect_last_admin
-- @params    none
UPDATE user_account
SET role_id = (SELECT role_id FROM role WHERE role_code = 'RESEARCHER')
WHERE role_id = (SELECT role_id FROM role WHERE role_code = 'ADMIN');
