import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Embeddings live on the `issues` table. We use OpenAI's
 * `text-embedding-3-small` (1536-dim) because it is cheap, fast, and
 * good enough for "similar bug" retrieval. If `OPENAI_API_KEY` is not
 * set, the embedding pipeline silently no-ops so the rest of the app
 * still works (the agent will just skip the RAG tool and fall back to
 * a single-shot triage).
 */

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIM = 1536;

function buildEmbeddingText(issue: {
  title: string;
  description: string;
  stepsToReproduce?: string;
  tags?: string[];
}): string {
  const parts = [
    `Title: ${issue.title}`,
    `Description: ${issue.description ?? ""}`,
  ];
  if (issue.stepsToReproduce?.trim()) {
    parts.push(`Steps to reproduce: ${issue.stepsToReproduce.trim()}`);
  }
  if (issue.tags?.length) {
    parts.push(`Tags: ${issue.tags.join(", ")}`);
  }
  // Cap to ~6k chars so we stay well under the embedding model's token limit
  // even on absurdly long descriptions.
  return parts.join("\n").slice(0, 6000);
}

/**
 * Call OpenAI's embeddings endpoint. Centralised so the agent can reuse
 * it to embed the *current* bug's text on the fly when running a
 * similarity search.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `OpenAI embeddings HTTP ${res.status}: ${body.slice(0, 300)}`
    );
  }
  const data = (await res.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const vec = data.data?.[0]?.embedding;
  if (!vec || vec.length !== EMBEDDING_DIM) {
    throw new Error(
      `Unexpected embedding response (got ${vec?.length ?? 0} dims, expected ${EMBEDDING_DIM})`
    );
  }
  return vec;
}

export const getIssueForEmbedding = internalQuery({
  args: { issueId: v.id("issues") },
  handler: async (ctx, { issueId }) => {
    const issue = await ctx.db.get(issueId);
    if (!issue) return null;
    return {
      _id: issue._id,
      title: issue.title,
      description: issue.description,
      stepsToReproduce: issue.stepsToReproduce,
      tags: issue.tags,
    };
  },
});

export const saveEmbedding = internalMutation({
  args: {
    issueId: v.id("issues"),
    embedding: v.array(v.number()),
    model: v.string(),
  },
  handler: async (ctx, { issueId, embedding, model }) => {
    const existing = await ctx.db.get(issueId);
    if (!existing) return;
    await ctx.db.patch(issueId, {
      embedding,
      embeddingModel: model,
      embeddedAt: Date.now(),
    });
  },
});

/**
 * Fire-and-forget: re-embed a single issue. Called from `issues.create`
 * and `issues.update`. Failures are swallowed (logged) so user-facing
 * mutations never break because of an embeddings outage.
 */
export const embedIssue = internalAction({
  args: { issueId: v.id("issues") },
  handler: async (ctx, { issueId }) => {
    if (!process.env.OPENAI_API_KEY) {
      // No key configured — skip silently. The UI surfaces a friendly
      // hint when RAG is unavailable.
      return;
    }
    const issue = await ctx.runQuery(internal.embeddings.getIssueForEmbedding, {
      issueId,
    });
    if (!issue) return;
    const text = buildEmbeddingText(issue);
    try {
      const embedding = await embedText(text);
      if (!embedding) return;
      await ctx.runMutation(internal.embeddings.saveEmbedding, {
        issueId,
        embedding,
        model: EMBEDDING_MODEL,
      });
    } catch (e) {
      console.error("embedIssue failed", e);
    }
  },
});

/**
 * One-shot backfill: re-embed every issue in a project that doesn't
 * yet have an embedding (or whose embedding is stale relative to the
 * current model).
 */
export const listIssuesNeedingEmbedding = internalQuery({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, { projectId }) => {
    const issues = projectId
      ? await ctx.db
          .query("issues")
          .withIndex("by_project", (q) => q.eq("projectId", projectId))
          .collect()
      : await ctx.db.query("issues").collect();
    return issues
      .filter(
        (i: Doc<"issues">) =>
          !i.embedding || i.embeddingModel !== EMBEDDING_MODEL
      )
      .map((i: Doc<"issues">) => i._id as Id<"issues">);
  },
});

export const backfillEmbeddings = internalAction({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, { projectId }) => {
    if (!process.env.OPENAI_API_KEY) {
      return { embedded: 0, skipped: "no OPENAI_API_KEY set" as const };
    }
    const ids = await ctx.runQuery(
      internal.embeddings.listIssuesNeedingEmbedding,
      { projectId }
    );
    let embedded = 0;
    for (const id of ids) {
      try {
        await ctx.runAction(internal.embeddings.embedIssue, { issueId: id });
        embedded += 1;
      } catch (e) {
        console.error("backfill embed failed for", id, e);
      }
    }
    return { embedded, skipped: null };
  },
});
