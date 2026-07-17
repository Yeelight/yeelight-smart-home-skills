#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { parseArgs } from "./lib/common.mjs";
import { loadThemeCatalog } from "./lib/theme-catalog.mjs";
import { planThemePresetProductionMatrix } from "./lib/theme-matrix-planner.mjs";
import { migrateLegacyTheme, normalizeProductSpec } from "./lib/theme-migration.mjs";

const args = parseArgs();
const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const evidenceDir = path.resolve(String(args["evidence-dir"] || "legacy-theme-evidence"));
const runner = path.join(scriptRoot, "validate-theme-target-matrix.mjs");
const catalog = loadThemeCatalog();
const plan = planThemePresetProductionMatrix();
const report = { schemaVersion: 1, kind: "legacy-theme-compatibility", startedAt: new Date().toISOString(), migrations: [], productSpecV3: null, realGeneration: null };

fs.mkdirSync(evidenceDir, { recursive: true });

try {
  report.migrations = validateMigrations();
  report.productSpecV3 = validateProductSpecV3();
  report.realGeneration = runRepresentativeLegacyGeneration();
  report.status = report.migrations.every(({ status }) => status === "passed")
    && report.productSpecV3.status === "passed"
    && report.realGeneration.status === "passed" ? "passed" : "failed";
} catch (error) {
  report.status = "failed";
  report.error = error instanceof Error ? error.stack || error.message : String(error);
} finally {
  report.finishedAt = new Date().toISOString();
  writeJson(path.join(evidenceDir, "legacy-theme-compatibility.json"), report);
}

console.log(JSON.stringify({ status: report.status, evidenceDir, migrations: report.migrations.length, realGeneration: report.realGeneration?.status || "missing" }, null, 2));
if (report.status !== "passed") process.exit(1);

function validateMigrations() {
  const modes = Object.fromEntries(catalog.legacyPacks.map(({ id, modes: values }) => [id, values[0]]));
  return catalog.legacyPacks.flatMap(({ id: pack }) => Object.keys(catalog.legacyAliases.palettes).map((palette) => {
    const input = { pack, palette, mode: modes[pack] };
    const first = migrateLegacyTheme(input, "comfortable", { catalog });
    const second = migrateLegacyTheme(input, "comfortable", { catalog });
    return {
      pack,
      palette,
      mode: input.mode,
      preset: first.spec.preset,
      deterministic: JSON.stringify(first) === JSON.stringify(second),
      inputSource: first.inputSource,
      diagnostics: first.diagnostics,
      status: first.inputSource === "legacy" && JSON.stringify(first) === JSON.stringify(second) ? "passed" : "failed",
    };
  }));
}

function validateProductSpecV3() {
  const source = {
    schemaVersion: 3,
    product: { name: "legacy-theme-fixture", title: "旧主题兼容", locale: "zh-CN" },
    target: { formFactor: "desktop", navigation: "sidebar", density: "comfortable" },
    scope: { homeIds: [], roomNames: [], includeAllRooms: true },
    modules: [{ id: "room.lighting-control", options: {} }],
    deviceFamilies: ["light"],
    theme: { pack: "daylight-minimal", palette: "teal-blue", mode: "light" },
    runtime: { contractVersion: "1.0", dataMode: "mock", bridgeMode: "local" },
    diagnostics: [],
  };
  const normalized = normalizeProductSpec(source, { catalog });
  return {
    inputSchemaVersion: source.schemaVersion,
    outputSchemaVersion: normalized.schemaVersion,
    preset: normalized.theme.preset,
    businessScopePreserved: JSON.stringify(source.modules) === JSON.stringify(normalized.modules)
      && JSON.stringify(source.scope) === JSON.stringify(normalized.scope),
    diagnostics: normalized.diagnostics,
    status: normalized.schemaVersion === 4 && normalized.theme.preset === "pro-daylight" ? "passed" : "failed",
  };
}

function runRepresentativeLegacyGeneration() {
  const item = plan.cases.find(({ id }) => id === "linen-home--tablet");
  if (!item) throw new Error("缺少 legacy 代表生产 case");
  const caseDir = path.join(evidenceDir, "real-generation");
  const commandArgs = [
    runner,
    "--case", item.id,
    "--theme-pack", "warm-residential",
    "--palette", "sunset-amber",
    "--mode", "dark",
    "--density", "comfortable",
    "--evidence-dir", caseDir,
  ];
  const result = spawnSync(process.execPath, commandArgs, { cwd: scriptRoot, encoding: "utf8", timeout: 600_000, maxBuffer: 16 * 1024 * 1024 });
  const summary = readJson(path.join(caseDir, "theme-target-summary.json"));
  const target = summary.targets?.[0];
  const generatedCaseDir = path.join(caseDir, "cases", item.id);
  const productSpec = readJson(path.join(generatedCaseDir, "product.spec.json"));
  const lock = readJson(path.join(generatedCaseDir, "theme.lock.json"));
  const diagnostics = productSpec.diagnostics || [];
  const status = result.status === 0 && summary.status === "passed" && target?.status === "passed"
    && productSpec.schemaVersion === 4 && productSpec.theme.preset === "linen-home"
    && diagnostics.some(({ code }) => code === "legacy-theme-migrated") ? "passed" : "failed";
  return {
    status,
    caseId: item.id,
    input: { pack: "warm-residential", palette: "sunset-amber", mode: "dark", density: "comfortable" },
    outputSchemaVersion: productSpec.schemaVersion,
    normalizedTheme: productSpec.theme,
    lockInputSource: lock.inputSource,
    resolvedDigest: lock.resolvedDigest,
    diagnostics,
    checks: target?.browser?.checks?.length || 0,
    screenshotEvidence: target?.browser?.screenshotEvidence || null,
    command: { status: result.status, signal: result.signal, stdout: result.stdout.slice(-4000), stderr: result.stderr.slice(-4000) },
  };
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
