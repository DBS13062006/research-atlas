// @id        C12
// @title     Delete: remove a reading-trail stop and close the gap
// @category  graph-native delete
// @concepts  DELETE a relationship, then renumber the remaining STEP positions in the same transaction
// @role      ra_researcher
// @param     trail_id string = MATCH (t:Trail)-[s:STEP]->() WITH t, count(s) AS n WHERE n >= 3 RETURN t.trailId ORDER BY n DESC LIMIT 1
MATCH (t:Trail {trailId: $trail_id})-[s:STEP {position: 2}]->()
DELETE s
WITH t
MATCH (t)-[rest:STEP]->(p:Paper) WHERE rest.position > 2
SET rest.position = rest.position - 1
WITH DISTINCT t
MATCH (t)-[step:STEP]->(p:Paper)
RETURN step.position AS position, p.title AS title
ORDER BY position
