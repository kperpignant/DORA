import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
} from "./_generated/server";
import { api, internal } from "./_generated/api";

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

export const markGenerating = internalMutation({
  args: { issueId: v.id("issues") },
  handler: async (ctx, { issueId }) => {
    const issue = await ctx.db.get(issueId);
    if (!issue) return;
    await ctx.db.patch(issueId, {
      aiSummary: {
        ...(issue.aiSummary ?? {}),
        status: "generating",
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
    errorMessage: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { issueId, status, ...rest } = args;
    if (status === "failed") {
      await ctx.db.patch(issueId, {
        aiSummary: {
          status: "failed",
          errorMessage: rest.errorMessage ?? "Unknown error",
          model: rest.model,
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
        model: rest.model,
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
    if (!issue || issue.type !== "bug") return;
    await ctx.db.patch(issueId, {
      aiSummary: { status: "pending" },
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.aiSummaries.generate, {
      issueId,
    });
  },
});

function buildUserPrompt(
  project: {
    name: string;
    description?: string;
    summary?: {
      techStack?: string;
      targetUsers?: string;
      keyFeatures?: string;
      knownConstraints?: string;
      glossary?: string;
    };
  },
  issue: {
    title: string;
    description: string;
    priority: "low" | "medium" | "high";
    severity?: "critical" | "major" | "minor" | "trivial";
    tags?: string[];
    stepsToReproduce?: string;
  }
): string {
  const lines: string[] = [
    "You are assisting with triage and fix planning for a software bug ticket.",
    "",
    "## Project context",
    `Name: ${project.name}`,
    project.description
      ? `Description: ${project.description}`
      : "Description: (none)",
  ];
  const s = project.summary;
  if (s) {
    if (s.techStack?.trim()) lines.push(`Tech stack: ${s.techStack.trim()}`);
    if (s.targetUsers?.trim())
      lines.push(`Target users: ${s.targetUsers.trim()}`);
    if (s.keyFeatures?.trim())
      lines.push(`Key features / scope: ${s.keyFeatures.trim()}`);
    if (s.knownConstraints?.trim())
      lines.push(`Known constraints: ${s.knownConstraints.trim()}`);
    if (s.glossary?.trim()) lines.push(`Glossary / notes: ${s.glossary.trim()}`);
  } else {
    lines.push("Project summary fields: (not filled in yet)");
  }
  lines.push(
    "",
    "## Bug ticket",
    `Title: ${issue.title}`,
    `Description: ${issue.description}`,
    `Reporter-set priority: ${issue.priority}`,
    `Reporter-set severity: ${issue.severity ?? "(none)"}`,
    `Tags: ${issue.tags?.length ? issue.tags.join(", ") : "(none)"}`,
    "",
    "## Steps to reproduce",
    issue.stepsToReproduce?.trim()
      ? issue.stepsToReproduce.trim()
      : "(none provided)",
    "",
    "## Your task",
    "Based on the project context and bug fields, respond with a single JSON object (no markdown fences) with exactly these keys:",
    '- "suggestedSeverity": one of "critical", "major", "minor", "trivial"',
    '- "suggestedPriority": one of "low", "medium", "high"',
    '- "reasoning": string explaining your suggested severity and priority vs what the reporter set, and key risks',
    '- "edgeCases": array of strings — regression areas, edge cases, and things to test',
    '- "possibleSolutions": array of strings — concrete fix approaches or investigations',
    "Be concise but actionable. If information is missing, note assumptions in reasoning."
  );
  return lines.join("\n");
}

function parseSeverity(
  raw: unknown
): "critical" | "major" | "minor" | "trivial" | undefined {
  if (raw === "critical" || raw === "major" || raw === "minor" || raw === "trivial")
    return raw;
  return undefined;
}

function parsePriority(raw: unknown): "low" | "medium" | "high" | undefined {
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  return undefined;
}

function parseAiJson(content: string): {
  suggestedSeverity?: "critical" | "major" | "minor" | "trivial";
  suggestedPriority?: "low" | "medium" | "high";
  reasoning?: string;
  edgeCases?: string[];
  possibleSolutions?: string[];
} {
  const trimmed = content.trim();
  const data = JSON.parse(trimmed) as Record<string, unknown>;
  const suggestedSeverity = parseSeverity(data.suggestedSeverity);
  const suggestedPriority = parsePriority(data.suggestedPriority);
  const reasoning =
    typeof data.reasoning === "string" ? data.reasoning : undefined;
  const edgeCases = Array.isArray(data.edgeCases)
    ? data.edgeCases.filter((x): x is string => typeof x === "string")
    : undefined;
  const possibleSolutions = Array.isArray(data.possibleSolutions)
    ? data.possibleSolutions.filter((x): x is string => typeof x === "string")
    : undefined;
  return {
    suggestedSeverity,
    suggestedPriority,
    reasoning,
    edgeCases,
    possibleSolutions,
  };
}

export const generate = internalAction({
  args: { issueId: v.id("issues") },
  handler: async (ctx, { issueId }) => {
    const issue = await ctx.runQuery(api.issues.get, { id: issueId });
    if (!issue || issue.type !== "bug") return;

    await ctx.runMutation(internal.aiSummaries.markGenerating, { issueId });

    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

    if (!apiKey) {
      await ctx.runMutation(internal.aiSummaries.saveResult, {
        issueId,
        status: "failed",
        errorMessage:
          "OPENROUTER_API_KEY is not set. Add it in the Convex dashboard (npx convex env set OPENROUTER_API_KEY ...).",
      });
      return;
    }

    const project = await ctx.runQuery(api.projects.get, {
      id: issue.projectId,
    });
    if (!project) {
      await ctx.runMutation(internal.aiSummaries.saveResult, {
        issueId,
        status: "failed",
        errorMessage: "Project not found for issue.",
      });
      return;
    }

    const userContent = buildUserPrompt(project, {
      title: issue.title,
      description: issue.description,
      priority: issue.priority,
      severity: issue.severity,
      tags: issue.tags,
      stepsToReproduce: issue.stepsToReproduce,
    });

    try {
      const res = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content:
                  "You output only valid JSON objects matching the user's schema. No markdown, no prose outside JSON.",
              },
              { role: "user", content: userContent },
            ],
            response_format: { type: "json_object" },
          }),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        await ctx.runMutation(internal.aiSummaries.saveResult, {
          issueId,
          status: "failed",
          errorMessage: `OpenRouter HTTP ${res.status}: ${text.slice(0, 500)}`,
          model,
        });
        return;
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        await ctx.runMutation(internal.aiSummaries.saveResult, {
          issueId,
          status: "failed",
          errorMessage: "Empty response from OpenRouter.",
          model,
        });
        return;
      }

      let parsed: ReturnType<typeof parseAiJson>;
      try {
        parsed = parseAiJson(content);
      } catch (e) {
        await ctx.runMutation(internal.aiSummaries.saveResult, {
          issueId,
          status: "failed",
          errorMessage: `Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`,
          model,
        });
        return;
      }

      if (!parsed.suggestedSeverity || !parsed.suggestedPriority) {
        await ctx.runMutation(internal.aiSummaries.saveResult, {
          issueId,
          status: "failed",
          errorMessage:
            "Model response missing required suggestedSeverity or suggestedPriority.",
          model,
        });
        return;
      }

      await ctx.runMutation(internal.aiSummaries.saveResult, {
        issueId,
        status: "complete",
        suggestedSeverity: parsed.suggestedSeverity,
        suggestedPriority: parsed.suggestedPriority,
        reasoning: parsed.reasoning,
        edgeCases: parsed.edgeCases,
        possibleSolutions: parsed.possibleSolutions,
        model,
      });
    } catch (e) {
      await ctx.runMutation(internal.aiSummaries.saveResult, {
        issueId,
        status: "failed",
        errorMessage: e instanceof Error ? e.message : String(e),
        model,
      });
    }
  },
});

export const regenerate = action({
  args: { issueId: v.id("issues") },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.aiSummaries.scheduleGeneration, {
      issueId: args.issueId,
    });
  },
});
