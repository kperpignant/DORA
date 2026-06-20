import { getAuthUserId } from "@convex-dev/auth/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const ACCESS_DENIED_MESSAGE = "This Google account is not allowed to access DORA.";
const BLOCKED_MESSAGE = "This account has been removed from DORA.";
const ADMIN_REQUIRED_MESSAGE = "Admin access is required.";
const PROJECT_ACCESS_DENIED_MESSAGE = "You do not have access to this project.";

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

export function adminEmailsFromEnv(): Set<string> {
  return parseAllowedEmails(process.env.ADMIN_EMAILS);
}

export function isEmailAllowed(
  email: string | undefined,
  allowedEmails: ReadonlySet<string> = allowedEmailsFromEnv()
): boolean {
  const normalized = normalizeEmail(email);
  return normalized !== null && allowedEmails.has(normalized);
}

export function isAdminEmail(
  email: string | undefined,
  adminEmails: ReadonlySet<string> = adminEmailsFromEnv()
): boolean {
  const normalized = normalizeEmail(email);
  return normalized !== null && adminEmails.has(normalized);
}

export function isAdmin(user: Doc<"users">): boolean {
  return user.role === "admin" || isAdminEmail(user.email);
}

export function assertEmailAllowed(email: string | undefined): void {
  if (!isEmailAllowed(email)) {
    throw new Error(ACCESS_DENIED_MESSAGE);
  }
}

export async function isEmailBlocked(
  ctx: QueryCtx | MutationCtx,
  email: string | undefined
): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const blocked = await ctx.db
    .query("blockedEmails")
    .withIndex("by_email", (q) => q.eq("email", normalized))
    .first();
  return blocked !== null;
}

export async function assertEmailNotBlocked(
  ctx: QueryCtx | MutationCtx,
  email: string | undefined
): Promise<void> {
  if (await isEmailBlocked(ctx, email)) {
    throw new Error(BLOCKED_MESSAGE);
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
  await assertEmailNotBlocked(ctx, user.email);
  return user;
}

export async function requireAllowedActionUser(ctx: ActionCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Sign in is required to access DORA.");
  }

  assertEmailAllowed(identity.email);
}

export async function requireAdmin(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const user = await requireAllowedUser(ctx);
  if (!isAdmin(user)) {
    throw new Error(ADMIN_REQUIRED_MESSAGE);
  }
  return user;
}

export async function userHasProjectAccess(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  projectId: Id<"projects">
): Promise<boolean> {
  if (isAdmin(user)) return true;
  const membership = await ctx.db
    .query("projectMembers")
    .withIndex("by_project_and_user", (q) =>
      q.eq("projectId", projectId).eq("userId", user._id)
    )
    .first();
  return membership !== null;
}

export async function requireProjectAccess(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">
): Promise<Doc<"users">> {
  const user = await requireAllowedUser(ctx);
  if (await userHasProjectAccess(ctx, user, projectId)) {
    return user;
  }
  throw new Error(PROJECT_ACCESS_DENIED_MESSAGE);
}

export async function countAdmins(ctx: QueryCtx | MutationCtx): Promise<number> {
  const users = await ctx.db.query("users").collect();
  return users.filter((user) => isAdmin(user)).length;
}
