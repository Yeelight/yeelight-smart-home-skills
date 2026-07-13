#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseArgs } from "./lib/common.mjs";
import { runCompositionGalleryBrowserE2E } from "./lib/composition-gallery-e2e-runner.mjs";
import { freePort, runCommand, startProcess, stopProcess, waitForUrl } from "./lib/lighting-e2e-runner.mjs";
import { startMockHomeServer } from "./lib/mock-home-server.mjs";

const args = parseArgs();
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const yeelightRoot = path.resolve(skillRoot, "../..");
const evidenceDir = path.resolve(String(args["evidence-dir"] || path.join(os.tmpdir(), `ypa-composition-gallery-${Date.now()}`)));
const runtimeBin = path.join(os.tmpdir(), `ypa-composition-gallery-runtime-${process.pid}`);
const wholeHomeModules = "home.space-summary,room.device-management,home.lighting-summary,room.lighting-control,device.curtain-control,device.switch-control,device.climate-control,sensor.environment,scene.launcher,automation.manager,group.manager,gateway.overview,panel.manager";
const profiles = [
  profile("whole-home-desktop", wholeHomeModules, "desktop", "sidebar", "comfortable", "daylight-minimal", "teal-blue", "light"),
  profile("whole-home-mobile", wholeHomeModules, "mobile", "bottom-tabs", "touch", "warm-residential", "forest-cyan", "light"),
  profile("installer", "gateway.overview,panel.manager,installer.maintenance", "desktop", "sidebar", "compact", "installer-contrast", "neutral-graphite", "dark"),
];
const requestedProfiles = String(args.profile || "").split(",").map((value) => value.trim()).filter(Boolean);
const selectedProfiles = requestedProfiles.length > 0 ? profiles.filter(({ id }) => requestedProfiles.includes(id)) : profiles;
const summary = { schemaVersion: 1, startedAt: new Date().toISOString(), evidenceDir, commands: [], profiles: [], browserProvider: { preferred: "browser-use", status: "blocked", reason: "Python 3.14 asyncio.get_event_loop has no current event loop", fallback: "repository Playwright runner" } };
fs.mkdirSync(evidenceDir, { recursive: true });

try {
  runStep("runtime-build", "go", ["build", "-o", runtimeBin, "../yeelight-home/cmd/yeelight-home"], { cwd: yeelightRoot });
  const { chromium } = await import(pathToFileURL(path.join(resolvePlaywrightModuleDir(), "playwright", "index.mjs")).href);
  if (selectedProfiles.length === 0) throw new Error(`未找到指定 gallery profile：${requestedProfiles.join(", ")}`);
  for (const item of selectedProfiles) summary.profiles.push(await validateProfile(item, chromium));
  summary.status = summary.profiles.every(({ status }) => status === "passed") ? "passed" : "failed";
} catch (error) {
  summary.status = "failed";
  summary.error = error instanceof Error ? error.stack || error.message : String(error);
} finally {
  summary.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(evidenceDir, "composition-gallery-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
}

console.log(JSON.stringify({ status: summary.status, evidenceDir, profiles: summary.profiles.map(({ id, status, browser }) => ({ id, status, checks: browser?.checks.length || 0, screenshots: browser?.screenshots.length || 0 })) }, null, 2));
if (summary.status !== "passed") process.exit(1);

async function validateProfile(item, chromium) {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), `ypa-gallery-${item.id}-`));
  const runtimeHome = fs.mkdtempSync(path.join(os.tmpdir(), `ypa-gallery-${item.id}-runtime-`));
  const targetEvidence = path.join(evidenceDir, item.id);
  let mockServer; let bridge; let web;
  const result = { id: item.id, appRoot, runtimeHome, status: "failed" };
  fs.mkdirSync(targetEvidence, { recursive: true });
  try {
    runStep(`${item.id}:build-app`, process.execPath, [path.join(skillRoot, "scripts/build-app.mjs"), "--request", item.id === "installer" ? "生成易来 PRO 安装维护应用。" : "生成完整的易来 PRO 全屋智能管理应用。", "--title", item.id === "installer" ? "易来 PRO 安装维护" : "易来 PRO 参考家庭", "--modules", item.modules, "--form-factor", item.formFactor, "--navigation", item.navigation, "--density", item.density, "--theme-pack", item.themePack, "--palette", item.palette, "--mode", item.mode, "--mock-home", "reference-home", "--runtime-bin", runtimeBin, "--out", appRoot]);
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
    result.browser = await runCompositionGalleryBrowserE2E({ chromium, baseUrl, profileId: item.id, evidenceDir: targetEvidence });
    result.status = result.browser.status;
  } catch (error) {
    result.error = error instanceof Error ? error.stack || error.message : String(error);
  } finally {
    if (bridge) result.bridgeLog = bridge.logs.join("").slice(-8000);
    if (web) result.webLog = web.logs.join("").slice(-8000);
    await stopProcess(web); await stopProcess(bridge); if (mockServer) await mockServer.close();
  }
  return result;
}

function profile(id, modules, formFactor, navigation, density, themePack, palette, mode) { return { id, modules, formFactor, navigation, density, themePack, palette, mode }; }
function runStep(id, command, commandArgs, options = {}) { const result = runCommand(command, commandArgs, { cwd: options.cwd || skillRoot, timeoutMs: 240000 }); summary.commands.push({ id, ...result, stdout: result.stdout.slice(-8000), stderr: result.stderr.slice(-8000) }); if (result.status !== 0) throw new Error(`${id} failed: ${result.stderr || result.stdout}`); }
function resolvePlaywrightModuleDir() { if (process.env.YPA_PLAYWRIGHT_MODULE_DIR) return path.resolve(process.env.YPA_PLAYWRIGHT_MODULE_DIR); const result = spawnSync("npx", ["--yes", "--package", "playwright", "sh", "-c", 'dirname "$(dirname "$(command -v playwright)")"'], { cwd: skillRoot, env: process.env, encoding: "utf8" }); const moduleDir = result.stdout.trim().split(/\r?\n/).at(-1) || ""; if (result.status !== 0 || !fs.existsSync(path.join(moduleDir, "playwright", "index.mjs"))) throw new Error(`无法定位 Playwright 模块。${result.stderr.trim()}`); return moduleDir; }
