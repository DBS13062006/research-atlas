// Maps PostgreSQL errors to HTTP problems (RFC 9457). The response names the violated rule in plain
// words, which doubles as a live constraint demo in the API docs and the Query Lab.

export type Problem = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  constraint?: string;
  sqlstate?: string;
  errors?: { path: string; message: string }[];
};

type PgLikeError = {
  code?: string;
  constraint_name?: string;
  constraint?: string;
  message?: string;
  detail?: string;
};

const STATUS_BY_SQLSTATE: Record<string, { status: number; title: string }> = {
  "23505": { status: 409, title: "Already exists" },
  "23001": { status: 409, title: "Still in use" },
  "23503": { status: 422, title: "Refers to something that does not exist" },
  "23514": { status: 422, title: "Breaks a data rule" },
  "23502": { status: 422, title: "A required value is missing" },
  "22023": { status: 400, title: "Invalid parameter" },
  "22P02": { status: 400, title: "Invalid value" },
  "42501": { status: 403, title: "Not allowed" },
  P0001: { status: 400, title: "Rejected by the database" },
  P0002: { status: 404, title: "Not found" },
  RA001: { status: 409, title: "Email already registered" },
  RA002: { status: 409, title: "The last administrator cannot be removed" },
};

// Plain-language explanations for the constraints a user is most likely to hit.
const CONSTRAINT_TEXT: Record<string, string> = {
  chk_no_self_citation: "A paper cannot cite itself.",
  trg_retraction_date_guard: "A retraction cannot be dated before the paper was published.",
  trg_topic_hierarchy_guard:
    "A topic must sit exactly one level below its parent, and cannot become its own ancestor.",
  uq_user_account_email: "An account with this email already exists.",
  uq_user_collection_name: "You already have a collection with this name.",
  uq_paper_doi: "Another paper already has this DOI.",
  uq_one_primary_topic: "A paper can have only one primary topic.",
  uq_paper_author_order: "Two authors cannot share the same position on a paper.",
  chk_user_account_password_is_argon2id: "Only Argon2id password hashes can be stored.",
  trg_protect_last_admin: "There must always be at least one active administrator.",
  trg_note_owner_immutable: "A note cannot be moved to another user or paper.",
  fk_paper_author_author: "This author still has papers.",
  fk_paper_topic_topic: "This topic still has papers.",
};

export function isPgError(err: unknown): err is PgLikeError & Error {
  return (
    err instanceof Error &&
    typeof (err as PgLikeError).code === "string" &&
    /^[0-9A-Z]{5}$/.test((err as PgLikeError).code ?? "")
  );
}

export function problemFromDbError(err: unknown): Problem | null {
  if (!isPgError(err)) return null;
  const code = err.code as string;
  const mapped =
    STATUS_BY_SQLSTATE[code] ?? (code.startsWith("23") ? { status: 422, title: "Breaks a data rule" } : null);
  if (!mapped) return null;
  const constraint = err.constraint_name ?? err.constraint;
  const permissionDenied = code === "42501";
  return {
    type: `https://research-atlas.test/problems/sqlstate-${code.toLowerCase()}`,
    title: mapped.title,
    status: mapped.status,
    detail:
      (constraint && CONSTRAINT_TEXT[constraint]) ??
      (permissionDenied ? "Your role does not have permission for this action." : err.message),
    ...(constraint ? { constraint } : {}),
    sqlstate: code,
  };
}
