import "server-only";

import { randomUUID } from "node:crypto";
import neo4j, { type Driver } from "neo4j-driver";
import { type GraphActor, GraphForbiddenError, GraphNotFoundError, GraphValidationError } from "./errors";

// Curated relations: a researcher asserts that one paper EXTENDS, IMPROVES_UPON, CONTRADICTS,
// REPLICATES or is RELATED_TO another. They live only in Neo4j (it is their system of record), with
// full read / update / delete. Neo4j Community has no fine-grained RBAC, so ownership is checked in
// Cypher: the creator may edit or delete, and so may a curator (relations:moderate).

export const RELATION_TYPES = [
  "EXTENDS",
  "IMPROVES_UPON",
  "CONTRADICTS",
  "REPLICATES",
  "RELATED_TO",
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export function isRelationType(value: string): value is RelationType {
  return (RELATION_TYPES as readonly string[]).includes(value);
}

export type Relation = {
  relationId: string;
  type: RelationType;
  fromPaperId: number;
  fromTitle: string;
  toPaperId: number;
  toTitle: string;
  note: string | null;
  confidence: number;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
};

const RETURN_RELATION = `
  RETURN r.relationId AS relationId, type(r) AS type, a.paperId AS fromPaperId, a.title AS fromTitle,
         b.paperId AS toPaperId, b.title AS toTitle, r.note AS note, r.confidence AS confidence,
         r.createdBy AS createdBy, toString(r.createdAt) AS createdAt, toString(r.updatedAt) AS updatedAt`;
const TYPE_FILTER = "type(r) IN $types";

function validate(input: { confidence?: number; note?: string | null }) {
  if (
    input.confidence !== undefined &&
    (!Number.isInteger(input.confidence) || input.confidence < 1 || input.confidence > 5)
  ) {
    throw new GraphValidationError("confidence must be a whole number from 1 to 5");
  }
  if (input.note && input.note.length > 2000)
    throw new GraphValidationError("note must be at most 2,000 characters");
}

export async function listRelations(driver: Driver, paperId: number): Promise<Relation[]> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const res = await session.run(
      `MATCH (a:Paper)-[r]->(b:Paper) WHERE ${TYPE_FILTER} AND (a.paperId = $paperId OR b.paperId = $paperId)
       ${RETURN_RELATION} ORDER BY r.createdAt DESC`,
      { paperId: neo4j.int(paperId), types: RELATION_TYPES },
    );
    return res.records.map((r) => r.toObject() as Relation);
  } finally {
    await session.close();
  }
}

export async function recentRelations(driver: Driver, limit = 50): Promise<Relation[]> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const res = await session.run(
      `MATCH (a:Paper)-[r]->(b:Paper) WHERE ${TYPE_FILTER} ${RETURN_RELATION} ORDER BY r.updatedAt DESC LIMIT $limit`,
      { types: RELATION_TYPES, limit: neo4j.int(limit) },
    );
    return res.records.map((r) => r.toObject() as Relation);
  } finally {
    await session.close();
  }
}

export async function getRelation(driver: Driver, relationId: string): Promise<Relation | null> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const res = await session.run(
      `MATCH (a:Paper)-[r]->(b:Paper) WHERE ${TYPE_FILTER} AND r.relationId = $relationId ${RETURN_RELATION}`,
      { relationId, types: RELATION_TYPES },
    );
    return (res.records[0]?.toObject() as Relation | undefined) ?? null;
  } finally {
    await session.close();
  }
}

export async function createRelation(
  driver: Driver,
  input: {
    fromPaperId: number;
    toPaperId: number;
    type: RelationType;
    note?: string | null;
    confidence: number;
  },
  actor: GraphActor,
): Promise<Relation> {
  if (!isRelationType(input.type)) throw new GraphValidationError(`unknown relation type ${input.type}`);
  if (input.fromPaperId === input.toPaperId)
    throw new GraphValidationError("a paper cannot relate to itself");
  validate(input);
  const session = driver.session();
  try {
    // The type comes from the fixed allow-list above, so interpolating it is safe.
    const res = await session.executeWrite((tx) =>
      tx.run(
        `MATCH (a:Paper {paperId: $from}), (b:Paper {paperId: $to})
         CREATE (a)-[r:${input.type} {relationId: $relationId, note: $note, confidence: $confidence,
                                     createdBy: $userId, createdAt: datetime(), updatedAt: datetime()}]->(b)
         ${RETURN_RELATION}`,
        {
          from: neo4j.int(input.fromPaperId),
          to: neo4j.int(input.toPaperId),
          relationId: randomUUID(),
          note: input.note ?? null,
          confidence: neo4j.int(input.confidence),
          userId: neo4j.int(actor.userId),
        },
      ),
    );
    const created = res.records[0]?.toObject() as Relation | undefined;
    if (!created) throw new GraphNotFoundError("one or both papers do not exist");
    return created;
  } finally {
    await session.close();
  }
}

export async function updateRelation(
  driver: Driver,
  relationId: string,
  changes: { note?: string | null; confidence?: number; type?: RelationType },
  actor: GraphActor,
): Promise<Relation> {
  validate(changes);
  if (changes.type !== undefined && !isRelationType(changes.type))
    throw new GraphValidationError("unknown relation type");
  const existing = await getRelation(driver, relationId);
  if (!existing) throw new GraphNotFoundError("relation not found");
  const session = driver.session();
  try {
    return await session.executeWrite(async (tx) => {
      const params = {
        relationId,
        types: RELATION_TYPES,
        userId: neo4j.int(actor.userId),
        isCurator: actor.isCurator,
      };
      // Ownership is decided in Cypher, inside the same transaction as the write.
      const owned = await tx.run(
        `MATCH (:Paper)-[r]->(:Paper) WHERE ${TYPE_FILTER} AND r.relationId = $relationId
           AND (r.createdBy = $userId OR $isCurator) RETURN count(r) AS n`,
        params,
      );
      if ((owned.records[0].get("n") as number) === 0)
        throw new GraphForbiddenError("only the creator or a curator can edit this relation");

      if (changes.type && changes.type !== existing.type) {
        // Relationship types are immutable in Neo4j: delete and recreate with the same id and properties.
        await tx.run(
          `MATCH (a:Paper)-[r]->(b:Paper) WHERE ${TYPE_FILTER} AND r.relationId = $relationId
           WITH a, b, properties(r) AS props, r
           DELETE r
           WITH a, b, props
           CREATE (a)-[n:${changes.type}]->(b) SET n = props`,
          params,
        );
      }
      const res = await tx.run(
        `MATCH (a:Paper)-[r]->(b:Paper) WHERE ${TYPE_FILTER} AND r.relationId = $relationId
         SET r.note = CASE WHEN $setNote THEN $note ELSE r.note END,
             r.confidence = coalesce($confidence, r.confidence),
             r.updatedAt = datetime()
         ${RETURN_RELATION}`,
        {
          ...params,
          setNote: changes.note !== undefined,
          note: changes.note ?? null,
          confidence: changes.confidence === undefined ? null : neo4j.int(changes.confidence),
        },
      );
      return res.records[0].toObject() as Relation;
    });
  } finally {
    await session.close();
  }
}

export async function deleteRelation(driver: Driver, relationId: string, actor: GraphActor): Promise<void> {
  const existing = await getRelation(driver, relationId);
  if (!existing) throw new GraphNotFoundError("relation not found");
  const session = driver.session();
  try {
    const res = await session.executeWrite((tx) =>
      tx.run(
        `MATCH (:Paper)-[r]->(:Paper) WHERE ${TYPE_FILTER} AND r.relationId = $relationId
           AND (r.createdBy = $userId OR $isCurator)
         DELETE r RETURN count(*) AS n`,
        { relationId, types: RELATION_TYPES, userId: neo4j.int(actor.userId), isCurator: actor.isCurator },
      ),
    );
    if ((res.records[0].get("n") as number) === 0)
      throw new GraphForbiddenError("only the creator or a curator can delete this relation");
  } finally {
    await session.close();
  }
}
