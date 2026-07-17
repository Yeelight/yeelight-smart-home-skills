#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import { parseArgs } from "./lib/common.mjs";
import { freePort, runCommand, startProcess, stopProcess, waitForUrl } from "./lib/lighting-e2e-runner.mjs";
import { startMockHomeServer } from "./lib/mock-home-server.mjs";
import { runSpaceBrowserE2E } from "./lib/space-e2e-runner.mjs";

const scriptFile = fileURLToPath(import.meta.url);
const args = parseArgs();
const skillRoot = path.resolve(path.dirname(scriptFile), "..");
const yeelightRoot = path.resolve(skillRoot, "../..");
const playwrightModuleDir = resolvePlaywrightModuleDir();
const evidenceDir = path.resolve(String(args["evidence-dir"] || path.join(os.tmpdir(), `ypa-space-e2e-${Date.now()}`)));
const appRoot = path.resolve(String(args.app || fs.mkdtempSync(path.join(os.tmpdir(), "ypa-space-app-"))));
const runtimeBin = path.resolve(String(args["runtime-bin"] || path.join(evidenceDir, "runtime", "yeelight-home")));
const summary = { schemaVersion: 1, startedAt: new Date().toISOString(), appRoot, evidenceDir, runtimeBin, commands: [] };
let mockServer;
let bridge;
let web;
let largeMockServer;
let largeBridge;
let largeWeb;

fs.mkdirSync(evidenceDir, { recursive: true });
try {
  if (!args["runtime-bin"]) {
    fs.mkdirSync(path.dirname(runtimeBin), { recursive: true });
    runStep("runtime-build", "go", ["build", "-o", runtimeBin, "../yeelight-home/cmd/yeelight-home"], { cwd: yeelightRoot });
  }
  if (!args.app) {
    runStep("build-app", process.execPath, [
      path.join(skillRoot, "scripts/build-app.mjs"),
      "--request", "生成一个明亮简洁的全屋空间和设备管理应用，支持房间总览、设备详情、改名和移动房间。",
      "--title", "我的家",
      "--mock-home", "comprehensive",
      "--runtime-bin", runtimeBin,
      "--out", appRoot,
    ]);
    runStep("npm-install", "npm", ["ci"], { cwd: appRoot });
  }
  runStep("npm-build", "npm", ["run", "build"], { cwd: appRoot });

  mockServer = await startMockHomeServer({ fixtureId: "comprehensive" });
  const bridgePort = await freePort();
  let webPort = await freePort();
  while (webPort === bridgePort) webPort = await freePort();
  const bridgeOrigin = `http://127.0.0.1:${bridgePort}`;
  const baseUrl = `http://127.0.0.1:${webPort}/`;
  const runtimeHome = fs.mkdtempSync(path.join(os.tmpdir(), "ypa-space-e2e-runtime-"));
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

  largeMockServer = await startMockHomeServer({ fixtureId: "reference-home-large" });
  const largeBridgePort = await freePort();
  let largeWebPort = await freePort();
  while (largeWebPort === largeBridgePort) largeWebPort = await freePort();
  const largeBridgeOrigin = `http://127.0.0.1:${largeBridgePort}`;
  const largeBaseUrl = `http://127.0.0.1:${largeWebPort}/`;
  const largeRuntimeEnv = {
    ...runtimeEnv,
    YEELIGHT_API_BASE_URL: largeMockServer.apiBaseUrl,
    YEELIGHT_HOME_ACCESS_TOKEN: largeMockServer.credential,
    YEELIGHT_HOME_HOUSE_ID: largeMockServer.homeId,
    YEELIGHT_HOME_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "ypa-space-large-runtime-")),
  };
  largeBridge = startProcess("npm", ["--workspace", "@app/bridge", "run", "dev"], { cwd: appRoot, env: { ...largeRuntimeEnv, YPA_BRIDGE_PORT: String(largeBridgePort), YPA_TRUSTED_WEB_ORIGINS: largeBaseUrl } });
  largeWeb = startProcess("npm", ["--workspace", "@app/web", "run", "dev", "--", "--host", "127.0.0.1", "--port", String(largeWebPort), "--strictPort"], { cwd: appRoot, env: { YPA_RELAY_ORIGIN: largeBridgeOrigin } });
  await waitForUrl(`${largeBridgeOrigin}/health`);
  await waitForUrl(largeBaseUrl);

  const playwrightFile = path.join(playwrightModuleDir, "playwright", "index.mjs");
  const { chromium } = await import(pathToFileURL(playwrightFile).href);
  summary.browser = await runSpaceBrowserE2E({ chromium, baseUrl, largeBaseUrl, bridgeOrigin, mockServer, evidenceDir });
  summary.mock = { fixtureId: mockServer.fixtureId, homeId: mockServer.homeId, finalState: mockServer.fixture.devices, requestCount: mockServer.requestLog().length };
  summary.status = summary.browser.status;
} catch (error) {
  summary.status = "failed";
  summary.error = error instanceof Error ? error.stack || error.message : String(error);
} finally {
  summary.finishedAt = new Date().toISOString();
  if (mockServer) {
    fs.writeFileSync(path.join(evidenceDir, "mock-api-requests.json"), `${JSON.stringify({ fixtureId: mockServer.fixtureId, requests: mockServer.requestLog() }, null, 2)}\n`);
  }
  if (largeMockServer) fs.writeFileSync(path.join(evidenceDir, "large-mock-api-requests.json"), `${JSON.stringify({ fixtureId: largeMockServer.fixtureId, requests: largeMockServer.requestLog() }, null, 2)}\n`);
  if (bridge) summary.bridgeLog = bridge.logs.join("").slice(-12000);
  if (web) summary.webLog = web.logs.join("").slice(-12000);
  fs.writeFileSync(path.join(evidenceDir, "space-e2e-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  await stopProcess(web);
  await stopProcess(bridge);
  await stopProcess(largeWeb);
  await stopProcess(largeBridge);
  if (mockServer) await mockServer.close();
  if (largeMockServer) await largeMockServer.close();
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
  const result = spawnSync("npx", ["--yes", "--package", "playwright", "sh", "-c", 'dirname "$(dirname "$(command -v playwright)")"'], {
    cwd: skillRoot,
    env: process.env,
    encoding: "utf8",
  });
  const moduleDir = result.stdout.trim().split(/\r?\n/).at(-1) || "";
  if (result.status !== 0 || !fs.existsSync(path.join(moduleDir, "playwright", "index.mjs"))) {
    throw new Error(`无法定位 Playwright 模块。${result.stderr.trim()}`);
  }
  return moduleDir;
}
