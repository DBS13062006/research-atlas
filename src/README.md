# `src/` — the application

Next.js 16.4 (App Router, Cache Components) in strict TypeScript.

```text
src/
├── app/                     routes
│   ├── (auth)/              sign-in and sign-up
│   ├── api/v1/              REST endpoints: one-line handlers over the shared registry
│   ├── atlas, search, papers, authors, topics, explore, integrity, trails
│   ├── library, account     signed-in pages
│   ├── curate, admin        curator and administrator consoles
│   └── lab                  Query Lab and Cypher Lab
├── components/
│   ├── shell/               header, footer, navigation, command palette, theme
│   ├── common/              page headers and the loading, empty and error states
│   ├── atlas, graph, charts the map canvas, d3 graphs, charts
│   ├── paper, library, lab, topics, auth   feature components
│   └── ui/                  shadcn/ui primitives on Base UI
├── lib/                     code shared by server and client: Zod schemas, roles, formatting, API client
├── server/                  server-only code
│   ├── auth/                passwords, sessions, the data access layer
│   ├── db/                  the role-switching client and SQLSTATE → problem mapping
│   ├── graph/               Neo4j driver, outbox projection, relations, trails
│   ├── api/                 endpoint registry, handler wrapper, OpenAPI document
│   ├── services/            the SQL and Cypher behind pages and endpoints
│   └── embeddings/          Ollama and Transformers.js providers
└── proxy.ts                 redirects anonymous visitors from signed-in pages (convenience, not security)
```

## Conventions

- Pages are server components; data comes from `src/server/services`, cached with `"use cache"` and a tag when
  it is the same for every visitor.
- Every database call goes through `withDb(ctx, …)`, which switches to the caller's PostgreSQL role for one
  transaction. Access decisions belong to PostgreSQL.
- A new endpoint is one registry entry plus a one-line route; validation, the role gate, OpenAPI and the role
  matrix test follow.
- `src/server/**` imports `server-only`; client components import types from it, never values.
