import { getAuthUserId } from "@convex-dev/auth/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const ACCESS_DENIED_MESSAGE = "This Google account is not allowed to access DORA.";

export function normalizeEmail(email: string | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized ? normalized : null;
}

export function parseAllowedEmails(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => normalizeEmail(email))
      .filter((email): email is string => email !== null)
  );
}

export function allowedEmailsFromEnv(): Set<string> {
  return parseAllowedEmails(process.env.ALLOWED_EMAILS);
}

export function isEmailAllowed(
  email: string | undefined,
  allowedEmails: ReadonlySet<string> = allowedEmailsFromEnv()
): boolean {
  const normalized = normalizeEmail(email);
  return normalized !== null && allowedEmails.has(normalized);
}

export function assertEmailAllowed(email: string | undefined): void {
  if (!isEmailAllowed(email)) {
    throw new Error(ACCESS_DENIED_MESSAGE);
  }
}

export async function requireAllowedUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Sign in is required to access DORA.");
  }

  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("Signed-in user could not be found.");
  }

  assertEmailAllowed(user.email);
  return user;
}

export async function requireAllowedActionUser(ctx: ActionCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Sign in is required to access DORA.");
  }

  assertEmailAllowed(identity.email);
}
