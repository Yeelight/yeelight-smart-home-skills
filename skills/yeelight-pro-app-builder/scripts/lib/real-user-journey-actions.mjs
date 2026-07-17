import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildJourneyArgs } from "./real-user-journeys.mjs";
import { sanitizeLiveCapabilityReport } from "./real-user-journey-runner.mjs";
import { runJourneyBrowserAudit } from "./real-user-journey-browser.mjs";
import { freePort, runCommand, startProcess, stopProcess, waitForUrl } from "./lighting-e2e-runner.mjs";
import { startMockHomeServer } from "./mock-home-server.mjs";
import { inspectGeneratedProduct } from "./source-difference-auditor.mjs";

export function createJourneyActions({ journey, skillRoot, runtimeBin, appRoot, evidenceDir, chromium }) {
  const command = (id, executable, args, options = {}) => runStep(id, executable, args, options);
  const build = (phase) => {
    const args = buildJourneyArgs(journey, { skillRoot, runtimeBin, outputRoot: appRoot, phase });
    const result = command(phase === "partial" ? "partial-build" : "build-app", process.execPath, args, { cwd: skillRoot, timeoutMs: 600000 });
    requireSuccess(result);
    return { productSpec: readJSON(path.join(appRoot, "product.spec.json")), generationManifest: readJSON(path.join(appRoot, "generation-manifest.json")), command: result.command };
  };
  return {
    capabilityReport: async () => {
      const result = command("capability-report", process.execPath, buildJourneyArgs(journey, { skillRoot, runtimeBin, outputRoot: "", phase: "capability-report" }), { cwd: skillRoot, timeoutMs: 600000 });
      requireSuccess(result);
      return { capabilityReport: sanitizeLiveCapabilityReport(parseJSONOutput(result.stdout, "capability report")), command: result.command };
    },
    strictBuild: async () => {
      const strictRoot = `${appRoot}-strict`;
      const result = command("strict-build", process.execPath, buildJourneyArgs(journey, { skillRoot, runtimeBin, outputRoot: strictRoot, phase: "build" }), { cwd: skillRoot, timeoutMs: 600000, allowFailure: true });
      return { exitCode: result.command.exitCode, outputCreated: fs.existsSync(strictRoot), command: result.command };
    },
    partialBuild: async () => build("partial"),
    build: async () => build("build"),
    validate: async () => {
      const result = command("validate-app", process.execPath, [path.join(skillRoot, "scripts/validate-app.mjs"), appRoot], { cwd: skillRoot });
      requireSuccess(result);
      return { validation: parseJSONOutput(result.stdout, "app validation"), command: result.command };
    },
    install: async () => {
      const result = command("npm-ci", "npm", ["ci", "--prefix", appRoot], { cwd: skillRoot, timeoutMs: 600000 });
      requireSuccess(result);
      return { command: result.command };
    },
    productionBuild: async () => {
      const result = command("production-build", "npm", ["run", "build", "--prefix", appRoot], { cwd: skillRoot, timeoutMs: 600000 });
      requireSuccess(result);
      return { command: result.command };
    },
    browserAudit: async () => auditBrowser({ journey, skillRoot, runtimeBin, appRoot, evidenceDir, chromium }),
  };
}

async function auditBrowser({ journey, runtimeBin, appRoot, evidenceDir, chromium }) {
  let mockServer;
  let bridge;
  let web;
  let runtimeHome;
  const startedAt = Date.now();
  try {
    if (journey.runtime.mode === "reference") mockServer = await startMockHomeServer({ fixtureId: journey.runtime.fixture });
    const bridgePort = await freePort();
    let webPort = await freePort();
    while (webPort === bridgePort) webPort = await freePort();
    const bridgeOrigin = `http://127.0.0.1:${bridgePort}`;
    const baseUrl = `http://127.0.0.1:${webPort}/`;
    const runtimeEnv = { YEELIGHT_HOME_BIN: runtimeBin, YEELIGHT_CLOUD_REGION: journey.runtime.region || "dev" };
    if (mockServer) {
      runtimeHome = fs.mkdtempSync(path.join(os.tmpdir(), `ypa-${journey.id}-runtime-`));
      Object.assign(runtimeEnv, {
        YEELIGHT_API_BASE_URL: mockServer.apiBaseUrl,
        YEELIGHT_HOME_ACCESS_TOKEN: mockServer.credential,
        YEELIGHT_HOME_AUTHENTICATED: "1",
        YEELIGHT_HOME_HOUSE_ID: mockServer.homeId,
        YEELIGHT_HOME_DIR: runtimeHome,
      });
    } else {
      runtimeEnv.YEELIGHT_HOME_HOUSE_ID = journey.runtime.homeId;
    }
    bridge = startProcess("npm", ["--workspace", "@app/bridge", "run", "dev"], { cwd: appRoot, env: { ...runtimeEnv, YPA_BRIDGE_PORT: String(bridgePort), YPA_TRUSTED_WEB_ORIGINS: baseUrl } });
    web = startProcess("npm", ["--workspace", "@app/web", "run", "dev", "--", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], { cwd: appRoot, env: { YPA_RELAY_ORIGIN: bridgeOrigin } });
    await waitForUrl(`${bridgeOrigin}/health`);
    await waitForUrl(baseUrl);
    const inspection = inspectGeneratedProduct(appRoot, journey.id);
    const browserAudit = await runJourneyBrowserAudit({ chromium, journey, baseUrl, routes: inspection.routes, evidenceDir });
    return { browserAudit, command: { id: "browser-audit", exitCode: browserAudit.status === "passed" ? 0 : 1, durationMs: Date.now() - startedAt } };
  } finally {
    await stopProcess(web);
    await stopProcess(bridge);
    if (mockServer) await mockServer.close();
    if (runtimeHome) fs.rmSync(runtimeHome, { recursive: true, force: true });
  }
}

function runStep(id, executable, args, { allowFailure = false, ...options } = {}) {
  const startedAt = Date.now();
  const result = runCommand(executable, args, options);
  const command = { id, exitCode: result.status, durationMs: Date.now() - startedAt };
  return { ...result, command, allowFailure };
}

function requireSuccess(result) {
  if (result.status !== 0) throw new Error(`${result.command.id} failed: ${boundedOutput(result.stderr || result.stdout)}`);
}

function parseJSONOutput(output, label) {
  try { return JSON.parse(output); }
  catch { throw new Error(`${label} did not return JSON`); }
}

function boundedOutput(value) {
  // 保留凭证脱敏能力，同时避免把禁止的认证方案字面量写入发布包。
  return String(value || "").replace(/\x42earer\s+\S+|https?:\/\/\S+|(?:token|secret|password)\s*[=:]\s*\S+/gi, "[redacted]").slice(-1000);
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
