import { z } from "zod";
import { ROLE_LABEL } from "@/lib/roles";
import { API, type Endpoint } from "@/server/api/registry";

// OpenAPI 3.1 generated from the endpoint registry: every request schema is the same Zod schema the
// handler validates with, so the documentation cannot drift from the code.

type JsonSchema = Record<string, unknown>;

const problemSchema: JsonSchema = {
  type: "object",
  description: "RFC 9457 problem details. Database errors name the violated constraint.",
  properties: {
    type: { type: "string" },
    title: { type: "string" },
    status: { type: "integer" },
    detail: { type: "string" },
    constraint: { type: "string" },
    sqlstate: { type: "string" },
    errors: {
      type: "array",
      items: { type: "object", properties: { path: { type: "string" }, message: { type: "string" } } },
    },
  },
};

function toJsonSchema(schema: z.ZodType): JsonSchema {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
  }) as JsonSchema;
  return rest;
}

export function openApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [key, raw] of Object.entries(API)) {
    const e = raw as Endpoint;
    const [method, path] = key.split(" ");
    const pathParams = [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
      name: m[1],
      in: "path",
      required: true,
      schema:
        m[1] === "id" && (path.startsWith("/relations") || path.startsWith("/trails"))
          ? { type: "string", format: "uuid" }
          : { type: "integer" },
    }));
    const queryParams: unknown[] = [];
    if (e.query) {
      const js = toJsonSchema(e.query);
      const props = (js.properties ?? {}) as Record<string, JsonSchema>;
      const required = new Set((js.required as string[] | undefined) ?? []);
      for (const [name, schema] of Object.entries(props)) {
        queryParams.push({
          name,
          in: "query",
          required: required.has(name) && schema.default === undefined,
          schema,
        });
      }
    }
    const responses: Record<string, unknown> = {
      [method === "POST" ? "201" : method === "DELETE" ? "204" : "200"]: { description: "Success" },
      "422": {
        description: "Invalid input",
        content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
      },
    };
    if (e.minRole !== "ANONYMOUS") {
      responses["401"] = {
        description: "Not signed in",
        content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
      };
      responses["403"] = {
        description: "Role too low, or blocked by row-level security",
        content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
      };
    }
    if (pathParams.length)
      responses["404"] = {
        description: "Not found",
        content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
      };
    paths[path] ??= {};
    paths[path][method.toLowerCase()] = {
      summary: e.summary,
      tags: [e.tag],
      description: `Minimum role: **${ROLE_LABEL[e.minRole]}**.${e.description ? ` ${e.description}` : ""}`,
      parameters: [...pathParams, ...queryParams],
      ...(e.body
        ? {
            requestBody: {
              required: true,
              content: { "application/json": { schema: toJsonSchema(e.body) } },
            },
          }
        : {}),
      responses,
      ...(e.minRole !== "ANONYMOUS" ? { security: [{ session: [] }] } : {}),
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Research Atlas API",
      version: "1.0.0",
      description:
        "Versioned REST API over PostgreSQL and Neo4j. Every request runs under the caller's PostgreSQL role, so the database " +
        "itself enforces access (GRANTs and row-level security). Errors are RFC 9457 problem+json and name the violated constraint.",
    },
    servers: [{ url: "/api/v1" }],
    components: {
      securitySchemes: { session: { type: "apiKey", in: "cookie", name: "ra_session" } },
      schemas: { Problem: problemSchema },
    },
    paths,
  };
}
