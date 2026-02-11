import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  projects: defineTable({
    name: v.string(),
    key: v.string(),
    description: v.optional(v.string()),
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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_and_number", ["projectId", "issueNumber"])
    .index("by_assignee", ["assigneeId"]),
});
