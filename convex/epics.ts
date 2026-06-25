import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireProjectAccess } from "./security";

async function getEpicProgress(ctx: QueryCtx, epicId: Id<"epics">) {
  const issues = await ctx.db
    .query("issues")
    .withIndex("by_epic", (q) => q.eq("epicId", epicId))
    .collect();

  const issueCount = issues.length;
  const doneCount = issues.filter((issue) => issue.status === "done").length;

  return { issueCount, doneCount };
}

async function attachAssignees(ctx: QueryCtx, issues: Doc<"issues">[]) {
  return await Promise.all(
    issues.map(async (issue) => {
      const assignee = issue.assigneeId
        ? await ctx.db.get(issue.assigneeId)
        : null;
      return { ...issue, assignee };
    })
  );
}

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const epics = await ctx.db
      .query("epics")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();

    return await Promise.all(
      epics.map(async (epic) => {
        const { issueCount, doneCount } = await getEpicProgress(ctx, epic._id);
        return { ...epic, issueCount, doneCount };
      })
    );
  },
});

export const get = query({
  args: { id: v.id("epics") },
  handler: async (ctx, args) => {
    const epic = await ctx.db.get(args.id);
    if (!epic) return null;

    await requireProjectAccess(ctx, epic.projectId);

    const { issueCount, doneCount } = await getEpicProgress(ctx, epic._id);
    return { ...epic, issueCount, doneCount };
  },
});

export const listIssues = query({
  args: { epicId: v.id("epics") },
  handler: async (ctx, args) => {
    const epic = await ctx.db.get(args.epicId);
    if (!epic) return [];

    await requireProjectAccess(ctx, epic.projectId);

    const issues = await ctx.db
      .query("issues")
      .withIndex("by_epic", (q) => q.eq("epicId", args.epicId))
      .order("desc")
      .collect();

    return await attachAssignees(ctx, issues);
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    status: v.union(
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("done")
    ),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);

    const existingEpics = await ctx.db
      .query("epics")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const maxNumber = existingEpics.reduce(
      (max, epic) => Math.max(max, epic.epicNumber),
      0
    );

    const now = Date.now();
    return await ctx.db.insert("epics", {
      projectId: args.projectId,
      epicNumber: maxNumber + 1,
      name: args.name,
      description: args.description,
      color: args.color,
      status: args.status,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("epics"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("planned"),
        v.literal("in_progress"),
        v.literal("done")
      )
    ),
  },
  handler: async (ctx, args) => {
    const epic = await ctx.db.get(args.id);
    if (!epic) throw new Error("Epic not found");

    await requireProjectAccess(ctx, epic.projectId);

    const { id, ...updates } = args;
    const patchData: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (updates.name !== undefined) patchData.name = updates.name;
    if (updates.description !== undefined) patchData.description = updates.description;
    if (updates.color !== undefined) patchData.color = updates.color;
    if (updates.status !== undefined) patchData.status = updates.status;

    await ctx.db.patch(id, patchData);
  },
});

export const remove = mutation({
  args: { id: v.id("epics") },
  handler: async (ctx, args) => {
    const epic = await ctx.db.get(args.id);
    if (!epic) throw new Error("Epic not found");

    await requireProjectAccess(ctx, epic.projectId);

    const issues = await ctx.db
      .query("issues")
      .withIndex("by_epic", (q) => q.eq("epicId", args.id))
      .collect();

    for (const issue of issues) {
      await ctx.db.patch(issue._id, {
        epicId: undefined,
        updatedAt: Date.now(),
      });
    }

    await ctx.db.delete(args.id);
  },
});

export const setIssueEpic = mutation({
  args: {
    issueId: v.id("issues"),
    epicId: v.union(v.id("epics"), v.null()),
  },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Issue not found");

    await requireProjectAccess(ctx, issue.projectId);

    if (args.epicId !== null) {
      const epic = await ctx.db.get(args.epicId);
      if (!epic) throw new Error("Epic not found");
      if (epic.projectId !== issue.projectId) {
        throw new Error("Epic and issue must belong to the same project");
      }
    }

    await ctx.db.patch(args.issueId, {
      epicId: args.epicId ?? undefined,
      updatedAt: Date.now(),
    });
  },
});
