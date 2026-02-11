import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const issues = await ctx.db
      .query("issues")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();

    // Fetch assignee info for each issue
    const issuesWithAssignees = await Promise.all(
      issues.map(async (issue) => {
        const assignee = issue.assigneeId
          ? await ctx.db.get(issue.assigneeId)
          : null;
        return { ...issue, assignee };
      })
    );

    return issuesWithAssignees;
  },
});

export const search = query({
  args: {
    projectId: v.id("projects"),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const issues = await ctx.db
      .query("issues")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();

    const searchLower = args.query.toLowerCase().trim();

    // Filter issues by search query (title, description, tags)
    const filtered = issues.filter((issue) => {
      const titleMatch = issue.title.toLowerCase().includes(searchLower);
      const descMatch = issue.description.toLowerCase().includes(searchLower);
      const tagsMatch = issue.tags?.some((tag) =>
        tag.toLowerCase().includes(searchLower)
      );
      return titleMatch || descMatch || tagsMatch;
    });

    // Fetch assignee info for each issue
    const issuesWithAssignees = await Promise.all(
      filtered.map(async (issue) => {
        const assignee = issue.assigneeId
          ? await ctx.db.get(issue.assigneeId)
          : null;
        return { ...issue, assignee };
      })
    );

    return issuesWithAssignees;
  },
});

export const get = query({
  args: { id: v.id("issues") },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.id);
    if (!issue) return null;

    const assignee = issue.assigneeId
      ? await ctx.db.get(issue.assigneeId)
      : null;

    return { ...issue, assignee };
  },
});

export const getByProjectAndNumber = query({
  args: {
    projectId: v.id("projects"),
    issueNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const issue = await ctx.db
      .query("issues")
      .withIndex("by_project_and_number", (q) =>
        q.eq("projectId", args.projectId).eq("issueNumber", args.issueNumber)
      )
      .first();

    if (!issue) return null;

    const assignee = issue.assigneeId
      ? await ctx.db.get(issue.assigneeId)
      : null;

    return { ...issue, assignee };
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    type: v.union(v.literal("task"), v.literal("bug")),
    title: v.string(),
    description: v.string(),
    status: v.union(v.literal("todo"), v.literal("in_progress"), v.literal("done")),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    estimate: v.optional(v.string()),
    stepsToReproduce: v.optional(v.string()),
    severity: v.optional(v.union(
      v.literal("critical"),
      v.literal("major"),
      v.literal("minor"),
      v.literal("trivial")
    )),
    tags: v.optional(v.array(v.string())),
    assigneeId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // Get the next issue number for this project
    const existingIssues = await ctx.db
      .query("issues")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const maxNumber = existingIssues.reduce(
      (max, issue) => Math.max(max, issue.issueNumber),
      0
    );

    const now = Date.now();
    return await ctx.db.insert("issues", {
      projectId: args.projectId,
      issueNumber: maxNumber + 1,
      type: args.type,
      title: args.title,
      description: args.description,
      status: args.status,
      priority: args.priority,
      estimate: args.type === "task" ? args.estimate : undefined,
      stepsToReproduce: args.type === "bug" ? args.stepsToReproduce : undefined,
      severity: args.type === "bug" ? args.severity : undefined,
      tags: args.tags,
      assigneeId: args.assigneeId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("issues"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.union(v.literal("todo"), v.literal("in_progress"), v.literal("done"))),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    estimate: v.optional(v.string()),
    stepsToReproduce: v.optional(v.string()),
    severity: v.optional(v.union(
      v.literal("critical"),
      v.literal("major"),
      v.literal("minor"),
      v.literal("trivial")
    )),
    tags: v.optional(v.array(v.string())),
    assigneeId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    
    // Build the update object, only including defined values
    const patchData: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (updates.title !== undefined) patchData.title = updates.title;
    if (updates.description !== undefined) patchData.description = updates.description;
    if (updates.status !== undefined) patchData.status = updates.status;
    if (updates.priority !== undefined) patchData.priority = updates.priority;
    if (updates.estimate !== undefined) patchData.estimate = updates.estimate;
    if (updates.stepsToReproduce !== undefined) patchData.stepsToReproduce = updates.stepsToReproduce;
    if (updates.severity !== undefined) patchData.severity = updates.severity;
    if (updates.tags !== undefined) patchData.tags = updates.tags;
    if (updates.assigneeId !== undefined) patchData.assigneeId = updates.assigneeId;

    await ctx.db.patch(id, patchData);
  },
});

export const clearAssignee = mutation({
  args: { id: v.id("issues") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      assigneeId: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("issues") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
