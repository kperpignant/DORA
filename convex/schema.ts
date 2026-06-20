import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(v.union(v.literal("admin"), v.literal("member"))),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  projectMembers: defineTable({
    projectId: v.id("projects"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_user", ["userId"])
    .index("by_project_and_user", ["projectId", "userId"]),

  blockedEmails: defineTable({
    email: v.string(),
    blockedAt: v.number(),
    blockedBy: v.id("users"),
  }).index("by_email", ["email"]),

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
    codeLog: v.optional(v.string()),
    status: v.union(
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("blocked"),
      v.literal("done")
    ),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    // Type-specific fields
    estimate: v.optional(v.string()), // For tasks
    stepsToReproduce: v.optional(v.string()), // For bugs
    expectedResult: v.optional(v.string()), // For bugs: what should happen
    actualResult: v.optional(v.string()), // For bugs: what actually happens
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
    // Embedding of title + description for RAG over past issues.
    // Optional so backfill can run async; nullable allows "tried but no key" state.
    embedding: v.optional(v.array(v.number())),
    embeddingModel: v.optional(v.string()),
    embeddedAt: v.optional(v.number()),
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
        // Suggested assignee derived from prior closers of similar bugs.
        suggestedAssigneeId: v.optional(v.id("users")),
        suggestedAssigneeReason: v.optional(v.string()),
        // Related/duplicate/regression candidates the agent surfaced via RAG.
        similarIssues: v.optional(
          v.array(
            v.object({
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
            })
          )
        ),
        // Full agent trace: each tool call the agent decided to make.
        steps: v.optional(
          v.array(
            v.object({
              kind: v.union(
                v.literal("thought"),
                v.literal("tool_call"),
                v.literal("tool_result"),
                v.literal("final")
              ),
              tool: v.optional(v.string()),
              input: v.optional(v.string()),
              output: v.optional(v.string()),
              timestamp: v.number(),
            })
          )
        ),
        latencyMs: v.optional(v.number()),
        tokensIn: v.optional(v.number()),
        tokensOut: v.optional(v.number()),
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
    .index("by_assignee", ["assigneeId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["projectId", "type"],
    }),

  attachments: defineTable({
    issueId: v.id("issues"),
    projectId: v.id("projects"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    kind: v.union(
      v.literal("image"),
      v.literal("log"),
      v.literal("video"),
      v.literal("other")
    ),
    uploadedBy: v.id("users"),
    uploadedAt: v.number(),
  }).index("by_issue", ["issueId"]),
});
