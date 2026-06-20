import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  countAdmins,
  isAdmin,
  normalizeEmail,
  requireAdmin,
} from "./security";

function withComputedAdmin(user: Doc<"users">) {
  return {
    ...user,
    isAdmin: isAdmin(user),
  };
}

export const assertAdmin = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
  },
});

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    return users.map(withComputedAdmin);
  },
});

export const setRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");

    if (args.userId === admin._id && args.role === "member") {
      throw new Error("You cannot demote yourself.");
    }

    if (isAdmin(target) && args.role === "member") {
      const adminCount = await countAdmins(ctx);
      if (adminCount <= 1) {
        throw new Error("Cannot demote the last admin.");
      }
    }

    await ctx.db.patch(args.userId, { role: args.role });
  },
});

export const removeUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");

    if (args.userId === admin._id) {
      throw new Error("You cannot remove yourself.");
    }

    if (isAdmin(target)) {
      const adminCount = await countAdmins(ctx);
      if (adminCount <= 1) {
        throw new Error("Cannot remove the last admin.");
      }
    }

    const normalizedEmail = normalizeEmail(target.email);
    if (!normalizedEmail) {
      throw new Error("User has no email and cannot be removed.");
    }

    const memberships = await ctx.db
      .query("projectMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const membership of memberships) {
      await ctx.db.delete(membership._id);
    }

    const assignedIssues = await ctx.db
      .query("issues")
      .withIndex("by_assignee", (q) => q.eq("assigneeId", args.userId))
      .collect();
    for (const issue of assignedIssues) {
      await ctx.db.patch(issue._id, {
        assigneeId: undefined,
        updatedAt: Date.now(),
      });
    }

    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", args.userId))
      .collect();
    for (const account of accounts) {
      await ctx.db.delete(account._id);
    }

    const existingBlock = await ctx.db
      .query("blockedEmails")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .first();
    if (!existingBlock) {
      await ctx.db.insert("blockedEmails", {
        email: normalizedEmail,
        blockedAt: Date.now(),
        blockedBy: admin._id,
      });
    }

    await ctx.db.delete(args.userId);
  },
});

export const listProjectMembers = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    const memberships = await ctx.db
      .query("projectMembers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const members = await Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db.get(membership.userId);
        return user ? { ...user, membershipId: membership._id } : null;
      })
    );

    return members.filter((member): member is NonNullable<typeof member> => member !== null);
  },
});

export const addProjectMember = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const existing = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", args.userId)
      )
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("projectMembers", {
      projectId: args.projectId,
      userId: args.userId,
      createdAt: Date.now(),
    });
  },
});

export const removeProjectMember = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const membership = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", args.userId)
      )
      .first();
    if (!membership) return;
    await ctx.db.delete(membership._id);
  },
});

export const listBlockedEmails = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("blockedEmails").order("desc").collect();
  },
});

export const unblockEmail = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const normalized = normalizeEmail(args.email);
    if (!normalized) throw new Error("Invalid email");

    const blocked = await ctx.db
      .query("blockedEmails")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .first();
    if (blocked) {
      await ctx.db.delete(blocked._id);
    }
  },
});

export const listProjectsForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("projects").order("desc").collect();
  },
});
