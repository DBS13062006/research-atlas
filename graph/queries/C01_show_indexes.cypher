// @id        C01
// @title     The graph's constraints and indexes, including the vector index
// @category  schema
// @concepts  SHOW INDEXES; range, full-text, lookup and vector index types
// @role      ra_anon
// @params    none
SHOW INDEXES YIELD name, type, entityType, labelsOrTypes, properties, state
RETURN name, type, entityType, labelsOrTypes, properties, state
ORDER BY type, name
