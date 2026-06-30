import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { isAdmin, requireProjectAccess } from "./security";

export const listByIssue = query({
  args: { issueId: v.id("issues") },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) return [];

    await requireProjectAccess(ctx, issue.projectId);

    const comments = await ctx.db
      .query("comments")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .order("asc")
      .collect();

    return await Promise.all(
      comments.map(async (comment) => {
        const author = await ctx.db.get(comment.authorId);
        return { ...comment, author };
      })
    );
  },
});

export const create = mutation({
  args: {
    issueId: v.id("issues"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Issue not found");

    const user = await requireProjectAccess(ctx, issue.projectId);

    const body = args.body.trim();
    if (!body) throw new Error("Comment cannot be empty");

    const now = Date.now();
    return await ctx.db.insert("comments", {
      issueId: args.issueId,
      projectId: issue.projectId,
      authorId: user._id,
      body,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("comments") },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.id);
    if (!comment) throw new Error("Comment not found");

    const user = await requireProjectAccess(ctx, comment.projectId);

    if (comment.authorId !== user._id && !isAdmin(user)) {
      throw new Error("You can only delete your own comments");
    }

    await ctx.db.delete(args.id);
  },
});
