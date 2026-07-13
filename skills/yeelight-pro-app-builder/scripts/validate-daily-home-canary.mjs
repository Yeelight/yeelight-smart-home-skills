#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseArgs } from "./lib/common.mjs";
import { freePort, runCommand, startProcess, stopProcess, waitForUrl } from "./lib/lighting-e2e-runner.mjs";
import { startMockHomeServer } from "./lib/mock-home-server.mjs";

const args = parseArgs();
const scriptFile = fileURLToPath(import.meta.url);
const skillRoot = path.resolve(path.dirname(scriptFile), "..");
const appRoot = path.resolve(String(args.app || ""));
const evidenceDir = path.resolve(String(args["evidence-dir"] || path.join(os.tmpdir(), `ypa-daily-home-${Date.now()}`)));
const summary = { schemaVersion: 1, startedAt: new Date().toISOString(), appRoot, evidenceDir, checks: [], commands: [], viewports: [] };
let mockServer; let bridge; let web; let browser;

if (!args.app) {
  console.error("Usage: node scripts/validate-daily-home-canary.mjs --app <generated-app> --runtime-bin <yeelight-home> [--evidence-dir <dir>]");
  process.exit(2);
}

fs.mkdirSync(evidenceDir, { recursive: true });
try {
  validateSourceBoundary();
  runStep("npm-build", "npm", ["run", "build"], { cwd: appRoot });
  mockServer = await startMockHomeServer({ fixtureId: "reference-home" });
  const bridgePort = await freePort(); let webPort = await freePort(); while (webPort === bridgePort) webPort = await freePort();
  const bridgeOrigin = `http://127.0.0.1:${bridgePort}`; const baseUrl = `http://127.0.0.1:${webPort}/`;
  const runtimeEnv = {
    YEELIGHT_API_BASE_URL: mockServer.apiBaseUrl,
    YEELIGHT_HOME_ACCESS_TOKEN: mockServer.credential,
    YEELIGHT_HOME_AUTHENTICATED: "1",
    YEELIGHT_HOME_HOUSE_ID: mockServer.homeId,
    YEELIGHT_HOME_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "ypa-daily-runtime-")),
    YEELIGHT_CLOUD_REGION: "dev",
    YEELIGHT_HOME_BIN: String(args["runtime-bin"] || process.env.YEELIGHT_HOME_BIN || "yeelight-home"),
  };
  bridge = startProcess("npm", ["--workspace", "@app/bridge", "run", "dev"], { cwd: appRoot, env: { ...runtimeEnv, YPA_BRIDGE_PORT: String(bridgePort) } });
  web = startProcess("npm", ["--workspace", "@app/web", "run", "dev", "--", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], { cwd: appRoot, env: { YPA_RELAY_ORIGIN: bridgeOrigin } });
  await waitForUrl(`${bridgeOrigin}/health`); await waitForUrl(baseUrl);
  const { chromium } = await import(pathToFileURL(path.join(resolvePlaywrightModuleDir(), "playwright", "index.mjs")).href);
  browser = await launchBrowser(chromium);
  for (const viewport of [{ id: "mobile-375", width: 375, height: 812 }, { id: "desktop-1440", width: 1440, height: 1000 }]) {
    await validateViewport({ viewport, baseUrl });
  }
  summary.status = summary.checks.every((item) => item.status === "passed") ? "passed" : "failed";
} catch (error) {
  summary.status = "failed";
  summary.error = error instanceof Error ? error.stack || error.message : String(error);
} finally {
  summary.finishedAt = new Date().toISOString();
  if (mockServer) fs.writeFileSync(path.join(evidenceDir, "mock-api-requests.json"), `${JSON.stringify({ fixtureId: mockServer.fixtureId, requests: mockServer.requestLog() }, null, 2)}\n`);
  if (bridge) summary.bridgeLog = bridge.logs.join("").slice(-12000);
  if (web) summary.webLog = web.logs.join("").slice(-12000);
  fs.writeFileSync(path.join(evidenceDir, "daily-home-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  if (browser) await browser.close();
  await stopProcess(web); await stopProcess(bridge);
  if (mockServer) await mockServer.close();
}

console.log(JSON.stringify({ status: summary.status, appRoot, evidenceDir, checks: summary.checks.length }, null, 2));
if (summary.status !== "passed") process.exit(1);

function validateSourceBoundary() {
  const app = fs.readFileSync(path.join(appRoot, "apps/web/src/App.tsx"), "utf8");
  const bridgeSource = fs.readFileSync(path.join(appRoot, "apps/bridge/src/index.mjs"), "utf8");
  const home = fs.readFileSync(path.join(appRoot, "apps/web/src/modules/home-space-summary/index.tsx"), "utf8");
  check("source:home-only-route", !/SpaceDirectory|RoomDeviceManagement|route: "spaces"|route: "devices"/.test(app), "daily app excludes space and device routes");
  check("source:no-device-management-module", !fs.existsSync(path.join(appRoot, "apps/web/src/modules/room-device-management")), "room-device-management not generated");
  check("source:readonly-home-cards", !/spaces\/areas|spaces\/rooms|onClick/.test(home), "home cards are read-only");
  const allowlist = bridgeSource.match(/allowedIntents = new Set\(\[(.*?)\]\)/)?.[1]?.split(",").map((value) => value.replace(/["\s]/g, "")).filter(Boolean) || [];
  check("source:bridge-readonly-allowlist", JSON.stringify(allowlist) === JSON.stringify(["area.list", "room.list", "entity.list"]), allowlist);
  check("source:no-write-intents", !/device\.rename|device\.move|state\.query|device\.detail\.get/.test(bridgeSource), "write and detail intents excluded");
}

async function validateViewport({ viewport, baseUrl }) {
  const context = await browser.newContext({ viewport, locale: "zh-CN", reducedMotion: "reduce" });
  const page = await context.newPage();
  const diagnostics = collectDiagnostics(page);
  await page.goto(`${baseUrl}#overview`, { waitUntil: "domcontentloaded" });
  await page.getByText("家庭在线", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "家庭总览", exact: true }).waitFor();
  const audit = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    areas: document.querySelectorAll(".home-area").length,
    rooms: document.querySelectorAll(".home-room-row").length,
    clickableCards: document.querySelectorAll(".home-area-heading:is(button, a), .home-room-row:is(button, a)").length,
    visibleNavigationItems: [...document.querySelectorAll("nav a, nav button")].filter((element) => element instanceof HTMLElement && element.offsetParent !== null).length,
  }));
  check(`${viewport.id}:reference-home-scale`, audit.areas === 4 && audit.rooms === 12, audit);
  check(`${viewport.id}:readonly-home-cards`, audit.clickableCards === 0, audit);
  check(`${viewport.id}:single-page-navigation-hidden`, audit.visibleNavigationItems === 0, audit);
  check(`${viewport.id}:no-horizontal-overflow`, audit.scrollWidth <= audit.clientWidth + 1, audit);
  check(`${viewport.id}:no-device-route`, await page.locator('[data-page="devices"], [data-page="spaces"]').count() === 0, page.url());
  if (viewport.id === "mobile-375") await validateFailureRecovery(page, diagnostics);
  const screenshot = path.join(evidenceDir, `${viewport.id}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  const unexpectedHttpErrors = diagnostics.httpErrors.filter((item) => !item.expected);
  const unexpectedConsoleErrors = diagnostics.consoleMessages.filter((item) => item.type === "error" && !item.expected);
  check(`${viewport.id}:page-errors`, diagnostics.pageErrors.length === 0, diagnostics.pageErrors);
  check(`${viewport.id}:request-failures`, diagnostics.failedRequests.length === 0, diagnostics.failedRequests);
  check(`${viewport.id}:http-errors`, unexpectedHttpErrors.length === 0, diagnostics.httpErrors);
  check(`${viewport.id}:console-errors`, unexpectedConsoleErrors.length === 0, diagnostics.consoleMessages);
  summary.viewports.push({ ...viewport, screenshot: path.basename(screenshot), audit, diagnostics });
  await context.close();
}

async function validateFailureRecovery(page, diagnostics) {
  const failurePath = `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/area/r/info/1/100`;
  await fetch(`${mockServer.origin}/__mock/fail-next`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "GET", path: failurePath, status: 503 }) });
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  const alert = page.getByRole("alert");
  await alert.waitFor();
  diagnostics.httpErrors.forEach((item) => { if (item.status >= 500 && new URL(item.url).pathname === "/api/operations/entity.list") item.expected = true; });
  diagnostics.consoleMessages.forEach((item) => { if (item.type === "error" && item.text.includes("Failed to load resource")) item.expected = true; });
  check("mobile-375:partial-failure-retains-home", await page.locator(".home-area").count() === 4, await alert.innerText());
  await alert.getByRole("button", { name: "重新同步" }).click();
  await alert.waitFor({ state: "hidden" });
  await page.getByText("家庭在线", { exact: true }).waitFor();
  check("mobile-375:partial-failure-recovers", await page.getByText("家庭在线", { exact: true }).isVisible(), "one-shot failure consumed");
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

function collectDiagnostics(page) {
  const value = { consoleMessages: [], pageErrors: [], failedRequests: [], httpErrors: [] };
  page.on("console", (message) => value.consoleMessages.push({ type: message.type(), text: message.text(), expected: false }));
  page.on("pageerror", (error) => value.pageErrors.push(error.message));
  page.on("requestfailed", (request) => value.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || "unknown" }));
  page.on("response", (response) => { if (response.status() >= 400) value.httpErrors.push({ url: response.url(), status: response.status(), expected: false }); });
  return value;
}

async function launchBrowser(chromium) {
  try { return await chromium.launch({ channel: process.env.YPA_PLAYWRIGHT_CHANNEL || "chrome", headless: true }); }
  catch (channelError) {
    try { return await chromium.launch({ headless: true }); }
    catch { throw new Error(`无法启动 Chromium。${channelError instanceof Error ? channelError.message : ""}`); }
  }
}

function check(id, passed, detail) {
  summary.checks.push({ id, status: passed ? "passed" : "failed", detail: detail && typeof detail === "object" ? structuredClone(detail) : detail });
}
