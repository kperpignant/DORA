#!/usr/bin/env node
/**
 * Convenience runner: read evals/bugs.json and pipe it into the
 * Convex `evals:run` action, then pretty-print the result.
 *
 *   node scripts/run-eval.mjs
 *
 * Requires that you've already run `npx convex dev` once so the
 * deployment is configured.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(__dirname, "..", "evals", "bugs.json");
const fixtures = JSON.parse(readFileSync(fixturePath, "utf8"));

const args = ["convex", "run", "evals:run", JSON.stringify({ fixtures })];

const res = spawnSync("npx", args, {
  stdio: ["ignore", "pipe", "inherit"],
  encoding: "utf8",
  shell: process.platform === "win32",
});

if (res.status !== 0) {
  process.exit(res.status ?? 1);
}

// `npx convex run` prints the function's return value as JSON on the
// last line(s) of stdout. Be defensive — strip any leading log noise.
const out = res.stdout.trim();
const jsonStart = out.indexOf("{");
let report;
try {
  report = JSON.parse(out.slice(jsonStart));
} catch {
  console.log(out);
  process.exit(1);
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const ms = (x) => `${x}ms`;

const { summary, results } = report;
console.log("");
console.log(`Eval set: ${summary.n} hand-labeled bugs`);
console.log("");
console.log(
  "                  severity acc   priority acc   avg latency   total tokens"
);
console.log(
  `  baseline        ${pad(pct(summary.baseline.severityAccuracy), 14)} ${pad(pct(summary.baseline.priorityAccuracy), 14)} ${pad(ms(summary.baseline.avgLatencyMs), 13)} ${summary.baseline.totalTokens}`
);
console.log(
  `  agent  (RAG)    ${pad(pct(summary.agent.severityAccuracy), 14)} ${pad(pct(summary.agent.priorityAccuracy), 14)} ${pad(ms(summary.agent.avgLatencyMs), 13)} ${summary.agent.totalTokens}`
);
console.log("");
console.log(
  `  agent retrieved on average ${summary.agent.avgSimilarFound.toFixed(1)} similar past issue(s) per bug.`
);
console.log("");
console.log("Per-bug breakdown:");
for (const r of results) {
  const baseSev = mark(r.baseline.severityCorrect, r.baseline.severity);
  const basePri = mark(r.baseline.priorityCorrect, r.baseline.priority);
  const agSev = mark(r.agent.severityCorrect, r.agent.severity);
  const agPri = mark(r.agent.priorityCorrect, r.agent.priority);
  console.log(`  • ${r.title.slice(0, 60).padEnd(60)} | gt: ${r.groundTruthSeverity}/${r.groundTruthPriority}`);
  console.log(`      baseline: sev ${baseSev}  pri ${basePri}`);
  console.log(`      agent:    sev ${agSev}  pri ${agPri}  (similar=${r.agent.similarFound})`);
}

function pad(s, n) {
  return String(s).padEnd(n);
}
function mark(ok, v) {
  return `${ok ? "✓" : "✗"} ${v ?? "(none)"}`;
}
