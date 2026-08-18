import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { CinemaError, isPlainObject } from "./contracts.mjs";
import { classifyDesignReceipt, classifyPropertyReceipt, isVerifiedDesignPowerWrite, isVerifiedPowerWrite } from "./runtime-receipts.mjs";
import { normalizeCapabilities, normalizeDetail, normalizeDiscovery, normalizeLiveDevice, normalizePreState, normalizeState, isQualifiedLiveDevice } from "./runtime-normalizers.mjs";
import { CONTEXT_VALUE, CONTROL_MODES, VALID_REGIONS, endpointHost, normalizeGatewayIp, normalizeLanEndpoint } from "./runtime-context.mjs";

export { classifyDesignReceipt, classifyPropertyReceipt, isVerifiedDesignPowerWrite, isVerifiedPowerWrite } from "./runtime-receipts.mjs";

const SAFE_INTENTS = new Set(["entity.list", "entity.capabilities", "device.detail.get", "state.query", "state.batch.query", "lighting.design.apply", "lighting.flow.execute", "light.power.set", "light.brightness.set", "light.color.set", "light.color_temperature.set"]);
const PROPERTY_INTENTS = new Map([
  ["brightness", "light.brightness.set"],
  ["color", "light.color.set"],
  ["colorTemperature", "light.color_temperature.set"],
]);
const MAX_RUNTIME_OUTPUT_BYTES = 2 * 1024 * 1024;
const BATCH_ONLINE_FALLBACK_CONCURRENCY = 16;
const STATE_BATCH_QUERY_TIMEOUT_MS = 120 * 1000;
const ONLINE_UNREADABLE = "online:unreadable";
const RUNTIME_ENV_KEYS = new Set(["PATH", "HOME", "USER", "TMPDIR", "TMP", "TEMP", "APPDATA", "LOCALAPPDATA", "USERPROFILE", "SYSTEMROOT", "YEELIGHT_HOME_PROFILE", "YEELIGHT_HOME_CONFIG_DIR", "YEELIGHT_HOME_DATA_DIR", "YEELIGHT_HOME_HOUSE_ID", "YEELIGHT_CLOUD_REGION", "YEELIGHT_HOME_CONTROL_MODE", "YEELIGHT_HOME_GATEWAY_IP", "YEELIGHT_HOME_LAN_ENDPOINT"]);
const BATCH_PROPERTY_SPECS = Object.freeze([
  Object.freeze({ property: "online", wire: "online" }),
  Object.freeze({ property: "power", wire: "p" }),
  Object.freeze({ property: "brightness", wire: "l" }),
  Object.freeze({ property: "colorTemperature", wire: "ct", capability: "temperature" }),
  Object.freeze({ property: "color", wire: "c", capability: "color" }),
]);

export class YeelightHomeRuntimeAdapter {
  constructor(options = {}) {
    this.binary = options.binary || process.env.YEELIGHT_HOME_BIN || "yeelight-home";
    this.timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : 20_000;
    this.invocations = [];
    this.live = options.live === true;
    this.context = normalizeRuntimeContext(options.context, { required: this.live });
  }

  async invoke(intent, request = {}, options = {}) {
    if (!this.live) throw new CinemaError("runtime_disabled", "Live Runtime mode is disabled.", 503);
    if (!SAFE_INTENTS.has(intent)) throw new CinemaError("runtime_intent_blocked", "That Runtime capability is not enabled.", 400);
    const requestId = randomUUID();
    const payload = JSON.stringify({
      contractVersion: "1.0",
      requestId,
      locale: "zh-CN",
      utterance: `Cinema Director ${intent}`,
      intent,
      ...(request.targets ? { targets: request.targets } : {}),
      parameters: request.parameters || {}
    });
    this.invocations.push({ requestId, intent });
    const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : this.timeoutMs;
    return invokeWithRetry(this.binary, payload, timeoutMs, options.signal, this.context, options.retrySafeError);
  }

  async discover(signal) {
    const result = await this.invoke("entity.list", { parameters: { entityTypes: ["device"], include: ["room", "capabilities"] } }, { signal });
    const devices = normalizeDiscovery(result);
    if (!this.live) return devices;
    const settled = await Promise.allSettled(devices.map(async (device) => {
      const [detail, capabilities, states] = await Promise.all([
        this.detail(device.runtimeId, signal),
        this.capabilities(device.runtimeId, signal),
        this.queryState([device], signal),
      ]);
      const state = states.find((row) => row.runtimeId === device.runtimeId);
      return normalizeLiveDevice(device, detail, capabilities, state);
    }));
    if (settled.some((entry) => entry.status === "rejected")) {
      throw new CinemaError("runtime_discovery_incomplete", "The live Runtime could not verify every discovered device.", 503);
    }
    return settled
      .filter((entry) => entry.status === "fulfilled")
      .map((entry) => entry.value)
      .filter(isQualifiedLiveDevice);
  }

  async detail(runtimeId, signal) {
    const result = await this.invoke("device.detail.get", {
      targets: [{ entityType: "device", id: runtimeId }],
      parameters: {}
    }, { signal });
    return normalizeDetail(result);
  }

  async capabilities(runtimeId, signal) {
    const result = await this.invoke("entity.capabilities", {
      targets: [{ entityType: "device", id: runtimeId }],
      parameters: {}
    }, { signal });
    return normalizeCapabilities(result);
  }

  async applyDesign(rows, signal, options = {}) {
    const actions = rows.map((row) => ({ targetType: "device", targetId: row.runtimeId, set: row.set }));
    return this.invoke("lighting.design.apply", { targets: rows.map((row) => ({ entityType: "device", id: row.runtimeId })), parameters: { actions } }, { signal, retrySafeError: options.retrySafeError });
  }

  async applyProperties(target, set, signal, options = {}) {
    const rows = [];
    for (const [property, value] of Object.entries(set || {})) {
      const intent = PROPERTY_INTENTS.get(property);
      if (!intent) throw new CinemaError("runtime_property_blocked", "The Runtime property is not enabled for validation.", 400);
      let result;
      try {
        result = await this.invoke(intent, {
          targets: [{ entityType: "device", id: target.runtimeId }],
          parameters: { [property]: value },
        }, { signal, retrySafeError: options.retrySafeError });
      } catch (error) {
        if (isBoundRuntimeWriteRejection(error)) {
          throw new CinemaError("runtime_write_verification_mismatch", "The Runtime could not verify the property change.", 502, {
            intent,
            runtimeId: String(target.runtimeId),
            property,
            expectedValue: value,
            classification: "bound_verification_mismatch",
          });
        }
        throw error;
      }
      const classification = classifyPropertyReceipt(result, target.runtimeId, property, value);
      if (classification !== "verified") {
        throw new CinemaError("runtime_write_verification_mismatch", "The Runtime could not verify the property change.", 502, {
          intent,
          runtimeId: String(target.runtimeId),
          property,
          expectedValue: value,
          classification,
        });
      }
      rows.push({ handle: target.handle, status: "acknowledged", property });
    }
    return { status: "acknowledged", rows };
  }

  async applyPower(target, power, signal, options = {}) {
    // EU Runtime exposes a stable R1 power endpoint; keep validation power
    // writes on that exact single-property contract instead of design apply.
    return this.setPower(target, power, signal, options);
  }

  async setPower(target, power, signal, options = {}) {
    const value = power === true;
    const result = await this.invoke("light.power.set", {
      targets: [{ entityType: "device", id: target.runtimeId }],
      parameters: { power: value },
    }, { signal, retrySafeError: options.retrySafeError });
    if (!isVerifiedPowerWrite(result, target.runtimeId, value)) throw new CinemaError("runtime_write_verification_mismatch", "The Runtime could not verify the power change.", 502);
    return { status: "acknowledged" };
  }

  async executeFlow(row, signal, options = {}) {
    return this.invoke("lighting.flow.execute", {
      targets: [{ entityType: "device", id: row.runtimeId }],
      parameters: { nodeType: "device", nodeId: row.runtimeId, flow: { mode: "cinema", set: row.set } }
    }, { signal, retrySafeError: options.retrySafeError });
  }

  async queryState(targets, signal, options = {}) {
    const result = await this.invoke("state.query", {
      targets: targets.map((target) => ({ entityType: "device", id: target.runtimeId })),
      parameters: options.property ? { property: options.property } : {}
    }, { signal, retrySafeError: options.retrySafeError });
    return normalizeState(result);
  }

  async queryStateBatch(targets, signal, options = {}) {
    const normalizedTargets = normalizeBatchTargets(targets);
    if (!normalizedTargets.length) return [];
    const result = await this.invoke("state.batch.query", {
      parameters: {
        items: normalizedTargets.map((target) => ({
          nodeType: "device",
          nodeId: target.runtimeId,
          properties: requestedBatchProperties(target),
        })),
      },
    }, { signal, retrySafeError: options.retrySafeError, timeoutMs: Math.max(this.timeoutMs, STATE_BATCH_QUERY_TIMEOUT_MS) });
    const normalized = normalizeBatchStateResponse(result, normalizedTargets, { allowOnlineUnreadable: true, includeFallbackMetadata: true });
    if (normalized.unreadableRuntimeIds.size === 0) return normalized.states;
    const fallbackTargets = normalizedTargets.filter((target) => normalized.unreadableRuntimeIds.has(target.runtimeId));
    const fallbackStates = await mapWithConcurrency(fallbackTargets, BATCH_ONLINE_FALLBACK_CONCURRENCY, async (target) => {
      const rows = await this.queryState([target], signal, { retrySafeError: options.retrySafeError });
      return normalizeOnlineFallback(rows, target);
    });
    const fallbackByRuntimeId = new Map(fallbackStates.map((state) => [state.runtimeId, state]));
    return normalized.states.map((state) => {
      const fallback = fallbackByRuntimeId.get(state.runtimeId);
      return fallback ? { ...state, online: fallback.online } : state;
    });
  }
}

function normalizeBatchTargets(targets) {
  if (!Array.isArray(targets)) throw new CinemaError("runtime_batch_protocol", "The Runtime batch query targets are invalid.", 502);
  const rows = targets.map((target) => ({ ...target, runtimeId: String(target?.runtimeId || "") }));
  const ids = rows.map((target) => target.runtimeId);
  if (rows.some((target) => !target.runtimeId) || new Set(ids).size !== rows.length) throw new CinemaError("runtime_batch_protocol", "The Runtime batch query target set is invalid.", 502);
  return rows;
}

function requestedBatchProperties(target) {
  return BATCH_PROPERTY_SPECS
    .filter((spec) => !spec.capability || target.capabilities?.[spec.capability] === true)
    .map((spec) => spec.wire);
}

function normalizeBatchStateResponse(value, targets, options = {}) {
  const expectedByRuntimeId = new Map(targets.map((target) => [target.runtimeId, requestedBatchProperties(target).map((wire) => batchPropertySpec(wire).property)]));
  return normalizeBatchRows(value, expectedByRuntimeId, options);
}

function normalizeBatchRows(value, expectedByRuntimeId, options = {}) {
  if (value?.status !== "success" || !Number.isInteger(value?.result?.count) || value.result.count !== expectedByRuntimeId.size || !Array.isArray(value.result.results) || value.result.results.length !== expectedByRuntimeId.size) {
    throw new CinemaError("runtime_batch_protocol", "The Runtime returned an incomplete batch state response.", 502);
  }
  const expected = new Set(expectedByRuntimeId.keys());
  const seen = new Set();
  const unreadableRuntimeIds = new Set();
  const rows = value.result.results.map((row) => {
    if (!row || row.error !== undefined || row.nodeType !== "device") throw new CinemaError("runtime_batch_protocol", "The Runtime returned an invalid batch state row.", 502);
    const runtimeId = String(row.nodeId || "");
    const deviceId = String(row.deviceId || "");
    if (!runtimeId || runtimeId !== deviceId || !expected.has(runtimeId) || seen.has(runtimeId)) throw new CinemaError("runtime_batch_protocol", "The Runtime batch state row is outside the requested target set.", 502);
    const properties = row.properties;
    const expectedProperties = expectedByRuntimeId.get(runtimeId);
    if (!isPlainObject(properties)) throw new CinemaError("runtime_batch_protocol", "The Runtime batch state row is missing a requested property.", 502);
    const missingProperties = expectedProperties.filter((property) => !Object.hasOwn(properties, property));
    const skippedProperties = Array.isArray(row.skippedProperties) ? row.skippedProperties : [];
    const onlineUnreadable = missingProperties.length === 1
      && missingProperties[0] === "online"
      && skippedProperties.length === 1
      && skippedProperties[0] === ONLINE_UNREADABLE;
    if (missingProperties.length && (!options.allowOnlineUnreadable || !onlineUnreadable)) throw new CinemaError("runtime_batch_protocol", "The Runtime batch state row is missing a requested property.", 502);
    if (onlineUnreadable) unreadableRuntimeIds.add(runtimeId);
    seen.add(runtimeId);
    return {
      runtimeId,
      verified: true,
      simulated: false,
      ...Object.fromEntries(expectedProperties.map((property) => [property, properties[property]])),
    };
  });
  if (seen.size !== expected.size) throw new CinemaError("runtime_batch_protocol", "The Runtime batch state response is missing a requested target.", 502);
  return options.includeFallbackMetadata ? { states: rows, unreadableRuntimeIds } : rows;
}

function normalizeOnlineFallback(rows, target) {
  if (!Array.isArray(rows) || rows.length !== 1) throw new CinemaError("runtime_batch_protocol", "The Runtime single-target online fallback response is invalid.", 502);
  const [state] = rows;
  if (!state || state.runtimeId !== target.runtimeId || state.verified !== true || state.simulated === true || typeof state.online !== "boolean") {
    throw new CinemaError("runtime_batch_protocol", "The Runtime single-target online fallback response is unverified.", 502);
  }
  return state;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  let failure = null;
  const consume = async () => {
    while (!failure) {
      const index = next++;
      if (index >= items.length) return;
      try { results[index] = await worker(items[index], index); } catch (error) { failure ||= error; return; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume));
  if (failure) throw failure;
  return results;
}

function batchPropertySpec(wire) {
  const spec = BATCH_PROPERTY_SPECS.find((candidate) => candidate.wire === wire);
  if (!spec) throw new CinemaError("runtime_batch_protocol", "The Runtime batch state property is not enabled.", 502);
  return spec;
}

function normalizeBatchPropertyResponse(value, expectedRuntimeIds, spec) {
  return normalizeBatchRows(value, new Map(expectedRuntimeIds.map((runtimeId) => [String(runtimeId), [spec.property]])));
}

function isBoundRuntimeWriteRejection(error) {
  return error instanceof CinemaError
    && error.code === "runtime_rejected"
    && error.details?.runtimeError
    && isPlainObject(error.details.runtimeError)
    && error.details.runtimeError.code === "write_verification_mismatch";
}

async function invokeWithRetry(binary, payload, timeoutMs, signal, context, retrySafeError, runner = runInvoke) {
  try {
    return await runner(binary, payload, timeoutMs, signal, context);
  } catch (error) {
    if (error?.details?.safeToRetry === true && retrySafeError !== false) {
      return runner(binary, payload, timeoutMs, signal, context);
    }
    throw error;
  }
}

function runInvoke(binary, payload, timeoutMs, signal, context = {}, spawnProcess = spawn) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CinemaError("runtime_cancelled", "The Runtime request was cancelled.", 504));
      return;
    }
    const child = spawnProcess(binary, ["invoke", "--stdin"], { shell: false, stdio: ["pipe", "pipe", "pipe"], env: runtimeEnvironment(process.env, contextToEnvironment(context)) });
    let output = "";
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(value);
    };
    const abort = () => { child.kill(); finish(new CinemaError("runtime_cancelled", "The Runtime request was cancelled.", 504)); };
    const timer = setTimeout(() => { child.kill(); finish(new CinemaError("runtime_timeout", "The Runtime request timed out.", 504)); }, timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.setEncoding("utf8");
    discardStderr(child.stderr);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.length > MAX_RUNTIME_OUTPUT_BYTES) {
        child.kill();
        finish(new CinemaError("runtime_protocol", "The local Runtime response was too large.", 502));
      }
    });
    child.on("error", () => finish(new CinemaError("runtime_unavailable", "The local Yeelight Runtime is unavailable.", 503)));
    child.on("close", (code) => {
      if (code !== 0) return finish(new CinemaError("runtime_failed", "The local Yeelight Runtime rejected the request.", 502));
      try {
        const parsed = JSON.parse(output.trim().split(/\r?\n/).filter(Boolean).pop() || "{}");
        if (parsed && parsed.error) return finish(new CinemaError("runtime_rejected", "The Runtime could not complete that semantic request.", 502, {
          runtimeError: parsed.error,
          safeToRetry: parsed.result?.safeToRetry === true,
          traceId: parsed.traceId,
        }));
        finish(null, parsed);
      } catch {
        finish(new CinemaError("runtime_protocol", "The local Runtime returned an invalid response.", 502));
      }
    });
    if (signal?.aborted) return abort();
    child.stdin.end(payload);
  });
}

export function runtimeEnvironment(source = process.env, overrides = {}) {
  const merged = { ...source, ...overrides };
  return Object.fromEntries([...RUNTIME_ENV_KEYS]
    .filter((key) => typeof merged[key] === "string" && merged[key] !== "")
    .map((key) => [key, merged[key]]));
}

export function normalizeRuntimeContext(context = {}, options = {}) {
  const source = context || {};
  const profile = String(source.profile || "").trim();
  const region = String(source.region || "").trim().toLowerCase();
  const houseId = String(source.houseId || "").trim();
  const gatewayIp = normalizeGatewayIp(source.gatewayIp);
  const lanEndpoint = normalizeLanEndpoint(source.lanEndpoint);
  const requestedControlMode = String(source.controlMode || "").trim().toLowerCase();
  const controlMode = requestedControlMode || (gatewayIp || lanEndpoint ? "local-preferred" : "");
  if (options.required && (!profile || !region || !houseId)) throw new CinemaError("live_context_required", "Live mode requires an explicit profile, region, and house.", 400);
  if (!profile && !region && !houseId && !controlMode && !gatewayIp && !lanEndpoint) return {};
  if (!CONTEXT_VALUE.test(profile) || !CONTEXT_VALUE.test(houseId) || !VALID_REGIONS.has(region) || controlMode && !CONTROL_MODES.has(controlMode)) throw new CinemaError("invalid_live_context", "The live Runtime context is invalid.", 400);
  if (controlMode === "cloud" && (gatewayIp || lanEndpoint)) throw new CinemaError("invalid_live_context", "A LAN endpoint requires local-preferred or local-only control.", 400);
  if (controlMode && controlMode !== "cloud" && !gatewayIp && !lanEndpoint) throw new CinemaError("live_lan_context_required", "Local Runtime control requires a gateway IP or LAN endpoint.", 400);
  if (gatewayIp && lanEndpoint && endpointHost(lanEndpoint) !== gatewayIp) throw new CinemaError("invalid_live_context", "The gateway IP and LAN endpoint must name the same local gateway.", 400);
  const normalized = { profile, region, houseId };
  if (controlMode) normalized.controlMode = controlMode;
  if (gatewayIp) normalized.gatewayIp = gatewayIp;
  if (lanEndpoint) normalized.lanEndpoint = lanEndpoint;
  return normalized;
}

function contextToEnvironment(context) {
  const normalized = normalizeRuntimeContext(context);
  if (!normalized.profile) return {};
  return {
    YEELIGHT_HOME_PROFILE: normalized.profile,
    YEELIGHT_CLOUD_REGION: normalized.region,
    YEELIGHT_HOME_HOUSE_ID: normalized.houseId,
    ...(normalized.controlMode ? { YEELIGHT_HOME_CONTROL_MODE: normalized.controlMode } : {}),
    ...(normalized.gatewayIp ? { YEELIGHT_HOME_GATEWAY_IP: normalized.gatewayIp } : {}),
    ...(normalized.lanEndpoint ? { YEELIGHT_HOME_LAN_ENDPOINT: normalized.lanEndpoint } : {}),
  };
}

export function discardStderr(stream) {
  stream?.on("data", () => {});
  stream?.resume();
}

export const __testing = { runInvoke, invokeWithRetry, runtimeEnvironment, discardStderr, normalizeRuntimeContext, contextToEnvironment, normalizeGatewayIp, normalizeLanEndpoint, normalizeDiscovery, normalizeDetail, normalizeCapabilities, normalizeLiveDevice, normalizePreState, isQualifiedLiveDevice, normalizeState, normalizeBatchTargets, normalizeBatchPropertyResponse, normalizeOnlineFallback, isVerifiedPowerWrite, isVerifiedDesignPowerWrite, classifyDesignReceipt, classifyPropertyReceipt, MAX_RUNTIME_OUTPUT_BYTES, BATCH_ONLINE_FALLBACK_CONCURRENCY, STATE_BATCH_QUERY_TIMEOUT_MS };
