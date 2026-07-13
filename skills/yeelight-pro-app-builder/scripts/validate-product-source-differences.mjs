#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs } from "./lib/common.mjs";
import { runCommand } from "./lib/lighting-e2e-runner.mjs";
import { auditGeneratedProductDifferences, inspectGeneratedProduct } from "./lib/source-difference-auditor.mjs";
import { modulesForProductProfile } from "./lib/theme-matrix-contracts.mjs";

const args = parseArgs();
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const yeelightRoot = path.resolve(skillRoot, "../..");
const evidenceDir = path.resolve(String(args["evidence-dir"] || path.join(os.tmpdir(), `ypa-product-source-diff-${Date.now()}`)));
const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ypa-product-source-apps-"));
const runtimeBin = path.join(appRoot, "yeelight-home");
const summary = { schemaVersion: 1, startedAt: new Date().toISOString(), evidenceDir, commands: [], products: [], report: null };

fs.mkdirSync(evidenceDir, { recursive: true });
try {
  runStep("runtime-build", "go", ["build", "-o", runtimeBin, "../yeelight-home/cmd/yeelight-home"], { cwd: yeelightRoot });
  for (const profile of profiles()) {
    const output = path.join(appRoot, profile.id);
    runStep(`${profile.id}:build-app`, process.execPath, [
      path.join(skillRoot, "scripts/build-app.mjs"),
      "--request", profile.request,
      "--title", profile.title,
      "--modules", modulesForProductProfile(profile.moduleProfile).join(","),
      "--form-factor", profile.formFactor,
      "--navigation", profile.navigation,
      "--density", profile.density,
      "--theme-pack", profile.pack,
      "--palette", profile.palette,
      "--mode", profile.mode,
      "--mock-home", "reference-home",
      "--runtime-bin", runtimeBin,
      "--out", output,
    ]);
    summary.products.push(inspectGeneratedProduct(output, profile.id));
  }
  summary.report = auditGeneratedProductDifferences(summary.products);
  summary.status = summary.report.status;
} catch (error) {
  summary.status = "failed";
  summary.error = error instanceof Error ? error.stack || error.message : String(error);
} finally {
  summary.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(evidenceDir, "product-source-difference-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  fs.rmSync(appRoot, { recursive: true, force: true });
}

console.log(JSON.stringify({
  status: summary.status,
  evidenceDir,
  products: summary.products.map(({ profileId, modules, routes, actions, allowlist }) => ({ profileId, modules: modules.length, routes: routes.length, actions: actions.length, allowlist: allowlist.length })),
  failed: summary.report?.checks.filter(({ status }) => status === "failed").map(({ id }) => id) || [],
}, null, 2));
if (summary.status !== "passed") process.exit(1);

function profiles() {
  return [
    { id: "room-control", moduleProfile: "room-control", request: "只要客厅灯光控制。", title: "客厅灯光", formFactor: "mobile", navigation: "bottom-tabs", density: "touch", pack: "daylight-minimal", palette: "teal-blue", mode: "light" },
    { id: "daily-home", moduleProfile: "daily-home", request: "只要家庭日常空间、环境、情景、自动化和设备组管理。", title: "我的家", formFactor: "mobile", navigation: "bottom-tabs", density: "touch", pack: "warm-residential", palette: "sunset-amber", mode: "light" },
    { id: "whole-home", moduleProfile: "whole-home", request: "生成全屋综合管理应用。", title: "全屋管理", formFactor: "desktop", navigation: "sidebar", density: "comfortable", pack: "daylight-minimal", palette: "neutral-graphite", mode: "light" },
    { id: "installer", moduleProfile: "installer", request: "只要专业安装维护、网关、面板和旋钮。", title: "安装维护", formFactor: "desktop", navigation: "sidebar", density: "compact", pack: "installer-contrast", palette: "forest-cyan", mode: "dark" },
  ];
}

function runStep(id, command, commandArgs, options = {}) {
  const result = runCommand(command, commandArgs, { cwd: options.cwd || skillRoot, timeoutMs: 240000 });
  summary.commands.push({ id, ...result, stdout: result.stdout.slice(-10000), stderr: result.stderr.slice(-10000) });
  if (result.status !== 0) throw new Error(`${id} failed: ${result.stderr || result.stdout}`);
}
