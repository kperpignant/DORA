import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const logPath = path.resolve(root, "..", "debug-fd27bd.log");
const endpoint =
  "http://127.0.0.1:7705/ingest/1b382383-a8f3-4b3c-bf0a-8ec5fa27d79f";

function log(hypothesisId, message, data) {
  const entry = {
    sessionId: "fd27bd",
    runId: process.env.DEBUG_RUN_ID ?? "diagnose",
    hypothesisId,
    location: "scripts/diagnose-render-build.mjs",
    message,
    data,
    timestamp: Date.now(),
  };
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
  fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "fd27bd",
    },
    body: JSON.stringify(entry),
  }).catch(() => {});
}

const binPath = path.join(root, "node_modules", ".bin", "convex");
const mainPath = path.join(root, "node_modules", "convex", "bin", "main.js");
const convexDir = path.join(root, "convex");

// #region agent log
log("H1", "convex directory shadowing check", {
  convexDirExists: fs.existsSync(convexDir),
  convexDirIsDirectory: fs.existsSync(convexDir) && fs.statSync(convexDir).isDirectory(),
});
// #endregion

let binStat = null;
if (fs.existsSync(binPath)) {
  binStat = fs.statSync(binPath);
  // #region agent log
  log("H2", "node_modules/.bin/convex permissions", {
    modeOctal: (binStat.mode & 0o777).toString(8),
    isExecutable: Boolean(binStat.mode & 0o111),
    size: binStat.size,
  });
  // #endregion
} else {
  // #region agent log
  log("H2", "node_modules/.bin/convex missing", {});
  // #endregion
}

const npxResult = spawnSync("npx", ["convex", "--version"], {
  cwd: root,
  shell: true,
  encoding: "utf8",
});
// #region agent log
log("H3", "npx convex --version result", {
  status: npxResult.status,
  error: npxResult.error?.message ?? null,
  stderr: npxResult.stderr?.trim() ?? "",
  stdout: npxResult.stdout?.trim() ?? "",
});
// #endregion

const nodeResult = spawnSync(
  process.execPath,
  [mainPath, "--version"],
  { cwd: root, encoding: "utf8" }
);
// #region agent log
log("H4", "node convex/bin/main.js --version result", {
  status: nodeResult.status,
  stderr: nodeResult.stderr?.trim() ?? "",
  stdout: nodeResult.stdout?.trim() ?? "",
});
// #endregion

console.log("Diagnosis written to debug-fd27bd.log");
console.log(JSON.stringify({ binStat, npxStatus: npxResult.status, nodeStatus: nodeResult.status }, null, 2));
