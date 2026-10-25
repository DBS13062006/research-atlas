// pnpm setup:fixture — a fresh clone to a working atlas from the committed 200-paper fixture:
// containers, migrations, fixture rows, the Neo4j projection, embeddings, the map layout,
// graph analytics and the demo accounts. No OpenAlex key or downloaded corpus is needed.
import { pnpm, runSteps } from "../lib/steps";

runSteps("setup:fixture", [
  pnpm("db:up"),
  pnpm("db:migrate"),
  pnpm("db:seed:fixture"),
  pnpm("graph:schema"),
  pnpm("graph:rebuild"),
  pnpm("embed:papers"),
  pnpm("layout:umap"),
  pnpm("graph:analytics"),
  pnpm("seed:demo"),
]).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
