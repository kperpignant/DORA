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

// #region agent log
// Render-side preflight diagnostics for the TS2591 "Cannot find name 'process'"
// issue. We compute the exact set of files in the app tsc program and whether
// @types/node global types are included, then print to stdout (Render logs).
function preflight() {
  const out = { hypotheses: "H8=appProgramMissingTypesNode, H9=convexSourceInAppProgram, H10=typesNodeFilesMissingOnDisk" };

  const typesNodeDir = path.join(root, "node_modules", "@types", "node");
  out.typesNodeDirExists = fs.existsSync(typesNodeDir);
  out.globalsDtsExists = fs.existsSync(path.join(typesNodeDir, "globals.d.ts"));
  out.indexDtsExists = fs.existsSync(path.join(typesNodeDir, "index.d.ts"));
  out.processDtsExists = fs.existsSync(path.join(typesNodeDir, "process.d.ts"));
  try {
    out.typesNodeVersion = JSON.parse(
      fs.readFileSync(path.join(typesNodeDir, "package.json"), "utf8")
    ).version;
  } catch {
    out.typesNodeVersion = null;
  }

  const tscBin = path.join(root, "node_modules", "typescript", "bin", "tsc");
  const ver = spawnSync(process.execPath, [tscBin, "--version"], {
    cwd: root,
    encoding: "utf8",
  });
  out.tscVersion = (ver.stdout ?? "").trim();

  const listed = spawnSync(
    process.execPath,
    [tscBin, "-p", "tsconfig.app.json", "--listFilesOnly", "--noEmit"],
    { cwd: root, encoding: "utf8" }
  );
  const files = (listed.stdout ?? "").split(/\r?\n/).filter(Boolean);
  out.appProgramFileCount = files.length;
  out.appIncludesTypesNodeGlobals = files.some((f) =>
    f.includes("@types/node/globals.d.ts")
  );
  out.appIncludesAnyTypesNode = files.some((f) => f.includes("@types/node/"));
  out.appIncludesConvexAiAgent = files.some((f) =>
    /[\\/]convex[\\/]aiAgent\.ts$/.test(f)
  );
  out.appIncludesConvexSecurity = files.some((f) =>
    /[\\/]convex[\\/]security\.ts$/.test(f)
  );

  console.log("=== RENDER PREFLIGHT DIAGNOSTIC START ===");
  console.log(JSON.stringify(out, null, 2));
  console.log("=== RENDER PREFLIGHT DIAGNOSTIC END ===");
  log("render-build preflight", out);
}
preflight();
// #endregion

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
