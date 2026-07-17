#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseArgs } from "./lib/common.mjs";
import { freePort, runCommand, startProcess, stopProcess, waitForUrl } from "./lib/lighting-e2e-runner.mjs";
import { startMockHomeServer } from "./lib/mock-home-server.mjs";
import { validateThemePresetProductionContracts } from "./lib/theme-matrix-contracts.mjs";
import { planThemePresetProductionMatrix } from "./lib/theme-matrix-planner.mjs";
import {
  buildThemeProductionArgs,
  captureGeneratedThemeArtifacts,
  selectThemeProductionCases,
} from "./lib/theme-production-matrix.mjs";
import { runThemeTargetBrowserE2E } from "./lib/theme-target-e2e-runner.mjs";

const args = parseArgs();
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const yeelightRoot = path.resolve(skillRoot, "../..");
const evidenceDir = path.resolve(String(args["evidence-dir"] || path.join(os.tmpdir(), `ypa-theme-production-${Date.now()}`)));
const runtimeBin = path.join(os.tmpdir(), `ypa-theme-production-runtime-${process.pid}`);
const plan = planThemePresetProductionMatrix();
const themeInputArgs = resolveThemeInputArgs(args);
const summary = { schemaVersion: 3, kind: "mandatory-preset-production", startedAt: new Date().toISOString(), evidenceDir, commands: [], plan, contracts: null, themeInput: summarizeThemeInput(args), targets: [] };
fs.mkdirSync(evidenceDir, { recursive: true });

try {
  const selectedCases = selectThemeProductionCases(plan, {
    caseIds: list(args.case),
    presetIds: list(args.preset),
    familyIds: list(args.family),
    batches: list(args.batch),
  });
  summary.selection = selectedCases.map(({ id }) => id);
  summary.contracts = validateThemePresetProductionContracts(plan);
  if (summary.contracts.status !== "passed") throw new Error("主题预设纯编译合同失败");
  runStep("runtime-build", "go", ["build", "-o", runtimeBin, "../yeelight-home/cmd/yeelight-home"], { cwd: yeelightRoot });
  const { chromium } = await import(pathToFileURL(path.join(resolvePlaywrightModuleDir(), "playwright", "index.mjs")).href);
  for (const item of selectedCases) summary.targets.push(await validateTarget(item, chromium));
  summary.status = summary.targets.length === selectedCases.length && summary.targets.every(({ status }) => status === "passed") ? "passed" : "failed";
} catch (error) {
  summary.status = "failed";
  summary.error = error instanceof Error ? error.stack || error.message : String(error);
} finally {
  summary.finishedAt = new Date().toISOString();
  writeJson(path.join(evidenceDir, "theme-matrix-plan.json"), plan);
  if (summary.contracts) writeJson(path.join(evidenceDir, "theme-matrix-contracts.json"), summary.contracts);
  writeJson(path.join(evidenceDir, "theme-target-summary.json"), summary);
  fs.rmSync(runtimeBin, { force: true });
}

console.log(JSON.stringify({
  status: summary.status,
  evidenceDir,
  targets: summary.targets.map((item) => ({ id: item.id, preset: item.themePreset, status: item.status, checks: item.browser?.checks.length || 0 })),
}, null, 2));
if (summary.status !== "passed") process.exit(1);

async function validateTarget(item, chromium) {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), `ypa-${item.id}-`));
  const runtimeHome = fs.mkdtempSync(path.join(os.tmpdir(), `ypa-${item.id}-runtime-`));
  const caseDir = path.join(evidenceDir, "cases", item.id);
  let mockServer;
  let bridge;
  let web;
  const result = {
    id: item.id,
    batch: item.batch,
    familyId: item.familyId,
    themePreset: item.themePreset,
    targetId: item.target.id,
    validationRole: item.validationRole,
    status: "failed",
  };
  fs.mkdirSync(caseDir, { recursive: true });
  try {
    runStep(`${item.id}:build-app`, process.execPath, buildThemeProductionArgs({ item, skillRoot, runtimeBin, appRoot, themeInputArgs }));
    runStep(`${item.id}:npm-install`, "npm", ["ci"], { cwd: appRoot });
    runStep(`${item.id}:npm-build`, "npm", ["run", "build"], { cwd: appRoot });
    runStep(`${item.id}:validate-app`, process.execPath, [path.join(skillRoot, "scripts/validate-app.mjs"), appRoot]);
    result.artifacts = captureGeneratedThemeArtifacts({ appRoot, caseDir });
    result.spec = JSON.parse(fs.readFileSync(path.join(caseDir, "product.spec.json"), "utf8"));
    result.themeLock = JSON.parse(fs.readFileSync(path.join(caseDir, "theme.lock.json"), "utf8"));

    mockServer = await startMockHomeServer({ fixtureId: "reference-home" });
    const bridgePort = await freePort();
    let webPort = await freePort();
    while (webPort === bridgePort) webPort = await freePort();
    const bridgeOrigin = `http://127.0.0.1:${bridgePort}`;
    const baseUrl = `http://127.0.0.1:${webPort}/`;
    const runtimeEnv = {
      YEELIGHT_API_BASE_URL: mockServer.apiBaseUrl,
      YEELIGHT_HOME_ACCESS_TOKEN: mockServer.credential,
      YEELIGHT_HOME_AUTHENTICATED: "1",
      YEELIGHT_HOME_HOUSE_ID: mockServer.homeId,
      YEELIGHT_HOME_DIR: runtimeHome,
      YEELIGHT_CLOUD_REGION: "dev",
      YEELIGHT_HOME_BIN: runtimeBin,
    };
    bridge = startProcess("npm", ["--workspace", "@app/bridge", "run", "dev"], { cwd: appRoot, env: { ...runtimeEnv, YPA_BRIDGE_PORT: String(bridgePort), YPA_TRUSTED_WEB_ORIGINS: baseUrl } });
    web = startProcess("npm", ["--workspace", "@app/web", "run", "dev", "--", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], { cwd: appRoot, env: { YPA_RELAY_ORIGIN: bridgeOrigin } });
    await waitForUrl(`${bridgeOrigin}/health`);
    await waitForUrl(baseUrl);
    result.browser = await runThemeTargetBrowserE2E({ chromium, baseUrl, target: browserTarget(item, result.spec, result.themeLock), evidenceDir: caseDir });
    writeJson(path.join(caseDir, "browser-report.json"), result.browser);
    result.status = result.browser.status;
  } catch (error) {
    result.error = error instanceof Error ? error.stack || error.message : String(error);
  } finally {
    if (bridge) result.bridgeLog = bridge.logs.join("").slice(-8000);
    if (web) result.webLog = web.logs.join("").slice(-8000);
    await stopProcess(web);
    await stopProcess(bridge);
    if (mockServer) await mockServer.close();
    fs.rmSync(runtimeHome, { recursive: true, force: true });
    fs.rmSync(appRoot, { recursive: true, force: true });
    result.commands = summary.commands.filter(({ id }) => id.startsWith(`${item.id}:`));
    result.finishedAt = new Date().toISOString();
    writeJson(path.join(caseDir, "case-summary.json"), result);
  }
  return result;
}

function browserTarget(item, spec, themeLock) {
  const theme = spec?.theme || {};
  return {
    id: item.id,
    title: `易来 PRO ${item.title}`,
    viewport: item.target.viewport,
    inputMode: item.target.inputMode,
    productProfile: item.target.productProfile,
    formFactor: item.target.formFactor,
    navigation: item.target.navigation,
    density: theme.density || item.density,
    mode: theme.mode || item.mode,
    themePreset: theme.preset || item.themePreset,
    themeFamily: themeLock?.familyId || item.familyId,
    validationRole: item.validationRole,
    expected: {
      formFactor: item.target.formFactor,
      navigation: item.target.navigation,
      density: theme.density || item.density,
      themePreset: theme.preset || item.themePreset,
      themeFamily: themeLock?.familyId || item.familyId,
      themeMode: theme.mode || item.mode,
    },
  };
}

function runStep(id, command, commandArgs, options = {}) {
  const result = runCommand(command, commandArgs, { cwd: options.cwd || skillRoot, timeoutMs: 240000 });
  summary.commands.push({ id, ...result, stdout: result.stdout.slice(-8000), stderr: result.stderr.slice(-8000) });
  if (result.status !== 0) throw new Error(`${id} failed: ${result.stderr || result.stdout}`);
}

function resolvePlaywrightModuleDir() {
  if (process.env.YPA_PLAYWRIGHT_MODULE_DIR) return path.resolve(process.env.YPA_PLAYWRIGHT_MODULE_DIR);
  const result = spawnSync("npx", ["--yes", "--package", "playwright", "sh", "-c", 'dirname "$(dirname "$(command -v playwright)")"'], { cwd: skillRoot, env: process.env, encoding: "utf8" });
  const moduleDir = result.stdout.trim().split(/\r?\n/).at(-1) || "";
  if (result.status !== 0 || !fs.existsSync(path.join(moduleDir, "playwright", "index.mjs"))) throw new Error(`无法定位 Playwright 模块。${result.stderr.trim()}`);
  return moduleDir;
}

function list(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function resolveThemeInputArgs(input) {
  if (input["theme-file"]) return ["--theme-file", path.resolve(String(input["theme-file"]))];
  if (!input["theme-pack"] && !input.palette) return [];
  const values = [];
  for (const [flag, key] of [["--theme-pack", "theme-pack"], ["--palette", "palette"], ["--mode", "mode"], ["--density", "density"]]) {
    if (input[key]) values.push(flag, String(input[key]));
  }
  return values;
}

function summarizeThemeInput(input) {
  if (input["theme-file"]) {
    const file = path.resolve(String(input["theme-file"]));
    const content = fs.readFileSync(file);
    return { type: "theme-file", bytes: content.length, sha256: cryptoDigest(content) };
  }
  if (input["theme-pack"] || input.palette) return { type: "legacy", pack: input["theme-pack"] || null, palette: input.palette || null, mode: input.mode || null, density: input.density || null };
  return { type: "preset-defaults" };
}

function cryptoDigest(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
