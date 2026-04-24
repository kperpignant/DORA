import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  projects: defineTable({
    name: v.string(),
    key: v.string(),
    description: v.optional(v.string()),
    summary: v.optional(
      v.object({
        techStack: v.optional(v.string()),
        targetUsers: v.optional(v.string()),
        keyFeatures: v.optional(v.string()),
        knownConstraints: v.optional(v.string()),
        glossary: v.optional(v.string()),
      })
    ),
    createdAt: v.number(),
  }).index("by_key", ["key"]),

  issues: defineTable({
    projectId: v.id("projects"),
    issueNumber: v.number(),
    type: v.union(v.literal("task"), v.literal("bug")),
    title: v.string(),
    description: v.string(),
    status: v.union(v.literal("todo"), v.literal("in_progress"), v.literal("done")),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    // Type-specific fields
    estimate: v.optional(v.string()), // For tasks
    stepsToReproduce: v.optional(v.string()), // For bugs
    severity: v.optional(v.union(
      v.literal("critical"),
      v.literal("major"),
      v.literal("minor"),
      v.literal("trivial")
    )), // For bugs
    // Tags
    tags: v.optional(v.array(v.string())),
    // Assignee
    assigneeId: v.optional(v.id("users")),
    aiSummary: v.optional(
      v.object({
        status: v.union(
          v.literal("pending"),
          v.literal("generating"),
          v.literal("complete"),
          v.literal("failed")
        ),
        suggestedSeverity: v.optional(
          v.union(
            v.literal("critical"),
            v.literal("major"),
            v.literal("minor"),
            v.literal("trivial")
          )
        ),
        suggestedPriority: v.optional(
          v.union(v.literal("low"), v.literal("medium"), v.literal("high"))
        ),
        reasoning: v.optional(v.string()),
        edgeCases: v.optional(v.array(v.string())),
        possibleSolutions: v.optional(v.array(v.string())),
        errorMessage: v.optional(v.string()),
        model: v.optional(v.string()),
        generatedAt: v.optional(v.number()),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_and_number", ["projectId", "issueNumber"])
    .index("by_assignee", ["assigneeId"]),
});
