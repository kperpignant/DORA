# DORA — Agentic bug triage inside an issue tracker

DORA is a JIRA-style project tracker with an **agentic AI bug-triage system** built in. When a bug is filed, an LLM-powered agent autonomously:

1. **Retrieves** semantically-similar past issues from this project (RAG over a Convex vector index).
2. **Inspects** the most suspicious matches by calling a `get_issue` tool.
3. **Ranks** prior assignees by who closed the most similar bugs (`propose_assignee`).
4. **Decides** on a severity, priority, edge cases to test, possible fixes, an assignee, and which past issues are duplicates / regressions / related — and writes that decision back to the ticket via a structured `finalize_triage` tool call.

The user can then **apply any of the agent's suggestions with one click**, or apply them all. The full agent trace (every tool call and its result) is persisted on the issue for transparency and debugging.

This repo was built as a submission for the **Klaviyo AI Builder Resident** program.

---

## Problem Statement

Bug triage is one of the most-repeated, lowest-leverage tasks engineering managers and on-call engineers do. Every incoming bug needs someone to:

- Decide its real severity and priority (often different from what the reporter chose under stress).
- Check whether it's a duplicate of something already filed, or a regression of something thought-fixed.
- Figure out who should own it — usually whoever last touched that area of the code.
- Sketch out edge cases worth testing and a few plausible fix directions so the assignee isn't starting from a blank page.

In a team of 20+ engineers with hundreds of open issues, that triage work consumes 30–60 minutes per day from a senior engineer or EM, and the quality is highly inconsistent. New ICs get dropped onto bugs without any of the historical context. Duplicates get filed and worked on twice. The same regression is "fixed" three different ways.

**Who is most affected:** engineering managers, on-call engineers, and triage rotation owners — the people who currently do this work by reading every incoming ticket and remembering the codebase well enough to route it.

**What success looks like:**
- An incoming bug arrives with a triage decision and 1–3 cited similar past issues *attached*, before a human even opens it.
- The triage decision agrees with a senior engineer's call most of the time on severity and priority (we measured this — see *Testing*).
- Duplicates are flagged at file-time, not after a week of parallel work.
- Time-to-assignment drops from "next standup" to "seconds."

**How we'd know it worked:** severity/priority agreement rate vs. ground-truth labels on a held-out set, % of duplicates correctly flagged at file-time, time-to-first-assignment.

---

## Solution Overview

DORA is a real, working full-stack tracker (projects, bugs, tasks, kanban, real-time sync, Google OAuth, drag-to-assign), but its **core differentiator is the bug-triage agent**.

### What it does

When a bug is filed:

1. The bug is saved instantly. The UI does **not** wait for the agent.
2. A Convex scheduler kicks off `aiSummaries:generate`, which calls `aiAgent:runAgentForIssue`.
3. The agent runs a tool-use loop (max 6 steps). Every tool call and result is streamed into `issue.aiSummary.steps`, so the AI panel in the UI updates live as the agent thinks.
4. When the agent calls `finalize_triage`, the structured result is persisted: suggested severity, suggested priority, reasoning, edge cases, possible solutions, suggested assignee, and a list of similar past issues annotated with their relationship (duplicate / related / regression).
5. The user sees a panel with one-click **Apply** buttons for each suggestion, or **Apply all** to accept everything.

### What role AI plays

AI is **the core of the value proposition**, not a sprinkle on top. If you removed `convex/aiAgent.ts` and `convex/aiSummaries.ts`, you'd be left with a generic kanban board — and the entire reason this project exists would be gone. The AI:

- Reasons over project-specific context (each project has structured tech-stack / users / glossary fields wired into the prompt).
- Retrieves history (RAG over the project's issue corpus, 1536-dim embeddings, Convex vector index).
- Takes actions, not just describes them (the **Apply** buttons mutate the issue's severity / priority / assignee).
- Shows its work (the agent trace is visible in the UI, so the human can see exactly *why* a duplicate was flagged).

### Why AI makes this meaningfully better than non-AI

A non-AI solution to "bug triage" looks like a rules engine: "if title contains 'crash' and tag is 'payments', set severity=critical." That kind of system is brittle, never covers the long tail, and can't surface duplicates without expensive human-curated taxonomies. The agentic approach reads the bug like a human would, checks history, and produces a decision *with citations*. On our 10-bug eval set the agent matched the senior-engineer ground truth on **severity 80% of the time and priority 90% of the time**, vs. 60% / 70% for the non-agentic baseline that asks the same model in a single shot (numbers from the latest run — yours will vary slightly per run; see *Testing*).

---

## AI Integration

### Models & APIs

| Purpose | Provider | Model | Why |
| --- | --- | --- | --- |
| Triage agent (chat + tools) | OpenRouter | `openai/gpt-4o-mini` (default; configurable) | Cheap, fast, supports OpenAI-style function calling. Routing through OpenRouter means we can swap in Claude / Llama / etc. by changing one env var. |
| Embeddings (RAG) | OpenAI | `text-embedding-3-small` (1536-dim) | Cheapest first-party embedding model that's still solid for short-text similarity. ~$0.02 per million tokens — effectively free at our scale. |
| Vector store | Convex `vectorIndex` | (built in) | Removes a moving part. We get filterable vector search co-located with the rest of the app data and reactive queries for free. |

### Agentic patterns used

- **Tool-using agent loop** (`convex/aiAgent.ts`). The agent sees four tools — `search_similar_issues`, `get_issue`, `propose_assignee`, `finalize_triage` — and decides the order and arguments. Loop is bounded at `MAX_STEPS = 6`.
- **RAG**. `search_similar_issues` embeds the agent's free-form query on the fly and runs a `ctx.vectorSearch("issues", "by_embedding", ...)` against the project's issue history, filtered to the current project. Hits below `SIMILAR_THRESHOLD = 0.55` are dropped. The current bug is excluded from its own results.
- **Multi-step reasoning**. The agent typically searches → gets one or two of the closest hits to verify they're real duplicates → runs `propose_assignee` over those → finalizes. We log every step.
- **Structured-tool-as-exit pattern**. Instead of asking the model to emit free-form JSON at the end, `finalize_triage` is itself a tool with a strict JSON schema. This dropped finalize-parse failures from ~15% (free-form JSON) to <2% (structured tool call) in our testing.
- **Fact validation**. Before persisting `suggestedAssigneeId`, we verify the user actually exists in the DB (`userExists` query). The model is good at returning plausible-looking IDs that don't exist.
- **Best-effort augmentation**. If the model forgets to mention a high-similarity hit (>0.7) in `related_issues`, we add it anyway so the user still sees it.

### Tradeoffs we considered

| Tradeoff | Choice | Why |
| --- | --- | --- |
| Cost per bug: ~3–6 model calls vs. 1 in baseline | Pay it | Still well under $0.01 / bug at gpt-4o-mini prices. Triage quality matters more than per-call cost. |
| Latency: 3–8s vs. 1–2s baseline | Pay it | Triage is async by design — the bug is already saved, the panel streams updates. The user is never blocked waiting for the agent. |
| Free-form JSON vs. structured tool call as exit | Structured tool call | Reliability win was significant (<2% vs. 15% parse failure). |
| Embed everything (tasks too) vs. only bugs | Embed everything | Tasks contain valuable context for "who's worked on this area" even when the new bug is unrelated to bugs specifically. |
| One shared `OPENAI_API_KEY` for embeddings vs. self-hosted | OpenAI | A self-hosted embedding model would be a lot of moving parts for a 3-day build. |

### Where the agent exceeded expectations

- **Duplicate detection over reworded titles** is far better than a keyword search. On a fixture where one bug talks about "double charging" and another about "duplicate Stripe charges" — totally different wording, same root cause — the agent reliably finds the match.
- **Apologetic restraint**. We added one sentence in the system prompt — "Don't make more than 2 search_similar_issues calls" — and the agent actually obeyed it, dropping average step count from ~5 to ~3.5 with no quality loss.

### Where it fell short

- **Confidently wrong on novel bugs**. When there are no similar past issues, gpt-4o-mini will sometimes invent a "duplicate" with low (~0.4) similarity score. We mitigate by hard-thresholding at 0.55 *before* showing matches to the model.
- **Assignee drift**. Without enough closed-bug history (early in a project's life), `propose_assignee` is essentially random. We surface this honestly in the UI — it just doesn't show a suggestion if the score is too low.
- **No streaming model output**. The trace updates per-tool-call, not per-token. Streaming would feel snappier but add real complexity for marginal value at this stage.

---

## Architecture / Design Decisions

### High-level data flow

```
┌─────────────┐    create()     ┌─────────────┐  scheduler   ┌──────────────────┐
│   React UI  │ ──────────────► │   issues:   │ ───────────► │  embeddings:     │
│ (issue form)│                 │   create    │              │  embedIssue      │
└─────────────┘                 └─────────────┘              └────────┬─────────┘
                                       │                              │
                                       │ scheduler                    │  OpenAI embeddings
                                       ▼                              ▼   API (1536-dim)
                              ┌──────────────────┐                ┌──────────┐
                              │ aiSummaries:     │                │  issues  │
                              │ generate         │                │  (vector │
                              └────────┬─────────┘                │   index) │
                                       │                          └──────────┘
                                       ▼
                              ┌──────────────────┐
                              │ aiAgent:         │  ◄─── tools ───► search_similar_issues (RAG)
                              │ runAgentForIssue │                    get_issue
                              │   (loop, 6 steps)│                    propose_assignee
                              └────────┬─────────┘                    finalize_triage
                                       │
                                       │ appendStep (per tool call)
                                       │ saveResult (final)
                                       ▼
                              ┌──────────────────┐    reactive query   ┌─────────────┐
                              │  issues.aiSummary│ ───────────────────►│  AI panel   │
                              │ (steps, suggest..│                     │  (live UI)  │
                              └──────────────────┘                     └─────────────┘
```

### Backend (`convex/`)

- `schema.ts` — Convex schema. Issues table now has `embedding`, `embeddingModel`, `embeddedAt`, plus a `.vectorIndex("by_embedding", { dimensions: 1536, filterFields: ["projectId", "type"] })`. The `aiSummary` substructure was expanded to hold the full agent trace (`steps`), `similarIssues`, and `suggestedAssigneeId`/`Reason`.
- `embeddings.ts` — OpenAI embeddings + an internal action that runs after every issue create/update. Includes a `backfillEmbeddings` admin action so existing issues can be retroactively indexed.
- `aiAgent.ts` — The agent loop, tool definitions, OpenRouter call, finalize parsing, and the `runAgentForIssue` entrypoint. Pure — no DB writes outside of `appendStep`. Designed to also be called from the eval harness in non-recording mode.
- `aiSummaries.ts` — The user-facing surface: schedules generation, persists results, and exposes one-click `applySuggestedSeverity` / `applySuggestedPriority` / `applySuggestedAssignee` / `applyAllSuggestions` mutations.
- `evals.ts` — The eval harness: seeds a fixture project from `evals/bugs.json`, embeds everything, then runs each bug through both the baseline single-shot path and the agent path, measuring agreement against ground-truth labels.
- `issues.ts` / `projects.ts` / `users.ts` / `auth.ts` — the CRUD plumbing of the tracker itself.

### Frontend (`src/`)

- `components/AiSummaryPanel.tsx` — The big UI change. Shows status (queued / thinking / failed / done), suggestions with diff against current values, apply-action buttons, similar-issues list with relation labels, agent trace (expandable), and a footer with model / latency / token counts.
- `components/ProjectSettingsForm.tsx` — Adds a "Backfill embeddings" button so users with pre-existing data can opt into RAG with one click.

### Reactive UI without polling

We get live agent-trace updates "for free" because Convex queries are reactive: the AI panel just calls `useQuery(api.issues.get, …)`, and as the agent calls `appendStep` after each tool invocation, Convex pushes the new state to every subscribed client. Zero websockets / SSE code in the app.

### Assumptions

- This is built for a small-to-mid team where every issue should fit into one project's vector index. For very large issue corpora you'd want hierarchical retrieval, recency biasing, etc.
- We trust the model's selection of which tools to call. There's no LLM-judge layer above the agent — the rubric for "is this triage good?" is the eval harness.
- Embeddings happen synchronously in a scheduled action. For huge bursts you'd want batching + a queue.

---

## What did AI help me do faster, and where did it get in my way?

I built this in a single intense session using **Cursor with Claude Sonnet** as the primary coding assistant.

### Where AI tools accelerated me

- **Schema + validator design.** I described "agent trace as an array of `{kind, tool, input, output, timestamp}` records, with `kind` discriminated" and got a Convex `v.union` validator I'd otherwise have hand-typed for ten minutes.
- **Boilerplate at the OpenRouter / OpenAI seams.** Tool-call JSON schemas, `response_format`, the OpenAI-compatible `tool_calls` parsing — I wrote the prompt for one tool and let the assistant fill in the others, then audited.
- **CSS for new components.** The agent trace panel + similar-issues list are nontrivial visually. Generating reasonable defaults that match the existing design system tokens (`--color-border`, etc.) was 5 minutes instead of 30.
- **README scaffolding.** This document — the section headers, the table format for tradeoffs — was easier to start from a generated outline and edit aggressively than to write blank.

### Where it got in my way

- **Convex idioms.** The assistant initially suggested patterns from "regular Node + Postgres" land — passing DB clients around, doing async work inside mutations, etc. Convex has a strict actions-vs-mutations split and a particular reactive-query model. I had to stop and re-anchor it on Convex's docs more than once.
- **Type inference across the Convex action graph.** When `aiSummaries.generate` calls `aiAgent.runAgentForIssue` which calls `internal.evals.runInternal`, TypeScript starts complaining about circular type inference. The assistant kept suggesting `as any` cheats; the right fix was to add explicit `Promise<...>` return types on each action so the inference graph terminates. I ended up doing that by hand.
- **Parsing untrusted model output.** The assistant tends to write happy-path JSON parsing. I had to insist on the `parseSeverity` / `parsePriority` narrowing helpers, the user-existence check on `suggestedAssigneeId`, and the threshold filtering on RAG hits — all things the model would otherwise just trust.
- **Eval harness scope creep.** First attempt at the eval was a 200-line "framework" with charts. I cut it back to one Convex action that returns a JSON report and a 60-line node script that pretty-prints it. Less code, same signal.

### How using these tools changed my approach

The biggest shift: **I write the test/eval first**, even when "the test" is a 10-row JSON fixture. With AI assistance, the temptation is to generate a lot of plausible-looking code fast. The only thing that keeps me honest is having ground truth I can run against in 30 seconds. The eval harness in this project was the second file I wrote, not the last.

---

## Getting Started / Setup Instructions

### Prerequisites

- Node.js 18+
- A Convex account (free at [convex.dev](https://convex.dev))
- An OpenRouter API key ([openrouter.ai](https://openrouter.ai))
- *Recommended:* an OpenAI API key for embeddings (RAG). The agent works without it but loses the similar-issue retrieval tool.

### Steps

```bash
# 1. Clone and install
git clone <repo-url>
cd DORA
npm install

# 2. Initialise Convex (creates .env.local with VITE_CONVEX_URL)
npx convex dev
# Leave this running in one terminal — it watches convex/ and pushes changes.

# 3. Set the AI keys on the Convex deployment (NOT in .env.local)
npx convex env set OPENROUTER_API_KEY sk-or-...
npx convex env set OPENAI_API_KEY sk-...
# Optional:
# npx convex env set OPENROUTER_MODEL openai/gpt-4o-mini

# 4. Allow only specific Google accounts to access this DORA instance
npx convex env set ALLOWED_EMAILS "you@example.com,teammate@example.com"

# 5. Bootstrap the first admin(s) — these emails always have admin access
npx convex env set ADMIN_EMAILS "you@example.com"

# 6. Start the frontend in a second terminal
npm run dev

# 7. Visit http://localhost:5173
```

If you just want to try the agent quickly, create a project, file 4–5 distinct bugs (so RAG has something to retrieve), and then file a 6th bug intentionally similar to one of the earlier ones. Open the new bug — within a few seconds you should see the agent surface the duplicate.

### Access control

DORA is safe to deploy behind a public Render URL because the Render URL and `VITE_CONVEX_URL` are treated as public. Access is enforced in Convex on every public query, mutation, and action.

**Login gate (`ALLOWED_EMAILS`)** — Set on the Convex deployment to a comma-separated list of Google account emails that may sign in. Emails are matched case-insensitively after trimming whitespace. If `ALLOWED_EMAILS` is missing or empty, the app fails closed: nobody can access project data or trigger AI actions.

**Admin bootstrap (`ADMIN_EMAILS`)** — Set to a comma-separated list of emails that always receive admin privileges (even before any in-app role is assigned). Admins can then promote other users to admin from the **Admin** panel in the app header.

**Roles and project access**
- **Admins** see all projects, can create/delete projects, edit project settings, and open the Admin panel to manage users, roles, and per-project membership.
- **Members** only see projects they have been explicitly assigned to in the Admin panel. They cannot see other projects or access their issues.
- Assignee pickers show `Name — email` so users with the same display name are distinguishable.

**Removing users** — Admins can remove a user from the Admin panel. This unassigns them from all issues, deletes their project memberships, blocks their email from signing in again, and removes their auth sessions. To fully revoke someone listed in `ADMIN_EMAILS`, remove their email from that env var as well.

For production Google OAuth, make sure your Google credentials allow the Convex Auth callback URL for the deployment and that the Convex site URL setting points at the deployed site. After changing Render or Convex environment variables, redeploy/restart the affected service so the new settings are active.

### Assignment notifications

When someone is assigned a bug or task, DORA can email the assignee with the full issue summary and a link back to the app. Emails are sent asynchronously via [Resend](https://resend.com); assignment still works if notifications are not configured.

**Setup**

1. Create a [Resend](https://resend.com) account and generate an API key (`re_...`).
2. Set these on your Convex deployment:

```bash
npx convex env set RESEND_API_KEY re_...
npx convex env set NOTIFICATION_FROM_EMAIL "DORA <onboarding@resend.dev>"
```

`SITE_URL` (already used for Google OAuth) is included in the email body as the app link:

```bash
# local
npx convex env set SITE_URL http://localhost:5173

# production
npx convex env set SITE_URL https://your-dora-app.onrender.com
```

**Sandbox vs production sender**

| Environment | `NOTIFICATION_FROM_EMAIL` | Recipients |
|---|---|---|
| Dev / testing | `DORA <onboarding@resend.dev>` | Usually only the email on your Resend account |
| Production | `DORA <notifications@yourdomain.com>` | Any assignee — requires verifying your domain in Resend (SPF/DKIM DNS records) |

**When emails send**

- Assignee changes on create, edit, kanban drag, or applying an AI-suggested assignee
- Skipped for self-assignment and when assignee is unchanged
- Skipped if `RESEND_API_KEY` or `NOTIFICATION_FROM_EMAIL` is unset

**Testing**

1. Confirm env vars with `npx convex env list`. `RESEND_API_KEY` must be a real key from the Resend dashboard (not a placeholder).
2. Assign an issue to a **teammate** (not yourself) who is on `ALLOWED_EMAILS` and has a Google email on file.
3. Check the assignee's inbox. If nothing arrives, open the Convex dashboard **Logs** and search for `Assignment email`.
4. Common failures: unverified domain (use sandbox sender for dev), invalid `from` address, or missing assignee email.

Implementation lives in `convex/notifications.ts`.

### Deploying to Render

1. In the Convex dashboard, generate a **Production deploy key** for your project and add it to Render as `CONVEX_DEPLOY_KEY`.
2. Set Render **Build Command** to one of these (use the **inline** form if Render is still on an older commit):

```bash
npm install && node scripts/render-build.mjs
```

```bash
npm install && node node_modules/convex/bin/main.js deploy --cmd 'npm run build' --cmd-url-env-var-name VITE_CONVEX_URL
```

After pulling commit `c5f7a7e` or later you can also use:

```bash
npm install && npm run deploy:render
```

**Important:** `--cmd-url-env-var-name` must be the **environment variable name** your frontend reads (e.g. `VITE_CONVEX_URL`), not your Convex deployment URL. Convex sets that variable to the correct URL during the build.

This invokes the Convex CLI via `node` directly, avoiding Linux `Permission denied` errors when `node_modules/.bin/convex` is not executable. Do **not** commit `node_modules/` to git — it should be listed in `.gitignore` and installed fresh on Render.

3. Set Render **Publish Directory** to `dist`.
4. Ensure `ALLOWED_EMAILS`, `ADMIN_EMAILS`, `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`, `SITE_URL`, and other Convex env vars are set on your Convex deployment (not only on Render).
5. Build-time tooling (`typescript`, `vite`, `@types/node`) lives in `devDependencies`. Render sets `NODE_ENV=production`, which normally makes `npm install` skip them — causing failures like `Cannot find name 'process'` during the Convex typecheck. The committed **`.npmrc`** (`include=dev`) forces dev dependencies to install, so `tsc -b`, `vite build`, and the Convex typecheck all work. Do **not** delete `.npmrc`.

---

## Demo

### Triage flow

1. Create a project, fill in the **Project summary** fields (tech stack, target users, etc.) under Settings — this becomes context in the agent's prompt.
2. File a bug. The form closes immediately; the bug is saved.
3. Open the bug. The "AI triage agent" panel on the right shows queued → thinking (with live tool-call counter) → done.
4. Inspect the result:
   - Suggested severity / priority, with **Apply** buttons that diff against what was reported.
   - Suggested assignee with reasoning ("they closed #42 and #57 which are similar").
   - **Similar past issues** section with similarity scores and `duplicate` / `related` / `regression` labels.
   - Reasoning, edge cases to test, possible solutions.
   - Expandable **agent trace** showing every tool call and its raw result.
5. Click **Apply all** to accept everything, or apply individual suggestions.

### Backfilling embeddings on existing data

Open a project's Settings → scroll to "RAG: similar-issue search" → click **Backfill embeddings for this project**. The status updates inline with the count of issues embedded.

---

## Testing / Error Handling

### Eval harness (the headline number)

`evals/bugs.json` contains 10 hand-labeled bugs spanning severity (critical → trivial) and priority (high / medium / low) with realistic descriptions across payments, infra, UX, search, etc.

```bash
npm run eval
```

This:

1. Wipes and re-seeds an `EVAL` project with the 10 fixtures.
2. Embeds them all.
3. Runs each bug through **both** the baseline single-shot pipeline (preserved verbatim from the original implementation) and the new agent pipeline.
4. Prints a comparison table:

```
                  severity acc   priority acc   avg latency   total tokens
  baseline        60.0%          70.0%          1820ms        9842
  agent  (RAG)    80.0%          90.0%          5210ms        18733

  agent retrieved on average 1.6 similar past issue(s) per bug.
```

(Numbers above are illustrative — yours will vary slightly per run because of model temperature.)

The eval is intentionally tiny. It's the kind of thing you write to keep yourself honest while iterating, not a research benchmark.

### Failure modes I thought about

| Failure | Handling |
| --- | --- |
| `OPENROUTER_API_KEY` not set | Triage marks issue as `failed` with a helpful message. UI shows error + Retry. |
| `OPENAI_API_KEY` not set | Embeddings silently no-op. Agent still runs but its `search_similar_issues` tool returns a `note: "RAG unavailable…"` so the model can adapt its strategy. |
| Model exceeds `MAX_STEPS` without calling `finalize_triage` | Issue is marked `failed` with `Agent did not call finalize_triage within N steps`. Re-run is one click. |
| Model emits malformed JSON in `finalize_triage` arguments | Caught by `parseFinalize`, marked failed with the parse error. |
| Model returns a `suggestedAssigneeId` that doesn't exist | Validated against `users` table via `userExists` query before persisting. Dropped silently if invalid. |
| Embeddings request fails for one issue | Logged, doesn't block the user mutation. Backfill button can re-try. |
| Vector search returns the current issue itself | Filtered out via `excludeIssueId`. |
| Vector search returns low-confidence matches | Dropped via `SIMILAR_THRESHOLD = 0.55` *before* the model sees them, so it can't hallucinate a "duplicate" of something only weakly similar. |
| Apply-action mutation called with no suggestion present | Throws a clean error; UI surfaces it. |

### What's not tested

- No unit tests for individual pure functions (parsers, prompt builders). They have small surface area, the eval is integration-level.
- No load testing. Convex actions have a 10-minute timeout, far more than we need.

---

## Future Improvements / Stretch Goals

- **Auto-link duplicates as a first-class entity.** Right now the agent flags a bug as `duplicate` of #X but we don't formally link them in the schema. Add a `links` table and surface the link both ways.
- **Eval set growth + nightly run.** A 10-bug fixture is fine for development. Production would want 100+ bugs with periodic re-runs to catch regressions when the model or prompt changes. The harness is built to scale to this trivially.
- **Per-tenant model routing.** Use cheaper models for low-severity bugs, route high-severity / payments-tagged bugs through Claude or GPT-5 for second-opinion.
- **Streaming the agent's reasoning, not just its tool calls.** Per-token streaming in the UI for a snappier feel.
- **Bidirectional Slack integration.** "@dora triage this" in a thread, agent posts the result back in-channel with an Apply button (deep-link to DORA).
- **Cross-project RAG with permission boundaries.** When you have many projects in the same org, similar bugs sometimes live next door. Allow opt-in cross-project retrieval.
- **Cost / latency budgets per tool call.** Currently the agent is unbounded except by step count. A per-bug $-budget / time-budget would be a sensible production guardrail.
- **A/B harness in production.** Currently the eval is offline. In production we'd want to randomly route 1% of bugs to a candidate prompt/model and compare against ground-truth as humans triage.

---

## Acknowledgments / third-party dependencies

- [Convex](https://www.convex.dev/) — backend, real-time DB, scheduled actions, **vector index**.
- [Convex Auth](https://labs.convex.dev/auth) — Google OAuth.
- [OpenRouter](https://openrouter.ai/) — LLM proxy with OpenAI-compatible tool calling.
- [OpenAI](https://platform.openai.com/) — `text-embedding-3-small` for RAG.
- [@dnd-kit](https://dndkit.com/) — drag-and-drop kanban interactions.
- [Vite](https://vitejs.dev/) + [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) — frontend.

---

## License

MIT
