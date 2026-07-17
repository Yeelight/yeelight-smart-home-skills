#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseArgs } from "./lib/common.mjs";
import { createJourneyActions } from "./lib/real-user-journey-actions.mjs";
import { executeJourney } from "./lib/real-user-journey-executor.mjs";
import { assertFreshDirectory, createRequirementCoverageAudit, planJourneyExecution } from "./lib/real-user-journey-runner.mjs";
import { loadRealUserJourneyCatalog } from "./lib/real-user-journeys.mjs";
import { runCommand } from "./lib/lighting-e2e-runner.mjs";

const args = parseArgs();
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const yeelightRoot = path.resolve(skillRoot, "../..");
const catalog = loadRealUserJourneyCatalog();
const requestedIds = list(args.journey);
const unknownIds = requestedIds.filter((id) => !catalog.journeys.some((journey) => journey.id === id));
if (unknownIds.length > 0) {
  console.error(`unknown journey ${unknownIds.join(",")}`);
  process.exit(2);
}
const selectedCatalog = { ...catalog, journeys: requestedIds.length > 0 ? catalog.journeys.filter(({ id }) => requestedIds.includes(id)) : catalog.journeys };
const journeys = planJourneyExecution(selectedCatalog, { includeLive: args["exclude-live"] !== true });

if (args["plan-only"] === true) {
  console.log(JSON.stringify({ status: "planned", journeys }, null, 2));
} else {
  await execute();
}

async function execute() {
  if (!args["evidence-dir"]) {
    console.error("Usage: node scripts/validate-real-user-journeys.mjs --evidence-dir <dir> [--journey J01,J02] [--exclude-live]");
    process.exitCode = 2;
    return;
  }
  const evidenceDir = path.resolve(String(args["evidence-dir"]));
  assertFreshDirectory(evidenceDir);
  const appsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ypa-real-user-apps-"));
  const records = [];
  const summary = { schemaVersion: 1, status: "running", journeyIds: journeys.map(({ id }) => id), records: [] };
  let runtimeBin = args["runtime-bin"] ? path.resolve(String(args["runtime-bin"])) : "";
  let chromium;
  try {
    writeJSON(path.join(evidenceDir, "journey-catalog.json"), redactCatalog(selectedCatalog));
    const hasBuild = selectedCatalog.journeys.some((journey) => journey.resolution.decision === "build" && (journey.runtime.mode !== "live-readonly" || args["exclude-live"] !== true));
    if (hasBuild) {
      if (!runtimeBin) {
        runtimeBin = path.join(appsRoot, "bin", "yeelight-home");
        fs.mkdirSync(path.dirname(runtimeBin), { recursive: true });
        const result = runCommand("go", ["build", "-o", runtimeBin, "../yeelight-home/cmd/yeelight-home"], { cwd: yeelightRoot, timeoutMs: 600000 });
        if (result.status !== 0) throw new Error(`runtime build failed: ${result.stderr || result.stdout}`);
      }
      chromium = await loadChromium();
    }
    for (const plan of journeys) {
      const journey = selectedCatalog.journeys.find(({ id }) => id === plan.id);
      const targetEvidence = path.join(evidenceDir, journey.id);
      const appRoot = path.join(appsRoot, journey.id);
      const actions = journey.resolution.decision === "build" ? createJourneyActions({ journey, skillRoot, runtimeBin, appRoot, evidenceDir: targetEvidence, chromium }) : {};
      const record = await executeJourney({ journey, evidenceDir: targetEvidence, actions });
      records.push(record);
      summary.records.push({ id: record.id, status: record.status });
    }
    summary.requirementAudit = selectedCatalog.journeys.length === 12 && journeys.length === 12
      ? createRequirementCoverageAudit(selectedCatalog, records)
      : { schemaVersion: 1, status: "partial", checkedJourneys: records.map(({ id }) => id) };
    summary.status = records.every(({ status }) => status === "passed") && summary.requirementAudit.status !== "failed" ? "passed" : "failed";
  } catch (error) {
    summary.status = "failed";
    summary.error = safeError(error);
  } finally {
    writeJSON(path.join(evidenceDir, "requirement-coverage-audit.json"), summary.requirementAudit || { schemaVersion: 1, status: "failed", reason: summary.error });
    writeJSON(path.join(evidenceDir, "validation-summary.json"), summary);
    if (args["preserve-apps"] !== true) fs.rmSync(appsRoot, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ status: summary.status, journeys: summary.records, evidenceDir }, null, 2));
  if (summary.status !== "passed") process.exitCode = 1;
}

async function loadChromium() {
  const moduleDir = process.env.YPA_PLAYWRIGHT_MODULE_DIR || resolvePlaywrightModuleDir();
  const module = await import(pathToFileURL(path.join(moduleDir, "playwright", "index.mjs")).href);
  return module.chromium;
}

function resolvePlaywrightModuleDir() {
  const result = spawnSync("npx", ["--yes", "--package", "playwright", "sh", "-c", 'dirname "$(dirname "$(command -v playwright)")"'], { cwd: skillRoot, env: process.env, encoding: "utf8" });
  const moduleDir = result.stdout.trim().split(/\r?\n/).at(-1) || "";
  if (result.status !== 0 || !fs.existsSync(path.join(moduleDir, "playwright", "index.mjs"))) throw new Error(`cannot locate Playwright: ${result.stderr.trim()}`);
  return moduleDir;
}

function redactCatalog(value) {
  const copy = structuredClone(value);
  for (const journey of copy.journeys) if (journey.runtime.mode === "live-readonly") journey.runtime.homeId = "[redacted-live-home]";
  return copy;
}

function list(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function safeError(error) {
  return (error instanceof Error ? error.message : String(error)).replace(/\x42earer\s+\S+|https?:\/\/\S+|(?:token|secret|password)\s*[=:]\s*\S+/gi, "[redacted]").slice(0, 1000);
}

function writeJSON(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
