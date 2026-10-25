import { openApiDocument } from "@/server/api/openapi";

export async function GET() {
  return Response.json(openApiDocument());
}
