import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const convexCli = path.join(root, "node_modules", "convex", "bin", "main.js");

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

process.exit(result.status ?? 1);
