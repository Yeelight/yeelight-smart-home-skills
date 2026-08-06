import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LOGICAL_SLOTS } from "./contracts.mjs";
import { QUADRANT_ALIASES, QUADRANT_MAP } from "./topology.mjs";

const VERSION = 1;
const DEVICE_ID = /^[A-Za-z0-9._-]{1,80}$/;
const PROFILE = /^[A-Za-z0-9._-]{1,64}$/;
const HOUSE_ID = /^\d{1,32}$/;
const REGIONS = new Set(["cn", "sg", "us", "eu", "dev"]);
const APP_DIR = "yeelight-interactive-light-experiences";
const LIVE_PROFILE = "ifa-eu";
const LIVE_REGION = "eu";
const AUTO_MODE = "live-auto";

export function defaultBindingRoot() {
  return path.join(os.homedir(), ".local", "state", APP_DIR);
}

export function defaultBindingPath() {
  return path.join(defaultBindingRoot(), "live-binding.json");
}

export function assertProductionBindingPath(bindingPath) {
  const target = path.resolve(bindingPath || defaultBindingPath());
  if (target !== path.resolve(defaultBindingPath())) throw new Error("live_binding_path_must_be_app_state");
  return target;
}

export class LiveTopologyManager {
  #adapter;
  #bindingPath;
  #context;
  #topologies = new Map();
  #writeValidated = false;

  constructor({ adapter, bindingPath = defaultBindingPath(), profile, region, houseId } = {}) {
    if (!adapter || typeof adapter.invokeRead !== "function") throw new Error("live_runtime_adapter_required");
    this.#adapter = adapter;
    this.#bindingPath = path.resolve(bindingPath);
    this.#context = normalizeContext({ profile, region, houseId });
  }

  async load() {
    const record = await readBindingFile(this.#bindingPath);
    if (!record || record.profile !== this.#context.profile || record.region !== this.#context.region || record.houseId !== this.#context.houseId) throw new Error("live_binding_context_mismatch");
    const discovered = await discoverLiveInstallation(this.#adapter, this.#context);
    const verifiedDevices = await verifyBoundDevices(this.#adapter, record, discovered.devices, discovered.gatewayId);
    const topology = buildLiveTopology(record, { ...discovered, devices: verifiedDevices }, false);
    this.#topologies.clear();
    this.#topologies.set(record.topology, topology);
    return topology;
  }

  get(mode) {
    if (mode === AUTO_MODE) {
      const resolved = this.#topologies.values().next().value;
      if (!resolved) throw new Error("live_topology_unavailable");
      return resolved;
    }
    const topology = this.#topologies.get(mode);
    if (!topology) throw new Error("live_topology_unavailable");
    return topology;
  }

  markWriteValidated(mode) {
    const topology = this.#topologies.get(mode);
    if (!topology) return;
    this.#writeValidated = true;
    topology.evidenceLabel = mode === "live-proxy-4" ? "EU 4-light quadrant-proxy write validated" : "16-light IFA live validation completed";
  }

  status() {
    return { loaded: this.#topologies.size > 0, bindingPath: this.#bindingPath, modes: [...this.#topologies.keys()], writeValidated: this.#writeValidated };
  }
}

export async function discoverLiveInstallation(adapter, expectedContext = null) {
  const [entityResult, gatewayResult] = await Promise.all([
    readWithRetry(() => adapter.invokeRead({ intent: "entity.list", targets: [], parameters: {} })),
    readWithRetry(() => adapter.invokeRead({ intent: "gateway.list", targets: [], parameters: {} })),
  ]);
  if (!entityResult?.ok || !gatewayResult?.ok) throw new Error("live_discovery_failed");
  if (expectedContext && (entityResult.houseId !== expectedContext.houseId || entityResult.region !== expectedContext.region || gatewayResult.houseId !== expectedContext.houseId || gatewayResult.region !== expectedContext.region)) throw new Error("live_discovery_context_mismatch");
  const devices = (entityResult.entities || []).filter((entity) => entity.entityType === "device");
  const gateways = (gatewayResult.gateways || []).filter((gateway) => gateway.online && gateway.bind !== false);
  if (!devices.length || gateways.length !== 1 || !gateways[0].id) throw new Error("live_gateway_or_device_discovery_invalid");
  return { devices, gateway: { alias: "IFA Gateway", online: true }, gatewayId: gateways[0].id, gatewayIds: entityResult.gatewayIds || [] };
}

async function verifyBoundDevices(adapter, record, devices, gatewayId) {
  const byId = new Map(devices.map((device) => [device.id, device]));
  const aliases = aliasesFor(record.topology);
  const checks = await boundedMap(aliases, 4, async (alias) => {
    const binding = record.bindings[alias];
    const device = byId.get(binding.deviceId);
    if (!device) return { ok: false, error: `live_binding_device_missing:${alias}` };
    if (!gatewayId || device.gatewayDeviceId !== gatewayId) return { ok: false, error: `live_binding_gateway_mismatch:${alias}` };
    const capabilities = await readWithRetry(() => adapter.invokeRead({ intent: "entity.capabilities", targets: [{ id: device.id }], parameters: {} }));
    if (!capabilities?.ok || !capabilities.capabilities?.rgb || !capabilities.capabilities?.brightness) return { ok: false, error: `live_binding_capability_invalid:${alias}` };
    const state = await readOneState(adapter, device.id);
    if (!state || state.online !== true) return { ok: false, error: `live_binding_device_offline:${alias}` };
    return { ok: true, device: { ...device, capabilities: capabilities.capabilities || {} } };
  });
  const failed = checks.find((check) => !check?.ok);
  if (failed) throw new Error(failed.error || "live_binding_verification_failed");
  return checks.map((check) => check.device);
}

async function boundedMap(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runWorker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch {
        results[index] = { ok: false, error: "live_binding_verification_failed" };
      }
    }
  };
  const workerCount = Math.min(Math.max(1, Math.floor(limit)), items.length);
  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

export async function createBindingFromNames({ adapter, profile, region, houseId, topology = "live-proxy-4", names, bindingPath = defaultBindingPath() } = {}) {
  const context = normalizeContext({ profile, region, houseId });
  const aliases = aliasesFor(topology);
  if (!names || typeof names !== "object" || aliases.some((alias) => typeof names[alias] !== "string" || !names[alias].trim())) throw new Error("live_binding_aliases_required");
  const discovered = await discoverLiveInstallation(adapter, context);
  const byName = new Map();
  for (const device of discovered.devices) {
    if (!device.name) continue;
    const candidates = byName.get(device.name) || [];
    candidates.push(device);
    byName.set(device.name, candidates);
  }
  const used = new Set();
  const bindings = {};
  for (const alias of aliases) {
    const candidates = byName.get(names[alias].trim()) || [];
    if (candidates.length !== 1) throw new Error(candidates.length ? `live_binding_device_name_ambiguous:${alias}` : `live_binding_device_not_found:${alias}`);
    const device = candidates[0];
    if (used.has(device.id)) throw new Error(`live_binding_device_not_found:${alias}`);
    if (!device.gatewayDeviceId || device.gatewayDeviceId !== discovered.gatewayId) throw new Error(`live_binding_gateway_mismatch:${alias}`);
    used.add(device.id);
    const capabilities = await readWithRetry(() => adapter.invokeRead({ intent: "entity.capabilities", targets: [{ id: device.id }], parameters: {} }));
    if (!capabilities?.ok || !capabilities.capabilities?.rgb || !capabilities.capabilities?.brightness) throw new Error(`live_binding_capability_invalid:${alias}`);
    const state = await readOneState(adapter, device.id);
    if (!state?.online) throw new Error(`live_binding_device_offline:${alias}`);
    bindings[alias] = { deviceId: device.id };
  }
  const record = normalizeBinding({ version: VERSION, profile: context.profile, region: context.region, houseId: context.houseId, topology, bindings });
  await writeBindingFile(bindingPath, record);
  return { ...record, bindingPath: path.resolve(bindingPath) };
}

async function readOneState(adapter, id) {
  const result = await readWithRetry(() => adapter.invokeRead({ intent: "state.query", targets: [{ id }], parameters: { allProperties: true } }));
  return result?.ok ? result.states?.find((state) => state.id === id) || result.states?.[0] : null;
}

async function readWithRetry(read, attempts = 2) {
  let result = { ok: false };
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { result = await read(); } catch { result = { ok: false }; }
    if (result?.ok) return result;
    if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return result;
}

function buildLiveTopology(record, discovered, writeValidated) {
  const byId = new Map(discovered.devices.map((device) => [device.id, device]));
  const aliases = aliasesFor(record.topology);
  const bindings = aliases.map((alias) => ({ alias, ...record.bindings[alias] }));
  const targets = [];
  for (const binding of bindings) {
    const device = byId.get(binding.deviceId);
    if (!device) throw new Error(`live_binding_device_missing:${binding.alias}`);
    targets.push({
      alias: binding.alias,
      slot: record.topology === "live-proxy-4" ? QUADRANT_MAP[binding.alias].physicalSlot : binding.alias,
      id: binding.deviceId,
      online: true,
      capabilities: {
        rgb: Boolean(device.capabilities?.rgb),
        brightness: Boolean(device.capabilities?.brightness),
        flowNames: Array.isArray(device.capabilities?.flowNames) ? [...device.capabilities.flowNames] : [],
        flow: Array.isArray(device.capabilities?.flowNames) && device.capabilities.flowNames.length > 0,
      },
      coverage: record.topology === "live-proxy-4" ? [...QUADRANT_MAP[binding.alias].coverage] : [binding.alias],
    });
  }
  const topology = {
    mode: record.topology,
    reduced: record.topology === "live-proxy-4",
    physicalCount: targets.length,
    logicalCount: LOGICAL_SLOTS.length,
    gateway: discovered.gateway,
    targets,
    evidenceLabel: writeValidated ? (record.topology === "live-proxy-4" ? "EU 4-light quadrant-proxy write validated" : "16-light IFA live validation completed") : "EU 4-light read-only validated",
    scenario: "online",
    provenance: "live",
    bindingRevision: bindingRevision(record),
  };
  if (record.topology === "live-16") topology.evidenceLabel = writeValidated ? "16-light IFA live validation completed" : "16-light IFA live validation pending";
  return topology;
}

function aliasesFor(topology) {
  if (topology === "live-proxy-4") return QUADRANT_ALIASES;
  if (topology === "live-16") return LOGICAL_SLOTS;
  throw new Error("live_binding_topology_invalid");
}

function normalizeContext({ profile, region, houseId }) {
  const normalized = { profile: String(profile || "").trim(), region: String(region || "").trim().toLowerCase(), houseId: String(houseId || "").trim() };
  if (normalized.profile !== LIVE_PROFILE || normalized.region !== LIVE_REGION || !HOUSE_ID.test(normalized.houseId)) throw new Error("live_context_fixed_to_ifa_eu");
  return normalized;
}

function normalizeBinding(value) {
  if (!value || typeof value !== "object" || value.version !== VERSION || !PROFILE.test(String(value.profile || "")) || !REGIONS.has(value.region) || !HOUSE_ID.test(String(value.houseId || ""))) throw new Error("live_binding_invalid");
  const topology = String(value.topology || "");
  const aliases = aliasesFor(topology);
  if (!value.bindings || typeof value.bindings !== "object" || Object.keys(value.bindings).sort().join(",") !== [...aliases].sort().join(",")) throw new Error("live_binding_aliases_invalid");
  const seen = new Set();
  const bindings = {};
  for (const alias of aliases) {
    const item = value.bindings[alias];
    if (!item || typeof item !== "object" || !DEVICE_ID.test(String(item.deviceId || "")) || seen.has(item.deviceId)) throw new Error("live_binding_devices_invalid");
    seen.add(item.deviceId);
    bindings[alias] = { deviceId: item.deviceId };
  }
  return { version: VERSION, profile: String(value.profile), region: value.region, houseId: String(value.houseId), topology, bindings };
}

async function readBindingFile(bindingPath) {
  assertBindingPath(bindingPath, false);
  try {
    const value = JSON.parse(await fs.promises.readFile(bindingPath, "utf8"));
    return normalizeBinding(value);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("live_binding_required");
    if (error.message?.startsWith("live_binding_")) throw error;
    throw new Error("live_binding_invalid");
  }
}

async function writeBindingFile(bindingPath, record) {
  const target = path.resolve(bindingPath);
  assertBindingPath(target, false, true);
  const directory = path.dirname(target);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  assertBindingPath(target, false, true);
  const lockPath = path.join(directory, `.${path.basename(target)}.lock`);
  const temporary = path.join(directory, `.${path.basename(target)}.${crypto.randomUUID()}.tmp`);
  const lock = await fs.promises.open(lockPath, "wx", 0o600);
  try {
    const handle = await fs.promises.open(temporary, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(record)); await handle.sync(); } finally { await handle.close(); }
    await fs.promises.rename(temporary, target);
    await fs.promises.chmod(target, 0o600);
    assertBindingPath(target, true);
    try { const parent = await fs.promises.open(directory, "r"); try { await parent.sync(); } finally { await parent.close(); } } catch { /* Directory fsync is unavailable on some platforms. */ }
  } finally {
    await lock.close();
    await fs.promises.unlink(lockPath).catch(() => undefined);
    await fs.promises.unlink(temporary).catch(() => undefined);
  }
}

function assertBindingPath(target, requireFile = false, createParent = false) {
  if (process.platform === "win32") throw new Error("live_binding_acl_unavailable");
  const absolute = path.resolve(target);
  const homePackage = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
  if (absolute === homePackage || absolute.startsWith(`${homePackage}${path.sep}`)) throw new Error("live_binding_path_in_skill_forbidden");
  const directory = path.dirname(absolute);
  if (createParent) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  assertNoSymlinkAncestors(directory);
  if (fs.existsSync(directory)) {
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("live_binding_path_unsafe");
    assertPrivateAncestor(stat);
  }
  if (!fs.existsSync(absolute)) { if (requireFile) throw new Error("live_binding_file_missing"); return; }
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("live_binding_path_unsafe");
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) throw new Error("live_binding_owner_invalid");
  if ((stat.mode & 0o077) !== 0) throw new Error("live_binding_permissions_invalid");
}

function assertNoSymlinkAncestors(target) {
  const parsed = path.parse(target);
  let current = parsed.root;
  for (const part of target.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) return;
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      const resolved = fs.realpathSync(current);
      if (!isTrustedSystemAlias(current, resolved)) throw new Error("live_binding_symlink_forbidden");
      continue;
    }
    if (!stat.isDirectory()) throw new Error("live_binding_path_unsafe");
    assertPrivateAncestor(stat);
  }
}

function assertPrivateAncestor(stat) {
  if (typeof process.getuid !== "function") return;
  if (stat.uid !== process.getuid() && stat.uid !== 0) throw new Error("live_binding_owner_invalid");
  if ((stat.mode & 0o022) !== 0) throw new Error("live_binding_ancestor_writable");
}

function isTrustedSystemAlias(logical, resolved) {
  if (process.platform !== "darwin") return false;
  return (logical === "/tmp" && resolved === "/private/tmp") || (logical === "/var" && resolved === "/private/var") || (logical === "/private/tmp" && resolved === "/private/tmp") || (logical === "/private/var" && resolved === "/private/var");
}

function bindingRevision(record) {
  return crypto.createHash("sha256").update(JSON.stringify(record)).digest("hex");
}

export const __testing = { normalizeBinding, buildLiveTopology, bindingRevision, assertBindingPath, verifyBoundDevices };
