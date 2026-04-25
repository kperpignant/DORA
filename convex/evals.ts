import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { runTriageAgent } from "./aiAgent";
import { requireAllowedActionUser } from "./security";

/**
 * Tiny eval harness used to compare:
 *   1. baseline  -> single OpenRouter call, JSON output (the original
 *      DORA implementation, kept here for honesty so the comparison is
 *      apples-to-apples).
 *   2. agent     -> the new tool-using agent in `aiAgent.ts`, which
 *      gets to retrieve similar past issues, get_issue, and propose
 *      assignees before deciding.
 *
 * We hand-label severity and priority on a small fixture set
 * (`evals/bugs.json`), seed them as a temporary "EVAL" project, and
 * measure agreement against ground truth. This isn't a research
 * benchmark — it's the kind of thing a real builder would write to
 * prove the agent is actually better than what it replaced before
 * shipping.
 *
 * Run it from the repo root with:
 *   npx convex run evals:run '{ "fixtures": <contents of evals/bugs.json> }'
 *
 * Or use the convenience helper in `scripts/run-eval.mjs`.
 */

const EVAL_PROJECT_KEY = "EVAL";

type Severity = "critical" | "major" | "minor" | "trivial";
type Priority = "low" | "medium" | "high";

type Fixture = {
  title: string;
  description: string;
  stepsToReproduce?: string;
  tags?: string[];
  reporterPriority: Priority;
  reporterSeverity: Severity;
  groundTruthSeverity: Severity;
  groundTruthPriority: Priority;
};

// ---------------------------------------------------------------------------
// Baseline: replicate the pre-agent single-shot behaviour for honest
// comparison. Kept self-contained so it cannot accidentally drift onto
// the agent path.
// ---------------------------------------------------------------------------

async function runBaseline(args: {
  apiKey: string;
  model: string;
  project: { name: string; description?: string; summary?: Doc<"projects">["summary"] };
  issue: {
    title: string;
    description: string;
    priority: Priority;
    severity?: Severity;
    tags?: string[];
    stepsToReproduce?: string;
  };
}): Promise<{
  status: "complete" | "failed";
  suggestedSeverity?: Severity;
  suggestedPriority?: Priority;
  errorMessage?: string;
  tokensIn: number;
  tokensOut: number;
}> {
  const userContent = [
    "You are assisting with triage for a software bug ticket.",
    "",
    "## Project context",
    `Name: ${args.project.name}`,
    args.project.description
      ? `Description: ${args.project.description}`
      : "Description: (none)",
    args.project.summary?.techStack
      ? `Tech stack: ${args.project.summary.techStack}`
      : "",
    args.project.summary?.targetUsers
      ? `Target users: ${args.project.summary.targetUsers}`
      : "",
    "",
    "## Bug",
    `Title: ${args.issue.title}`,
    `Description: ${args.issue.description}`,
    `Reporter-set priority: ${args.issue.priority}`,
    `Reporter-set severity: ${args.issue.severity ?? "(none)"}`,
    `Tags: ${args.issue.tags?.join(", ") ?? "(none)"}`,
    "",
    "## Steps to reproduce",
    args.issue.stepsToReproduce ?? "(none)",
    "",
    "## Task",
    "Respond with a single JSON object with keys:",
    '- "suggestedSeverity": one of "critical","major","minor","trivial"',
    '- "suggestedPriority": one of "low","medium","high"',
    '- "reasoning": string',
    '- "edgeCases": array of strings',
    '- "possibleSolutions": array of strings',
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      messages: [
        {
          role: "system",
          content:
            "You output only valid JSON objects matching the user's schema. No markdown.",
        },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    return {
      status: "failed",
      errorMessage: `HTTP ${res.status}`,
      tokensIn: 0,
      tokensOut: 0,
    };
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  try {
    const obj = JSON.parse(content) as Record<string, unknown>;
    const sev = obj.suggestedSeverity;
    const pri = obj.suggestedPriority;
    return {
      status: "complete",
      suggestedSeverity:
        sev === "critical" || sev === "major" || sev === "minor" || sev === "trivial"
          ? sev
          : undefined,
      suggestedPriority:
        pri === "low" || pri === "medium" || pri === "high" ? pri : undefined,
      tokensIn: data.usage?.prompt_tokens ?? 0,
      tokensOut: data.usage?.completion_tokens ?? 0,
    };
  } catch (e) {
    return {
      status: "failed",
      errorMessage: e instanceof Error ? e.message : String(e),
      tokensIn: data.usage?.prompt_tokens ?? 0,
      tokensOut: data.usage?.completion_tokens ?? 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Seed / cleanup helpers
// ---------------------------------------------------------------------------

export const seedEvalProject = internalMutation({
  args: { fixtures: v.array(v.any()) },
  handler: async (ctx, { fixtures }) => {
    // Wipe any prior eval project and its issues.
    const prior = await ctx.db
      .query("projects")
      .withIndex("by_key", (q) => q.eq("key", EVAL_PROJECT_KEY))
      .first();
    if (prior) {
      const oldIssues = await ctx.db
        .query("issues")
        .withIndex("by_project", (q) => q.eq("projectId", prior._id))
        .collect();
      for (const i of oldIssues) await ctx.db.delete(i._id);
      await ctx.db.delete(prior._id);
    }

    const projectId = await ctx.db.insert("projects", {
      name: "DORA agent eval",
      key: EVAL_PROJECT_KEY,
      description: "Auto-seeded fixture project for agent vs baseline eval.",
      summary: {
        techStack: "Generic SaaS web app (React + Node + Postgres)",
        targetUsers: "B2C marketers and customer support agents",
      },
      createdAt: Date.now(),
    });

    const created: Array<{ issueId: Id<"issues">; fixtureIndex: number }> = [];
    for (let i = 0; i < fixtures.length; i++) {
      const f = fixtures[i] as Fixture;
      const issueId = await ctx.db.insert("issues", {
        projectId,
        issueNumber: i + 1,
        type: "bug",
        title: f.title,
        description: f.description,
        status: "todo",
        priority: f.reporterPriority,
        severity: f.reporterSeverity,
        stepsToReproduce: f.stepsToReproduce,
        tags: f.tags,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      created.push({ issueId, fixtureIndex: i });
    }
    return { projectId, issues: created };
  },
});

export const getEvalContext = internalQuery({
  args: { projectId: v.id("projects"), issueId: v.id("issues") },
  handler: async (ctx, { projectId, issueId }) => {
    const project = await ctx.db.get(projectId);
    const issue = await ctx.db.get(issueId);
    if (!project || !issue) return null;
    return { project, issue };
  },
});

// ---------------------------------------------------------------------------
// The eval action
// ---------------------------------------------------------------------------

type RunResult = {
  fixtureIndex: number;
  title: string;
  groundTruthSeverity: Severity;
  groundTruthPriority: Priority;
  baseline: {
    severity?: Severity;
    priority?: Priority;
    severityCorrect: boolean;
    priorityCorrect: boolean;
    latencyMs: number;
    tokensIn: number;
    tokensOut: number;
    error?: string;
  };
  agent: {
    severity?: Severity;
    priority?: Priority;
    severityCorrect: boolean;
    priorityCorrect: boolean;
    latencyMs: number;
    tokensIn: number;
    tokensOut: number;
    similarFound: number;
    error?: string;
  };
};

type EvalSummary = ReturnType<typeof summarise>;

type EvalReport = {
  projectId: Id<"projects">;
  results: RunResult[];
  summary: EvalSummary;
};

type SeededEval = {
  projectId: Id<"projects">;
  issues: Array<{ issueId: Id<"issues">; fixtureIndex: number }>;
};

export const runInternal = internalAction({
  args: { fixtures: v.array(v.any()) },
  handler: async (ctx, { fixtures }): Promise<EvalReport> => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY not set on Convex deployment");
    }

    // 1. Seed the eval project + issues.
    const seeded: SeededEval = await ctx.runMutation(
      internal.evals.seedEvalProject,
      { fixtures }
    );

    // 2. Embed everything synchronously so the agent has RAG signal.
    if (process.env.OPENAI_API_KEY) {
      for (const { issueId } of seeded.issues) {
        await ctx.runAction(internal.embeddings.embedIssue, { issueId });
      }
    }

    // 3. For each fixture, run baseline and agent. We exclude the
    // current issue from the agent's RAG (the agent already does this
    // via excludeIssueId) so it can't just retrieve itself.
    const results: RunResult[] = [];
    for (const { issueId, fixtureIndex } of seeded.issues) {
      const f = fixtures[fixtureIndex] as Fixture;
      const ctxData = await ctx.runQuery(internal.evals.getEvalContext, {
        projectId: seeded.projectId,
        issueId,
      });
      if (!ctxData) continue;

      // --- baseline ---
      const baseStart = Date.now();
      const baseline = await runBaseline({
        apiKey,
        model,
        project: {
          name: ctxData.project.name,
          description: ctxData.project.description,
          summary: ctxData.project.summary,
        },
        issue: {
          title: f.title,
          description: f.description,
          priority: f.reporterPriority,
          severity: f.reporterSeverity,
          tags: f.tags,
          stepsToReproduce: f.stepsToReproduce,
        },
      });
      const baselineLatency = Date.now() - baseStart;

      // --- agent ---
      const agentStart = Date.now();
      const agent = await runTriageAgent({
        ctx,
        issue: ctxData.issue,
        project: ctxData.project,
        apiKey,
        model,
        record: false,
      });
      const agentLatency = Date.now() - agentStart;

      results.push({
        fixtureIndex,
        title: f.title,
        groundTruthSeverity: f.groundTruthSeverity,
        groundTruthPriority: f.groundTruthPriority,
        baseline: {
          severity: baseline.suggestedSeverity,
          priority: baseline.suggestedPriority,
          severityCorrect:
            baseline.suggestedSeverity === f.groundTruthSeverity,
          priorityCorrect:
            baseline.suggestedPriority === f.groundTruthPriority,
          latencyMs: baselineLatency,
          tokensIn: baseline.tokensIn,
          tokensOut: baseline.tokensOut,
          error: baseline.errorMessage,
        },
        agent: {
          severity: agent.suggestedSeverity,
          priority: agent.suggestedPriority,
          severityCorrect: agent.suggestedSeverity === f.groundTruthSeverity,
          priorityCorrect: agent.suggestedPriority === f.groundTruthPriority,
          latencyMs: agentLatency,
          tokensIn: agent.tokensIn,
          tokensOut: agent.tokensOut,
          similarFound: agent.similarIssues?.length ?? 0,
          error: agent.errorMessage,
        },
      });
    }

    const summary = summarise(results);
    return { projectId: seeded.projectId, results, summary };
  },
});

function summarise(results: RunResult[]) {
  const n = results.length || 1;
  const baseSev = results.filter((r) => r.baseline.severityCorrect).length;
  const basePri = results.filter((r) => r.baseline.priorityCorrect).length;
  const agSev = results.filter((r) => r.agent.severityCorrect).length;
  const agPri = results.filter((r) => r.agent.priorityCorrect).length;
  const baseLatency = avg(results.map((r) => r.baseline.latencyMs));
  const agLatency = avg(results.map((r) => r.agent.latencyMs));
  const baseTokens = sum(
    results.map((r) => r.baseline.tokensIn + r.baseline.tokensOut)
  );
  const agTokens = sum(
    results.map((r) => r.agent.tokensIn + r.agent.tokensOut)
  );
  return {
    n: results.length,
    baseline: {
      severityAccuracy: baseSev / n,
      priorityAccuracy: basePri / n,
      avgLatencyMs: Math.round(baseLatency),
      totalTokens: baseTokens,
    },
    agent: {
      severityAccuracy: agSev / n,
      priorityAccuracy: agPri / n,
      avgLatencyMs: Math.round(agLatency),
      totalTokens: agTokens,
      avgSimilarFound: avg(results.map((r) => r.agent.similarFound)),
    },
  };
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/** Public action: run the eval. Pass fixtures from the JSON file. */
export const run = action({
  args: { fixtures: v.array(v.any()) },
  handler: async (ctx, args): Promise<EvalReport> => {
    await requireAllowedActionUser(ctx);
    return await ctx.runAction(internal.evals.runInternal, {
      fixtures: args.fixtures,
    });
  },
});
