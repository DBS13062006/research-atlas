# Contributing to Research Atlas

Thanks for helping. This guide covers the setup, the rules every change follows, and how to get it merged.

## Set up

```bash
cp .env.example .env.local      # choose your own container and demo passwords
pnpm install
pnpm setup:fixture              # a working atlas from the committed 200-paper fixture
pnpm dev                        # http://localhost:3000
```

Requirements: Node 24 (see `.nvmrc`), pnpm 12, Docker with Compose, and Ollama with
`ollama pull embeddinggemma` (or `EMBEDDINGS_PROVIDER=transformers`).

## Workflow

1. Branch from `main`: `feat/short-name`, `fix/short-name` or `docs/short-name`.
2. Make the change with its tests (see below).
3. Run `pnpm verify:all` with `next dev` stopped. It must exit 0.
4. Open a pull request using the template; CI must be green before it is merged.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org) with a scope, in the imperative, no trailing full stop:

```text
feat(db): add a language column to paper with an ISO 639-1 check
fix(graph): refresh co-authorship for authors touched by a sync
docs(report): add the Query Lab section
```

Types in use: `feat`, `fix`, `perf`, `test`, `docs`, `build`, `ci`, `chore`.

## Rules every change follows

**Database**
- Schema changes are new migrations in `db/migrations/` with both `-- migrate:up` and `-- migrate:down`.
  Never edit an applied migration.
- Every constraint, index and trigger has a name (`pk_`, `fk_`, `uq_`, `chk_`, `ix_`, `trg_`).
- Each new constraint gets an accepting and a refusing pgTAP test in `db/tests/10_constraints.sql`;
  the coverage meta-test fails otherwise.
- Functions set `search_path`; `SECURITY DEFINER` functions return only what they must and are granted narrowly.
- SQL lives in `db/` or in postgres.js tagged templates — never string concatenation.

**Application**
- TypeScript strict, no `any`; `pnpm lint` (Biome) clean.
- Modules under `src/server/` import `server-only`.
- New API endpoints are one entry in `src/server/api/registry.ts`; validation, the role gate, OpenAPI and the
  role-matrix test follow from it.
- Every page has loading, empty and error states, works by keyboard and in both themes, and passes axe-core.

**Data and secrets**
- Never commit `.env.local` or any secret; `.env.example` holds placeholders only.
- Prefer real data from the database over hard-coded examples.

## Regenerating generated files

| Changed                   | Run                                        |
| ------------------------- | ------------------------------------------ |
| schema or catalog queries | `pnpm docs:catalog` and `pnpm docs:schema` |
| ER model                  | `pnpm docs:er`                             |
| pages or styling          | `pnpm docs:screenshots` (server running)   |
| corpus counts or diagram  | `pnpm docs:brand`                          |
| any chapter               | `pnpm docs:report`                         |
