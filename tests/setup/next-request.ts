import { vi } from "vitest";

// Route handlers are called directly in tests, outside a Next.js request scope, where
// connection() (used to keep API routes out of build-time prerendering) would throw.
// Every test call already is a request-time call, so it resolves immediately here.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
