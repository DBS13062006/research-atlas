import "server-only";

import { randomUUID } from "node:crypto";
import neo4j, { type Driver, type ManagedTransaction } from "neo4j-driver";
import {
  type GraphActor,
  GraphForbiddenError,
  GraphNotFoundError,
  GraphValidationError,
} from "@/server/graph/errors";

// Reading Trails: an ordered route through papers, stored only in Neo4j as
// (:Trail)-[:STEP {position, annotation}]->(:Paper). Positions are always 1..n with no gaps.

export type TrailVisibility = "PUBLIC" | "PRIVATE";
export type TrailSummary = {
  trailId: string;
  title: string;
  description: string | null;
  visibility: TrailVisibility;
  ownerId: number;
  steps: number;
  createdAt: string;
  updatedAt: string;
};
export type TrailStep = {
  position: number;
  paperId: number;
  title: string;
  year: number | null;
  annotation: string | null;
};
export type Trail = TrailSummary & { stepsList: TrailStep[] };

const SUMMARY = `t.trailId AS trailId, t.title AS title, t.description AS description, t.visibility AS visibility,
  t.ownerId AS ownerId, toString(t.createdAt) AS createdAt, toString(t.updatedAt) AS updatedAt`;

function check(input: {
  title?: string;
  description?: string | null;
  visibility?: string;
  annotation?: string | null;
}) {
  if (input.title !== undefined && (input.title.trim().length === 0 || input.title.length > 150)) {
    throw new GraphValidationError("title must be 1 to 150 characters");
  }
  if (input.description && input.description.length > 2000)
    throw new GraphValidationError("description is too long");
  if (input.visibility !== undefined && input.visibility !== "PUBLIC" && input.visibility !== "PRIVATE") {
    throw new GraphValidationError("visibility must be PUBLIC or PRIVATE");
  }
  if (input.annotation && input.annotation.length > 2000)
    throw new GraphValidationError("annotation is too long");
}

// Inside a write transaction: the trail must exist, and the actor must own it (admins may moderate).
async function assertOwner(tx: ManagedTransaction, trailId: string, actor: GraphActor): Promise<void> {
  const res = await tx.run("MATCH (t:Trail {trailId: $trailId}) RETURN t.ownerId AS ownerId", { trailId });
  if (res.records.length === 0) throw new GraphNotFoundError("trail not found");
  if (res.records[0].get("ownerId") !== actor.userId && !actor.isAdmin) {
    throw new GraphForbiddenError("only the trail's owner can change it");
  }
}

export async function listTrails(driver: Driver, viewerId: number | null): Promise<TrailSummary[]> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const res = await session.run(
      `MATCH (t:Trail) WHERE t.visibility = 'PUBLIC' OR t.ownerId = $viewerId
       OPTIONAL MATCH (t)-[s:STEP]->()
       WITH t, count(s) AS steps
       RETURN ${SUMMARY}, steps ORDER BY t.updatedAt DESC`,
      { viewerId: viewerId === null ? null : neo4j.int(viewerId) },
    );
    return res.records.map((r) => r.toObject() as TrailSummary);
  } finally {
    await session.close();
  }
}

export async function getTrail(
  driver: Driver,
  trailId: string,
  viewer: { userId: number | null; isAdmin: boolean },
): Promise<Trail> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const res = await session.run(
      `MATCH (t:Trail {trailId: $trailId})
       OPTIONAL MATCH (t)-[s:STEP]->(p:Paper)
       WITH t, s, p ORDER BY s.position
       WITH t, collect(CASE WHEN p IS NULL THEN null ELSE
              {position: s.position, paperId: p.paperId, title: p.title, year: p.year, annotation: s.annotation} END) AS stepsList
       RETURN ${SUMMARY}, size(stepsList) AS steps, stepsList`,
      { trailId },
    );
    const trail = res.records[0]?.toObject() as Trail | undefined;
    if (!trail) throw new GraphNotFoundError("trail not found");
    if (trail.visibility === "PRIVATE" && trail.ownerId !== viewer.userId && !viewer.isAdmin) {
      throw new GraphNotFoundError("trail not found"); // private trails are invisible, not forbidden
    }
    return trail;
  } finally {
    await session.close();
  }
}

export async function createTrail(
  driver: Driver,
  input: { title: string; description?: string | null; visibility?: TrailVisibility },
  actor: GraphActor,
): Promise<string> {
  check(input);
  const trailId = randomUUID();
  const session = driver.session();
  try {
    await session.executeWrite((tx) =>
      tx.run(
        `CREATE (t:Trail {trailId: $trailId, title: $title, description: $description, visibility: $visibility,
                          ownerId: $ownerId, createdAt: datetime(), updatedAt: datetime()})`,
        {
          trailId,
          title: input.title.trim(),
          description: input.description ?? null,
          visibility: input.visibility ?? "PRIVATE",
          ownerId: neo4j.int(actor.userId),
        },
      ),
    );
    return trailId;
  } finally {
    await session.close();
  }
}

export async function updateTrail(
  driver: Driver,
  trailId: string,
  changes: { title?: string; description?: string | null; visibility?: TrailVisibility },
  actor: GraphActor,
): Promise<void> {
  check(changes);
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      await assertOwner(tx, trailId, actor);
      await tx.run(
        `MATCH (t:Trail {trailId: $trailId})
         SET t.title = coalesce($title, t.title),
             t.description = CASE WHEN $setDescription THEN $description ELSE t.description END,
             t.visibility = coalesce($visibility, t.visibility),
             t.updatedAt = datetime()`,
        {
          trailId,
          title: changes.title?.trim() ?? null,
          setDescription: changes.description !== undefined,
          description: changes.description ?? null,
          visibility: changes.visibility ?? null,
        },
      );
    });
  } finally {
    await session.close();
  }
}

export async function addStep(
  driver: Driver,
  trailId: string,
  paperId: number,
  annotation: string | null,
  actor: GraphActor,
): Promise<number> {
  check({ annotation });
  const session = driver.session();
  try {
    return await session.executeWrite(async (tx) => {
      await assertOwner(tx, trailId, actor);
      const res = await tx.run(
        `MATCH (t:Trail {trailId: $trailId}), (p:Paper {paperId: $paperId})
         OPTIONAL MATCH (t)-[s:STEP]->()
         WITH t, p, coalesce(max(s.position), 0) + 1 AS next
         CREATE (t)-[:STEP {position: next, annotation: $annotation}]->(p)
         SET t.updatedAt = datetime()
         RETURN next`,
        { trailId, paperId: neo4j.int(paperId), annotation },
      );
      if (res.records.length === 0) throw new GraphNotFoundError("paper not found");
      return res.records[0].get("next") as number;
    });
  } finally {
    await session.close();
  }
}

export async function annotateStep(
  driver: Driver,
  trailId: string,
  position: number,
  annotation: string | null,
  actor: GraphActor,
): Promise<void> {
  check({ annotation });
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      await assertOwner(tx, trailId, actor);
      const res = await tx.run(
        `MATCH (t:Trail {trailId: $trailId})-[s:STEP {position: $position}]->()
         SET s.annotation = $annotation, t.updatedAt = datetime() RETURN count(s) AS n`,
        { trailId, position: neo4j.int(position), annotation },
      );
      if ((res.records[0].get("n") as number) === 0) throw new GraphNotFoundError("step not found");
    });
  } finally {
    await session.close();
  }
}

// New order given as the current positions in their new sequence, e.g. [3, 1, 2]. All positions
// are rewritten in one transaction.
export async function reorderSteps(
  driver: Driver,
  trailId: string,
  order: number[],
  actor: GraphActor,
): Promise<void> {
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      await assertOwner(tx, trailId, actor);
      const res = await tx.run(
        "MATCH (:Trail {trailId: $trailId})-[s:STEP]->() RETURN collect(s.position) AS positions",
        { trailId },
      );
      const current = [...(res.records[0].get("positions") as number[])].sort((a, b) => a - b);
      const proposed = [...order].sort((a, b) => a - b);
      if (current.length !== proposed.length || current.some((p, i) => p !== proposed[i])) {
        throw new GraphValidationError("the new order must list every current position exactly once");
      }
      await tx.run(
        `MATCH (t:Trail {trailId: $trailId})-[s:STEP]->()
         WITH t, s, [i IN range(0, size($order) - 1) WHERE $order[i] = s.position][0] + 1 AS newPosition
         SET s.position = newPosition, t.updatedAt = datetime()`,
        { trailId, order: order.map((o) => neo4j.int(o)) },
      );
    });
  } finally {
    await session.close();
  }
}

export async function removeStep(
  driver: Driver,
  trailId: string,
  position: number,
  actor: GraphActor,
): Promise<void> {
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      await assertOwner(tx, trailId, actor);
      const res = await tx.run(
        "MATCH (:Trail {trailId: $trailId})-[s:STEP {position: $position}]->() DELETE s RETURN count(*) AS n",
        { trailId, position: neo4j.int(position) },
      );
      if ((res.records[0].get("n") as number) === 0) throw new GraphNotFoundError("step not found");
      // Close the gap so positions stay 1..n.
      await tx.run(
        `MATCH (t:Trail {trailId: $trailId})-[s:STEP]->() WHERE s.position > $position
         SET s.position = s.position - 1, t.updatedAt = datetime()`,
        { trailId, position: neo4j.int(position) },
      );
    });
  } finally {
    await session.close();
  }
}

export async function deleteTrail(driver: Driver, trailId: string, actor: GraphActor): Promise<void> {
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      await assertOwner(tx, trailId, actor);
      await tx.run("MATCH (t:Trail {trailId: $trailId}) DETACH DELETE t", { trailId });
    });
  } finally {
    await session.close();
  }
}
