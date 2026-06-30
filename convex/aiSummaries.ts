import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  mutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { scheduleAssignmentEmail } from "./notifications";
import { requireAllowedActionUser, requireProjectAccess } from "./security";

const severityUnion = v.union(
  v.literal("critical"),
  v.literal("major"),
  v.literal("minor"),
  v.literal("trivial")
);

const priorityUnion = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high")
);

const similarIssueValidator = v.object({
  issueId: v.id("issues"),
  issueNumber: v.number(),
  title: v.string(),
  status: v.union(
    v.literal("todo"),
    v.literal("in_progress"),
    v.literal("blocked"),
    v.literal("done")
  ),
  similarity: v.number(),
  relation: v.optional(
    v.union(
      v.literal("duplicate"),
      v.literal("related"),
      v.literal("regression")
    )
  ),
  note: v.optional(v.string()),
});

export const markGenerating = internalMutation({
  args: { issueId: v.id("issues") },
  handler: async (ctx, { issueId }) => {
    const issue = await ctx.db.get(issueId);
    if (!issue) return;
    await ctx.db.patch(issueId, {
      aiSummary: {
        ...(issue.aiSummary ?? {}),
        status: "generating",
        // Reset trace at the start of a fresh run.
        steps: [],
      },
      updatedAt: Date.now(),
    });
  },
});

export const saveResult = internalMutation({
  args: {
    issueId: v.id("issues"),
    status: v.union(v.literal("complete"), v.literal("failed")),
    suggestedSeverity: v.optional(severityUnion),
    suggestedPriority: v.optional(priorityUnion),
    reasoning: v.optional(v.string()),
    edgeCases: v.optional(v.array(v.string())),
    possibleSolutions: v.optional(v.array(v.string())),
    suggestedAssigneeId: v.optional(v.id("users")),
    suggestedAssigneeReason: v.optional(v.string()),
    suggestedTags: v.optional(v.array(v.string())),
    similarIssues: v.optional(v.array(similarIssueValidator)),
    errorMessage: v.optional(v.string()),
    model: v.optional(v.string()),
    latencyMs: v.optional(v.number()),
    tokensIn: v.optional(v.number()),
    tokensOut: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { issueId, status, ...rest } = args;
    const existing = await ctx.db.get(issueId);
    const steps = existing?.aiSummary?.steps;
    if (status === "failed") {
      await ctx.db.patch(issueId, {
        aiSummary: {
          status: "failed",
          errorMessage: rest.errorMessage ?? "Unknown error",
          model: rest.model,
          steps,
          latencyMs: rest.latencyMs,
          tokensIn: rest.tokensIn,
          tokensOut: rest.tokensOut,
        },
        updatedAt: now,
      });
      return;
    }
    await ctx.db.patch(issueId, {
      aiSummary: {
        status: "complete",
        suggestedSeverity: rest.suggestedSeverity,
        suggestedPriority: rest.suggestedPriority,
        reasoning: rest.reasoning,
        edgeCases: rest.edgeCases,
        possibleSolutions: rest.possibleSolutions,
        suggestedAssigneeId: rest.suggestedAssigneeId,
        suggestedAssigneeReason: rest.suggestedAssigneeReason,
        suggestedTags: rest.suggestedTags,
        similarIssues: rest.similarIssues,
        steps,
        model: rest.model,
        latencyMs: rest.latencyMs,
        tokensIn: rest.tokensIn,
        tokensOut: rest.tokensOut,
        generatedAt: now,
      },
      updatedAt: now,
    });
  },
});

export const scheduleGeneration = internalMutation({
  args: { issueId: v.id("issues") },
  handler: async (ctx, { issueId }) => {
    const issue = await ctx.db.get(issueId);
    if (!issue) return;
    await ctx.db.patch(issueId, {
      aiSummary: { status: "pending" },
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.aiSummaries.generate, {
      issueId,
    });
  },
});

/**
 * Run the agent and persist its result. The agent itself streams
 * intermediate steps into the issue document via `appendStep`, so the
 * UI gets live updates as tool calls happen.
 */
export const generate = internalAction({
  args: { issueId: v.id("issues") },
  handler: async (ctx, { issueId }) => {
    await ctx.runMutation(internal.aiSummaries.markGenerating, { issueId });
    const start = Date.now();
    const result = await ctx.runAction(internal.aiAgent.runAgentForIssue, {
      issueId,
      record: true,
    });
    const latencyMs = Date.now() - start;
    if (result.status === "failed") {
      await ctx.runMutation(internal.aiSummaries.saveResult, {
        issueId,
        status: "failed",
        errorMessage: result.errorMessage,
        model: result.model,
        latencyMs,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
      });
      return;
    }
    await ctx.runMutation(internal.aiSummaries.saveResult, {
      issueId,
      status: "complete",
      suggestedSeverity: result.suggestedSeverity,
      suggestedPriority: result.suggestedPriority,
      reasoning: result.reasoning,
      edgeCases: result.edgeCases,
      possibleSolutions: result.possibleSolutions,
      suggestedAssigneeId: result.suggestedAssigneeId,
      suggestedAssigneeReason: result.suggestedAssigneeReason,
      suggestedTags: result.suggestedTags,
      similarIssues: result.similarIssues,
      model: result.model,
      latencyMs,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    });
  },
});

export const regenerate = action({
  args: { issueId: v.id("issues") },
  handler: async (ctx, args) => {
    await requireAllowedActionUser(ctx);
    const issue = await ctx.runQuery(internal.issues.getInternal, {
      issueId: args.issueId,
    });
    if (!issue) throw new Error("Issue not found");
    await ctx.runQuery(internal.issues.assertProjectAccess, {
      projectId: issue.projectId,
    });
    await ctx.runMutation(internal.aiSummaries.scheduleGeneration, {
      issueId: args.issueId,
    });
  },
});

// ---------------------------------------------------------------------------
// Apply-action mutations: let the user accept the agent's suggestions
// with a single click. This is the "AI as force multiplier" piece —
// the agent doesn't just describe what to do, it can *take* the
// action when the human approves.
// ---------------------------------------------------------------------------

export const applySuggestedSeverity = mutation({
  args: { issueId: v.id("issues") },
  handler: async (ctx, { issueId }) => {
    const issue = await ctx.db.get(issueId);
    if (!issue) throw new Error("Issue not found");
    await requireProjectAccess(ctx, issue.projectId);
    const sev = issue.aiSummary?.suggestedSeverity;
    if (!sev) throw new Error("No suggested severity to apply");
    await ctx.db.patch(issueId, { severity: sev, updatedAt: Date.now() });
  },
});

export const applySuggestedPriority = mutation({
  args: { issueId: v.id("issues") },
  handler: async (ctx, { issueId }) => {
    const issue = await ctx.db.get(issueId);
    if (!issue) throw new Error("Issue not found");
    await requireProjectAccess(ctx, issue.projectId);
    const pri = issue.aiSummary?.suggestedPriority;
    if (!pri) throw new Error("No suggested priority to apply");
    await ctx.db.patch(issueId, { priority: pri, updatedAt: Date.now() });
  },
});

export const applySuggestedAssignee = mutation({
  args: { issueId: v.id("issues") },
  handler: async (ctx, { issueId }) => {
    const issue = await ctx.db.get(issueId);
    if (!issue) throw new Error("Issue not found");
    const assigner = await requireProjectAccess(ctx, issue.projectId);
    const userId = issue.aiSummary?.suggestedAssigneeId;
    if (!userId) throw new Error("No suggested assignee to apply");
    const user = await ctx.db.get(userId as Id<"users">);
    if (!user) throw new Error("Suggested assignee no longer exists");
    await ctx.db.patch(issueId, {
      assigneeId: userId as Id<"users">,
      updatedAt: Date.now(),
    });
    await scheduleAssignmentEmail(ctx, {
      issueId,
      assigneeId: userId as Id<"users">,
      assignedByUserId: assigner._id,
      previousAssigneeId: issue.assigneeId,
    });
  },
});

export const applySuggestedTags = mutation({
  args: { issueId: v.id("issues") },
  handler: async (ctx, { issueId }) => {
    const issue = await ctx.db.get(issueId);
    if (!issue) throw new Error("Issue not found");
    await requireProjectAccess(ctx, issue.projectId);
    const suggested = issue.aiSummary?.suggestedTags;
    if (!suggested || suggested.length === 0) {
      throw new Error("No suggested tags to apply");
    }
    const existing = issue.tags ?? [];
    const merged = [...new Set([...existing, ...suggested])];
    await ctx.db.patch(issueId, { tags: merged, updatedAt: Date.now() });
  },
});

export const applyAllSuggestions = mutation({
  args: { issueId: v.id("issues") },
  handler: async (ctx, { issueId }) => {
    const issue = await ctx.db.get(issueId);
    if (!issue) throw new Error("Issue not found");
    const assigner = await requireProjectAccess(ctx, issue.projectId);
    const ai = issue.aiSummary;
    if (!ai || ai.status !== "complete") return;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (issue.type === "bug" && ai.suggestedSeverity) {
      patch.severity = ai.suggestedSeverity;
    }
    if (ai.suggestedPriority) patch.priority = ai.suggestedPriority;
    if (ai.suggestedAssigneeId) {
      const user = await ctx.db.get(ai.suggestedAssigneeId as Id<"users">);
      if (user) patch.assigneeId = ai.suggestedAssigneeId;
    }
    if (ai.suggestedTags && ai.suggestedTags.length > 0) {
      const existing = issue.tags ?? [];
      patch.tags = [...new Set([...existing, ...ai.suggestedTags])];
    }
    await ctx.db.patch(issueId, patch);
    if (typeof patch.assigneeId === "string") {
      await scheduleAssignmentEmail(ctx, {
        issueId,
        assigneeId: patch.assigneeId as Id<"users">,
        assignedByUserId: assigner._id,
        previousAssigneeId: issue.assigneeId,
      });
    }
  },
});
