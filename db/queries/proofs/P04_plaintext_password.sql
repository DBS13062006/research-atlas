-- @id        P04
-- @title     Store a plaintext password
-- @category  constraints
-- @concepts  CHECK with a regular expression: only Argon2id PHC strings are accepted
-- @role      ra_admin
-- @expect    chk_user_account_password_is_argon2id
-- @params    none
UPDATE user_account
SET password_hash = 'correct horse battery staple'
WHERE user_id = app_current_user_id();
