#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { defaultBindingPath, defaultBindingRoot } from "./lib/live-topology.mjs";
import { PROTOCOL_VERSION, SERVICE_ID, serviceOwnerProof, validInstanceId, validOwnerToken } from "./lib/service-contract.mjs";

const DEFAULT_PORT = 8787;
const START_TIMEOUT_MS = 90_000;
const PROBE_TIMEOUT_MS = 1_500;
const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const launchPath = path.join(packageRoot, "scripts", "launch.mjs");

export async function startService(options = {}) {
  const paths = servicePaths(options);
  ensureStateRoot(paths.root);
  const release = acquireLock(paths.lock);
  try {
    const configuration = resolveConfiguration(options);
    const state = readState(paths.state);
    if (state) {
      const existingHealth = await probeHealth(state.port, state.ownerToken);
      if (existingHealth) {
        if (!matchesService(existingHealth, state) || state.configFingerprint !== configuration.fingerprint) {
          throw serviceError("service_config_conflict", "A Yeelight interactive service is already running with a different configuration.");
        }
        return serviceResponse("already_running", existingHealth, state);
      }
      if (isProcessAlive(state.pid)) {
        throw serviceError("service_unavailable", "The existing Yeelight interactive service is still starting or is not healthy.");
      }
      removeState(paths.state);
    }
    if (await portIsOpen(configuration.port)) {
      throw serviceError("service_port_conflict", "The Yeelight interactive service port is already used by another local process.");
    }

    const instanceId = crypto.randomUUID();
    const ownerToken = crypto.randomUUID();
    let child;
    let logFd;
    try {
      logFd = openLog(paths.log);
      child = spawn(process.execPath, [launchPath, "--mode", configuration.mode, "--port", String(configuration.port), ...configuration.liveArgs], {
        cwd: packageRoot,
        detached: true,
        shell: false,
        stdio: ["ignore", logFd, logFd],
        env: childEnvironment(instanceId, ownerToken),
      });
    } catch {
      throw serviceError("service_spawn_failed", "The local interactive service could not be started.");
    } finally {
      if (Number.isInteger(logFd)) closeFd(logFd);
    }
    if (!child || !Number.isInteger(child.pid) || child.pid <= 0) {
      throw serviceError("service_spawn_failed", "The local interactive service could not be started.");
    }
    let childExited = false;
    child.once("exit", () => { childExited = true; });
    child.once("error", () => { childExited = true; });
    child.unref();
    const stopStartingChild = () => {
      if (childExited || child.exitCode !== null || child.signalCode !== null) return;
      try { child.kill("SIGTERM"); } catch { /* Preserve the startup failure after best-effort child cleanup. */ }
    };
    const nextState = {
      version: 1,
      serviceId: SERVICE_ID,
      protocolVersion: PROTOCOL_VERSION,
      pid: child.pid,
      port: configuration.port,
      startedAt: Date.now(),
      requestedMode: configuration.mode,
      mode: configuration.mode === "live-auto" ? "" : configuration.mode,
      configFingerprint: configuration.fingerprint,
      instanceId,
      ownerToken,
    };
    try {
      try {
        writeState(paths.state, nextState);
      } catch {
        throw serviceError("service_state_invalid", "The local interactive service state could not be saved.");
      }
      const health = await waitForHealth(nextState);
      if (!health) {
        throw serviceError("service_start_failed", "The Yeelight interactive service did not become ready. Check the local installation and binding.");
      }
      nextState.mode = health.mode;
      try {
        writeState(paths.state, nextState);
      } catch {
        throw serviceError("service_state_invalid", "The local interactive service state could not be saved.");
      }
      return serviceResponse("started", health, nextState);
    } catch (error) {
      stopStartingChild();
      removeStateIfOwned(paths.state, nextState);
      throw error;
    }
  } finally {
    release();
  }
}

export async function serviceStatus(options = {}) {
  const paths = servicePaths(options);
  ensureStateRoot(paths.root);
  const state = readState(paths.state);
  if (!state) return { contractVersion: "1.0", status: "success", operation: "status", serviceStatus: "stopped", service: SERVICE_ID };
  const health = await probeHealth(state.port, state.ownerToken);
  if (health && matchesService(health, state)) return serviceResponse("status", health, state);
  if (health && isProcessAlive(state.pid)) throw serviceError("service_owner_mismatch", "A different local process is using the saved Yeelight interactive service state.");
  if (!health && isProcessAlive(state.pid)) throw serviceError("service_unavailable", "The existing Yeelight interactive service is still starting or is not healthy.");
  if (!isProcessAlive(state.pid)) removeStateIfOwned(paths.state, state);
  return { contractVersion: "1.0", status: "success", operation: "status", serviceStatus: "stopped", service: SERVICE_ID };
}

export async function stopService(options = {}) {
  const paths = servicePaths(options);
  ensureStateRoot(paths.root);
  const release = acquireLock(paths.lock);
  try {
    const state = readState(paths.state);
    if (!state) return { contractVersion: "1.0", status: "success", operation: "stop", serviceStatus: "stopped", service: SERVICE_ID };
    const health = await probeHealth(state.port, state.ownerToken);
    if (!health || !matchesService(health, state)) {
      if (!isProcessAlive(state.pid)) removeStateIfOwned(paths.state, state);
      throw serviceError("service_owner_mismatch", "The saved service instance is no longer owned by this Skill.");
    }
    terminateOwnedProcess(state.pid);
    if (!await waitForExit(state.port, state.instanceId, state.ownerToken)) throw serviceError("service_stop_timeout", "The Yeelight interactive service did not stop within the local shutdown window.");
    removeStateIfOwned(paths.state, state);
    return { contractVersion: "1.0", status: "success", operation: "stop", serviceStatus: "stopped", service: SERVICE_ID };
  } finally {
    release();
  }
}

function servicePaths(options) {
  const root = path.resolve(options.stateRoot || defaultBindingRoot());
  return { root, state: path.join(root, "service.json"), lock: path.join(root, "service.lock"), log: path.join(root, "service.log") };
}

function resolveConfiguration(options) {
  const bindingPath = path.resolve(options.bindingPath || defaultBindingPath());
  const bindingExists = bindingPresent(bindingPath);
  const mode = bindingExists ? "live-auto" : "mock-18";
  if (options.mode && options.mode !== mode) throw serviceError("service_mode_fixed", "The service mode is selected from the protected live binding and cannot be supplied by the Host.");
  if (!bindingExists) {
    const port = normalizePort(options.port);
    return { mode, port, liveArgs: [], fingerprint: fingerprint({ mode, port }) };
  }
  const binding = readBinding(bindingPath);
  if (binding.profile !== "ifa-eu" || binding.region !== "eu" || !/^\d{1,32}$/.test(binding.houseId)) throw serviceError("live_binding_invalid", "The protected IFA binding is invalid or incomplete.");
  const runtimeBin = resolveRuntimeBinary(options);
  const port = normalizePort(options.port);
  const context = { profile: binding.profile, region: binding.region, houseId: binding.houseId, runtimeBin };
  const bindingFingerprint = fingerprint({ version: binding.version, profile: binding.profile, region: binding.region, houseId: binding.houseId, topology: binding.topology, bindings: binding.bindings });
  return { mode, port, liveArgs: ["--profile", context.profile, "--region", context.region, "--house-id", context.houseId, "--runtime-bin", context.runtimeBin], fingerprint: fingerprint({ mode, port, context, bindingFingerprint }) };
}

function bindingPresent(file) {
  try {
    fs.lstatSync(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw serviceError("live_binding_invalid", "The protected IFA binding cannot be read.");
  }
}

function normalizePort(value) {
  const port = value === undefined || value === "" ? DEFAULT_PORT : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw serviceError("service_port_invalid", "The local service port must be a fixed non-zero TCP port.");
  return port;
}

function readBinding(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("unsafe_binding");
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    const version = Number(value.version);
    const profile = String(value.profile || "");
    const region = String(value.region || "").toLowerCase();
    const houseId = String(value.houseId || "");
    const topology = String(value.topology || "");
    const bindings = value.bindings && typeof value.bindings === "object" && !Array.isArray(value.bindings) ? value.bindings : null;
    if (version !== 1 || !bindings || !["live-proxy-4", "live-18"].includes(topology)) throw new Error("binding_shape_invalid");
    return { version, profile, region, houseId, topology, bindings };
  } catch {
    throw serviceError("live_binding_invalid", "The protected IFA binding cannot be read.");
  }
}

function resolveRuntimeBinary(options = {}) {
  const candidates = [];
  if (options.runtimeBin) candidates.push(options.runtimeBin);
  candidates.push(path.resolve(packageRoot, "../../../yeelight-home/yeelight-home"));
  candidates.push("/opt/homebrew/bin/yeelight-home", "/usr/local/bin/yeelight-home", "/usr/bin/yeelight-home");
  for (const candidate of candidates) {
    try {
      const resolved = fs.realpathSync(candidate);
      if (fs.statSync(resolved).isFile() && (process.platform === "win32" || (fs.statSync(resolved).mode & 0o111))) return resolved;
    } catch { /* Try the next approved installation path. */ }
  }
  throw serviceError("runtime_missing", "The live IFA binding exists, but yeelight-home is not installed or is not executable.");
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function childEnvironment(instanceId, ownerToken) {
  const env = { ...process.env, YEELIGHT_ILE_INSTANCE_ID: instanceId, YEELIGHT_ILE_OWNER_TOKEN: ownerToken };
  delete env.YEELIGHT_ILE_MODE;
  delete env.YEELIGHT_ILE_PORT;
  delete env.YEELIGHT_ILE_SCENARIO;
  delete env.YEELIGHT_ILE_STATE_ROOT;
  delete env.YEELIGHT_HOME_BIN;
  return env;
}

function ensureStateRoot(root) {
  try { fs.mkdirSync(root, { recursive: true, mode: 0o700 }); } catch { throw serviceError("service_state_invalid", "The local service state directory is unavailable."); }
  let stat;
  try { stat = fs.lstatSync(root); } catch { throw serviceError("service_state_invalid", "The local service state directory is unavailable."); }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw serviceError("service_state_invalid", "The local service state directory is not a private directory.");
  fs.chmodSync(root, 0o700);
}

function acquireLock(file) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = fs.openSync(file, "wx", 0o600);
      try { fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, startedAt: Date.now() }), "utf8"); } catch (error) { closeFd(handle); throw error; }
      return () => { try { fs.closeSync(handle); } finally { try { fs.unlinkSync(file); } catch { /* Already removed. */ } } };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (attempt > 0 || !reclaimStaleLock(file)) throw serviceError("service_start_in_progress", "Another AI Host is already starting the Yeelight interactive service.");
    }
  }
  throw serviceError("service_start_in_progress", "Another AI Host is already starting the Yeelight interactive service.");
}

function reclaimStaleLock(file) {
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) return false;
    const lock = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Number.isInteger(lock?.pid) || lock.pid <= 0 || isProcessAlive(lock.pid)) return false;
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

function readState(file) {
  if (!fs.existsSync(file)) return null;
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) throw serviceError("service_state_invalid", "The local service state file is invalid.");
  try {
    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    if (state?.version !== 1 || state.serviceId !== SERVICE_ID || state.protocolVersion !== PROTOCOL_VERSION || !Number.isInteger(state.pid) || state.pid <= 0 || !Number.isInteger(state.port) || state.port < 1 || state.port > 65535 || typeof state.requestedMode !== "string" || !["mock-18", "live-auto"].includes(state.requestedMode) || typeof state.mode !== "string" || (state.mode !== "" && !["mock-18", "live-proxy-4", "live-18"].includes(state.mode)) || !validInstanceId(state.instanceId) || !validOwnerToken(state.ownerToken) || typeof state.configFingerprint !== "string") throw new Error("invalid_state");
    return state;
  } catch {
    throw serviceError("service_state_invalid", "The local service state file is malformed.");
  }
}

function writeState(file, state) {
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state), { encoding: "utf8", mode: 0o600, flag: "wx" });
  try { fs.renameSync(temp, file); } finally { try { fs.unlinkSync(temp); } catch { /* Rename succeeded. */ } }
}

function removeState(file) {
  try { fs.unlinkSync(file); } catch (error) { if (error.code !== "ENOENT") throw error; }
}

function removeStateIfOwned(file, expected) {
  try {
    const actual = readState(file);
    if (actual?.instanceId === expected.instanceId && actual.pid === expected.pid) removeState(file);
  } catch { /* Preserve an unexpected state file rather than deleting it. */ }
}

function openLog(file) {
  try {
    if (fs.existsSync(file)) {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("unsafe_log");
    }
    const flags = fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | (fs.constants.O_NOFOLLOW || 0);
    const fd = fs.openSync(file, flags, 0o600);
    fs.fstatSync(fd);
    fs.chmodSync(file, 0o600);
    return fd;
  } catch {
    throw serviceError("service_log_invalid", "The local service log is unavailable.");
  }
}

function closeFd(fd) {
  try { fs.closeSync(fd); } catch { /* The descriptor may already be closed. */ }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; }
}

function terminateOwnedProcess(pid) {
  if (!isProcessAlive(pid)) return;
  try { process.kill(pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
}

function matchesService(health, state) {
  const requestedModeMatches = health?.requestedMode === state.requestedMode;
  const resolvedModeMatches = !state.mode || health?.mode === state.mode;
  const readinessMatches = state.requestedMode.startsWith("live") ? health?.liveReady === true : health?.liveReady === false;
  return health?.ok === true && health.serviceId === SERVICE_ID && health.protocolVersion === PROTOCOL_VERSION && validInstanceId(health.instanceId) && health.instanceId === state.instanceId && requestedModeMatches && resolvedModeMatches && readinessMatches;
}

async function waitForHealth(state) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const health = await probeHealth(state.port, state.ownerToken);
    if (health && matchesService(health, state)) return health;
    if (!isProcessAlive(state.pid)) return null;
    await delay(150);
  }
  return null;
}

async function waitForExit(port, instanceId, ownerToken) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const health = await probeHealth(port, ownerToken);
    if (!health || health.instanceId !== instanceId) return true;
    await delay(100);
  }
  return false;
}

async function probeHealth(port, ownerToken) {
  return new Promise((resolve) => {
    const challenge = ownerToken ? crypto.randomUUID() : "";
    const headers = { host: `127.0.0.1:${port}` };
    if (challenge) headers["x-yeelight-ile-challenge"] = challenge;
    const request = http.get({ hostname: "127.0.0.1", port, path: "/api/health", timeout: PROBE_TIMEOUT_MS, headers }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          if (response.statusCode !== 200) return resolve(null);
          const value = JSON.parse(body);
          if (ownerToken && value.ownerProof !== serviceOwnerProof(ownerToken, challenge, value.instanceId, value.protocolVersion)) return resolve(null);
          delete value.ownerProof;
          resolve(value);
        } catch { resolve(null); }
      });
    });
    request.on("error", () => resolve(null));
    request.on("timeout", () => { request.destroy(); resolve(null); });
  });
}

async function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
    socket.connect(port, "127.0.0.1");
  });
}

function serviceResponse(operation, health, state) {
  return {
    contractVersion: "1.0",
    status: "success",
    operation,
    serviceStatus: "running",
    service: SERVICE_ID,
    url: `http://127.0.0.1:${state.port}/`,
    openUrl: `http://127.0.0.1:${state.port}/`,
    healthUrl: `http://127.0.0.1:${state.port}/api/health`,
    requestedMode: health.requestedMode,
    mode: health.mode,
    liveReady: Boolean(health.liveReady),
    reused: operation === "already_running",
  };
}

function serviceError(code, userMessage) {
  const error = new Error(userMessage);
  error.code = code;
  return error;
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function parseOperation(argv) {
  const operation = argv[0] || "start";
  if (argv.length > 1 || !new Set(["start", "status", "stop"]).has(operation)) throw serviceError("service_operation_invalid", "Use only start, status, or stop for the local interactive service.");
  return operation;
}

function publicError(error, operation = "start") {
  return { contractVersion: "1.0", status: "error", operation, service: SERVICE_ID, error: { code: error.code || "service_failed", message: error.message || "The local interactive service failed." } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const requestedOperation = process.argv[2] || "start";
  try {
    const operation = parseOperation(process.argv.slice(2));
    const result = operation === "start" ? await startService() : operation === "status" ? await serviceStatus() : await stopService();
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.status === "error" ? 1 : 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify(publicError(error, requestedOperation))}\n`);
    process.exitCode = 1;
  }
}
