#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizeRuntimeContext, runtimeEnvironment } from "./lib/runtime-adapter.mjs";
import { randomOpaque } from "./lib/contracts.mjs";

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const launchPath = path.join(packageRoot, "scripts", "launch.mjs");
const statePath = path.join(os.homedir(), ".yeelight", "yeelight-cinema-director", "service.json");
const DEFAULT_PORT = 8789;
export const DEFAULT_STOP_TIMEOUT_MS = 4_000;
export const MAX_STOP_TIMEOUT_MS = 120_000;
export const DEFAULT_STARTUP_TIMEOUT_MS = 8_000;
export const LIVE_STARTUP_TIMEOUT_MS = 60_000;
export const MAX_STARTUP_TIMEOUT_MS = 120_000;
const NOFOLLOW = fs.constants.O_NOFOLLOW || 0;

export async function serviceCommand(action, options = {}) {
  if (!["start", "status", "stop"].includes(action)) throw new Error("unsupported_action");
  const storagePath = options.statePath || statePath;
  const normalizedOptions = action === "stop" ? { ...options, stopTimeoutMs: parseStopTimeout(options.stopTimeoutMs) } : action === "start" ? normalizeStartOptions(options) : options;
  const state = await readState(storagePath);
  if (action === "status") return status(state, storagePath);
  if (action === "stop") return stop(state, normalizedOptions, storagePath);
  return start(state, normalizedOptions, storagePath);
}

async function start(existing, options, storagePath) {
  const port = Number(options.port || process.env.YEELIGHT_CINEMA_PORT || DEFAULT_PORT);
  const mode = options.mode === "live" ? "live" : "mock";
  const context = mode === "live" ? normalizeRuntimeContext(options.context, { required: true }) : {};
  const startupTimeoutMs = parseStartupTimeout(options.startupTimeoutMs, mode);
  if (existing?.instanceId) {
    const existingOpen = await portIsOpen(existing.port);
    if (existing.phase === "stopping") {
      if (existingOpen) {
        const details = await healthDetails(existing.port);
        if (details && details.instanceId !== existing.instanceId) throw new Error("service_identity_mismatch");
        return serviceLocation(existing, "stopping", true);
      }
      await clearState(storagePath);
    } else if (await health(existing.port, existing.instanceId)) {
      if (existing.mode !== mode || !sameContext(existing.context, context)) throw new Error("service_context_mismatch");
      if (mode === "live" && typeof existing.hostToken !== "string") throw new Error("service_host_token_missing");
      return serviceLocation(existing, "already_running", true);
    } else if (existingOpen) {
      throw new Error("service_identity_unavailable");
    } else {
      await clearState(storagePath);
    }
  }
  if (await portIsOpen(port)) throw new Error("service_port_conflict");
  const hostToken = randomOpaque("a");
  const childEnv = { ...runtimeEnvironment(), YEELIGHT_CINEMA_INSTANCE: randomOpaque("i"), YEELIGHT_CINEMA_MODE: mode, YEELIGHT_CINEMA_PORT: String(port), YEELIGHT_CINEMA_HOST_TOKEN: hostToken };
  if (mode === "live") {
    for (const key of ["YEELIGHT_HOME_CONTROL_MODE", "YEELIGHT_HOME_GATEWAY_IP", "YEELIGHT_HOME_LAN_ENDPOINT"]) delete childEnv[key];
    Object.assign(childEnv, runtimeEnvironment({}, {
      YEELIGHT_HOME_PROFILE: context.profile,
      YEELIGHT_CLOUD_REGION: context.region,
      YEELIGHT_HOME_HOUSE_ID: context.houseId,
      ...(context.controlMode ? { YEELIGHT_HOME_CONTROL_MODE: context.controlMode } : {}),
      ...(context.gatewayIp ? { YEELIGHT_HOME_GATEWAY_IP: context.gatewayIp } : {}),
      ...(context.lanEndpoint ? { YEELIGHT_HOME_LAN_ENDPOINT: context.lanEndpoint } : {}),
    }));
    delete childEnv.YEELIGHT_API_BASE_URL;
  }
  if (process.env.YEELIGHT_HOME_BIN) childEnv.YEELIGHT_HOME_BIN = process.env.YEELIGHT_HOME_BIN;
  if (process.env.YOUTUBE_API_KEY?.trim()) childEnv.YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY.trim();
  const launchArgs = [launchPath, "--port", String(port), "--mode", mode];
  if (mode === "live") {
    launchArgs.push("--profile", context.profile, "--region", context.region, "--house-id", context.houseId);
    if (context.controlMode) launchArgs.push("--control-mode", context.controlMode);
    if (context.gatewayIp) launchArgs.push("--gateway-ip", context.gatewayIp);
    if (context.lanEndpoint) launchArgs.push("--lan-endpoint", context.lanEndpoint);
  }
  const child = spawn(process.execPath, launchArgs, { cwd: packageRoot, detached: true, shell: false, stdio: "ignore", env: childEnv });
  if (!child.pid) throw new Error("service_spawn_failed");
  const expectedInstanceId = childEnv.YEELIGHT_CINEMA_INSTANCE;
  const childState = { exited: false };
  child.once("exit", () => { childState.exited = true; });
  child.once("error", () => { childState.exited = true; });
  child.unref();
  const healthy = await waitForHealth(port, startupTimeoutMs, () => childState.exited, expectedInstanceId);
  if (!healthy) {
    await terminateSpawnedChild(child, port);
    throw new Error(childState.exited ? "service_start_failed" : "service_not_ready");
  }
  const identity = await healthDetails(port);
  if (!identity || identity.instanceId !== expectedInstanceId) {
    await terminateSpawnedChild(child, port);
    throw new Error("service_identity_unavailable");
  }
  try {
    await writeState(storagePath, { pid: child.pid, port, mode, context, hostToken, phase: "running", instanceId: identity.instanceId, startedAt: Date.now() });
  } catch (error) {
    await terminateSpawnedChild(child, port);
    throw error;
  }
  return { status: "ok", serviceStatus: "started", openUrl: `http://127.0.0.1:${port}/`, healthUrl: `http://127.0.0.1:${port}/api/health`, mode, reused: false };
}

async function status(state, storagePath) {
  if (!state) return { status: "ok", serviceStatus: "stopped", reused: false };
  if (!state.instanceId) return { status: "ok", serviceStatus: "unavailable", port: state.port, mode: state.mode, reused: false };
  const open = await portIsOpen(state.port);
  if (state.phase === "stopping") {
    if (!open) {
      await clearState(storagePath);
      return { status: "ok", serviceStatus: "stopped", reused: false };
    }
    const details = await healthDetails(state.port);
    if (details && details.instanceId !== state.instanceId) return { status: "error", serviceStatus: "identity_mismatch", port: state.port, reused: false };
    return serviceLocation(state, "stopping", true);
  }
  const healthy = await health(state.port, state.instanceId);
  if (!healthy && !open) {
    await clearState(storagePath);
    return { status: "ok", serviceStatus: "stopped", reused: false };
  }
  if (!healthy) return { status: "ok", serviceStatus: "unavailable", port: state.port, mode: state.mode, reused: false };
  return serviceLocation(state, "running", true);
}

async function stop(state, options, storagePath) {
  if (!state) return { status: "ok", serviceStatus: "stopped", stopped: false };
  if (!validPid(state.pid)) return { status: "error", serviceStatus: "state_invalid", stopped: false, port: state.port };
  const timeoutMs = Number.isInteger(options.stopTimeoutMs) && options.stopTimeoutMs >= 0 ? options.stopTimeoutMs : DEFAULT_STOP_TIMEOUT_MS;
  if (state.phase !== "stopping") {
    const details = await healthDetails(state.port);
    const open = await portIsOpen(state.port);
    if (!open) { await clearState(storagePath); return { status: "ok", serviceStatus: "stopped", stopped: false }; }
    if (!details || !state.instanceId || details.instanceId !== state.instanceId) return { status: "error", serviceStatus: "identity_mismatch", stopped: false, port: state.port };
    await writeState(storagePath, { ...state, phase: "stopping", stopRequestedAt: Date.now() });
    try {
      (options.killProcess || process.kill)(state.pid, "SIGTERM");
    } catch (error) {
      if (error?.code === "ESRCH" && !(await portIsOpen(state.port))) {
        await clearState(storagePath);
        return { status: "ok", serviceStatus: "stopped", stopped: false };
      }
      return { status: "error", serviceStatus: "stop_failed", stopped: false, port: state.port };
    }
  }
  const down = await waitForDown(state.port, timeoutMs);
  if (!down) return { status: "error", serviceStatus: "stopping", stopped: false, port: state.port };
  await clearState(storagePath);
  return { status: "ok", serviceStatus: "stopped", stopped: true };
}

function serviceLocation(state, serviceStatus, reused) {
  return { status: "ok", serviceStatus, openUrl: `http://127.0.0.1:${state.port}/`, healthUrl: `http://127.0.0.1:${state.port}/api/health`, mode: state.mode, reused, contextMatched: state.mode === "live", controlMode: state.context?.controlMode || "configured", lanConfigured: Boolean(state.context?.gatewayIp || state.context?.lanEndpoint) };
}

function normalizeStartOptions(options) {
  const mode = options.mode === "live" ? "live" : "mock";
  if (mode !== "live") return { ...options, mode };
  const context = options.context || {
    profile: options.profile,
    region: options.region,
    houseId: options.houseId,
    controlMode: options.controlMode,
    gatewayIp: options.gatewayIp,
    lanEndpoint: options.lanEndpoint,
  };
  return { ...options, mode, context: normalizeRuntimeContext(context, { required: true }) };
}

function sameContext(left = {}, right = {}) {
  return ["profile", "region", "houseId", "controlMode", "gatewayIp", "lanEndpoint"]
    .every((key) => (left[key] || "") === (right[key] || ""));
}

function validPid(pid) { return Number.isSafeInteger(pid) && pid > 0; }

export function parseStartupTimeout(value, mode) {
  if (value === undefined) return mode === "live" ? LIVE_STARTUP_TIMEOUT_MS : DEFAULT_STARTUP_TIMEOUT_MS;
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
  if (!/^\d+$/.test(text)) throw new Error("invalid_startup_timeout");
  const timeoutMs = Number(text);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_STARTUP_TIMEOUT_MS) throw new Error("invalid_startup_timeout");
  return timeoutMs;
}

export function parseStopTimeout(value) {
  if (value === undefined) return DEFAULT_STOP_TIMEOUT_MS;
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
  if (!/^\d+$/.test(text)) throw new Error("invalid_stop_timeout");
  const timeoutMs = Number(text);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs > MAX_STOP_TIMEOUT_MS) throw new Error("invalid_stop_timeout");
  return timeoutMs;
}

async function health(port, expectedInstanceId) {
  const details = await healthDetails(port);
  return Boolean(details && (!expectedInstanceId || details.instanceId === expectedInstanceId));
}

async function healthDetails(port) {
  return new Promise((resolve) => {
    const request = http.get({ hostname: "127.0.0.1", port, path: "/api/health", headers: { Host: `127.0.0.1:${port}` } }, (response) => { let body = ""; response.setEncoding("utf8"); response.on("data", (chunk) => { body += chunk; }); response.on("end", () => { try { const value = JSON.parse(body); resolve(response.statusCode === 200 && value.serviceId === "yeelight-cinema-director" && typeof value.instanceId === "string" ? value : null); } catch { resolve(null); } }); });
    request.setTimeout(500, () => { request.destroy(); resolve(null); });
    request.on("error", () => resolve(null));
  });
}

async function waitForHealth(port, timeoutMs, exited = () => false, expectedInstanceId) { const end = Date.now() + timeoutMs; while (Date.now() < end) { if (await health(port, expectedInstanceId)) return true; if (exited()) return false; await new Promise((resolve) => setTimeout(resolve, 80)); } return false; }
async function waitForDown(port, timeoutMs) { const end = Date.now() + timeoutMs; while (Date.now() < end) { if (!(await portIsOpen(port))) return true; await new Promise((resolve) => setTimeout(resolve, 80)); } return false; }
async function portIsOpen(port) { return new Promise((resolve) => { const socket = net.createConnection({ host: "127.0.0.1", port }); socket.once("connect", () => { socket.destroy(); resolve(true); }); socket.once("error", () => resolve(false)); socket.setTimeout(250, () => { socket.destroy(); resolve(false); }); }); }

async function terminateSpawnedChild(child, port) {
  try { process.kill(child.pid, "SIGTERM"); } catch (error) { if (error?.code !== "ESRCH") throw error; }
  const [down, exited] = await Promise.all([
    waitForDown(port, DEFAULT_STOP_TIMEOUT_MS),
    waitForChildExit(child, DEFAULT_STOP_TIMEOUT_MS),
  ]);
  if (!down || !exited) throw new Error("service_cleanup_failed");
}

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", () => finish(true));
    child.once("error", () => finish(true));
  });
}

async function readState(storagePath) {
  const directory = path.dirname(storagePath);
  if (!await privateDirectoryExists(directory)) return null;
  let handle;
  try {
    handle = await fs.open(storagePath, fs.constants.O_RDONLY | NOFOLLOW);
    const stat = await handle.stat();
    assertPrivateFile(stat);
    return JSON.parse(await handle.readFile("utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error?.message === "service_state_invalid" || error?.code === "ELOOP") throw new Error("service_state_invalid");
    throw new Error("service_state_invalid");
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function writeState(storagePath, state) {
  const directory = path.dirname(storagePath);
  await ensurePrivateDirectory(directory);
  await privateFileExists(storagePath);
  const temporary = `${storagePath}.tmp-${process.pid}-${randomOpaque("s")}`;
  let handle;
  try {
    handle = await fs.open(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NOFOLLOW, 0o600);
    await handle.chmod(0o600);
    await handle.writeFile(JSON.stringify(state), "utf8");
    await handle.sync();
  } catch (error) {
    if (error?.code === "ELOOP") throw new Error("service_state_invalid");
    throw error;
  } finally {
    await handle?.close().catch(() => {});
  }
  try {
    await fs.rename(temporary, storagePath);
    await syncDirectory(directory);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function privateDirectoryExists(directory) {
  try {
    const stat = await fs.lstat(directory);
    assertPrivateDirectory(stat);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    if (error?.message === "service_state_invalid") throw error;
    throw new Error("service_state_invalid");
  }
}

async function privateFileExists(filePath) {
  try {
    const stat = await fs.lstat(filePath);
    assertPrivateFile(stat);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    if (error?.message === "service_state_invalid") throw error;
    throw new Error("service_state_invalid");
  }
}

async function ensurePrivateDirectory(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(directory);
  assertPrivateDirectory(stat);
  if ((stat.mode & 0o077) !== 0) await fs.chmod(directory, 0o700);
}

function assertPrivateDirectory(stat) {
  if (stat.isSymbolicLink() || !stat.isDirectory() || !ownedByCurrentUser(stat)) throw new Error("service_state_invalid");
}

function assertPrivateFile(stat) {
  if (stat.isSymbolicLink() || !stat.isFile() || !ownedByCurrentUser(stat) || (stat.mode & 0o077) !== 0) throw new Error("service_state_invalid");
}

function ownedByCurrentUser(stat) {
  return typeof process.getuid !== "function" || stat.uid === process.getuid();
}

async function syncDirectory(directory) {
  const handle = await fs.open(directory, fs.constants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}

async function clearState(storagePath) {
  await fs.rm(storagePath, { force: true });
  try { await syncDirectory(path.dirname(storagePath)); } catch (error) { if (error?.code !== "ENOENT") throw error; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  serviceCommand(process.argv[2] || "start", { port: value("--port"), mode: value("--mode"), profile: value("--profile"), region: value("--region"), houseId: value("--house-id"), controlMode: value("--control-mode"), gatewayIp: value("--gateway-ip"), lanEndpoint: value("--lan-endpoint"), stopTimeoutMs: value("--stop-timeout-ms") }).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(JSON.stringify({ status: "error", operation: process.argv[2] || "start", error: { code: error.code || "service_failed", message: error.message } })); process.exitCode = 1; });
}

function value(name) {
  const indexes = process.argv.reduce((found, value, index) => value === name ? [...found, index] : found, []);
  if (indexes.length > 1) throw new Error("duplicate_argument");
  if (!indexes.length) return undefined;
  return process.argv[indexes[0] + 1] ?? "";
}

export const __testing = { statePath, health, healthDetails, waitForHealth, waitForDown, validPid, parseStopTimeout, parseStartupTimeout, readState, privateDirectoryExists, privateFileExists, assertPrivateFile };
