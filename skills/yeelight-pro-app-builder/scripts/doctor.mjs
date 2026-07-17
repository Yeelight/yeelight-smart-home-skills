#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";

import { createCommandRunner } from "./lib/command-runner.mjs";
import { parseArgs } from "./lib/common.mjs";
import { inspectLoopbackPort, inspectOutputDirectory, runBuilderDoctor } from "./lib/doctor.mjs";

const args = parseArgs();
const runtimeBin = String(args["runtime-bin"] || process.env.YEELIGHT_HOME_BIN || "yeelight-home");
const outputDir = path.resolve(String(args["output-dir"] || path.join(process.cwd(), "yeelight-pro-app")));
const bridgePort = Number(args["bridge-port"] || 4174);
const npm = spawnSync("npm", ["--version"], { encoding: "utf8" });

const report = await runBuilderDoctor({
  runtimeBin,
  outputDir,
  bridgePort,
  nodeVersion: process.versions.node,
  npmVersion: npm.status === 0 ? npm.stdout.trim() : "unknown",
  run: createCommandRunner({ runtimeBin }),
  inspectOutputDirectory,
  inspectPort: inspectLoopbackPort,
});

if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
else printText(report);
if (!report.ok) process.exitCode = 1;

function printText(value) {
  console.log(value.ok ? "Yeelight PRO App Builder doctor: ready" : "Yeelight PRO App Builder doctor: action required");
  for (const check of value.checks) {
    console.log(`${check.status === "pass" ? "PASS" : "FAIL"} ${check.id}: ${check.message}`);
    if (check.remediation) console.log(`  ${check.remediation}`);
  }
}
