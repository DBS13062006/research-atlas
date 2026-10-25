import { idFrom, notFound, route } from "@/server/api/handler";
import { graphDriver } from "@/server/graph/driver";
import { createRelation, listRelations } from "@/server/graph/relations";
import { getPaperCards } from "@/server/services/papers";
import { withNames } from "@/server/services/people";

export const GET = route("GET /papers/{id}/relations", async ({ db, params }) => {
  const id = idFrom(params);
  if ((await getPaperCards(db, [id])).size === 0) notFound("Paper");
  return { items: await withNames(await listRelations(graphDriver(), id), "createdBy") };
});

export const POST = route("POST /papers/{id}/relations", async ({ params, body, actor }) =>
  createRelation(
    graphDriver(),
    {
      fromPaperId: idFrom(params),
      toPaperId: body.to_paper_id,
      type: body.type,
      note: body.note ?? null,
      confidence: body.confidence,
    },
    actor(),
  ),
);
