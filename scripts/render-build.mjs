import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logPath = path.resolve(root, "..", "debug-fd27bd.log");
const convexCli = path.join(root, "node_modules", "convex", "bin", "main.js");

function log(message, data) {
  const entry = {
    sessionId: "fd27bd",
    runId: process.env.DEBUG_RUN_ID ?? "render-build",
    hypothesisId: "H7",
    location: "scripts/render-build.mjs",
    message,
    data,
    timestamp: Date.now(),
  };
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
}

const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8")
);

// #region agent log
log("render-build entry", {
  hasDeployRenderScript: Boolean(packageJson.scripts?.["deploy:render"]),
  convexCliExists: fs.existsSync(convexCli),
  cwd: root,
});
// #endregion

if (!fs.existsSync(convexCli)) {
  console.error(`Convex CLI not found at ${convexCli}. Run npm install first.`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    convexCli,
    "deploy",
    "--cmd",
    "npm run build",
    "--cmd-url-env-var-name",
    "VITE_CONVEX_URL",
  ],
  { cwd: root, stdio: "inherit" }
);

// #region agent log
log("render-build finished", { exitCode: result.status ?? 1 });
// #endregion

process.exit(result.status ?? 1);
