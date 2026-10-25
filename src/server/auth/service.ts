import "server-only";

import { withAuthDb } from "@/server/db/client";
import { hashPassword, verifyPassword } from "./password";
import { createSession } from "./session";

// Sign-up and log-in. Messages never reveal whether an email exists; a missing account still costs
// one Argon2id verification so response times do not leak it either.

export class LoginError extends Error {}

// A real Argon2id hash of a random string, verified when the email is unknown.
let dummyHash: Promise<string> | undefined;

type AuthRow = {
  user_id: string;
  password_hash: string;
  is_active: boolean;
  failed_login_count: number;
  locked_until: Date | null;
};

export async function signUp(
  input: { name: string; email: string; password: string },
  ip: string | null,
  userAgent: string | null,
) {
  const hash = await hashPassword(input.password);
  const [row] = await withAuthDb(
    (tx) =>
      tx<
        { p_user_id: string }[]
      >`CALL sp_register_user(${input.name}, ${input.email}, ${hash}, 'RESEARCHER', NULL)`,
  );
  const userId = Number(row.p_user_id);
  return { userId, ...(await createSession(userId, ip, userAgent)) };
}

export async function logIn(email: string, password: string, ip: string | null, userAgent: string | null) {
  const [row] = await withAuthDb((tx) => tx<AuthRow[]>`SELECT * FROM fn_auth_lookup(${email})`);
  if (!row) {
    dummyHash ??= hashPassword(crypto.randomUUID());
    await verifyPassword(await dummyHash, password);
    throw new LoginError("Email or password is incorrect.");
  }
  if (!row.is_active) throw new LoginError("This account has been deactivated. Contact an administrator.");
  if (row.locked_until && row.locked_until.getTime() > Date.now()) {
    throw new LoginError(`Too many failed attempts. Try again after ${lockMessage(row.locked_until)}.`);
  }
  if (!(await verifyPassword(row.password_hash, password))) {
    const [r] = await withAuthDb(
      (tx) =>
        tx<{ locked_until: Date | null }[]>`SELECT fn_record_login_failure(${row.user_id}) AS locked_until`,
    );
    if (r?.locked_until && r.locked_until.getTime() > Date.now()) {
      throw new LoginError(`Too many failed attempts. Try again after ${lockMessage(r.locked_until)}.`);
    }
    throw new LoginError("Email or password is incorrect.");
  }
  const userId = Number(row.user_id);
  return { userId, ...(await createSession(userId, ip, userAgent)) };
}

function lockMessage(until: Date): string {
  return (
    until.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) +
    " IST"
  );
}
