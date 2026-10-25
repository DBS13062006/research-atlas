// Read, update and delete paths for the graph-native features (curated relations and reading
// trails), including ownership refusals. Runs against the local Neo4j on throwaway papers with
// negative ids, so real data is never touched.
import type { Driver } from "neo4j-driver";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeGraphDriver, graphDriver } from "@/server/graph/driver";
import { GraphForbiddenError, GraphNotFoundError, GraphValidationError } from "@/server/graph/errors";
import {
  createRelation,
  deleteRelation,
  getRelation,
  listRelations,
  updateRelation,
} from "@/server/graph/relations";
import {
  addStep,
  annotateStep,
  createTrail,
  deleteTrail,
  getTrail,
  listTrails,
  removeStep,
  reorderSteps,
  updateTrail,
} from "@/server/graph/trails";

const A = -9001;
const B = -9002;
const C = -9003;
const owner = { userId: -501, isCurator: false, isAdmin: false };
const stranger = { userId: -502, isCurator: false, isAdmin: false };
const curator = { userId: -503, isCurator: true, isAdmin: false };
const admin = { userId: -504, isCurator: true, isAdmin: true };

let driver: Driver;

beforeAll(async () => {
  driver = graphDriver();
  const s = driver.session();
  await s.run("MATCH (p:Paper) WHERE p.paperId IN [-9001, -9002, -9003] DETACH DELETE p");
  await s.run(
    "UNWIND [{id: -9001, t: 'Test paper A'}, {id: -9002, t: 'Test paper B'}, {id: -9003, t: 'Test paper C'}] AS r CREATE (:Paper {paperId: r.id, title: r.t, year: 2025})",
  );
  await s.close();
});

afterAll(async () => {
  const s = driver.session();
  await s.run("MATCH (t:Trail) WHERE t.ownerId IN [-501, -502, -503, -504] DETACH DELETE t");
  await s.run("MATCH (p:Paper) WHERE p.paperId IN [-9001, -9002, -9003] DETACH DELETE p");
  await s.close();
  await closeGraphDriver();
});

describe("curated relations", () => {
  it("creates and reads a relation from both ends", async () => {
    const r = await createRelation(
      driver,
      { fromPaperId: A, toPaperId: B, type: "EXTENDS", note: "builds on", confidence: 4 },
      owner,
    );
    expect(r.type).toBe("EXTENDS");
    expect(r.createdBy).toBe(owner.userId);
    expect((await listRelations(driver, A)).map((x) => x.relationId)).toContain(r.relationId);
    expect((await listRelations(driver, B)).map((x) => x.relationId)).toContain(r.relationId);
    expect((await getRelation(driver, r.relationId))?.note).toBe("builds on");
  });

  it("validates input", async () => {
    await expect(
      createRelation(driver, { fromPaperId: A, toPaperId: A, type: "EXTENDS", confidence: 3 }, owner),
    ).rejects.toBeInstanceOf(GraphValidationError);
    await expect(
      createRelation(driver, { fromPaperId: A, toPaperId: B, type: "EXTENDS", confidence: 9 }, owner),
    ).rejects.toBeInstanceOf(GraphValidationError);
    await expect(
      createRelation(driver, { fromPaperId: A, toPaperId: -1, type: "EXTENDS", confidence: 3 }, owner),
    ).rejects.toBeInstanceOf(GraphNotFoundError);
  });

  it("lets the creator update note and confidence", async () => {
    const r = await createRelation(
      driver,
      { fromPaperId: B, toPaperId: C, type: "RELATED_TO", confidence: 2 },
      owner,
    );
    const u = await updateRelation(driver, r.relationId, { note: "same dataset", confidence: 5 }, owner);
    expect(u.note).toBe("same dataset");
    expect(u.confidence).toBe(5);
    expect(u.updatedAt >= u.createdAt).toBe(true);
  });

  it("changes the type by recreating the relationship with the same id", async () => {
    const r = await createRelation(
      driver,
      { fromPaperId: A, toPaperId: C, type: "RELATED_TO", note: "x", confidence: 3 },
      owner,
    );
    const u = await updateRelation(driver, r.relationId, { type: "CONTRADICTS" }, owner);
    expect(u.type).toBe("CONTRADICTS");
    expect(u.relationId).toBe(r.relationId);
    expect(u.note).toBe("x");
    expect(u.createdAt).toBe(r.createdAt);
  });

  it("refuses updates and deletes from someone else, but allows a curator", async () => {
    const r = await createRelation(
      driver,
      { fromPaperId: C, toPaperId: A, type: "REPLICATES", confidence: 3 },
      owner,
    );
    await expect(updateRelation(driver, r.relationId, { note: "hijack" }, stranger)).rejects.toBeInstanceOf(
      GraphForbiddenError,
    );
    await expect(deleteRelation(driver, r.relationId, stranger)).rejects.toBeInstanceOf(GraphForbiddenError);
    expect((await getRelation(driver, r.relationId))?.note).toBeNull();
    await updateRelation(driver, r.relationId, { note: "moderated" }, curator);
    await deleteRelation(driver, r.relationId, curator);
    expect(await getRelation(driver, r.relationId)).toBeNull();
  });

  it("lets the creator delete, and reports a missing relation", async () => {
    const r = await createRelation(
      driver,
      { fromPaperId: B, toPaperId: A, type: "IMPROVES_UPON", confidence: 3 },
      owner,
    );
    await deleteRelation(driver, r.relationId, owner);
    expect(await getRelation(driver, r.relationId)).toBeNull();
    await expect(deleteRelation(driver, r.relationId, owner)).rejects.toBeInstanceOf(GraphNotFoundError);
  });
});

describe("reading trails", () => {
  it("creates a trail, adds steps in order and reads it back", async () => {
    const id = await createTrail(
      driver,
      { title: "From A to C", description: "test", visibility: "PRIVATE" },
      owner,
    );
    expect(await addStep(driver, id, A, "start here", owner)).toBe(1);
    expect(await addStep(driver, id, B, null, owner)).toBe(2);
    expect(await addStep(driver, id, C, "the end", owner)).toBe(3);
    const t = await getTrail(driver, id, { userId: owner.userId, isAdmin: false });
    expect(t.stepsList.map((s) => s.paperId)).toEqual([A, B, C]);
    expect(t.steps).toBe(3);
  });

  it("hides private trails from others and lists public ones", async () => {
    const priv = await createTrail(driver, { title: "Private", visibility: "PRIVATE" }, owner);
    const pub = await createTrail(driver, { title: "Public", visibility: "PUBLIC" }, owner);
    await expect(getTrail(driver, priv, { userId: stranger.userId, isAdmin: false })).rejects.toBeInstanceOf(
      GraphNotFoundError,
    );
    const visible = (await listTrails(driver, stranger.userId)).map((t) => t.trailId);
    expect(visible).toContain(pub);
    expect(visible).not.toContain(priv);
    expect((await listTrails(driver, owner.userId)).map((t) => t.trailId)).toContain(priv);
    expect((await getTrail(driver, priv, { userId: null, isAdmin: true })).title).toBe("Private");
  });

  it("renames, annotates and changes visibility", async () => {
    const id = await createTrail(driver, { title: "Draft" }, owner);
    await addStep(driver, id, A, null, owner);
    await updateTrail(driver, id, { title: "Final", visibility: "PUBLIC", description: "now public" }, owner);
    await annotateStep(driver, id, 1, "read section 3", owner);
    const t = await getTrail(driver, id, { userId: null, isAdmin: false });
    expect(t.title).toBe("Final");
    expect(t.description).toBe("now public");
    expect(t.stepsList[0].annotation).toBe("read section 3");
  });

  it("reorders steps in one transaction and rejects a bad order", async () => {
    const id = await createTrail(driver, { title: "Reorder" }, owner);
    for (const p of [A, B, C]) await addStep(driver, id, p, null, owner);
    await reorderSteps(driver, id, [3, 1, 2], owner);
    const t = await getTrail(driver, id, { userId: owner.userId, isAdmin: false });
    expect(t.stepsList.map((s) => s.paperId)).toEqual([C, A, B]);
    expect(t.stepsList.map((s) => s.position)).toEqual([1, 2, 3]);
    await expect(reorderSteps(driver, id, [1, 1, 2], owner)).rejects.toBeInstanceOf(GraphValidationError);
  });

  it("removes a step and closes the gap", async () => {
    const id = await createTrail(driver, { title: "Gaps" }, owner);
    for (const p of [A, B, C]) await addStep(driver, id, p, null, owner);
    await removeStep(driver, id, 2, owner);
    const t = await getTrail(driver, id, { userId: owner.userId, isAdmin: false });
    expect(t.stepsList.map((s) => [s.position, s.paperId])).toEqual([
      [1, A],
      [2, C],
    ]);
    await expect(removeStep(driver, id, 9, owner)).rejects.toBeInstanceOf(GraphNotFoundError);
  });

  it("refuses every change from a non-owner and lets an admin moderate", async () => {
    const id = await createTrail(driver, { title: "Mine", visibility: "PUBLIC" }, owner);
    await addStep(driver, id, A, null, owner);
    await expect(updateTrail(driver, id, { title: "Theirs" }, stranger)).rejects.toBeInstanceOf(
      GraphForbiddenError,
    );
    await expect(addStep(driver, id, B, null, stranger)).rejects.toBeInstanceOf(GraphForbiddenError);
    await expect(annotateStep(driver, id, 1, "x", stranger)).rejects.toBeInstanceOf(GraphForbiddenError);
    await expect(reorderSteps(driver, id, [1], stranger)).rejects.toBeInstanceOf(GraphForbiddenError);
    await expect(removeStep(driver, id, 1, stranger)).rejects.toBeInstanceOf(GraphForbiddenError);
    await expect(deleteTrail(driver, id, stranger)).rejects.toBeInstanceOf(GraphForbiddenError);
    await updateTrail(driver, id, { title: "Moderated" }, admin);
    expect((await getTrail(driver, id, { userId: null, isAdmin: false })).title).toBe("Moderated");
  });

  it("deletes a trail with its steps", async () => {
    const id = await createTrail(driver, { title: "Temporary" }, owner);
    await addStep(driver, id, A, null, owner);
    await deleteTrail(driver, id, owner);
    await expect(getTrail(driver, id, { userId: owner.userId, isAdmin: false })).rejects.toBeInstanceOf(
      GraphNotFoundError,
    );
    await expect(deleteTrail(driver, id, owner)).rejects.toBeInstanceOf(GraphNotFoundError);
  });
});
