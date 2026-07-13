#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseArgs } from "./lib/common.mjs";
import { runInstallerBrowserE2E } from "./lib/installer-e2e-runner.mjs";
import { freePort, runCommand, startProcess, stopProcess, waitForUrl } from "./lib/lighting-e2e-runner.mjs";
import { startMockHomeServer } from "./lib/mock-home-server.mjs";

const args = parseArgs();
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const yeelightRoot = path.resolve(skillRoot, "../..");
const appRoot = path.resolve(String(args.app || fs.mkdtempSync(path.join(os.tmpdir(), "ypa-installer-app-"))));
const evidenceDir = path.resolve(String(args["evidence-dir"] || path.join(os.tmpdir(), `ypa-installer-e2e-${Date.now()}`)));
const runtimeBin = path.resolve(String(args["runtime-bin"] || path.join(os.tmpdir(), `ypa-installer-runtime-${process.pid}`)));
const summary = { schemaVersion: 1, startedAt: new Date().toISOString(), appRoot, evidenceDir, commands: [], checks: [] };
let mockServer; let bridge; let web; let runtimeHome;

fs.mkdirSync(evidenceDir, { recursive: true });
try {
  if (!args["runtime-bin"]) runStep("runtime-build", "go", ["build", "-o", runtimeBin, "../yeelight-home/cmd/yeelight-home"], { cwd: yeelightRoot });
  if (!args.app) {
    runStep("build-app", process.execPath, [path.join(skillRoot, "scripts/build-app.mjs"), "--request", "生成易来 PRO 安装维护工作区，覆盖网关协议、面板旋钮、异常设备、版本与诊断。", "--title", "全屋安装维护", "--mock-home", "reference-home", "--runtime-bin", runtimeBin, "--out", appRoot]);
    runStep("npm-install", "npm", ["install", "--workspaces", "--include-workspace-root"], { cwd: appRoot });
  }
  runStep("npm-build", "npm", ["run", "build"], { cwd: appRoot });
  validateSourceBoundary();

  mockServer = await startMockHomeServer({ fixtureId: "reference-home" });
  const bridgePort = await freePort(); let webPort = await freePort(); while (webPort === bridgePort) webPort = await freePort();
  const bridgeOrigin = `http://127.0.0.1:${bridgePort}`; const baseUrl = `http://127.0.0.1:${webPort}/`;
  runtimeHome = fs.mkdtempSync(path.join(os.tmpdir(), "ypa-installer-runtime-home-"));
  const runtimeEnv = { YEELIGHT_API_BASE_URL: mockServer.apiBaseUrl, YEELIGHT_HOME_ACCESS_TOKEN: mockServer.credential, YEELIGHT_HOME_AUTHENTICATED: "1", YEELIGHT_HOME_HOUSE_ID: mockServer.homeId, YEELIGHT_HOME_DIR: runtimeHome, YEELIGHT_CLOUD_REGION: "dev", YEELIGHT_HOME_BIN: runtimeBin };
  bridge = startProcess("npm", ["--workspace", "@app/bridge", "run", "dev"], { cwd: appRoot, env: { ...runtimeEnv, YPA_BRIDGE_PORT: String(bridgePort) } });
  web = startProcess("npm", ["--workspace", "@app/web", "run", "dev", "--", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], { cwd: appRoot, env: { YPA_RELAY_ORIGIN: bridgeOrigin } });
  await waitForUrl(`${bridgeOrigin}/health`); await waitForUrl(baseUrl);
  const { chromium } = await import(pathToFileURL(path.join(resolvePlaywrightModuleDir(), "playwright", "index.mjs")).href);
  summary.browser = await runInstallerBrowserE2E({ chromium, baseUrl, mockServer, evidenceDir });
  summary.mock = { fixtureId: mockServer.fixtureId, homeId: mockServer.homeId, requestCount: mockServer.requestLog().length };
  summary.status = summary.browser.status === "passed" && summary.checks.every((item) => item.status === "passed") ? "passed" : "failed";
} catch (error) {
  summary.status = "failed"; summary.error = error instanceof Error ? error.stack || error.message : String(error);
} finally {
  summary.finishedAt = new Date().toISOString();
  if (mockServer) fs.writeFileSync(path.join(evidenceDir, "mock-api-requests.json"), `${JSON.stringify({ fixtureId: mockServer.fixtureId, requests: mockServer.requestLog() }, null, 2)}\n`);
  if (bridge) summary.bridgeLog = bridge.logs.join("").slice(-12000);
  if (web) summary.webLog = web.logs.join("").slice(-12000);
  fs.writeFileSync(path.join(evidenceDir, "installer-e2e-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  await stopProcess(web); await stopProcess(bridge); if (mockServer) await mockServer.close();
  if (runtimeHome) fs.rmSync(runtimeHome, { recursive: true, force: true });
  if (!args["runtime-bin"]) fs.rmSync(runtimeBin, { force: true });
}

console.log(JSON.stringify({ status: summary.status, appRoot, evidenceDir, checks: (summary.browser?.checks?.length || 0) + summary.checks.length }, null, 2));
if (summary.status !== "passed") process.exit(1);

function validateSourceBoundary() {
  const spec = readJSON("apps/web/src/generated/product-spec.json");
  const manifest = readJSON("generation-manifest.json");
  const runtimeLock = readJSON("runtime.lock.json");
  const app = readText("apps/web/src/App.tsx");
  const bridgeSource = readText("apps/bridge/src/index.mjs");
  const installer = readText("apps/web/src/modules/installer-maintenance/index.tsx");
  const modules = spec.modules.map((item) => item.id);
  const allowlist = parseAllowlist(bridgeSource);
  check("source:modules", JSON.stringify(modules) === JSON.stringify(["gateway.overview", "panel.manager", "installer.maintenance"]), modules);
  check("source:manifest", JSON.stringify(manifest.modules) === JSON.stringify(modules), manifest.modules);
  check("source:installer-profile", spec.modules.filter((item) => ["gateway.overview", "panel.manager"].includes(item.id)).every((item) => item.options?.profile === "installer"), spec.modules);
  check("source:navigation", ["维护总览", "网关与协议", "面板旋钮", "异常设备", "版本与诊断"].every((label) => app.includes(label)), "five installer routes");
  check("source:installer-module", app.includes("InstallerOverview") && app.includes("InstallerIssues") && app.includes("InstallerDiagnostics"), "installer components composed in AppShell");
  check("source:gateway-delete-allowlisted", allowlist.includes("gateway.delete"), allowlist);
  check("source:panel-click-blocked", !allowlist.includes("panel.click"), allowlist);
  check("source:no-ota-action", !/升级固件|立即升级|OTA/.test(installer), "firmware remains read-only");
  check("source:no-internal-copy", !/\b(?:Runtime|CLI|intent|capability|endpoint)\b|payload JSON/i.test(installer), "production copy sanitized");
  check("source:runtime-lock-sanitized", !/(Authorization|access[_-]?token|local[_-]?key|api\.yeelight|https?:\/\/)/i.test(JSON.stringify(runtimeLock)), "runtime lock contains no credentials or remote URLs");
}

function readText(relativePath) { return fs.readFileSync(path.join(appRoot, relativePath), "utf8"); }
function readJSON(relativePath) { return JSON.parse(readText(relativePath)); }
function parseAllowlist(source) { return source.match(/allowedIntents = new Set\(\[(.*?)\]\)/s)?.[1]?.split(",").map((item) => item.replace(/["\s]/g, "")).filter(Boolean) || []; }
function check(id, passed, detail) { summary.checks.push({ id, status: passed ? "passed" : "failed", detail: detail && typeof detail === "object" ? structuredClone(detail) : detail }); }
function runStep(id, command, commandArgs, options = {}) { const result = runCommand(command, commandArgs, { cwd: options.cwd || skillRoot, timeoutMs: 300000 }); summary.commands.push({ id, ...result, stdout: result.stdout.slice(-12000), stderr: result.stderr.slice(-12000) }); if (result.status !== 0) throw new Error(`${id} failed: ${result.stderr || result.stdout}`); }
function resolvePlaywrightModuleDir() { if (process.env.YPA_PLAYWRIGHT_MODULE_DIR) return path.resolve(process.env.YPA_PLAYWRIGHT_MODULE_DIR); const result = spawnSync("npx", ["--yes", "--package", "playwright", "sh", "-c", 'dirname "$(dirname "$(command -v playwright)")"'], { cwd: skillRoot, env: process.env, encoding: "utf8" }); const moduleDir = result.stdout.trim().split(/\r?\n/).at(-1) || ""; if (result.status !== 0 || !fs.existsSync(path.join(moduleDir, "playwright", "index.mjs"))) throw new Error(`无法定位 Playwright 模块。${result.stderr.trim()}`); return moduleDir; }
