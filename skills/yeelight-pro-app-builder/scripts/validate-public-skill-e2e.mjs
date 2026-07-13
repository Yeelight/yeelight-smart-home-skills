#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs } from "./lib/common.mjs";
import { runCommand } from "./lib/lighting-e2e-runner.mjs";
import { buildProductArgs, publicJourneyValidators, publicProductProfiles, resolvePublicSkillStage, summarizePublicProduct } from "./lib/public-skill-matrix.mjs";
import { auditGeneratedProductDifferences, inspectGeneratedProduct } from "./lib/source-difference-auditor.mjs";

const args = parseArgs();
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const yeelightRoot = path.resolve(skillRoot, "../..");
const evidenceDir = path.resolve(String(args["evidence-dir"] || path.join(os.tmpdir(), `ypa-public-skill-e2e-${Date.now()}`)));
const appsRoot = path.join(evidenceDir, "apps");
const runtimeBin = path.join(evidenceDir, "bin", "yeelight-home");
const summary = { schemaVersion: 1, startedAt: new Date().toISOString(), evidenceDir, commands: [], stage: null, products: [], differenceReport: null, journeys: [] };

try {
  ensureFreshDirectory(evidenceDir);
  fs.mkdirSync(path.dirname(runtimeBin), { recursive: true });
  fs.mkdirSync(appsRoot, { recursive: true });
  summary.stage = resolvePublicSkillStage({ yeelightRoot, version: String(args.version || "0.1.0"), explicitRoot: String(args["skill-root"] || "") });
  step("runtime-build", "go", ["build", "-o", runtimeBin, "../yeelight-home/cmd/yeelight-home"], { cwd: yeelightRoot });
  for (const product of publicProductProfiles) validateProduct(product);
  summary.differenceReport = auditGeneratedProductDifferences(summary.products.map(({ inspection }) => inspection));
  if (args["include-journeys"]) validateJourneys();
  summary.status = summary.differenceReport.status === "passed" && summary.journeys.every(({ status }) => status === "passed") ? "passed" : "failed";
} catch (error) {
  summary.status = "failed";
  summary.error = error instanceof Error ? error.stack || error.message : String(error);
} finally {
  summary.finishedAt = new Date().toISOString();
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "public-skill-e2e-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
}

console.log(JSON.stringify({
  status: summary.status,
  evidenceDir,
  stage: summary.stage && { root: summary.stage.stageRoot, digest: summary.stage.digest, files: summary.stage.files.length },
  products: summary.products.map(({ profileId, modules, routes, actions, allowlist }) => ({ profileId, modules: modules.length, routes: routes.length, actions: actions.length, allowlist: allowlist.length })),
  journeys: summary.journeys.map(({ id, status, checks }) => ({ id, status, checks })),
  failed: summary.differenceReport?.checks.filter(({ status }) => status === "failed").map(({ id }) => id) || [],
}, null, 2));
if (summary.status !== "passed") process.exit(1);

function validateProduct(product) {
  const outputRoot = path.join(appsRoot, product.id);
  step(`${product.id}:build-app`, process.execPath, buildProductArgs(product, { stageRoot: summary.stage.stageRoot, runtimeBin, outputRoot }), { cwd: summary.stage.stageRoot, timeoutMs: 600000 });
  step(`${product.id}:validate-app`, process.execPath, [path.join(summary.stage.stageRoot, "scripts/validate-app.mjs"), outputRoot], { cwd: summary.stage.stageRoot });
  step(`${product.id}:npm-install`, "npm", ["install", "--workspaces", "--include-workspace-root"], { cwd: outputRoot, timeoutMs: 600000 });
  step(`${product.id}:npm-build`, "npm", ["run", "build"], { cwd: outputRoot, timeoutMs: 600000 });
  const inspection = inspectGeneratedProduct(outputRoot, product.id);
  summary.products.push({ ...summarizePublicProduct(product, inspection, outputRoot), inspection });
}

function validateJourneys() {
  const byId = new Map(summary.products.map((product) => [product.profileId, product]));
  for (const journey of publicJourneyValidators) {
    const product = byId.get(journey.productId);
    if (!product) throw new Error(`综合旅程缺少产品：${journey.productId}`);
    const targetEvidence = path.join(evidenceDir, "journeys", journey.id);
    const script = path.join(skillRoot, "scripts", journey.script);
    const result = step(`journey:${journey.id}`, process.execPath, [script, "--app", product.outputRoot, "--evidence-dir", targetEvidence], { cwd: skillRoot, timeoutMs: 600000 });
    const evidenceFile = findSummary(targetEvidence);
    const evidence = JSON.parse(fs.readFileSync(evidenceFile, "utf8"));
    const checks = Array.isArray(evidence.browser?.checks) ? evidence.browser.checks.length : Array.isArray(evidence.checks) ? evidence.checks.length : 0;
    summary.journeys.push({ id: journey.id, script: journey.script, productId: journey.productId, status: evidence.status === "passed" && result.status === 0 ? "passed" : "failed", checks, evidenceFile });
  }
}

function step(id, command, commandArgs, options = {}) {
  const result = runCommand(command, commandArgs, options);
  summary.commands.push({ id, command: result.command, status: result.status, stdout: result.stdout.slice(-12000), stderr: result.stderr.slice(-12000) });
  if (result.status !== 0) throw new Error(`${id} failed: ${result.stderr || result.stdout}`);
  return result;
}

function ensureFreshDirectory(directory) {
  if (fs.existsSync(directory) && fs.readdirSync(directory).length > 0) throw new Error(`证据目录必须为空：${directory}`);
  fs.mkdirSync(directory, { recursive: true });
}

function findSummary(directory) {
  const candidates = fs.readdirSync(directory).filter((name) => name.endsWith("summary.json")).sort();
  if (candidates.length !== 1) throw new Error(`旅程证据目录需要且只能包含一个 summary：${directory}`);
  return path.join(directory, candidates[0]);
}
