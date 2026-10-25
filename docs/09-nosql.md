# 9. NoSQL and vector database (Neo4j)

PostgreSQL is the system of record. Neo4j 2026.09 Community (Cypher 25, with the APOC and Graph Data
Science plugins) holds the same catalog as a **property graph**, plus three things that do not fit
the relational model well:
1. **graph-native data** that users create there: reading trails and curated relations;
2. **vector search** over 768-dimension paper embeddings;
3. **graph algorithms** whose results are written back to the graph: influence, communities,
   co-authorship and semantic similarity.

## 9.1 Graph model

| Node label      | Key              | Count  | Source                                                                                                           |
| --------------- | ---------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| `Paper`         | `paperId`        | 5,761  | projected from `paper` (+ `embedding`, `umapX/umapY`, `articleRank`, `community`, `betweenness` written by jobs) |
| `Author`        | `authorId`       | 24,736 | projected from `author`                                                                                          |
| `Institution`   | `institutionId`  | 2,941  | projected                                                                                                        |
| `Venue`         | `venueId`        | 1,135  | projected                                                                                                        |
| `Topic`         | `topicId`        | 1,189  | projected                                                                                                        |
| `Method`        | `methodId`       | 160    | projected                                                                                                        |
| `Dataset`       | `datasetId`      | 60     | projected                                                                                                        |
| `Trail`         | `trailId` (UUID) | 2      | **graph-native**                                                                                                 |
| `EmbeddingMeta` | `name`           | 1      | records the embedding model                                                                                      |

| Relationship                                                                                                         | From → to              | Count        | Source                                                   |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------ | -------------------------------------------------------- |
| `CITES`                                                                                                              | Paper → Paper          | 77,024       | projected from `citation`                                |
| `AUTHORED {order, isCorresponding}`                                                                                  | Author → Paper         | 34,617       | projected from `paper_author`                            |
| `AFFILIATED_WITH`                                                                                                    | Author → Institution   | 22,788       | projected                                                |
| `BELONGS_TO_TOPIC {score, isPrimary}`                                                                                | Paper → Topic          | 17,283       | projected                                                |
| `SUBTOPIC_OF`                                                                                                        | Topic → Topic          | 1,185        | projected                                                |
| `USES_METHOD`, `USES_DATASET {usage}`                                                                                | Paper → Method/Dataset | 10,937 / 879 | projected                                                |
| `PUBLISHED_IN`                                                                                                       | Paper → Venue          | 5,681        | projected                                                |
| `COAUTHOR {papers}`                                                                                                  | Author → Author        | 157,150      | **derived** from AUTHORED                                |
| `SIMILAR_TO {score, model}`                                                                                          | Paper → Paper          | 56,594       | **derived** from the vector index (top 10, score ≥ 0.75) |
| `STEP {position, annotation}`                                                                                        | Trail → Paper          | 9            | **graph-native**                                         |
| `EXTENDS`, `IMPROVES_UPON`, `CONTRADICTS`, `REPLICATES`, `RELATED_TO` `{relationId, note, confidence, createdBy, …}` | Paper → Paper          | 5            | **graph-native** curated relations                       |

Counts are from the loaded corpus on 25 October 2026.

## 9.2 Schema

[`graph/schema.cypher`](../graph/schema.cypher) is applied by `pnpm graph:schema`. Every statement is
idempotent (`IF NOT EXISTS`):
- **9 uniqueness constraints**, one per node key (they also create the lookup indexes);
- **range indexes** on `Paper.year`, `Paper.community`, `Paper.articleRank`, `Trail.ownerId`,
  `Topic.level`, `STEP.position`, and on `relationId` for each curated relationship type;
- **full-text indexes** on paper titles and author names;
- a **vector index** on `Paper.embedding`:

```cypher
CREATE VECTOR INDEX paper_embedding IF NOT EXISTS
FOR (p:Paper) ON p.embedding
WITH [p.year, p.isRetracted]
OPTIONS { indexConfig: { `vector.dimensions`: 768, `vector.similarity_function`: 'cosine' } };
```

`year` and `isRetracted` are declared as filter properties, so a `SEARCH … WHERE p.year >= 2020` filters
inside the index rather than after it. Embeddings are stored as `LIST<FLOAT>`: the native `VECTOR` type
needs the block store format, which Neo4j Community does not offer. `SHOW INDEXES` (catalog query C01, and
the Cypher Lab) lists all of them.

## 9.3 Keeping Neo4j consistent: the transactional outbox

Writing to two databases from the application ("dual writes") loses data whenever one write succeeds and
the other fails. Instead:
1. An `AFTER INSERT OR UPDATE OR DELETE` trigger (`trg_graph_outbox`) on every projected table inserts a
   row into `graph_outbox` **in the same transaction** as the change, then calls `pg_notify`. If the
   transaction rolls back, so does the outbox row. Updates that change nothing are skipped.
2. `drainOutbox` ([`src/server/graph/projection.ts`](../src/server/graph/projection.ts)) reads pending rows
   in id order with `FOR UPDATE SKIP LOCKED`, groups consecutive rows of the same table and operation into
   one `UNWIND` batch, applies the matching Cypher, and marks them processed. A failing group records the
   error and stops the drain, so a later change never overtakes an earlier one.
3. The web app drains right after each write; `pnpm graph:sync` drains on demand; the admin console shows
   pending and failing rows and has a “Sync graph now” button.
4. Derived `COAUTHOR` edges are refreshed for exactly the authors whose authorships changed.
5. `pnpm graph:rebuild` wipes the projected part and reloads it from PostgreSQL (5.6 s), keeping
   graph-native data and job-owned properties. `pnpm graph:check` compares 17 counts between the two
   databases, the derived co-authorship included, and fails on any drift.

The model is _eventually consistent_: the graph trails PostgreSQL by at most one drain, and can always be
rebuilt from it.

## 9.4 Vector search

Each paper is embedded with Ollama's `embeddinggemma` (768 dimensions) using the model's document prompt,
`title: {title} | text: {abstract}`; a search query uses `task: search result | query: {q}`. Vectors are
cached on disk by a hash of the text, so re-running `pnpm embed:papers` only embeds what changed (5,761
papers took 106 s on the laptop's GPU). A Transformers.js build of the same model is the fallback provider;
its vectors agree with Ollama's at cosine 0.996.

Similar papers (catalog query C02):

```cypher
CYPHER 25
MATCH (seed:Paper {paperId: $paper_id})
MATCH (p:Paper)
  SEARCH p IN (VECTOR INDEX paper_embedding FOR seed.embedding WHERE p.year >= 2020 LIMIT 11) SCORE AS score
WITH seed, p, score WHERE p <> seed
RETURN p.paperId AS paperId, p.title AS title, p.year AS year, round(score, 3) AS score
ORDER BY score DESC LIMIT 10
```

**Hybrid search** runs PostgreSQL full-text search and the vector search side by side and fuses the two
rankings with Reciprocal Rank Fusion, score = Σ 1 / (60 + rank). The search page shows each hit's rank in
both lists.

### Probe results

The five probe queries from the plan, top five hits each (`pnpm embed:papers --probe`):

| Query                             | Top hits (cosine similarity)                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| spiking neurons energy efficiency | 0.819 Spike-based dynamic computing with asynchronous sensing-computing neuromorphic chip · 0.811 Accurate and efficient time-domain classification with adaptive spiking recurrent neural networks · 0.809 High-performance deep spiking neural networks with 0.3 spikes per neuron · 0.808 Spiking Neural Networks and Their Applications: A Review · 0.802 A 4-fJ/Spike Artificial Neuron in 65 nm CMOS Technology |
| retrieval augmented generation    | 0.823 Retrieval-Augmented Generation for AI-Generated Content: A Survey · 0.805 Retrieval-Augmented Generation for Large Language Models: A Survey · 0.800 Retrieval-augmented generation for educational application · 0.787 Hallucination Mitigation for Retrieval-Augmented LLMs · 0.782 Graph Retrieval-Augmented Generation: A Survey                                                                            |
| graph attention                   | 0.816 Attention-based Graph Neural Network for Semi-supervised Learning · 0.815 Understanding Attention and Generalization in GNNs · 0.813 Graph Attention Networks · 0.812 How to Find Your Friendly Neighborhood · 0.807 How Attentive are Graph Attention Networks?                                                                                                                                                |
| ICU mortality prediction          | 0.837 Prediction model of in-hospital mortality in ICU patients with heart failure · 0.830 Predicting Mortality in ICU Patients With Heart Failure · 0.827 Dynamic and explainable ML prediction of mortality in ICU patients · 0.821 Prognostic Assessment of COVID-19 in the ICU · 0.811 Using ML to Predict ICU Transfer in COVID-19 Patients                                                                      |
| offline reinforcement learning    | 0.877 Offline RL: Tutorial, Review, and Perspectives on Open Problems · 0.861 A Survey on Offline RL · 0.834 Conservative Q-Learning for Offline RL · 0.825 Off-Policy Deep RL without Exploration · 0.824 MOPO: Model-based Offline Policy Optimization                                                                                                                                                              |

Every hit is on topic, including papers whose titles share no words with the query.

## 9.5 Graph algorithms (`pnpm graph:analytics`)

| Job                 | Algorithm (GDS)                                                                       | Written to                  | Used by                                                 |
| ------------------- | ------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------- |
| Influence           | ArticleRank on the citation graph                                                     | `Paper.articleRank`         | Hidden gems (influential but under-cited), ranking      |
| Research fronts     | Leiden on the undirected citation graph, fixed seed: 125 communities, modularity 0.62 | `Paper.community`           | Atlas colours, Research fronts page                     |
| Brokers             | Betweenness centrality (sampled)                                                      | `Paper.betweenness`         | Bridges query (C08)                                     |
| Co-authorship       | Cypher aggregation over shared papers                                                 | `COAUTHOR {papers}`         | Author network, “people you may collaborate with” (C05) |
| Semantic neighbours | Top 10 vector neighbours, score ≥ 0.75                                                | `SIMILAR_TO {score, model}` | Similar tab on paper pages                              |

`pnpm layout:umap` projects the embeddings to two dimensions with a seeded UMAP, so the map is identical
on every rebuild.

## 9.6 Read, update and delete on graph-native data

Neo4j Community has no fine-grained access control, so ownership is enforced in the Cypher itself: the
creator may change a relation or trail, and so may a curator (relations) or an administrator (trails).
Every path is covered by integration tests in
[`tests/integration/graph-native.test.ts`](../tests/integration/graph-native.test.ts).

### Curated relations

| Operation | API                                                               | Cypher idea                                                                                                        |
| --------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Create    | `POST /api/v1/papers/{id}/relations`                              | `MATCH` both papers, `CREATE (a)-[:EXTENDS {relationId: $id, …}]->(b)` with a UUID made by the server              |
| Read      | `GET /api/v1/papers/{id}/relations`, `GET /api/v1/relations/{id}` | match by `relationId`, either direction                                                                            |
| Update    | `PATCH /api/v1/relations/{id}`                                    | note and confidence in place; a type change recreates the relationship with the same id (Cypher cannot retype one) |
| Delete    | `DELETE /api/v1/relations/{id}`                                   | `WHERE r.createdBy = $userId OR $isCurator … DELETE r`                                                             |

Update in place (catalog query C11):

```cypher
MATCH (:Paper)-[r {relationId: $relation_id}]->(:Paper)
WHERE r.createdBy = $user_id OR $is_curator
SET r.note = 'Confirmed after reading section 4', r.confidence = 5, r.updatedAt = datetime()
RETURN r.relationId AS relationId, type(r) AS relation, r.note AS note, r.confidence AS confidence
```

### Reading trails

A trail is a `Trail` node with ordered `STEP {position, annotation}` relationships to papers.

| Operation | API                                                                                               | Notes                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Create    | `POST /api/v1/trails`, `POST /api/v1/trails/{id}/steps`                                           | positions assigned in order                                                                      |
| Read      | `GET /api/v1/trails`, `GET /api/v1/trails/{id}`                                                   | private trails are invisible (404, not 403) to others                                            |
| Update    | `PATCH /api/v1/trails/{id}` (title, visibility), `PATCH …/steps/{position}` (annotation), reorder | reorder rewrites all positions in one transaction and rejects an order that is not a permutation |
| Delete    | `DELETE …/steps/{position}`, `DELETE /api/v1/trails/{id}`                                         | removing a step closes the gap                                                                   |

Remove step 2 and close the gap (C12):

```cypher
MATCH (t:Trail {trailId: $trail_id})-[s:STEP {position: 2}]->()
DELETE s
WITH t
MATCH (t)-[rest:STEP]->(p:Paper) WHERE rest.position > 2
SET rest.position = rest.position - 1
```

## 9.7 The same question in both databases

The Lineage and Connect pages answer each question twice and show both timings:

| Question                                      | PostgreSQL                                                                                      | Neo4j                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| What does this paper build on, 3 levels deep? | recursive CTE with `SEARCH BREADTH FIRST` and `CYCLE` (`fn_paper_lineage`), 300 papers in 76 ms | variable-length `(p)-[:CITES]->{1,3}(q)`, 128 ms |
| Shortest citation chain between two papers    | breadth-first recursive CTE carrying the path as an array (Q16)                                 | `SHORTEST 1 (a)-[:CITES]-+(b)` (C03)             |

At this size PostgreSQL is competitive on traversals; Neo4j earns its place with the vector index, the graph
algorithms and the graph-native features, which would be awkward or impossible in SQL alone.

<!-- chapter-nav -->

---

[← Advanced SQL](08-advanced-sql.md) · [Documentation index](README.md) · [Authentication and RBAC →](10-auth-rbac.md)
