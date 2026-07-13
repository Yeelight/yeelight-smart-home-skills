#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs } from "./lib/common.mjs";
import { runCommand } from "./lib/lighting-e2e-runner.mjs";

const args = parseArgs();
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const yeelightRoot = path.resolve(skillRoot, "../..");
const evidenceDir = path.resolve(String(args["evidence-dir"] || path.join(os.tmpdir(), `ypa-infrastructure-suite-${Date.now()}`)));
const appRoot = path.resolve(String(args["app-root"] || fs.mkdtempSync(path.join(os.tmpdir(), "ypa-infrastructure-apps-"))));
const homeApp = path.join(appRoot, "home-infrastructure");
const installerApp = path.join(appRoot, "installer");
const runtimeBin = path.join(appRoot, "yeelight-home");
const summary = { schemaVersion: 1, startedAt: new Date().toISOString(), evidenceDir, appRoot, homeApp, installerApp, commands: [], checks: [] };

fs.mkdirSync(evidenceDir, { recursive: true });
try {
  runStep("runtime-build", "go", ["build", "-o", runtimeBin, "../yeelight-home/cmd/yeelight-home"], yeelightRoot);
  buildApp("home", homeApp, ["--request", "生成家庭网关、Thread、Matter、DALI、墙面面板和旋钮管理应用。", "--title", "家庭基础设施", "--modules", "gateway.overview,panel.manager", "--device-families", "gateway,panel-screen,knob", "--form-factor", "desktop", "--navigation", "sidebar", "--density", "comfortable", "--theme-pack", "daylight-minimal", "--palette", "teal-blue", "--mode", "light"]);
  buildApp("installer", installerApp, ["--request", "生成易来 PRO 安装维护工作区，覆盖网关协议、面板旋钮、异常设备、版本与诊断。", "--title", "全屋安装维护"]);
  runStep("home-install", "npm", ["install", "--workspaces", "--include-workspace-root"], homeApp);
  runStep("home-build", "npm", ["run", "build"], homeApp);
  runStep("installer-install", "npm", ["install", "--workspaces", "--include-workspace-root"], installerApp);
  compareApplications();
  runStep("installer-e2e", process.execPath, [path.join(skillRoot, "scripts/validate-installer-canary.mjs"), "--app", installerApp, "--runtime-bin", runtimeBin, "--evidence-dir", path.join(evidenceDir, "installer")], skillRoot, 600000);
  summary.status = summary.checks.every((item) => item.status === "passed") ? "passed" : "failed";
} catch (error) {
  summary.status = "failed"; summary.error = error instanceof Error ? error.stack || error.message : String(error);
} finally {
  summary.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(evidenceDir, "infrastructure-suite-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
}

console.log(JSON.stringify({ status: summary.status, evidenceDir, appRoot, checks: summary.checks.length }, null, 2));
if (summary.status !== "passed") process.exit(1);

function buildApp(id, output, extraArgs) {
  runStep(`${id}-generate`, process.execPath, [path.join(skillRoot, "scripts/build-app.mjs"), ...extraArgs, "--mock-home", "reference-home", "--runtime-bin", runtimeBin, "--out", output], skillRoot, 600000);
}

function compareApplications() {
  const homeSpec = readJSON(homeApp, "apps/web/src/generated/product-spec.json");
  const installerSpec = readJSON(installerApp, "apps/web/src/generated/product-spec.json");
  const homeSource = readText(homeApp, "apps/web/src/App.tsx");
  const installerSource = readText(installerApp, "apps/web/src/App.tsx");
  const homeAllowlist = parseAllowlist(readText(homeApp, "apps/bridge/src/index.mjs"));
  const installerAllowlist = parseAllowlist(readText(installerApp, "apps/bridge/src/index.mjs"));
  const homeModules = homeSpec.modules.map((item) => item.id);
  const installerModules = installerSpec.modules.map((item) => item.id);

  check("compare:home-modules", JSON.stringify(homeModules) === JSON.stringify(["gateway.overview", "panel.manager"]), homeModules);
  check("compare:installer-modules", JSON.stringify(installerModules) === JSON.stringify(["gateway.overview", "panel.manager", "installer.maintenance"]), installerModules);
  check("compare:distinct-spec", JSON.stringify(homeSpec) !== JSON.stringify(installerSpec), { home: homeSpec.target, installer: installerSpec.target });
  check("compare:distinct-source", homeSource !== installerSource, "AppShell composition differs");
  check("compare:home-navigation", !/维护总览|异常设备|版本与诊断/.test(homeSource), "home excludes installer routes");
  check("compare:installer-navigation", /维护总览/.test(installerSource) && /异常设备/.test(installerSource) && /版本与诊断/.test(installerSource), "installer routes present");
  check("compare:home-gateway-delete-blocked", !homeAllowlist.includes("gateway.delete"), homeAllowlist);
  check("compare:home-panel-click-blocked", !homeAllowlist.includes("panel.click"), homeAllowlist);
  check("compare:installer-gateway-delete", installerAllowlist.includes("gateway.delete"), installerAllowlist);
  check("compare:installer-panel-click-terminal", !installerAllowlist.includes("panel.click"), installerAllowlist);
  check("compare:allowlist-diff", JSON.stringify(homeAllowlist) !== JSON.stringify(installerAllowlist), { homeAllowlist, installerAllowlist });
  const homeLock = readJSON(homeApp, "runtime.lock.json"); const installerLock = readJSON(installerApp, "runtime.lock.json");
  const stableTopology = JSON.stringify(lockTopology(homeLock)) === JSON.stringify(lockTopology(installerLock));
  const sharedEntitiesStable = Object.entries(homeLock.entities || {}).every(([id, entity]) => (
    JSON.stringify(entityIdentity(entity)) === JSON.stringify(entityIdentity(installerLock.entities?.[id]))
  ));
  check("compare:runtime-lock-stable", stableTopology && sharedEntitiesStable, {
    stableTopology,
    sharedEntitiesStable,
    homeEntityCount: Object.keys(homeLock.entities || {}).length,
    installerEntityCount: Object.keys(installerLock.entities || {}).length,
  });
}

function readText(root, relativePath) { return fs.readFileSync(path.join(root, relativePath), "utf8"); }
function readJSON(root, relativePath) { return JSON.parse(readText(root, relativePath)); }
function parseAllowlist(source) { return source.match(/allowedIntents = new Set\(\[(.*?)\]\)/s)?.[1]?.split(",").map((item) => item.replace(/["\s]/g, "")).filter(Boolean) || []; }
function lockTopology(lock) {
  const project = (items, fields) => (Array.isArray(items) ? items : Object.values(items || {})).map((item) => Object.fromEntries(fields.map((field) => [field, item?.[field] ?? null])));
  return {
    schemaVersion: lock.schemaVersion,
    cli: lock.cli,
    intents: lock.intents,
    areas: project(lock.areas, ["id", "name"]),
    rooms: project(lock.rooms, ["id", "name", "areaId"]),
    gateways: project(lock.gateways, ["id", "name", "model", "roomId"]),
    panels: project(lock.panels, ["id", "name", "roomId"]),
    knobs: project(lock.knobs, ["id", "name", "roomId"]),
    groups: project(lock.groups, ["id", "name", "roomId", "memberIds"]),
    scenes: project(lock.scenes, ["id", "name"]),
  };
}
function entityIdentity(entity) {
  if (!entity) return null;
  return Object.fromEntries(["id", "entityType", "name", "displayName", "modelName", "family", "roomId", "roomName", "areaId", "areaName", "gatewayDeviceId", "online"].map((field) => [field, entity[field] ?? null]));
}
function check(id, passed, detail) { summary.checks.push({ id, status: passed ? "passed" : "failed", detail: detail && typeof detail === "object" ? structuredClone(detail) : detail }); }
function runStep(id, command, commandArgs, cwd = skillRoot, timeoutMs = 300000) { const result = runCommand(command, commandArgs, { cwd, timeoutMs }); summary.commands.push({ id, ...result, stdout: result.stdout.slice(-12000), stderr: result.stderr.slice(-12000) }); if (result.status !== 0) throw new Error(`${id} failed: ${result.stderr || result.stdout}`); }
