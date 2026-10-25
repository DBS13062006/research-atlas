import { idFrom, notFound, route } from "@/server/api/handler";
import { deleteNote, updateNote } from "@/server/services/library";

export const PATCH = route("PATCH /notes/{id}", async ({ db, params, body }) => {
  if (!(await updateNote(db, idFrom(params), body))) notFound("Note");
  return { note_id: idFrom(params) };
});

export const DELETE = route("DELETE /notes/{id}", async ({ db, params }) => {
  if (!(await deleteNote(db, idFrom(params)))) notFound("Note");
  return null;
});
