// Research Atlas knowledge graph schema (Neo4j 2026.09, Cypher 25). Applied by `pnpm graph:schema`.
// Statements are separated by semicolons at line ends; every one is idempotent (IF NOT EXISTS).

// ── Node keys: one uniqueness constraint per label ───────────────────────────────────────────
CREATE CONSTRAINT paper_id IF NOT EXISTS FOR (p:Paper) REQUIRE p.paperId IS UNIQUE;
CREATE CONSTRAINT author_id IF NOT EXISTS FOR (a:Author) REQUIRE a.authorId IS UNIQUE;
CREATE CONSTRAINT institution_id IF NOT EXISTS FOR (i:Institution) REQUIRE i.institutionId IS UNIQUE;
CREATE CONSTRAINT venue_id IF NOT EXISTS FOR (v:Venue) REQUIRE v.venueId IS UNIQUE;
CREATE CONSTRAINT topic_id IF NOT EXISTS FOR (t:Topic) REQUIRE t.topicId IS UNIQUE;
CREATE CONSTRAINT method_id IF NOT EXISTS FOR (m:Method) REQUIRE m.methodId IS UNIQUE;
CREATE CONSTRAINT dataset_id IF NOT EXISTS FOR (d:Dataset) REQUIRE d.datasetId IS UNIQUE;
CREATE CONSTRAINT trail_id IF NOT EXISTS FOR (t:Trail) REQUIRE t.trailId IS UNIQUE;
CREATE CONSTRAINT embedding_meta_name IF NOT EXISTS FOR (e:EmbeddingMeta) REQUIRE e.name IS UNIQUE;

// ── Range indexes for filters and sorting ────────────────────────────────────────────────────
CREATE INDEX paper_year IF NOT EXISTS FOR (p:Paper) ON (p.year);
CREATE INDEX paper_community IF NOT EXISTS FOR (p:Paper) ON (p.community);
CREATE INDEX paper_article_rank IF NOT EXISTS FOR (p:Paper) ON (p.articleRank);
CREATE INDEX trail_owner IF NOT EXISTS FOR (t:Trail) ON (t.ownerId);
CREATE INDEX topic_level IF NOT EXISTS FOR (t:Topic) ON (t.level);

// ── Curated relations are looked up by their id; one relationship index per type ────────────
CREATE INDEX curated_extends_id IF NOT EXISTS FOR ()-[r:EXTENDS]-() ON (r.relationId);
CREATE INDEX curated_improves_upon_id IF NOT EXISTS FOR ()-[r:IMPROVES_UPON]-() ON (r.relationId);
CREATE INDEX curated_contradicts_id IF NOT EXISTS FOR ()-[r:CONTRADICTS]-() ON (r.relationId);
CREATE INDEX curated_replicates_id IF NOT EXISTS FOR ()-[r:REPLICATES]-() ON (r.relationId);
CREATE INDEX curated_related_to_id IF NOT EXISTS FOR ()-[r:RELATED_TO]-() ON (r.relationId);
CREATE INDEX step_position IF NOT EXISTS FOR ()-[s:STEP]-() ON (s.position);

// ── Full-text search over titles and names ──────────────────────────────────────────────────
CREATE FULLTEXT INDEX paper_title_ft IF NOT EXISTS FOR (p:Paper) ON EACH [p.title];
CREATE FULLTEXT INDEX author_name_ft IF NOT EXISTS FOR (a:Author) ON EACH [a.name];

// ── Vector index: 768-dimension EmbeddingGemma vectors, cosine similarity ───────────────────
// year and isRetracted are declared as filter properties so SEARCH ... WHERE filters inside the
// index instead of after it. Embeddings are stored as LIST<FLOAT> (the native VECTOR type needs the
// block store format, which Neo4j Community does not offer).
CREATE VECTOR INDEX paper_embedding IF NOT EXISTS
FOR (p:Paper) ON p.embedding
WITH [p.year, p.isRetracted]
OPTIONS { indexConfig: { `vector.dimensions`: 768, `vector.similarity_function`: 'cosine' } };
