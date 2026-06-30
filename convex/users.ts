import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { isAdmin, isEmailAllowed, requireAllowedUser, requireProjectAccess } from "./security";

/** Used by actions: JWT identity.email is often missing; DB user email is authoritative. */
export const assertAllowedForAction = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requireAllowedUser(ctx);
  },
});

export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      ...user,
      isAllowed: isEmailAllowed(user.email),
      isAdmin: isAdmin(user),
    };
  },
});

export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);

    const memberships = await ctx.db
      .query("projectMembers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const members = await Promise.all(
      memberships.map(async (membership) => ctx.db.get(membership.userId))
    );

    return members.filter((member): member is NonNullable<typeof member> => member !== null);
  },
});
