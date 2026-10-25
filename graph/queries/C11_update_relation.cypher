// @id        C11
// @title     Update: change a curated relation's note and confidence (owner or curator only)
// @category  graph-native update
// @concepts  ownership checked inside the write with WHERE r.createdBy = $userId OR $isCurator
// @role      ra_researcher
// @param     relation_id string = MATCH ()-[r:EXTENDS|IMPROVES_UPON|CONTRADICTS|REPLICATES|RELATED_TO]->() RETURN r.relationId ORDER BY r.createdAt LIMIT 1
// @param     user_id int = MATCH ()-[r:EXTENDS|IMPROVES_UPON|CONTRADICTS|REPLICATES|RELATED_TO]->() RETURN r.createdBy ORDER BY r.createdAt LIMIT 1
// @param     is_curator boolean = RETURN false
MATCH (:Paper)-[r {relationId: $relation_id}]->(:Paper)
WHERE r.createdBy = $user_id OR $is_curator
SET r.note = 'Confirmed after reading section 4', r.confidence = 5, r.updatedAt = datetime()
RETURN r.relationId AS relationId, type(r) AS relation, r.note AS note, r.confidence AS confidence
