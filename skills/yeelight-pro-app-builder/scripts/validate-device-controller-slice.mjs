#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseArgs } from "./lib/common.mjs";
import { runDeviceControllerBrowserE2E } from "./lib/device-controller-e2e-runner.mjs";
import { freePort, runCommand, startProcess, stopProcess, waitForUrl } from "./lib/lighting-e2e-runner.mjs";
import { startMockHomeServer } from "./lib/mock-home-server.mjs";

const args = parseArgs();
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const yeelightRoot = path.resolve(skillRoot, "../..");
const evidenceDir = path.resolve(String(args["evidence-dir"] || path.join(os.tmpdir(), `ypa-device-controller-${Date.now()}`)));
const appRoot = path.resolve(String(args.app || path.join(evidenceDir, "generated-app")));
const runtimeBin = path.resolve(String(args["runtime-bin"] || path.join(evidenceDir, "runtime", "yeelight-home")));
const summary = { schemaVersion: 1, startedAt: new Date().toISOString(), appRoot, evidenceDir, runtimeBin, commands: [] };
let mockServer;
let bridge;
let web;

fs.mkdirSync(evidenceDir, { recursive: true });
try {
  if (!args["runtime-bin"]) {
    fs.mkdirSync(path.dirname(runtimeBin), { recursive: true });
    runStep("runtime-build", "go", ["build", "-o", runtimeBin, "../yeelight-home/cmd/yeelight-home"], { cwd: yeelightRoot });
  }
  if (!args.app) {
    runStep("build-app", process.execPath, [
      path.join(skillRoot, "scripts/build-app.mjs"),
      "--request", "生成易来 PRO 全屋设备管理应用，包含空间、设备目录、灯光、窗帘、开关继电器、温控和传感器环境。",
      "--title", "易来 PRO 全屋设备",
      "--name", "yeelight-pro-controller-suite",
      "--modules", "home.space-summary,room.device-management,room.lighting-control,device.curtain-control,device.switch-control,device.climate-control,sensor.environment",
      "--device-families", "light,curtain,switch-relay,climate,sensor",
      "--form-factor", "desktop", "--navigation", "sidebar", "--density", "comfortable",
      "--theme-pack", "daylight-minimal", "--palette", "teal-blue", "--mode", "light",
      "--mock-home", "reference-home", "--runtime-bin", runtimeBin, "--out", appRoot,
    ]);
    runStep("npm-install", "npm", ["ci"], { cwd: appRoot });
  }
  runStep("validate-app", process.execPath, [path.join(skillRoot, "scripts/validate-app.mjs"), appRoot]);
  runStep("npm-build", "npm", ["run", "build"], { cwd: appRoot });

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
    YEELIGHT_HOME_DIR: path.join(evidenceDir, "runtime-home"),
    YEELIGHT_CLOUD_REGION: "dev",
    YEELIGHT_HOME_BIN: runtimeBin,
    YPA_RUNTIME_TIMEOUT_MS: "3000",
  };
  bridge = startProcess("npm", ["--workspace", "@app/bridge", "run", "dev"], { cwd: appRoot, env: { ...runtimeEnv, YPA_BRIDGE_PORT: String(bridgePort), YPA_TRUSTED_WEB_ORIGINS: baseUrl } });
  web = startProcess("npm", ["--workspace", "@app/web", "run", "dev", "--", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], { cwd: appRoot, env: { YPA_RELAY_ORIGIN: bridgeOrigin } });
  await waitForUrl(`${bridgeOrigin}/health`);
  await waitForUrl(baseUrl);

  const { chromium } = await import(pathToFileURL(path.join(resolvePlaywrightModuleDir(), "playwright", "index.mjs")).href);
  summary.browser = await runDeviceControllerBrowserE2E({ chromium, baseUrl, bridgeOrigin, mockServer, evidenceDir });
  summary.mock = { fixtureId: mockServer.fixtureId, homeId: mockServer.homeId, requestCount: mockServer.requestLog().length };
  summary.status = summary.browser.status;
} catch (error) {
  summary.status = "failed";
  summary.error = error instanceof Error ? error.stack || error.message : String(error);
} finally {
  summary.finishedAt = new Date().toISOString();
  if (mockServer) fs.writeFileSync(path.join(evidenceDir, "mock-api-requests.json"), `${JSON.stringify({ fixtureId: mockServer.fixtureId, requests: mockServer.requestLog() }, null, 2)}\n`);
  if (bridge) summary.bridgeLog = bridge.logs.join("").slice(-16000);
  if (web) summary.webLog = web.logs.join("").slice(-16000);
  fs.writeFileSync(path.join(evidenceDir, "device-controller-e2e-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  await stopProcess(web);
  await stopProcess(bridge);
  if (mockServer) await mockServer.close();
}

console.log(JSON.stringify({ status: summary.status, appRoot, evidenceDir, checks: summary.browser?.checks?.length || 0 }, null, 2));
if (summary.status !== "passed") process.exit(1);

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
