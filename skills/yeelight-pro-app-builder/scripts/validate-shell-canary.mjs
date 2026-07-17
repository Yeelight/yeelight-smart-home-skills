#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseArgs } from "./lib/common.mjs";
import { freePort, runCommand, startProcess, stopProcess, waitForUrl } from "./lib/lighting-e2e-runner.mjs";
import { startMockHomeServer } from "./lib/mock-home-server.mjs";
import { runShellCanaryBrowserE2E } from "./lib/shell-canary-e2e-runner.mjs";

const args = parseArgs();
const preserve = Boolean(args.preserve);
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const yeelightRoot = path.resolve(skillRoot, "../..");
const evidenceDir = path.resolve(String(args["evidence-dir"] || path.join(os.tmpdir(), `ypa-shell-canary-${Date.now()}`)));
const runtimeBin = path.join(os.tmpdir(), `ypa-shell-canary-runtime-${process.pid}`);
const modules = "home.space-summary,room.device-management,home.lighting-summary,room.lighting-control,device.curtain-control,device.switch-control,device.climate-control,sensor.environment,scene.launcher,automation.manager,group.manager,gateway.overview,panel.manager";
const targets = [
  target("mobile-375", 375, 812, "mobile", "bottom-tabs", "touch", 44),
  target("tablet-768", 768, 1024, "tablet", "adaptive-rail", "comfortable", 44),
  target("wall-1024", 1024, 768, "wall", "touch-rail", "touch", 44),
  target("desktop-1440", 1440, 900, "desktop", "sidebar", "comfortable", 44),
];
const summary = { schemaVersion: 1, startedAt: new Date().toISOString(), evidenceDir, modules: modules.split(","), commands: [], targets: [] };
fs.mkdirSync(evidenceDir, { recursive: true });

try {
  runStep("runtime-build", "go", ["build", "-o", runtimeBin, "../yeelight-home/cmd/yeelight-home"], { cwd: yeelightRoot });
  const { chromium } = await import(pathToFileURL(path.join(resolvePlaywrightModuleDir(), "playwright", "index.mjs")).href);
  for (const item of targets) summary.targets.push(await validateTarget(item, chromium));
  summary.status = summary.targets.every((item) => item.status === "passed") ? "passed" : "failed";
} catch (error) {
  summary.status = "failed";
  summary.error = error instanceof Error ? error.stack || error.message : String(error);
} finally {
  summary.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(evidenceDir, "shell-canary-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  if (!preserve) fs.rmSync(runtimeBin, { force: true });
}

console.log(JSON.stringify({ status: summary.status, evidenceDir, targets: summary.targets.map((item) => ({ id: item.id, status: item.status, checks: item.browser?.checks?.length || 0 })) }, null, 2));
if (summary.status !== "passed") process.exit(1);

async function validateTarget(item, chromium) {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), `ypa-shell-${item.id}-`));
  const runtimeHome = fs.mkdtempSync(path.join(os.tmpdir(), `ypa-shell-${item.id}-runtime-`));
  const targetEvidence = path.join(evidenceDir, item.id);
  let mockServer; let bridge; let web;
  const result = { id: item.id, target: item, status: "failed" };
  fs.mkdirSync(targetEvidence, { recursive: true });
  try {
    runStep(`${item.id}:build-app`, process.execPath, [
      path.join(skillRoot, "scripts/build-app.mjs"),
      "--request", "生成完整的易来 PRO 全屋智能管理应用。",
      "--title", "易来 PRO 参考家庭",
      "--modules", modules,
      "--form-factor", item.formFactor,
      "--navigation", item.navigation,
      "--density", item.density,
      "--theme-pack", "daylight-minimal",
      "--palette", "teal-blue",
      "--mode", "light",
      "--mock-home", "reference-home",
      "--runtime-bin", runtimeBin,
      "--out", appRoot,
    ]);
    runStep(`${item.id}:npm-install`, "npm", ["ci"], { cwd: appRoot });
    runStep(`${item.id}:npm-build`, "npm", ["run", "build"], { cwd: appRoot });
    result.spec = JSON.parse(fs.readFileSync(path.join(appRoot, "product.spec.json"), "utf8"));
    result.manifest = JSON.parse(fs.readFileSync(path.join(appRoot, "generation-manifest.json"), "utf8"));

    mockServer = await startMockHomeServer({ fixtureId: "reference-home" });
    const bridgePort = await freePort(); let webPort = await freePort(); while (webPort === bridgePort) webPort = await freePort();
    const bridgeOrigin = `http://127.0.0.1:${bridgePort}`; const baseUrl = `http://127.0.0.1:${webPort}/`;
    const runtimeEnv = { YEELIGHT_API_BASE_URL: mockServer.apiBaseUrl, YEELIGHT_HOME_ACCESS_TOKEN: mockServer.credential, YEELIGHT_HOME_AUTHENTICATED: "1", YEELIGHT_HOME_HOUSE_ID: mockServer.homeId, YEELIGHT_HOME_DIR: runtimeHome, YEELIGHT_CLOUD_REGION: "dev", YEELIGHT_HOME_BIN: runtimeBin };
    bridge = startProcess("npm", ["--workspace", "@app/bridge", "run", "dev"], { cwd: appRoot, env: { ...runtimeEnv, YPA_BRIDGE_PORT: String(bridgePort), YPA_TRUSTED_WEB_ORIGINS: baseUrl } });
    web = startProcess("npm", ["--workspace", "@app/web", "run", "dev", "--", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], { cwd: appRoot, env: { YPA_RELAY_ORIGIN: bridgeOrigin } });
    await waitForUrl(`${bridgeOrigin}/health`); await waitForUrl(baseUrl);
    result.browser = await runShellCanaryBrowserE2E({ chromium, baseUrl, target: item, evidenceDir: targetEvidence });
    result.status = result.browser.status;
  } catch (error) {
    result.error = error instanceof Error ? error.stack || error.message : String(error);
  } finally {
    if (mockServer) fs.writeFileSync(path.join(targetEvidence, "mock-api-requests.json"), `${JSON.stringify({ fixtureId: mockServer.fixtureId, requests: mockServer.requestLog() }, null, 2)}\n`);
    if (bridge) result.bridgeLog = bridge.logs.join("").slice(-12000);
    if (web) result.webLog = web.logs.join("").slice(-12000);
    await stopProcess(web); await stopProcess(bridge);
    if (mockServer) await mockServer.close();
    if (!preserve) {
      fs.rmSync(runtimeHome, { recursive: true, force: true });
      fs.rmSync(appRoot, { recursive: true, force: true });
    }
  }
  return result;
}

function target(id, width, height, formFactor, navigation, density, minimumTarget) {
  return { id, viewport: { width, height }, formFactor, navigation, density, minimumTarget, mode: "light", expected: { formFactor, navigation, density, themePack: "daylight-minimal", themeMode: "light" } };
}

function runStep(id, command, commandArgs, options = {}) {
  const result = runCommand(command, commandArgs, { cwd: options.cwd || skillRoot, timeoutMs: 240000 });
  summary.commands.push({ id, ...result, stdout: result.stdout.slice(-12000), stderr: result.stderr.slice(-12000) });
  if (result.status !== 0) throw new Error(`${id} failed: ${result.stderr || result.stdout}`);
}

function resolvePlaywrightModuleDir() {
  if (process.env.YPA_PLAYWRIGHT_MODULE_DIR) return path.resolve(process.env.YPA_PLAYWRIGHT_MODULE_DIR);
  const result = spawnSync("npx", ["--yes", "--package", "playwright", "sh", "-c", 'dirname "$(dirname "$(command -v playwright)")"'], { cwd: skillRoot, env: process.env, encoding: "utf8" });
  const moduleDir = result.stdout.trim().split(/\r?\n/).at(-1) || "";
  if (result.status !== 0 || !fs.existsSync(path.join(moduleDir, "playwright", "index.mjs"))) throw new Error(`无法定位 Playwright 模块。${result.stderr.trim()}`);
  return moduleDir;
}
