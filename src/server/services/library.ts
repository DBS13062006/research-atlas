import "server-only";

import type { z } from "zod";
import type {
  collectionCreate,
  collectionPaperUpdate,
  collectionUpdate,
  noteCreate,
  noteUpdate,
} from "@/lib/schemas";
import { type DbContext, withDb } from "@/server/db/client";

// Collections and notes. Every query runs under the caller's database role, so ownership is
// enforced by row-level security: another user's private rows are simply not there.

export async function myCollections(ctx: DbContext) {
  return withDb(
    ctx,
    (tx) => tx`
      SELECT collection_id::INT, public_id, collection_name, description, is_public, updated_at, papers, not_read, reading, read
      FROM v_my_library ORDER BY updated_at DESC`,
  );
}

export async function getCollection(ctx: DbContext, collectionId: number) {
  return withDb(ctx, async (tx) => {
    const [c] = await tx`
      SELECT c.collection_id::INT, c.public_id, c.collection_name, c.description, c.is_public, c.user_id::INT,
             c.user_id = app_current_user_id() AS is_owner
      FROM collection c WHERE c.collection_id = ${collectionId}`;
    if (!c) return null;
    const items = await tx`
      SELECT cp.paper_id::INT, cp.reading_status, cp.priority, cp.position, cp.added_at, cp.read_at,
             v.title, v.publication_year::INT, v.venue_name, v.author_names, v.retraction_status,
             (SELECT count(*) FROM note n WHERE n.paper_id = cp.paper_id AND n.user_id = app_current_user_id())::INT AS my_notes
      FROM collection_paper cp JOIN v_paper_card v ON v.paper_id = cp.paper_id
      WHERE cp.collection_id = ${collectionId}
      ORDER BY cp.position, cp.added_at`;
    return { ...c, items };
  });
}

export async function createCollection(ctx: DbContext, input: z.infer<typeof collectionCreate>) {
  return withDb(ctx, async (tx) => {
    const [row] = await tx<{ collection_id: number }[]>`
      INSERT INTO collection (user_id, collection_name, description, is_public)
      VALUES (app_current_user_id(), ${input.name}, ${input.description ?? null}, ${input.is_public})
      RETURNING collection_id::INT`;
    return row.collection_id;
  });
}

export async function updateCollection(
  ctx: DbContext,
  collectionId: number,
  input: z.infer<typeof collectionUpdate>,
) {
  return withDb(ctx, async (tx) => {
    const res = await tx`
      UPDATE collection SET
        collection_name = coalesce(${input.name ?? null}, collection_name),
        description = CASE WHEN ${input.description !== undefined} THEN ${input.description ?? null} ELSE description END,
        is_public = coalesce(${input.is_public ?? null}, is_public)
      WHERE collection_id = ${collectionId}`;
    return res.count > 0;
  });
}

export async function deleteCollection(ctx: DbContext, collectionId: number) {
  return withDb(
    ctx,
    async (tx) => (await tx`DELETE FROM collection WHERE collection_id = ${collectionId}`).count > 0,
  );
}

export async function addToCollection(
  ctx: DbContext,
  collectionId: number,
  paperId: number,
  priority: string,
) {
  return withDb(ctx, async (tx) => {
    await tx`CALL sp_add_to_collection(${collectionId}, ${paperId}, ${priority})`;
    return true;
  });
}

export async function updateCollectionPaper(
  ctx: DbContext,
  collectionId: number,
  paperId: number,
  input: z.infer<typeof collectionPaperUpdate>,
) {
  return withDb(ctx, async (tx) => {
    const [row] = await tx`
      UPDATE collection_paper SET
        reading_status = coalesce(${input.reading_status ?? null}, reading_status),
        priority = coalesce(${input.priority ?? null}, priority),
        position = coalesce(${input.position ?? null}, position)
      WHERE collection_id = ${collectionId} AND paper_id = ${paperId}
      RETURNING paper_id::INT, reading_status, priority, position, read_at`;
    return row ?? null;
  });
}

export async function removeFromCollection(ctx: DbContext, collectionId: number, paperId: number) {
  return withDb(
    ctx,
    async (tx) =>
      (await tx`DELETE FROM collection_paper WHERE collection_id = ${collectionId} AND paper_id = ${paperId}`)
        .count > 0,
  );
}

// Notes visible to the caller: their own, plus public notes from others when paperId is given.
export async function listNotes(ctx: DbContext, paperId?: number) {
  return withDb(
    ctx,
    (tx) => tx`
      SELECT n.note_id::INT, n.paper_id::INT, p.title AS paper_title, n.note_text, n.is_private, n.created_at, n.updated_at,
             n.user_id = app_current_user_id() AS is_mine
      FROM note n JOIN paper p USING (paper_id)
      WHERE ${paperId ? tx`n.paper_id = ${paperId}` : tx`n.user_id = app_current_user_id()`}
      ORDER BY n.updated_at DESC LIMIT 200`,
  );
}

export async function createNote(ctx: DbContext, input: z.infer<typeof noteCreate>) {
  return withDb(ctx, async (tx) => {
    const [row] = await tx<{ note_id: number }[]>`
      INSERT INTO note (user_id, paper_id, note_text, is_private)
      VALUES (app_current_user_id(), ${input.paper_id}, ${input.text}, ${input.is_private})
      RETURNING note_id::INT`;
    return row.note_id;
  });
}

export async function updateNote(ctx: DbContext, noteId: number, input: z.infer<typeof noteUpdate>) {
  return withDb(ctx, async (tx) => {
    const res = await tx`
      UPDATE note SET note_text = coalesce(${input.text ?? null}, note_text), is_private = coalesce(${input.is_private ?? null}, is_private)
      WHERE note_id = ${noteId} AND user_id = app_current_user_id()`;
    return res.count > 0;
  });
}

export async function deleteNote(ctx: DbContext, noteId: number) {
  return withDb(
    ctx,
    async (tx) =>
      (await tx`DELETE FROM note WHERE note_id = ${noteId} AND user_id = app_current_user_id()`).count > 0,
  );
}
