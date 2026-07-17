#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { parseArgs } from "./lib/common.mjs";
import { reserveLoopbackPorts } from "./lib/loopback-port-reservation.mjs";
import { startMockHomeServer } from "./lib/mock-home-server.mjs";

const args = parseArgs();
const usage = `Usage: node scripts/run-mock-app.mjs --app <generated-app-dir>
  [--mock-home comprehensive|reference-home|reference-home-degraded]
  [--web-port <port|auto>] [--bridge-port <port|auto>]

Occupied numeric ports fail before Mock API or npm starts. This runner does not terminate external processes.`;
if (args.help) {
  console.log(usage);
  process.exit(0);
}
if (!args.app) {
  console.error(usage);
  process.exit(2);
}

const appRoot = path.resolve(String(args.app));
const specFile = path.join(appRoot, "product.spec.json");
if (!fs.existsSync(specFile)) {
  console.error("Generated app is missing product.spec.json");
  process.exit(2);
}

const spec = JSON.parse(fs.readFileSync(specFile, "utf8"));
const fixtureId = String(args["mock-home"] || "comprehensive");
let reservations;
let mockServer;
let runtimeHome;
let child;
let requestedSignal = "";
let forceTimer;
const outputTail = [];

try {
  reservations = await reserveLoopbackPorts({ webValue: args["web-port"], bridgeValue: args["bridge-port"] });
  const { webPort, bridgePort } = reservations;
  mockServer = await startMockHomeServer({ fixtureId });
  if (!spec.scope?.homeIds?.includes(mockServer.homeId)) throw runnerError(`Generated app home does not match mock fixture ${fixtureId}`, 2);
  runtimeHome = fs.mkdtempSync(path.join(os.tmpdir(), "ypa-mock-app-runtime-"));
  await reservations.release();
  reservations = undefined;
  child = spawn("npm", ["run", "dev", "--prefix", appRoot], {
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      YEELIGHT_API_BASE_URL: mockServer.apiBaseUrl,
      YEELIGHT_HOME_ACCESS_TOKEN: mockServer.credential,
      YEELIGHT_HOME_AUTHENTICATED: "1",
      YEELIGHT_HOME_HOUSE_ID: mockServer.homeId,
      YEELIGHT_HOME_DIR: runtimeHome,
      YEELIGHT_CLOUD_REGION: "dev",
      YPA_WEB_PORT: String(webPort),
      YPA_BRIDGE_PORT: String(bridgePort),
      YPA_RELAY_ORIGIN: `http://127.0.0.1:${bridgePort}`,
      YPA_TRUSTED_WEB_ORIGINS: `http://127.0.0.1:${webPort},http://localhost:${webPort}`,
    },
    stdio: ["inherit", "pipe", "pipe"],
  });
  mirrorOutput(child.stdout, process.stdout, outputTail);
  mirrorOutput(child.stderr, process.stderr, outputTail);

  console.log(`Mock home ${fixtureId} is serving app ${appRoot}`);
  console.log(`Mock API ${mockServer.apiBaseUrl}`);
  console.log(`Web app http://127.0.0.1:${webPort}`);
  console.log(`Bridge http://127.0.0.1:${bridgePort}`);

  const signalHandlers = Object.fromEntries(["SIGINT", "SIGTERM"].map((signal) => [signal, () => {
    requestedSignal = signal;
    forceTimer = terminateOwnedProcessGroup(child, signal);
  }]));
  for (const [signal, handler] of Object.entries(signalHandlers)) process.once(signal, handler);
  const outcome = await waitForChild(child);
  for (const [signal, handler] of Object.entries(signalHandlers)) process.removeListener(signal, handler);
  if (forceTimer) clearTimeout(forceTimer);
  if (outcome.error) throw outcome.error;
  if (requestedSignal) process.exitCode = 0;
  else if ((outcome.code ?? 1) !== 0) {
    if (/EADDRINUSE|address already in use|strictPort/i.test(outputTail.join(""))) {
      console.error("A selected app port became unavailable during startup. Retry with --web-port auto --bridge-port auto.");
    }
    process.exitCode = outcome.code ?? 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
} finally {
  if (reservations) await reservations.release();
  if (child?.exitCode === null && child?.signalCode === null) {
    forceTimer = terminateOwnedProcessGroup(child, "SIGTERM");
    await waitForChild(child);
  }
  if (forceTimer) clearTimeout(forceTimer);
  if (mockServer) await mockServer.close();
  if (runtimeHome) fs.rmSync(runtimeHome, { recursive: true, force: true });
}

function waitForChild(processChild) {
  return new Promise((resolve) => {
    processChild.once("error", (error) => resolve({ error }));
    processChild.once("close", (code, signal) => resolve({ code, signal }));
  });
}

function terminateOwnedProcessGroup(processChild, signal) {
  if (!processChild?.pid || processChild.exitCode !== null || processChild.signalCode !== null) return undefined;
  signalOwnedProcess(processChild, signal);
  const timer = setTimeout(() => signalOwnedProcess(processChild, "SIGKILL"), 3000);
  timer.unref();
  return timer;
}

function signalOwnedProcess(processChild, signal) {
  try {
    if (process.platform !== "win32") process.kill(-processChild.pid, signal);
    else processChild.kill(signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function mirrorOutput(source, target, tail) {
  source.on("data", (chunk) => {
    const text = chunk.toString();
    target.write(text);
    tail.push(text);
    while (tail.join("").length > 12000) tail.shift();
  });
}

function runnerError(message, exitCode) {
  return Object.assign(new Error(message), { exitCode });
}
