-- @id        P10
-- @title     Count other people's private notes
-- @category  constraints
-- @concepts  row-level security (FORCE ROW LEVEL SECURITY): the rows exist but the policy hides them
-- @role      ra_researcher
-- @params    none
SELECT count(*) AS private_notes_of_others_visible_to_me
FROM note
WHERE user_id <> app_current_user_id() AND is_private;
