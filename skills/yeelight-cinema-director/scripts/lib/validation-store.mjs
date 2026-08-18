import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isHandle, randomOpaque } from "./contracts.mjs";
import { normalizeRuntimeContext } from "./runtime-adapter.mjs";

export const DEFAULT_RECOVERY_PATH = path.join(os.homedir(), ".yeelight", "yeelight-cinema-director", "recovery.json");

export async function loadRecoveryRecords(filePath, context = {}, options = {}) {
  const storeOptions = normalizeStoreOptions(options);
  if (!filePath) return [];
  let stat;
  try { stat = await fs.lstat(filePath); } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("recovery_store_invalid");
  const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
  if (!validStoredRecords(parsed, storeOptions)) throw new Error("recovery_store_invalid");
  await fs.chmod(filePath, 0o600);
  return parsed.records.filter((record) => sameContext(record.context, context) && validRecord(record, storeOptions));
}

export async function saveRecoveryRecords(filePath, records, context = {}, options = {}) {
  const storeOptions = normalizeStoreOptions(options);
  if (!filePath || !path.isAbsolute(filePath)) throw new Error("recovery_store_invalid");
  const values = [...records.values()];
  if (values.some((record) => !validRecord({ ...record, context }, storeOptions))) throw new Error("recovery_store_invalid");
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryStat = await fs.lstat(directory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) throw new Error("recovery_store_invalid");
  await fs.chmod(directory, 0o700);
  const existing = await readStoredRecords(filePath, storeOptions);
  const merged = new Map(existing.map((record) => [record.id, record]));
  for (const record of existing) if (sameContext(record.context, context) && !values.some((value) => value.id === record.id)) merged.delete(record.id);
  for (const record of values) merged.set(record.id, { ...record, context });
  if (merged.size > storeOptions.maxRecords) throw new Error("recovery_store_invalid");
  const payload = JSON.stringify({ version: 1, records: [...merged.values()] });
  const temporary = `${filePath}.tmp-${process.pid}-${randomOpaque("w")}`;
  try {
    const handle = await fs.open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(payload, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.chmod(temporary, 0o600);
    await fs.rename(temporary, filePath);
    await syncDirectory(directory);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function readStoredRecords(filePath, options) {
  try {
    const stat = await fs.lstat(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("recovery_store_invalid");
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (!validStoredRecords(parsed, options)) throw new Error("recovery_store_invalid");
    return parsed.records;
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    if (error?.message === "recovery_store_invalid") throw error;
    throw new Error("recovery_store_invalid");
  }
}

async function syncDirectory(directory) {
  const handle = await fs.open(directory, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

function sameContext(left = {}, right = {}) {
  try {
    const leftContext = normalizeRuntimeContext(left, { required: true });
    const rightContext = normalizeRuntimeContext(right, { required: true });
    return ["profile", "region", "houseId", "controlMode", "gatewayIp", "lanEndpoint"]
      .every((key) => (leftContext[key] || "") === (rightContext[key] || ""));
  } catch {
    return false;
  }
}

function normalizeStoreOptions(options = {}) {
  return {
    kind: typeof options.kind === "string" ? options.kind : "validation",
    maxTargets: Number.isInteger(options.maxTargets) ? options.maxTargets : 4,
    maxRecords: Number.isInteger(options.maxRecords) ? options.maxRecords : 8,
  };
}

function validStoredRecords(parsed, options = normalizeStoreOptions()) {
  if (parsed?.version !== 1 || !Array.isArray(parsed.records) || !parsed.records.every((record) => validRecord(record, options))) return false;
  return parsed.records.length <= options.maxRecords && new Set(parsed.records.map((record) => record.id)).size === parsed.records.length;
}

function validRecord(record, options = normalizeStoreOptions()) {
  if (!isHandle(record?.id) || !Number.isFinite(record.createdAt) || !Number.isFinite(record.updatedAt) || !Number.isFinite(record.expiresAt)) return false;
  if (!validContext(record.context) || !["in_progress", "recovery", "manual_recovery_required"].includes(record.phase)) return false;
  if (options.kind !== "validation" && record.kind !== options.kind) return false;
  if (!Array.isArray(record.targets) || record.targets.length < 1 || record.targets.length > options.maxTargets) return false;
  if (!Array.isArray(record.touchedHandles) || !Array.isArray(record.pendingHandles)) return false;
  const targetHandles = new Set(record.targets.map((target) => target?.handle));
  const runtimeIds = new Set(record.targets.map((target) => target?.runtimeId));
  if (targetHandles.size !== record.targets.length || runtimeIds.size !== record.targets.length) return false;
  if (record.touchedHandles.some((handle) => !targetHandles.has(handle)) || new Set(record.touchedHandles).size !== record.touchedHandles.length) return false;
  if (record.pendingHandles.some((handle) => !record.touchedHandles.includes(handle)) || new Set(record.pendingHandles).size !== record.pendingHandles.length) return false;
  return record.targets.every((target) => validTarget(target, options));
}

function validContext(context) {
  try {
    const normalized = normalizeRuntimeContext(context, { required: true });
    const keys = Object.keys(context || {}).sort();
    const normalizedKeys = Object.keys(normalized).sort();
    return keys.length === normalizedKeys.length
      && keys.every((key, index) => key === normalizedKeys[index] && context[key] === normalized[key]);
  } catch {
    return false;
  }
}

function validTarget(target, options = normalizeStoreOptions()) {
  const capabilities = target?.capabilities;
  const preState = target?.preState;
  if (!isHandle(target?.handle) || typeof target?.runtimeId !== "string" || target.runtimeId.length < 1 || target.runtimeId.length > 160) return false;
  if (target.isLight !== true || target.preStateVerified !== true || target.preStateComplete !== true || target.online !== true) return false;
  if (!capabilities || capabilities.power !== true || capabilities.brightness !== true || typeof capabilities.color !== "boolean" || typeof capabilities.temperature !== "boolean") return false;
  if (!isValidTargetState(preState, target)) return false;
  if (options.kind === "screening") {
    if (!Array.isArray(target.knownStates) || target.knownStates.length < 1 || target.knownStates.length > 8) return false;
    const keys = target.knownStates.map(stateKey);
    if (new Set(keys).size !== keys.length || target.knownStates.some((state) => !isValidTargetState(state, target))) return false;
    if (!keys.includes(stateKey(preState))) return false;
  } else if (target.knownStates !== undefined) {
    return false;
  }
  return true;
}

export function isValidTargetState(state, target) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return false;
  const capabilities = target?.capabilities || {};
  const allowed = new Set(["power", "brightness"]);
  if (capabilities.color === true) allowed.add("color");
  if (capabilities.temperature === true) allowed.add("colorTemperature");
  const keys = Object.keys(state);
  if (keys.length !== allowed.size || keys.some((key) => !allowed.has(key))) return false;
  return typeof state.power === "boolean"
    && integerInRange(state.brightness, 1, 100)
    && (capabilities.color !== true || integerInRange(state.color, 0, 0xFFFFFF))
    && (capabilities.temperature !== true || integerInRange(state.colorTemperature, 1700, 6500));
}

function stateKey(state) {
  return JSON.stringify(Object.fromEntries(Object.keys(state || {}).sort().map((key) => [key, state[key]])));
}

function integerInRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

export const __testing = { validRecord, validTarget, validContext, normalizeStoreOptions, isValidTargetState, stateKey };
