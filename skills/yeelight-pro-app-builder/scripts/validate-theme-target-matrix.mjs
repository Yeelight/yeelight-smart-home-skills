#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseArgs } from "./lib/common.mjs";
import { freePort, runCommand, startProcess, stopProcess, waitForUrl } from "./lib/lighting-e2e-runner.mjs";
import { startMockHomeServer } from "./lib/mock-home-server.mjs";
import { validateThemeMatrixContracts, modulesForProductProfile } from "./lib/theme-matrix-contracts.mjs";
import { runThemeTargetBrowserE2E } from "./lib/theme-target-e2e-runner.mjs";
import { planThemeTargetMatrix, selectBrowserRepresentativeCases } from "./lib/theme-matrix-planner.mjs";

const args = parseArgs();
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const yeelightRoot = path.resolve(skillRoot, "../..");
const evidenceDir = path.resolve(String(args["evidence-dir"] || path.join(os.tmpdir(), `ypa-theme-target-${Date.now()}`)));
const runtimeBin = path.join(os.tmpdir(), `ypa-theme-target-runtime-${process.pid}`);
const plan = planThemeTargetMatrix();
const browserCases = selectBrowserRepresentativeCases(plan);
const requestedCases = String(args.case || "").split(",").map((value) => value.trim()).filter(Boolean);
const selectedBrowserCases = requestedCases.length > 0 ? browserCases.filter(({ id }) => requestedCases.includes(id)) : browserCases;
const summary = { schemaVersion: 2, startedAt: new Date().toISOString(), evidenceDir, commands: [], plan, contracts: null, targets: [] };
fs.mkdirSync(evidenceDir, { recursive: true });

try {
  summary.contracts = validateThemeMatrixContracts(plan);
  if (summary.contracts.status !== "passed") throw new Error("主题目标纯编译合同失败");
  runStep("runtime-build", "go", ["build", "-o", runtimeBin, "../yeelight-home/cmd/yeelight-home"], { cwd: yeelightRoot });
  const { chromium } = await import(pathToFileURL(path.join(resolvePlaywrightModuleDir(), "playwright", "index.mjs")).href);
  if (selectedBrowserCases.length === 0) throw new Error(`未找到指定矩阵 case：${requestedCases.join(", ")}`);
  for (const item of selectedBrowserCases) summary.targets.push(await validateTarget(browserTarget(item), chromium));
  summary.status = summary.targets.every((item) => item.status === "passed") ? "passed" : "failed";
} catch (error) {
  summary.status = "failed"; summary.error = error instanceof Error ? error.stack || error.message : String(error);
} finally {
  summary.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(evidenceDir, "theme-matrix-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  if (summary.contracts) fs.writeFileSync(path.join(evidenceDir, "theme-matrix-contracts.json"), `${JSON.stringify(summary.contracts, null, 2)}\n`);
  fs.writeFileSync(path.join(evidenceDir, "theme-target-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  fs.rmSync(runtimeBin, { force: true });
}
console.log(JSON.stringify({ status: summary.status, evidenceDir, targets: summary.targets.map((item) => ({ id: item.id, status: item.status, checks: item.browser?.checks.length || 0 })) }, null, 2));
if (summary.status !== "passed") process.exit(1);

async function validateTarget(item, chromium) {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), `ypa-${item.id}-`));
  const runtimeHome = fs.mkdtempSync(path.join(os.tmpdir(), `ypa-${item.id}-runtime-`));
  let mockServer; let bridge; let web;
  const result = { id: item.id, appRoot, spec: null, browser: null, status: "failed" };
  try {
    runStep(`${item.id}:build-app`, process.execPath, [path.join(skillRoot, "scripts/build-app.mjs"), "--request", "只生成明确选择的易来 PRO 功能。", "--title", item.title, "--modules", modulesForProductProfile(item.productProfile).join(","), "--form-factor", item.formFactor, "--navigation", item.navigation, "--density", item.density, "--theme-pack", item.pack, "--palette", item.palette, "--mode", item.mode, "--mock-home", "reference-home", "--runtime-bin", runtimeBin, "--out", appRoot]);
    runStep(`${item.id}:npm-install`, "npm", ["install"], { cwd: appRoot });
    runStep(`${item.id}:npm-build`, "npm", ["run", "build"], { cwd: appRoot });
    result.spec = JSON.parse(fs.readFileSync(path.join(appRoot, "product.spec.json"), "utf8"));
    mockServer = await startMockHomeServer({ fixtureId: "reference-home" });
    const bridgePort = await freePort(); let webPort = await freePort(); while (webPort === bridgePort) webPort = await freePort();
    const bridgeOrigin = `http://127.0.0.1:${bridgePort}`; const baseUrl = `http://127.0.0.1:${webPort}/`;
    const runtimeEnv = { YEELIGHT_API_BASE_URL: mockServer.apiBaseUrl, YEELIGHT_HOME_ACCESS_TOKEN: mockServer.credential, YEELIGHT_HOME_AUTHENTICATED: "1", YEELIGHT_HOME_HOUSE_ID: mockServer.homeId, YEELIGHT_HOME_DIR: runtimeHome, YEELIGHT_CLOUD_REGION: "dev", YEELIGHT_HOME_BIN: runtimeBin };
    bridge = startProcess("npm", ["--workspace", "@app/bridge", "run", "dev"], { cwd: appRoot, env: { ...runtimeEnv, YPA_BRIDGE_PORT: String(bridgePort) } });
    web = startProcess("npm", ["--workspace", "@app/web", "run", "dev", "--", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], { cwd: appRoot, env: { YPA_RELAY_ORIGIN: bridgeOrigin } });
    await waitForUrl(`${bridgeOrigin}/health`); await waitForUrl(baseUrl);
    result.browser = await runThemeTargetBrowserE2E({ chromium, baseUrl, target: item, evidenceDir });
    result.status = result.browser.status;
  } catch (error) { result.error = error instanceof Error ? error.stack || error.message : String(error); }
  finally { if (bridge) result.bridgeLog = bridge.logs.join("").slice(-8000); if (web) result.webLog = web.logs.join("").slice(-8000); await stopProcess(web); await stopProcess(bridge); if (mockServer) await mockServer.close(); fs.rmSync(runtimeHome, { recursive: true, force: true }); fs.rmSync(appRoot, { recursive: true, force: true }); }
  return result;
}

function browserTarget(item) {
  return {
    id: item.id,
    title: `易来 PRO ${item.target.productProfile}`,
    viewport: item.target.viewport,
    inputMode: item.target.inputMode,
    productProfile: item.target.productProfile,
    formFactor: item.target.formFactor,
    navigation: item.target.navigation,
    density: item.density,
    pack: item.pack,
    palette: item.palette,
    mode: item.mode,
    expected: { formFactor: item.target.formFactor, navigation: item.target.navigation, density: item.density, themePack: item.pack, themeMode: item.mode },
  };
}
function runStep(id, command, commandArgs, options = {}) { const result = runCommand(command, commandArgs, { cwd: options.cwd || skillRoot, timeoutMs: 240000 }); summary.commands.push({ id, ...result, stdout: result.stdout.slice(-8000), stderr: result.stderr.slice(-8000) }); if (result.status !== 0) throw new Error(`${id} failed: ${result.stderr || result.stdout}`); }
function resolvePlaywrightModuleDir() { if (process.env.YPA_PLAYWRIGHT_MODULE_DIR) return path.resolve(process.env.YPA_PLAYWRIGHT_MODULE_DIR); const result = spawnSync("npx", ["--yes", "--package", "playwright", "sh", "-c", 'dirname "$(dirname "$(command -v playwright)")"'], { cwd: skillRoot, env: process.env, encoding: "utf8" }); const moduleDir = result.stdout.trim().split(/\r?\n/).at(-1) || ""; if (result.status !== 0 || !fs.existsSync(path.join(moduleDir, "playwright", "index.mjs"))) throw new Error(`无法定位 Playwright 模块。${result.stderr.trim()}`); return moduleDir; }
