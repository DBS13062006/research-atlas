import "server-only";

import neo4j, { type Driver } from "neo4j-driver";
import { env } from "@/server/env";

// One driver per process. Integers come back as JS numbers: every id in this project fits easily.
const globalForGraph = globalThis as unknown as { atlasNeo4j?: Driver };

export function graphDriver(): Driver {
  if (!globalForGraph.atlasNeo4j) {
    const e = env();
    if (!e.NEO4J_PASSWORD) throw new Error("NEO4J_PASSWORD is not configured");
    globalForGraph.atlasNeo4j = neo4j.driver(e.NEO4J_URI, neo4j.auth.basic(e.NEO4J_USER, e.NEO4J_PASSWORD), {
      disableLosslessIntegers: true,
      maxConnectionPoolSize: 20,
    });
  }
  return globalForGraph.atlasNeo4j;
}

export async function closeGraphDriver(): Promise<void> {
  await globalForGraph.atlasNeo4j?.close();
  globalForGraph.atlasNeo4j = undefined;
}
