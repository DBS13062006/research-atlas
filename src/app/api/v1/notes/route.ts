import { route } from "@/server/api/handler";
import { createNote, listNotes } from "@/server/services/library";

export const GET = route("GET /notes", async ({ db, query }) => ({
  items: await listNotes(db, query.paper_id),
}));
export const POST = route("POST /notes", async ({ db, body }) => ({ note_id: await createNote(db, body) }));
