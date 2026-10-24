import { z } from "zod";

// Validated once at first use. DATABASE_URL and DATABASE_OWNER_URL are composed from the
// individual Postgres settings when they are not given explicitly, so .env.local only
// needs the passwords.
const schema = z.object({
  DATABASE_URL: z.url().optional(),
  DATABASE_OWNER_URL: z.url().optional(),
  POSTGRES_DB: z.string().min(1).default("researchatlas"),
  POSTGRES_HOST: z.string().min(1).default("localhost"),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_PASSWORD: z.string().min(1).optional(),
  APP_DB_PASSWORD: z.string().min(1).optional(),
  NEO4J_URI: z.string().min(1).default("bolt://localhost:7687"),
  NEO4J_USER: z.string().min(1).default("neo4j"),
  NEO4J_PASSWORD: z.string().min(8).optional(),
  OLLAMA_URL: z.url().default("http://localhost:11434"),
  EMBEDDINGS_PROVIDER: z.enum(["ollama", "transformers"]).default("ollama"),
  EMBEDDING_MODEL: z.string().min(1).default("embeddinggemma"),
  OPENALEX_API_KEY: z.string().optional(),
  OPENALEX_MAILTO: z.email().optional(),
  SEED_PASSWORD: z.string().min(8).optional(),
  SESSION_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

type Parsed = z.infer<typeof schema>;
export type Env = Parsed & { DATABASE_URL: string; DATABASE_OWNER_URL: string };

function compose(user: string, password: string | undefined, e: Parsed): string {
  const auth = password
    ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
    : encodeURIComponent(user);
  return `postgres://${auth}@${e.POSTGRES_HOST}:${e.POSTGRES_PORT}/${e.POSTGRES_DB}`;
}

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Names only: values may be secrets.
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  const e = parsed.data;
  cached = {
    ...e,
    DATABASE_URL: e.DATABASE_URL ?? compose("ra_app", e.APP_DB_PASSWORD, e),
    DATABASE_OWNER_URL: e.DATABASE_OWNER_URL ?? compose("postgres", e.POSTGRES_PASSWORD, e),
  };
  return cached;
}
