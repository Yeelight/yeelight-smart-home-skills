#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadCapabilityCatalog, loadCapabilityCoverage, validateCapabilityProfile } from "./lib/capabilities/catalog.mjs";
import { runReferenceCapabilityProbe } from "./lib/capabilities/reference-probes.mjs";
import { diffRuntimeProfiles, probeRuntimeProfile } from "./lib/capabilities/runtime-profile.mjs";
import { createCommandRunner } from "./lib/command-runner.mjs";
import { startMockHomeServer } from "./lib/mock-home-server.mjs";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptRoot, "../../../..");
const smartHomeRoot = path.join(repoRoot, "yeelight-smart-home");
const args = parseArgs(process.argv.slice(2));
const source = String(args.source || "all");
if (!["installed", "workspace", "all"].includes(source)) throw new Error("--source must be installed, workspace, or all");

const catalog = loadCapabilityCatalog();
const coverage = loadCapabilityCoverage();
const profiles = {};
let workspaceDir;
try {
  if (source === "installed" || source === "all") {
    profiles.installed = await probeSource({ catalog, coverage, source: "installed-cli", runtimeBin: String(args["installed-bin"] || "yeelight-home") });
  }
  if (source === "workspace" || source === "all") {
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "ypa-workspace-runtime-"));
    const runtimeBin = String(args["workspace-bin"] || path.join(workspaceDir, "yeelight-home"));
    if (!args["workspace-bin"]) await runProcess("go", ["build", "-o", runtimeBin, "../yeelight-home/cmd/yeelight-home"], smartHomeRoot);
    profiles.workspace = await probeSource({ catalog, coverage, source: "workspace-runtime", runtimeBin });
  }
  const output = {
    schemaVersion: 1,
    catalogVersion: catalog.catalogVersion,
    profiles,
    profileCoverage: Object.fromEntries(Object.entries(profiles).map(([id, profile]) => [id, summarizeProfile(profile)])),
    ...(profiles.installed && profiles.workspace ? { diff: diffRuntimeProfiles(profiles.installed, profiles.workspace) } : {}),
  };
  const json = JSON.stringify(output, null, 2) + "\n";
  if (args.out) {
    const outputFile = path.resolve(String(args.out));
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, json);
  } else process.stdout.write(json);
} finally {
  if (workspaceDir) fs.rmSync(workspaceDir, { recursive: true, force: true });
}

function summarizeProfile(profile) {
  const counts = Object.fromEntries([...new Set(profile.capabilities.map((entry) => entry.status))].sort().map((status) => [status, profile.capabilities.filter((entry) => entry.status === status).length]));
  return { total: profile.capabilities.length, covered: profile.capabilities.length, coveragePercent: 100, counts };
}

async function probeSource({ catalog, coverage, source, runtimeBin }) {
  const server = await startMockHomeServer({ fixtureId: "reference-home" });
  const runtimeHome = fs.mkdtempSync(path.join(os.tmpdir(), `ypa-${source}-`));
  try {
    const run = createCommandRunner({ runtimeBin, region: "dev", env: {
      YEELIGHT_API_BASE_URL: server.apiBaseUrl,
      YEELIGHT_HOME_ACCESS_TOKEN: server.credential,
      YEELIGHT_HOME_HOUSE_ID: server.homeId,
      YEELIGHT_HOME_DIR: runtimeHome,
    } });
    const profile = await probeRuntimeProfile({
      catalog,
      source,
      run,
      executeProbe: async (capability) => {
        const requestOffset = server.requestLog().length;
        try {
          return await runReferenceCapabilityProbe({ capability, run, server });
        } catch (error) {
          const requests = server.requestLog().slice(requestOffset);
          const failedRequests = requests.filter((entry) => entry.status >= 400);
          const requestEvidence = JSON.stringify(failedRequests.length > 0 ? failedRequests : requests.slice(-12));
          throw new Error(`${String(error?.message || error)}\nrequestLog=${requestEvidence}`);
        }
      },
    });
    return validateCapabilityProfile(profile, { catalog, coverage });
  } finally {
    await server.close();
    fs.rmSync(runtimeHome, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    parsed[key] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return parsed;
}

function runProcess(command, commandArgs, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} failed (${code}): ${stderr || stdout}`)));
  });
}
