#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { parseArgs } from "./lib/common.mjs";
import { loadThemeCatalog } from "./lib/theme-catalog.mjs";
import { planThemePresetProductionMatrix } from "./lib/theme-matrix-planner.mjs";
import { normalizeThemeSpec } from "./lib/theme-spec.mjs";
import { compileThemeTokens } from "./lib/theme-token-compiler.mjs";

const args = parseArgs();
const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const evidenceDir = path.resolve(String(args["evidence-dir"] || "custom-theme-evidence"));
const runner = path.join(scriptRoot, "validate-theme-target-matrix.mjs");
const builder = path.join(scriptRoot, "build-app.mjs");
const plan = planThemePresetProductionMatrix();
const catalog = loadThemeCatalog();
const report = { schemaVersion: 1, kind: "custom-theme-production-audit", startedAt: new Date().toISOString(), cases: [], dimensions: [], rejectedCases: [] };

fs.mkdirSync(path.join(evidenceDir, "inputs"), { recursive: true });

try {
  for (const definition of customCases()) report.cases.push(runCustomCase(definition));
  report.dimensions = validateControlledDimensions();
  report.rejectedCases = validateRejectedInputs();
  report.status = report.cases.every(({ status }) => status === "passed")
    && report.dimensions.every(({ status }) => status === "passed")
    && report.rejectedCases.every(({ status }) => status === "rejected-before-runtime")
    ? "passed" : "failed";
} catch (error) {
  report.status = "failed";
  report.error = error instanceof Error ? error.stack || error.message : String(error);
} finally {
  report.finishedAt = new Date().toISOString();
  writeJson(path.join(evidenceDir, "custom-theme-audit.json"), report);
}

console.log(JSON.stringify({ status: report.status, evidenceDir, cases: report.cases.map(({ id, status, checks }) => ({ id, status, checks })), rejected: report.rejectedCases.length }, null, 2));
if (report.status !== "passed") process.exit(1);

function customCases() {
  return [
    { id: "warm-brand", productionCaseId: "linen-home--tablet", colors: { brand: "#F4B860", accent: "#D97706" } },
    { id: "saturated-light-brand", productionCaseId: "pro-daylight--desktop", colors: { brand: "#00FF88", accent: "#FF00FF" } },
    { id: "deep-dark-brand", productionCaseId: "obsidian-focus--desktop", colors: { brand: "#07111F", accent: "#18B6A4" } },
  ];
}

function runCustomCase(definition) {
  const item = plan.cases.find(({ id }) => id === definition.productionCaseId);
  if (!item) throw new Error(`缺少自定义主题生产 case：${definition.productionCaseId}`);
  const spec = {
    schemaVersion: 1,
    preset: item.themePreset,
    mode: item.mode,
    density: item.density,
    colors: definition.colors,
    typography: item.typography,
    shape: item.shape,
    motion: item.motion,
  };
  const inputPath = path.join(evidenceDir, "inputs", `${definition.id}.json`);
  const caseDir = path.join(evidenceDir, "cases", definition.id);
  writeJson(inputPath, spec);
  const command = run(process.execPath, [runner, "--case", item.id, "--theme-file", inputPath, "--evidence-dir", caseDir], 600_000);
  const summary = readJson(path.join(caseDir, "theme-target-summary.json"));
  const target = summary.targets?.[0];
  const generatedCaseDir = path.join(caseDir, "cases", item.id);
  const lock = readJson(path.join(generatedCaseDir, "theme.lock.json"));
  const productSpec = readJson(path.join(generatedCaseDir, "product.spec.json"));
  const adjustmentCount = lock.adjustments?.length || 0;
  const status = command.status === 0 && summary.status === "passed" && target?.status === "passed"
    && productSpec.schemaVersion === 4 && adjustmentCount > 0 ? "passed" : "failed";
  return {
    id: definition.id,
    productionCaseId: item.id,
    status,
    checks: target?.browser?.checks?.length || 0,
    input: { path: `inputs/${definition.id}.json`, bytes: fs.statSync(inputPath).size, sha256: digest(fs.readFileSync(inputPath)) },
    normalizedSpec: lock.normalizedSpec,
    resolvedDigest: lock.resolvedDigest,
    adjustmentCount,
    adjustments: lock.adjustments,
    screenshotEvidence: target?.browser?.screenshotEvidence || null,
    command,
  };
}

function validateControlledDimensions() {
  const groups = {
    mode: ["light", "dark", "auto"],
    density: catalog.densities.map(({ id }) => id),
    typography: catalog.typography.map(({ id }) => id),
    shape: catalog.shapes.map(({ id }) => id),
    motion: catalog.motions.map(({ id }) => id),
    target: catalog.targets.map(({ id }) => id),
  };
  return Object.entries(groups).flatMap(([dimension, values]) => values.map((value) => {
    const preset = dimension === "target"
      ? catalog.presets.find(({ targets }) => targets.includes(value))
      : catalog.presets.find(({ id }) => id === "pro-daylight");
    const input = { schemaVersion: 1, preset: preset.id };
    if (dimension !== "target") input[dimension] = value;
    const normalized = normalizeThemeSpec(input, { catalog, ...(dimension === "target" ? { targetId: value } : {}) });
    const compiled = compileThemeTokens(normalized, { catalog, inputSource: "file" });
    return { dimension, value, preset: preset.id, resolvedDigest: compiled.lock.resolvedDigest, status: "passed" };
  }));
}

function validateRejectedInputs() {
  const definitions = [
    { id: "css", input: { schemaVersion: 1, preset: "pro-daylight", css: ":root{}" } },
    { id: "javascript", input: { schemaVersion: 1, preset: "pro-daylight", javascript: "alert(1)" } },
    { id: "html", input: { schemaVersion: 1, preset: "pro-daylight", html: "<script></script>" } },
    { id: "url", input: { schemaVersion: 1, preset: "pro-daylight", url: "https://example.com/theme.css" } },
    { id: "font-path", input: { schemaVersion: 1, preset: "pro-daylight", font: "/tmp/local.woff2" } },
    { id: "invalid-color", input: { schemaVersion: 1, preset: "pro-daylight", colors: { brand: "red" } } },
    { id: "unknown-preset", input: { schemaVersion: 1, preset: "missing" } },
  ];
  return definitions.map(({ id, input }) => {
    const inputPath = path.join(evidenceDir, "inputs", `invalid-${id}.json`);
    const outputPath = path.join(evidenceDir, "rejected-output", id);
    writeJson(inputPath, input);
    const command = run(process.execPath, [builder, "--request", "验证非法主题输入。", "--theme-file", inputPath, "--mock-home", "reference-home", "--out", outputPath], 60_000);
    return {
      id,
      status: command.status !== 0 && !fs.existsSync(outputPath) ? "rejected-before-runtime" : "failed",
      error: command.stderr.trim(),
      outputCreated: fs.existsSync(outputPath),
    };
  });
}

function run(command, commandArgs, timeout) {
  const result = spawnSync(command, commandArgs, { cwd: scriptRoot, encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024 });
  return { command: [command, ...commandArgs].map((value) => path.basename(value) === value ? value : path.basename(value)).join(" "), status: result.status, signal: result.signal, stdout: result.stdout.slice(-4000), stderr: result.stderr.slice(-4000) };
}

function digest(content) { return crypto.createHash("sha256").update(content).digest("hex"); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
