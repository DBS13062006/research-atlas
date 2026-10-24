# Research Atlas

See how an idea travelled. Research Atlas maps research papers by meaning, links them by citation and lineage, and enforces its rules inside the database.

DBMS mini-project, PES University (Aug–Dec 2026) — Daruru Bhuvan Sai (PES1UG24AM356) and Deeptanshu Kumar (PES1UG24AM357).

> Work in progress. The full README (feature tour, architecture, quickstart and rubric map) lands with the documentation phase.

## Stack

PostgreSQL 18 (system of record, RBAC and row-level security) · Neo4j 2026.09 (knowledge graph and vector index) · Next.js 16.4 · Ollama embeddings.

## Quickstart (development)

```bash
cp .env.example .env.local   # fill in the passwords and keys
pnpm install
pnpm db:up
pnpm dev
```

## Licence

MIT. Data credits are listed in the documentation.
