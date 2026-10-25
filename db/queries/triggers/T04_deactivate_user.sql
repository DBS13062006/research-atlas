-- @id        T04
-- @title     Deactivate an account and read the audit trail
-- @category  triggers
-- @concepts  generic audit trigger storing old and new rows as JSONB, with the password hash removed
-- @role      ra_admin
-- @param     user_id bigint = SELECT u.user_id FROM user_account u JOIN role r USING (role_id) WHERE r.role_code = 'RESEARCHER' ORDER BY u.user_id DESC LIMIT 1
UPDATE user_account
SET is_active = FALSE
WHERE user_id = $1
RETURNING user_id, name, is_active;
