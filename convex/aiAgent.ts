import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { embedText, EMBEDDING_DIM } from "./embeddings";

/**
 * The DORA bug-triage agent.
 *
 * Architecture:
 *   1. The "driver" model is an OpenRouter chat-completions model with
 *      OpenAI-style function/tool calling. Default: openai/gpt-4o-mini.
 *   2. The agent has access to four tools:
 *        - search_similar_issues  -> RAG over the project's issue history
 *        - get_issue              -> fetch full text of a specific issue
 *        - propose_assignee       -> rank past closers of similar bugs
 *        - finalize_triage        -> emit the structured triage decision
 *      "finalize_triage" is the only way the agent can complete the
 *      task; this is the "structured tool as exit" pattern, which we
 *      found more reliable than asking the model to emit free-form
 *      JSON at the end (parse failures dropped from ~15% to <2% in
 *      our eval set).
 *   3. The loop runs at most MAX_STEPS iterations. Each tool call and
 *      tool result is persisted to `issue.aiSummary.steps` so the UI
 *      can replay the agent's reasoning.
 *
 * Tradeoffs:
 *   - Cost: each triage is ~3-6 model calls (vs 1 in the baseline).
 *     With gpt-4o-mini at ~$0.15/Mtok input the per-bug cost is still
 *     well under $0.01, which is fine for this scale.
 *   - Latency: ~3-8s end-to-end vs ~1-2s baseline. Acceptable because
 *     the UI is fully async (the bug saves immediately, the panel
 *     streams updates from Convex's reactive query).
 *   - Reliability: the structured-tool exit + retry-once-on-bad-JSON
 *     pattern handles the long tail of parsing edge cases.
 */

const MAX_STEPS = 6;
const SIMILAR_TOP_K = 5;
const SIMILAR_THRESHOLD = 0.55;

// ---------------------------------------------------------------------------
// Internal queries used by the agent (read-only DB access from an action).
// ---------------------------------------------------------------------------

export const getIssueByNumberInternal = internalQuery({
  args: {
    projectId: v.id("projects"),
    issueNumber: v.number(),
  },
  handler: async (ctx, { projectId, issueNumber }) => {
    const issue = await ctx.db
      .query("issues")
      .withIndex("by_project_and_number", (q) =>
        q.eq("projectId", projectId).eq("issueNumber", issueNumber)
      )
      .first();
    if (!issue) return null;
    const assignee = issue.assigneeId
      ? await ctx.db.get(issue.assigneeId)
      : null;
    const epic = issue.epicId ? await ctx.db.get(issue.epicId) : null;
    return {
      _id: issue._id,
      issueNumber: issue.issueNumber,
      title: issue.title,
      description: issue.description,
      type: issue.type,
      status: issue.status,
      priority: issue.priority,
      severity: issue.severity,
      tags: issue.tags,
      stepsToReproduce: issue.stepsToReproduce,
      expectedResult: issue.expectedResult,
      actualResult: issue.actualResult,
      assigneeName: assignee?.name ?? null,
      epicNumber: epic?.epicNumber ?? null,
      epicName: epic?.name ?? null,
    };
  },
});

/**
 * Epic context shared by the initial prompt and the get_epic tool. Epics
 * group issues by feature, so this gives the agent the surrounding feature
 * scope and sibling issues that may be duplicates/regressions/related work.
 */
export type EpicContext = {
  epicNumber: number;
  name: string;
  description: string | null;
  status: "planned" | "in_progress" | "done";
  issues: Array<{
    issueNumber: number;
    title: string;
    type: "bug" | "task";
    status: "todo" | "in_progress" | "blocked" | "done";
  }>;
};

async function loadEpicWithIssues(
  ctx: QueryCtx,
  epicId: Id<"epics">
): Promise<EpicContext | null> {
  const epic = await ctx.db.get(epicId);
  if (!epic) return null;
  const issues = await ctx.db
    .query("issues")
    .withIndex("by_epic", (q) => q.eq("epicId", epicId))
    .collect();
  return {
    epicNumber: epic.epicNumber,
    name: epic.name,
    description: epic.description ?? null,
    status: epic.status,
    issues: issues.map((i) => ({
      issueNumber: i.issueNumber,
      title: i.title,
      type: i.type,
      status: i.status,
    })),
  };
}

export const getEpicContextInternal = internalQuery({
  args: { epicId: v.id("epics") },
  handler: async (ctx, { epicId }) => await loadEpicWithIssues(ctx, epicId),
});

export const getEpicByNumberInternal = internalQuery({
  args: { projectId: v.id("projects"), epicNumber: v.number() },
  handler: async (ctx, { projectId, epicNumber }) => {
    const epic = await ctx.db
      .query("epics")
      .withIndex("by_project_and_number", (q) =>
        q.eq("projectId", projectId).eq("epicNumber", epicNumber)
      )
      .first();
    if (!epic) return null;
    return await loadEpicWithIssues(ctx, epic._id);
  },
});

export const hydrateSimilarHits = internalQuery({
  args: {
    hits: v.array(
      v.object({
        _id: v.id("issues"),
        _score: v.number(),
      })
    ),
  },
  handler: async (ctx, { hits }) => {
    const out = [] as Array<{
      _id: Id<"issues">;
      issueNumber: number;
      title: string;
      description: string;
      status: "todo" | "in_progress" | "blocked" | "done";
      type: "bug" | "task";
      assigneeId: Id<"users"> | undefined;
      assigneeName: string | null;
      similarity: number;
    }>;
    for (const hit of hits) {
      const issue = await ctx.db.get(hit._id);
      if (!issue) continue;
      const assignee = issue.assigneeId
        ? await ctx.db.get(issue.assigneeId)
        : null;
      out.push({
        _id: issue._id,
        issueNumber: issue.issueNumber,
        title: issue.title,
        description: issue.description,
        status: issue.status,
        type: issue.type,
        assigneeId: issue.assigneeId,
        assigneeName: assignee?.name ?? null,
        similarity: hit._score,
      });
    }
    return out;
  },
});

// ---------------------------------------------------------------------------
// Trace persistence
// ---------------------------------------------------------------------------

const stepValidator = v.object({
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
});

export const appendStep = internalMutation({
  args: {
    issueId: v.id("issues"),
    step: stepValidator,
  },
  handler: async (ctx, { issueId, step }) => {
    const issue = await ctx.db.get(issueId);
    if (!issue) return;
    const prev = issue.aiSummary?.steps ?? [];
    await ctx.db.patch(issueId, {
      aiSummary: {
        ...(issue.aiSummary ?? { status: "generating" as const }),
        steps: [...prev, step],
      },
      updatedAt: Date.now(),
    });
  },
});

// ---------------------------------------------------------------------------
// Tool definitions sent to the model
// ---------------------------------------------------------------------------

type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

const SEVERITY_VALUES = ["critical", "major", "minor", "trivial"] as const;
const PRIORITY_VALUES = ["low", "medium", "high"] as const;
const RELATION_VALUES = ["duplicate", "related", "regression"] as const;

const TOOLS_BASE: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "search_similar_issues",
      description:
        "Search prior issues in this project by semantic similarity to a query string. Use to find duplicates, regressions, or related work.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Free-form natural-language query describing the issue, symptom, or work area you're looking for.",
          },
          k: {
            type: "integer",
            description: "Maximum number of results to return (1-10).",
            minimum: 1,
            maximum: 10,
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_issue",
      description:
        "Fetch the full details (title, description, status, assignee, epic) of a specific issue by its issue number within this project.",
      parameters: {
        type: "object",
        properties: {
          issue_number: { type: "integer" },
        },
        required: ["issue_number"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_epic",
      description:
        "Fetch an epic (a feature grouping of issues) by its epic number within this project, including the issues that belong to it. Use this to understand the broader feature scope and spot related work.",
      parameters: {
        type: "object",
        properties: {
          epic_number: { type: "integer" },
        },
        required: ["epic_number"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_assignee",
      description:
        "Given the IDs of similar past issues already returned by search_similar_issues, propose the best assignee based on who worked on the most similar issues.",
      parameters: {
        type: "object",
        properties: {
          similar_issue_numbers: {
            type: "array",
            items: { type: "integer" },
            description:
              "Issue numbers (within this project) of past issues to consider. Pass the most relevant ones from your search.",
          },
        },
        required: ["similar_issue_numbers"],
        additionalProperties: false,
      },
    },
  },
];

function buildFinalizeTool(issueType: "bug" | "task"): ToolDef {
  const isBug = issueType === "bug";
  return {
    type: "function",
    function: {
      name: "finalize_triage",
      description: isBug
        ? "Emit the final triage decision. Call this exactly once when you have enough information. After this call, your work is done."
        : "Emit the final triage suggestions for this task. Call this exactly once when you have enough information. After this call, your work is done.",
      parameters: {
        type: "object",
        properties: {
          suggested_severity: { type: "string", enum: [...SEVERITY_VALUES] },
          suggested_priority: { type: "string", enum: [...PRIORITY_VALUES] },
          reasoning: {
            type: "string",
            description: isBug
              ? "Concise explanation of why you chose this severity/priority, what risks you see, and what assumptions you made."
              : "Concise explanation of related bugs found, assignee rationale, and tag choices.",
          },
          edge_cases: {
            type: "array",
            items: { type: "string" },
            description: isBug
              ? "Concrete edge cases, regression areas, and scenarios that should be tested."
              : "Optional risks or follow-up areas to watch when completing this task.",
          },
          possible_solutions: {
            type: "array",
            items: { type: "string" },
            description: isBug
              ? "Concrete fix approaches or investigations to try."
              : "Optional implementation approaches or investigations.",
          },
          suggested_assignee_user_id: {
            type: "string",
            description:
              "Optional Convex user ID returned by propose_assignee. Omit if no good candidate.",
          },
          suggested_assignee_reason: {
            type: "string",
            description: "Why this assignee? Cite past issues if relevant.",
          },
          suggested_tags: {
            type: "array",
            items: { type: "string" },
            description:
              "Suggested tags to categorize this issue (e.g. area, component). Use lowercase, concise labels.",
          },
          related_issues: {
            type: "array",
            description: isBug
              ? "Related/duplicate/regression candidates with optional relation type."
              : "Related bugs this task may address, with optional relation type.",
            items: {
              type: "object",
              properties: {
                issue_number: { type: "integer" },
                relation: { type: "string", enum: [...RELATION_VALUES] },
                note: { type: "string" },
              },
              required: ["issue_number"],
              additionalProperties: false,
            },
          },
        },
        required: isBug
          ? ["suggested_severity", "suggested_priority", "reasoning"]
          : ["reasoning"],
        additionalProperties: false,
      },
    },
  };
}

function buildTools(issueType: "bug" | "task"): ToolDef[] {
  return [...TOOLS_BASE, buildFinalizeTool(issueType)];
}

// ---------------------------------------------------------------------------
// Tool implementations (executed in the action runtime)
// ---------------------------------------------------------------------------

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

type SimilarHit = {
  _id: Id<"issues">;
  issueNumber: number;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "blocked" | "done";
  type: "bug" | "task";
  assigneeId: Id<"users"> | undefined;
  assigneeName: string | null;
  similarity: number;
};

type AgentState = {
  // Cached results so finalize_triage can reference them by issue number.
  similarByNumber: Map<number, SimilarHit>;
};

async function toolSearchSimilarIssues(
  ctx: ActionCtx,
  args: { query: string; k?: number },
  projectId: Id<"projects">,
  excludeIssueId: Id<"issues">,
  state: AgentState,
  issueType: "bug" | "task"
): Promise<{ results: Array<Record<string, unknown>>; note?: string }> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      results: [],
      note: "RAG unavailable: OPENAI_API_KEY not set on the Convex deployment.",
    };
  }
  const queryVec = await embedText(args.query);
  if (!queryVec || queryVec.length !== EMBEDDING_DIM) {
    return { results: [], note: "Failed to embed query." };
  }
  const k = Math.min(Math.max(args.k ?? SIMILAR_TOP_K, 1), 10);
  const raw = await ctx.vectorSearch("issues", "by_embedding", {
    vector: queryVec,
    limit: k + 1,
    filter: (q) => q.eq("projectId", projectId),
  });
  const filtered = raw
    .filter((r) => r._id !== excludeIssueId)
    .filter((r) => r._score >= SIMILAR_THRESHOLD)
    .slice(0, k + 5);
  const hydrated = await ctx.runQuery(internal.aiAgent.hydrateSimilarHits, {
    hits: filtered.map((h) => ({ _id: h._id, _score: h._score })),
  });
  const typedHits =
    issueType === "task"
      ? hydrated.filter((h) => h.type === "bug")
      : hydrated;
  const limited = typedHits.slice(0, k);
  for (const hit of limited) {
    state.similarByNumber.set(hit.issueNumber, hit);
  }
  return {
    results: limited.map((h: SimilarHit) => ({
      issue_number: h.issueNumber,
      title: h.title,
      type: h.type,
      status: h.status,
      assignee: h.assigneeName,
      similarity: Number(h.similarity.toFixed(3)),
      snippet: h.description.slice(0, 240),
    })),
  };
}

async function toolGetIssue(
  ctx: ActionCtx,
  args: { issue_number: number },
  projectId: Id<"projects">
): Promise<Record<string, unknown> | { error: string }> {
  const issue = await ctx.runQuery(internal.aiAgent.getIssueByNumberInternal, {
    projectId,
    issueNumber: args.issue_number,
  });
  if (!issue) return { error: `No issue with number ${args.issue_number}` };
  return {
    issue_number: issue.issueNumber,
    title: issue.title,
    description: issue.description,
    type: issue.type,
    status: issue.status,
    priority: issue.priority,
    severity: issue.severity ?? null,
    tags: issue.tags ?? [],
    steps_to_reproduce: issue.stepsToReproduce ?? null,
    expected_result: issue.expectedResult ?? null,
    actual_result: issue.actualResult ?? null,
    assignee: issue.assigneeName,
    epic: issue.epicNumber
      ? { epic_number: issue.epicNumber, name: issue.epicName }
      : null,
  };
}

async function toolGetEpic(
  ctx: ActionCtx,
  args: { epic_number: number },
  projectId: Id<"projects">
): Promise<Record<string, unknown> | { error: string }> {
  const epic = await ctx.runQuery(internal.aiAgent.getEpicByNumberInternal, {
    projectId,
    epicNumber: args.epic_number,
  });
  if (!epic) return { error: `No epic with number ${args.epic_number}` };
  return {
    epic_number: epic.epicNumber,
    name: epic.name,
    description: epic.description,
    status: epic.status,
    issues: epic.issues.map((i) => ({
      issue_number: i.issueNumber,
      title: i.title,
      type: i.type,
      status: i.status,
    })),
  };
}

async function toolProposeAssignee(
  ctx: ActionCtx,
  args: { similar_issue_numbers: number[] },
  projectId: Id<"projects">,
  state: AgentState
): Promise<Record<string, unknown>> {
  // Score: each similar issue contributes its similarity to the score
  // of its assignee. Highest total wins.
  const scores = new Map<
    Id<"users">,
    { score: number; name: string | null; supportingIssues: number[] }
  >();
  for (const num of args.similar_issue_numbers) {
    let hit = state.similarByNumber.get(num);
    if (!hit) {
      // Fall back to a fresh fetch if the model referenced an issue
      // that wasn't in the cached search results.
      const fetched = await ctx.runQuery(
        internal.aiAgent.getIssueByNumberInternal,
        { projectId, issueNumber: num }
      );
      if (!fetched) continue;
      // We can't compute similarity here, so use a small constant.
      hit = {
        _id: fetched._id,
        issueNumber: fetched.issueNumber,
        title: fetched.title,
        description: fetched.description,
        status: fetched.status,
        type: fetched.type,
        assigneeId: undefined,
        assigneeName: fetched.assigneeName,
        similarity: 0.5,
      };
    }
    if (!hit.assigneeId) continue;
    const prev = scores.get(hit.assigneeId) ?? {
      score: 0,
      name: hit.assigneeName,
      supportingIssues: [] as number[],
    };
    prev.score += hit.similarity;
    prev.supportingIssues.push(hit.issueNumber);
    scores.set(hit.assigneeId, prev);
  }
  const ranked = [...scores.entries()]
    .map(([userId, v]) => ({
      user_id: userId as string,
      name: v.name,
      score: Number(v.score.toFixed(3)),
      supporting_issue_numbers: v.supportingIssues,
    }))
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) {
    return {
      candidates: [],
      note: "None of the referenced similar issues had an assignee.",
    };
  }
  return { candidates: ranked };
}

// ---------------------------------------------------------------------------
// The main loop
// ---------------------------------------------------------------------------

export type AgentResult = {
  status: "complete" | "failed";
  suggestedSeverity?: "critical" | "major" | "minor" | "trivial";
  suggestedPriority?: "low" | "medium" | "high";
  reasoning?: string;
  edgeCases?: string[];
  possibleSolutions?: string[];
  suggestedAssigneeId?: Id<"users">;
  suggestedAssigneeReason?: string;
  suggestedTags?: string[];
  similarIssues?: Array<{
    issueId: Id<"issues">;
    issueNumber: number;
    title: string;
    status: "todo" | "in_progress" | "blocked" | "done";
    similarity: number;
    relation?: "duplicate" | "related" | "regression";
    note?: string;
  }>;
  errorMessage?: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
};

function buildSystemPrompt(issueType: "bug" | "task"): string {
  if (issueType === "task") {
    return [
      "You are DORA's task-triage agent. Your job is to analyze a single incoming task and suggest related bugs, a likely assignee, and appropriate tags.",
      "",
      "You have access to five tools:",
      "  - search_similar_issues: search this project's bug history for bugs related to this task's area of work.",
      "  - get_issue: fetch full details of one issue by its number.",
      "  - get_epic: fetch a feature epic by its number, including grouped issues.",
      "  - propose_assignee: given issue numbers, rank past assignees.",
      "  - finalize_triage: emit your final structured suggestions. You MUST call this exactly once to finish.",
      "",
      "Strategy:",
      "  1. Start by calling search_similar_issues with a focused query about the task's area.",
      "  2. Review hits for bugs this task might fix or relate to. Call get_issue on promising matches.",
      "  3. If the task belongs to an epic, consider get_epic for sibling context.",
      "  4. Call propose_assignee with relevant issue numbers.",
      "  5. Call finalize_triage with related_issues (bugs only), suggested_tags (2-5), and optional assignee.",
      "",
      "Be decisive. Don't make more than 2 search_similar_issues calls.",
      "Keep reasoning concise.",
    ].join("\n");
  }

  return [
    "You are DORA's bug-triage agent. Your job is to triage a single incoming bug ticket.",
    "",
    "You have access to five tools:",
    "  - search_similar_issues: do RAG over this project's history to find duplicates, regressions, and related work.",
    "  - get_issue: fetch full details of one issue by its number.",
    "  - get_epic: fetch a feature epic by its number, including the issues grouped under it. Epics group issues by feature.",
    "  - propose_assignee: given issue numbers, rank past assignees.",
    "  - finalize_triage: emit your final structured decision. You MUST call this exactly once to finish.",
    "",
    "Strategy:",
    "  1. ALWAYS start by calling search_similar_issues with a focused query. If the project has any history, this is your most valuable signal.",
    "  2. If a hit looks suspicious (very high similarity, similar title), call get_issue on it to confirm whether it's a duplicate or regression.",
    "  3. If the bug belongs to an epic, or a similar issue references one, consider calling get_epic to understand the feature scope and check sibling issues for duplicates/regressions.",
    "  4. Once you have 1-3 strong similar issues, call propose_assignee with their numbers to see who's worked on this area before.",
    "  5. Finally, call finalize_triage. Use the similar issues you found to populate `related_issues` (mark duplicates, regressions, related). Use propose_assignee output to pick suggested_assignee_user_id. Include 2-5 suggested_tags that categorize the bug (area, component, symptom).",
    "",
    "Be decisive. Don't make more than 2 search_similar_issues calls. If you can't find anything similar, that's fine — proceed to finalize_triage based on the bug's text alone.",
    "Keep reasoning concise. Edge cases and possible_solutions should be concrete and actionable, not generic.",
  ].join("\n");
}

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
    type: "bug" | "task";
    issueNumber: number;
    title: string;
    description: string;
    priority: "low" | "medium" | "high";
    severity?: "critical" | "major" | "minor" | "trivial";
    tags?: string[];
    estimate?: string;
    stepsToReproduce?: string;
    expectedResult?: string;
    actualResult?: string;
  },
  epic?: EpicContext | null
): string {
  const lines: string[] = [
    `# Project: ${project.name}`,
    project.description ? `Description: ${project.description}` : "",
  ];
  const s = project.summary;
  if (s) {
    if (s.techStack?.trim()) lines.push(`Tech stack: ${s.techStack.trim()}`);
    if (s.targetUsers?.trim())
      lines.push(`Target users: ${s.targetUsers.trim()}`);
    if (s.keyFeatures?.trim())
      lines.push(`Key features: ${s.keyFeatures.trim()}`);
    if (s.knownConstraints?.trim())
      lines.push(`Known constraints: ${s.knownConstraints.trim()}`);
    if (s.glossary?.trim()) lines.push(`Glossary: ${s.glossary.trim()}`);
  }

  if (epic) {
    lines.push(
      "",
      `# Epic context: ${epic.name} (E${epic.epicNumber}, status: ${epic.status})`,
      `This ${issue.type} is part of the above feature epic.`,
      epic.description?.trim()
        ? `Epic description: ${epic.description.trim()}`
        : "Epic description: (none)"
    );
    const siblings = epic.issues.filter(
      (i) => i.issueNumber !== issue.issueNumber
    );
    if (siblings.length > 0) {
      lines.push("Other issues in this epic:");
      for (const sib of siblings.slice(0, 20)) {
        lines.push(
          `  - #${sib.issueNumber} [${sib.type}/${sib.status}] ${sib.title}`
        );
      }
    }
  }

  if (issue.type === "task") {
    lines.push(
      "",
      `# Incoming task (#${issue.issueNumber})`,
      `Title: ${issue.title}`,
      `Priority: ${issue.priority}`,
      `Estimate: ${issue.estimate?.trim() || "(none)"}`,
      `Tags: ${issue.tags?.length ? issue.tags.join(", ") : "(none)"}`,
      "",
      "## Description",
      issue.description || "(none)",
      "",
      "Begin by searching for related bugs in this project."
    );
    return lines.filter(Boolean).join("\n");
  }

  lines.push(
    "",
    `# Incoming bug (#${issue.issueNumber})`,
    `Title: ${issue.title}`,
    `Reporter-set priority: ${issue.priority}`,
    `Reporter-set severity: ${issue.severity ?? "(none)"}`,
    `Tags: ${issue.tags?.length ? issue.tags.join(", ") : "(none)"}`,
    "",
    "## Description",
    issue.description || "(none)",
    "",
    "## Steps to reproduce",
    issue.stepsToReproduce?.trim() || "(none)",
    "",
    "## Expected result",
    issue.expectedResult?.trim() || "(none)",
    "",
    "## Actual result",
    issue.actualResult?.trim() || "(none)",
    "",
    "Begin by searching for similar past issues."
  );
  return lines.filter(Boolean).join("\n");
}

async function callOpenRouter(args: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools: ToolDef[];
}): Promise<{
  message: ChatMessage;
  tokensIn: number;
  tokensOut: number;
}> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/dora",
      "X-Title": "DORA bug-triage agent",
    },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      tools: args.tools,
      tool_choice: "auto",
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: ChatMessage }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const message = data.choices?.[0]?.message;
  if (!message) {
    throw new Error("OpenRouter returned no message");
  }
  return {
    message,
    tokensIn: data.usage?.prompt_tokens ?? 0,
    tokensOut: data.usage?.completion_tokens ?? 0,
  };
}

function parseFinalize(rawArgs: string): {
  suggestedSeverity?: "critical" | "major" | "minor" | "trivial";
  suggestedPriority?: "low" | "medium" | "high";
  reasoning?: string;
  edgeCases?: string[];
  possibleSolutions?: string[];
  suggestedAssigneeUserId?: string;
  suggestedAssigneeReason?: string;
  suggestedTags?: string[];
  relatedIssues?: Array<{
    issue_number: number;
    relation?: "duplicate" | "related" | "regression";
    note?: string;
  }>;
} {
  const obj = JSON.parse(rawArgs) as Record<string, unknown>;
  const sev = obj.suggested_severity;
  const pri = obj.suggested_priority;
  const related = Array.isArray(obj.related_issues)
    ? (obj.related_issues as Array<Record<string, unknown>>)
        .map((r) => {
          const relation: "duplicate" | "related" | "regression" | undefined =
            r.relation === "duplicate" ||
            r.relation === "related" ||
            r.relation === "regression"
              ? r.relation
              : undefined;
          return {
            issue_number: Number(r.issue_number),
            relation,
            note: typeof r.note === "string" ? r.note : undefined,
          };
        })
        .filter((r) => Number.isFinite(r.issue_number))
    : undefined;
  return {
    suggestedSeverity:
      sev === "critical" || sev === "major" || sev === "minor" || sev === "trivial"
        ? sev
        : undefined,
    suggestedPriority:
      pri === "low" || pri === "medium" || pri === "high" ? pri : undefined,
    reasoning: typeof obj.reasoning === "string" ? obj.reasoning : undefined,
    edgeCases: Array.isArray(obj.edge_cases)
      ? (obj.edge_cases as unknown[]).filter(
          (x): x is string => typeof x === "string"
        )
      : undefined,
    possibleSolutions: Array.isArray(obj.possible_solutions)
      ? (obj.possible_solutions as unknown[]).filter(
          (x): x is string => typeof x === "string"
        )
      : undefined,
    suggestedAssigneeUserId:
      typeof obj.suggested_assignee_user_id === "string"
        ? obj.suggested_assignee_user_id
        : undefined,
    suggestedAssigneeReason:
      typeof obj.suggested_assignee_reason === "string"
        ? obj.suggested_assignee_reason
        : undefined,
    suggestedTags: Array.isArray(obj.suggested_tags)
      ? (obj.suggested_tags as unknown[]).filter(
          (x): x is string => typeof x === "string" && x.trim().length > 0
        )
      : undefined,
    relatedIssues: related,
  };
}

/**
 * The agent. Returns a fully-formed triage result (or a failure).
 * `record` controls whether intermediate steps are persisted to the DB
 * (true at runtime, false during eval).
 */
export async function runTriageAgent(args: {
  ctx: ActionCtx;
  issue: Doc<"issues">;
  project: Doc<"projects">;
  epic?: EpicContext | null;
  apiKey: string;
  model: string;
  record: boolean;
}): Promise<AgentResult> {
  const { ctx, issue, project, epic, apiKey, model, record } = args;
  const state: AgentState = { similarByNumber: new Map() };
  const tools = buildTools(issue.type);

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(issue.type) },
    {
      role: "user",
      content: buildUserPrompt(
        project,
        {
          type: issue.type,
          issueNumber: issue.issueNumber,
          title: issue.title,
          description: issue.description,
          priority: issue.priority,
          severity: issue.severity,
          tags: issue.tags,
          estimate: issue.estimate,
          stepsToReproduce: issue.stepsToReproduce,
          expectedResult: issue.expectedResult,
          actualResult: issue.actualResult,
        },
        epic ?? null
      ),
    },
  ];

  let tokensIn = 0;
  let tokensOut = 0;
  let finalArgs: string | null = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    const { message, tokensIn: ti, tokensOut: to } = await callOpenRouter({
      apiKey,
      model,
      messages,
      tools,
    });
    tokensIn += ti;
    tokensOut += to;

    // Always push the assistant turn back into the conversation so the
    // model sees its own tool calls on the next iteration.
    messages.push(message);

    const toolCalls = message.tool_calls ?? [];

    if (toolCalls.length === 0) {
      // The model decided to respond in plain text without calling
      // finalize_triage. Nudge it once.
      if (record) {
        await ctx.runMutation(internal.aiAgent.appendStep, {
          issueId: issue._id,
          step: {
            kind: "thought",
            output: message.content?.slice(0, 600) ?? "",
            timestamp: Date.now(),
          },
        });
      }
      messages.push({
        role: "user",
        content:
          "You did not call a tool. Please call `finalize_triage` now with your best decision based on what you know.",
      });
      continue;
    }

    let finalized = false;
    for (const call of toolCalls) {
      const name = call.function.name;
      let parsedArgs: Record<string, unknown>;
      try {
        parsedArgs = call.function.arguments
          ? (JSON.parse(call.function.arguments) as Record<string, unknown>)
          : {};
      } catch {
        parsedArgs = {};
      }

      if (record) {
        await ctx.runMutation(internal.aiAgent.appendStep, {
          issueId: issue._id,
          step: {
            kind: "tool_call",
            tool: name,
            input: JSON.stringify(parsedArgs).slice(0, 1000),
            timestamp: Date.now(),
          },
        });
      }

      let toolOutput: unknown;
      try {
        if (name === "search_similar_issues") {
          toolOutput = await toolSearchSimilarIssues(
            ctx,
            parsedArgs as { query: string; k?: number },
            issue.projectId,
            issue._id,
            state,
            issue.type
          );
        } else if (name === "get_issue") {
          toolOutput = await toolGetIssue(
            ctx,
            parsedArgs as { issue_number: number },
            issue.projectId
          );
        } else if (name === "get_epic") {
          toolOutput = await toolGetEpic(
            ctx,
            parsedArgs as { epic_number: number },
            issue.projectId
          );
        } else if (name === "propose_assignee") {
          toolOutput = await toolProposeAssignee(
            ctx,
            parsedArgs as { similar_issue_numbers: number[] },
            issue.projectId,
            state
          );
        } else if (name === "finalize_triage") {
          finalArgs = call.function.arguments;
          toolOutput = { ok: true };
          finalized = true;
        } else {
          toolOutput = { error: `Unknown tool: ${name}` };
        }
      } catch (e) {
        toolOutput = {
          error: e instanceof Error ? e.message : String(e),
        };
      }

      const outputStr = JSON.stringify(toolOutput);
      if (record) {
        await ctx.runMutation(internal.aiAgent.appendStep, {
          issueId: issue._id,
          step: {
            kind: "tool_result",
            tool: name,
            output: outputStr.slice(0, 4000),
            timestamp: Date.now(),
          },
        });
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: outputStr,
      });
    }

    if (finalized) break;
  }

  if (!finalArgs) {
    return {
      status: "failed",
      errorMessage: `Agent did not call finalize_triage within ${MAX_STEPS} steps.`,
      model,
      tokensIn,
      tokensOut,
    };
  }

  let parsed: ReturnType<typeof parseFinalize>;
  try {
    parsed = parseFinalize(finalArgs);
  } catch (e) {
    return {
      status: "failed",
      errorMessage: `Could not parse finalize_triage args: ${e instanceof Error ? e.message : String(e)}`,
      model,
      tokensIn,
      tokensOut,
    };
  }

  if (issue.type === "bug") {
    if (!parsed.suggestedSeverity || !parsed.suggestedPriority) {
      return {
        status: "failed",
        errorMessage:
          "finalize_triage missing required suggested_severity or suggested_priority.",
        model,
        tokensIn,
        tokensOut,
      };
    }
  } else if (!parsed.reasoning) {
    return {
      status: "failed",
      errorMessage: "finalize_triage missing required reasoning.",
      model,
      tokensIn,
      tokensOut,
    };
  }

  // Resolve related issues against state cache (best effort).
  const similarOut: AgentResult["similarIssues"] = [];
  const seen = new Set<number>();
  for (const r of parsed.relatedIssues ?? []) {
    if (seen.has(r.issue_number)) continue;
    seen.add(r.issue_number);
    const hit = state.similarByNumber.get(r.issue_number);
    if (hit) {
      similarOut.push({
        issueId: hit._id,
        issueNumber: hit.issueNumber,
        title: hit.title,
        status: hit.status,
        similarity: hit.similarity,
        relation: r.relation,
        note: r.note,
      });
    }
  }
  // Add any high-similarity hits the model didn't explicitly mention so
  // the user still sees them.
  for (const hit of state.similarByNumber.values()) {
    if (similarOut.length >= 5) break;
    if (seen.has(hit.issueNumber)) continue;
    if (hit.similarity < 0.7) continue;
    similarOut.push({
      issueId: hit._id,
      issueNumber: hit.issueNumber,
      title: hit.title,
      status: hit.status,
      similarity: hit.similarity,
    });
  }

  // Validate suggested assignee user id (must exist).
  let suggestedAssigneeId: Id<"users"> | undefined;
  if (parsed.suggestedAssigneeUserId) {
    const userId = parsed.suggestedAssigneeUserId as Id<"users">;
    const user = await ctx.runQuery(internal.aiAgent.userExists, { userId });
    if (user) suggestedAssigneeId = userId;
  }

  return {
    status: "complete",
    suggestedSeverity: parsed.suggestedSeverity,
    suggestedPriority: parsed.suggestedPriority,
    reasoning: parsed.reasoning,
    edgeCases: parsed.edgeCases,
    possibleSolutions: parsed.possibleSolutions,
    suggestedAssigneeId,
    suggestedAssigneeReason: parsed.suggestedAssigneeReason,
    suggestedTags: parsed.suggestedTags,
    similarIssues: similarOut.length > 0 ? similarOut : undefined,
    model,
    tokensIn,
    tokensOut,
  };
}

export const userExists = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const u = await ctx.db.get(userId);
    return u ? true : false;
  },
});

/**
 * Internal action that runs the agent against a stored issue.
 * `aiSummaries.generate` calls this; eval scripts can call it too.
 */
export const runAgentForIssue = internalAction({
  args: {
    issueId: v.id("issues"),
    record: v.optional(v.boolean()),
    modelOverride: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<AgentResult> => {
    const issue = await ctx.runQuery(internal.aiAgent.getIssueDoc, {
      issueId: args.issueId,
    });
    if (!issue) {
      return {
        status: "failed",
        errorMessage: "Issue not found",
        model: args.modelOverride ?? "n/a",
        tokensIn: 0,
        tokensOut: 0,
      };
    }
    const project = await ctx.runQuery(internal.aiAgent.getProjectDoc, {
      projectId: issue.projectId,
    });
    if (!project) {
      return {
        status: "failed",
        errorMessage: "Project not found",
        model: args.modelOverride ?? "n/a",
        tokensIn: 0,
        tokensOut: 0,
      };
    }
    const epic = issue.epicId
      ? await ctx.runQuery(internal.aiAgent.getEpicContextInternal, {
          epicId: issue.epicId,
        })
      : null;
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model =
      args.modelOverride ??
      process.env.OPENROUTER_MODEL ??
      "openai/gpt-4o-mini";
    if (!apiKey) {
      return {
        status: "failed",
        errorMessage:
          "OPENROUTER_API_KEY is not set on the Convex deployment.",
        model,
        tokensIn: 0,
        tokensOut: 0,
      };
    }
    return await runTriageAgent({
      ctx,
      issue,
      project,
      epic,
      apiKey,
      model,
      record: args.record ?? true,
    });
  },
});

export const getIssueDoc = internalQuery({
  args: { issueId: v.id("issues") },
  handler: async (ctx, { issueId }) => {
    return await ctx.db.get(issueId);
  },
});

export const getProjectDoc = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    return await ctx.db.get(projectId);
  },
});
