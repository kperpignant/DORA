import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const projectSummaryValidator = v.object({
  techStack: v.optional(v.string()),
  targetUsers: v.optional(v.string()),
  keyFeatures: v.optional(v.string()),
  knownConstraints: v.optional(v.string()),
  glossary: v.optional(v.string()),
});

function normalizeSummary(
  input: {
    techStack?: string;
    targetUsers?: string;
    keyFeatures?: string;
    knownConstraints?: string;
    glossary?: string;
  }
) {
  const techStack = input.techStack?.trim();
  const targetUsers = input.targetUsers?.trim();
  const keyFeatures = input.keyFeatures?.trim();
  const knownConstraints = input.knownConstraints?.trim();
  const glossary = input.glossary?.trim();
  const out: {
    techStack?: string;
    targetUsers?: string;
    keyFeatures?: string;
    knownConstraints?: string;
    glossary?: string;
  } = {};
  if (techStack) out.techStack = techStack;
  if (targetUsers) out.targetUsers = targetUsers;
  if (keyFeatures) out.keyFeatures = keyFeatures;
  if (knownConstraints) out.knownConstraints = knownConstraints;
  if (glossary) out.glossary = glossary;
  return Object.keys(out).length > 0 ? out : undefined;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("projects").order("desc").collect();
  },
});

export const get = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByKey = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    key: v.string(),
    description: v.optional(v.string()),
    summary: v.optional(projectSummaryValidator),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (existing) {
      throw new Error(`Project with key "${args.key}" already exists`);
    }

    return await ctx.db.insert("projects", {
      name: args.name,
      key: args.key.toUpperCase(),
      description: args.description,
      summary: args.summary ? normalizeSummary(args.summary) : undefined,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    summary: v.optional(projectSummaryValidator),
  },
  handler: async (ctx, args) => {
    const { id, summary, name, description } = args;
    const patch: {
      name?: string;
      description?: string;
      summary?: ReturnType<typeof normalizeSummary>;
    } = {};
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description;
    if (summary !== undefined) {
      patch.summary = normalizeSummary(summary);
    }
    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    // Delete all issues associated with this project
    const issues = await ctx.db
      .query("issues")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();

    for (const issue of issues) {
      await ctx.db.delete(issue._id);
    }

    await ctx.db.delete(args.id);
  },
});
