import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { LOGICAL_SLOTS, MAX_PHASE_DURATION_MS, MIN_PHASE_DURATION_MS } from "./contracts.mjs";
import { PersistentRuntimeChannel } from "./persistent-runtime.mjs";

const ALLOWED_INTENTS = new Set(["lighting.design.apply", "lighting.flow.execute", "state.query"]);
const READ_INTENTS = new Set(["entity.list", "entity.capabilities", "gateway.list", "state.query"]);
const REGIONS = new Set(["cn", "sg", "us", "eu", "dev"]);
const MAX_OUTPUT = 64 * 1024;
const EVENTUAL_WRITE_CONFIRM_DELAY_MS = 3500;
const FLOW_SETTLE_BUFFER_MS = 750;
const MAX_TARGETS = LOGICAL_SLOTS.length;
const MAX_CAPABILITY_NAMES = 64;
const MAX_CAPABILITY_TEXT = 4096;
const SAFE_FLOW_NAME = /^[A-Za-z0-9._:-]{1,64}$/;
const DEFAULT_MAX_PARALLEL_TARGETS = MAX_TARGETS;
const TERMINATION_GRACE_MS = 1000;
const RUNTIME_WRITE_VERIFICATION_MISMATCH = "runtime_write_verification_mismatch";
const OBSERVATION_PROPERTIES = Object.freeze(["brightness", "color"]);
const MAX_OBSERVATION_TARGETS = 2;

export { DEFAULT_MAX_PARALLEL_TARGETS, MAX_TARGETS, FLOW_SETTLE_BUFFER_MS, normalizeParallelTargets };

export class YeelightHomeCommandAdapter {
  #runtimeGate;

  constructor({ runtimeBin = process.env.YEELIGHT_HOME_BIN || "yeelight-home", run = runCommand, sleep = delay, profile = "", region = "", houseId = "", strictRuntime = false, homeDir = "", timeoutMs = 30000, maxParallelTargets = process.env.YEELIGHT_INTERACTIVE_MAX_PARALLEL_TARGETS, persistent = run === runCommand, runtimeChannel = null } = {}) {
    this.runtimeBin = strictRuntime ? assertTrustedRuntimeBinary(runtimeBin) : runtimeBin;
    this.run = run;
    this.sleep = sleep;
    this.context = normalizeRuntimeContext({ profile, region, houseId });
    this.strictRuntime = Boolean(strictRuntime);
    this.homeDir = homeDir || path.join(os.homedir(), ".yeelight-home");
    this.timeoutMs = Number.isFinite(Number(timeoutMs)) ? Math.max(1000, Math.min(30000, Math.round(Number(timeoutMs)))) : 30000;
    this.maxParallelTargets = normalizeParallelTargets(maxParallelTargets, DEFAULT_MAX_PARALLEL_TARGETS);
    this.#runtimeGate = new RuntimeConcurrencyGate(this.maxParallelTargets);
    this.persistent = Boolean(persistent);
    this.nativeBatch = Boolean(persistent);
    this.runtimeChannel = runtimeChannel;
  }

  async invoke(request, { signal, confirmEventual = true } = {}) {
    const safe = validateRequest(request);
    if (!safe.ok) return { ok: false, reason: safe.reason };
    const result = await this.#run(safe.request, signal);
    if (!result.ok) return { ok: false, reason: safeRuntimeFailure(result.reason) };
    const projected = projectRuntimeResponse(result.value, safe.request);
    if (projected.reason === RUNTIME_WRITE_VERIFICATION_MISMATCH && confirmEventual !== true) {
      return { ok: true, status: "dispatched_unverified", verification: "write_verification_mismatch" };
    }
    if (projected.ok || confirmEventual !== true || safe.request.intent !== "lighting.design.apply" || !["runtime_partial", RUNTIME_WRITE_VERIFICATION_MISMATCH].includes(projected.reason)) return projected;
    return this.#confirmEventualWrite(safe.request, projected, signal);
  }

  async invokeBatch(request, { signal, confirmEventual = true } = {}) {
    const safe = validateRequest(request);
    if (!safe.ok) return { ok: false, reason: safe.reason };
    if (safe.request.intent !== "lighting.design.apply" || !Array.isArray(safe.request.parameters.actions)) return { ok: false, reason: "batch_not_supported" };
    if (signal?.aborted) return { ok: false, reason: "runtime_cancelled" };

    // New Runtime versions accept the complete action list in one request.
    // Keep the older bounded target fallback for one-shot/legacy binaries.
    if (this.nativeBatch) {
      const dispatched = await this.invoke(safe.request, { signal, confirmEventual: false });
      if (!dispatched.ok) return dispatched;
      if (dispatched.status === "dispatched_unverified" && confirmEventual === true) {
        const confirmed = await this.#confirmBatchWrite(safe.request, signal);
        return confirmed
          ? { ok: true, status: "success", verification: "batched_delayed_readback", targetCount: safe.request.targets.length }
          : { ok: false, reason: "runtime_partial" };
      }
      return { ...dispatched, targetCount: safe.request.targets.length, verification: dispatched.verification || "runtime_batch_receipt" };
    }

    // The current Runtime accepts actions[] but fans them out sequentially.
    // Keep the single validated phase as the source of truth, then run one
    // target per bounded worker so the physical wall-clock time is reduced
    // without bypassing yeelight-home or changing phase ordering.
    const actionsById = new Map(safe.request.parameters.actions.map((action) => [action.targetId, action]));
    const requests = safe.request.targets.map((target, index) => ({
      ...safe.request,
      requestId: `${safe.request.requestId}-target-${index + 1}`,
      targets: [target],
      parameters: { actions: [actionsById.get(target.id)] },
    }));
    const results = await boundedMap(requests, this.maxParallelTargets, (targetRequest) => this.invoke(targetRequest, { signal, confirmEventual: false }));
    if (results.some((result) => result?.reason === "runtime_batch_incomplete")) return { ok: false, reason: "runtime_batch_incomplete" };
    const failed = results.find((result) => result && result.ok === false);
    if (failed) {
      if (failed.reason !== "runtime_partial") return { ok: false, reason: failed.reason || "runtime_error" };
      if (confirmEventual !== true) return { ok: false, reason: "runtime_partial" };
      const confirmed = await this.#confirmBatchWrite(safe.request, signal);
      if (confirmed) return { ok: true, status: "success", verification: "batched_delayed_readback", targetCount: requests.length };
      return { ok: false, reason: "runtime_partial" };
    }
    if (signal?.aborted) return { ok: false, reason: "runtime_cancelled" };
    const unverifiedCount = results.filter((result) => result?.status === "dispatched_unverified").length;
    if (unverifiedCount > 0) {
      if (confirmEventual !== true) return { ok: true, status: "dispatched_unverified", verification: "write_verification_mismatch", targetCount: requests.length, unverifiedCount };
      const confirmed = await this.#confirmBatchWrite(safe.request, signal);
      if (confirmed) return { ok: true, status: "success", verification: "batched_delayed_readback", targetCount: requests.length };
      return { ok: false, reason: "runtime_partial" };
    }
    return { ok: true, status: "success", verification: "bounded_target_batch", targetCount: requests.length };
  }

  // The visitor path can only fan out the already validated design actions.
  // Each direct Runtime intent verifies one property, so its closed receipt is
  // sufficient to distinguish an acknowledged eventual write from a hard error.
  async invokeVisitorBatch(request, { signal } = {}) {
    const visitorRequest = {
      ...request,
      parameters: { ...(request?.parameters || {}), verification: "acknowledged" },
    };
    const safe = validateRequest(visitorRequest);
    if (!safe.ok) return { ok: false, reason: safe.reason };
    if (safe.request.intent !== "lighting.design.apply" || !Array.isArray(safe.request.parameters.actions)) return { ok: false, reason: "batch_not_supported" };
    if (signal?.aborted) return { ok: false, reason: "runtime_cancelled" };
    if (this.nativeBatch) {
      const dispatched = await this.invoke(safe.request, { signal, confirmEventual: false });
      if (dispatched.ok) return { ...dispatched, status: "dispatched_unverified", verification: dispatched.verification || "runtime_batch_receipt", targetCount: safe.request.targets.length };
      return dispatched;
    }
    return this.#invokeVisitorPropertiesBatch(safe.request, signal);
  }

  async invokeFlowBatch(request, { signal } = {}) {
    const safe = validateRequest(request);
    if (!safe.ok) return { ok: false, reason: safe.reason };
    if (safe.request.intent !== "lighting.flow.execute" || !safe.request.parameters.flow && !Array.isArray(safe.request.parameters.flows)) return { ok: false, reason: "flow_batch_not_supported" };
    if (signal?.aborted) return { ok: false, reason: "runtime_cancelled" };

    const flowEntries = safe.request.parameters.flows || safe.request.targets.map((target) => ({ targetId: target.id, flow: safe.request.parameters.flow }));
    const flowById = new Map(flowEntries.map((entry) => [entry.targetId, entry.flow]));
    const flowWindowMs = Math.max(...flowEntries.map(({ flow }) => flowDurationMs(flow))) + FLOW_SETTLE_BUFFER_MS;
    const requests = safe.request.targets.map((target, index) => ({
      ...safe.request,
      requestId: `${safe.request.requestId}-flow-${index + 1}`,
      targets: [target],
      parameters: { flow: flowById.get(target.id) },
    }));

    // Once any request is handed to the Runtime, the gateway may already be
    // animating. All requests settle first, then an independent cleanup wait
    // prevents a cancelled visitor signal from racing the active Flow.
    const results = await Promise.all(requests.map((targetRequest) => this.invoke(targetRequest, { signal, confirmEventual: false })));
    await this.sleep(flowWindowMs);
    const failed = results.find((result) => result?.ok === false);
    if (failed) return { ok: false, reason: failed.reason || "runtime_error", flowDispatched: true, flowSettled: true, flowWindowMs };
    if (signal?.aborted) return { ok: false, reason: "runtime_cancelled", flowDispatched: true, flowSettled: true, flowWindowMs };
    return { ok: true, status: "success", verification: "flow_window_elapsed", flowDispatched: true, flowSettled: true, flowWindowMs, targetCount: requests.length };
  }

  async #invokeVisitorPropertiesBatch(request, signal) {
    const actionsById = new Map(request.parameters.actions.map((action) => [action.targetId, action]));
    const requests = request.targets.flatMap((target, targetIndex) => {
      const action = actionsById.get(target.id);
      return Object.entries(action.set).map(([property, expectedValue], propertyIndex) => buildVisitorPropertyRequest(request, target.id, property, expectedValue, targetIndex, propertyIndex));
    });
    const results = await boundedMap(requests, this.maxParallelTargets, async (runtimeRequest) => {
      const result = await this.#run(runtimeRequest, signal);
      if (!result.ok) return { ok: false, reason: safeRuntimeFailure(result.reason) };
      return projectVisitorPropertyReceipt(result.value, runtimeRequest);
    });
    const failed = results.find((result) => result && result.ok === false);
    if (failed) return { ok: false, reason: failed.reason || "runtime_error" };
    if (results.some((result) => result?.reason === "runtime_batch_incomplete")) return { ok: false, reason: "runtime_batch_incomplete" };
    if (signal?.aborted) return { ok: false, reason: "runtime_cancelled" };
    return { ok: true, status: "dispatched_unverified", verification: "visitor_property_receipts", targetCount: request.targets.length };
  }

  async invokeRead(request, { signal, requireExplicitTargetId = false } = {}) {
    const safe = validateReadRequest(request);
    if (!safe.ok) return { ok: false, reason: safe.reason };
    if (safe.request.intent === "state.query" && request?.parameters?.allProperties === true && safe.request.targets.length > 1) {
      if (this.nativeBatch) {
        const batchRequest = {
          ...safe.request,
          intent: "state.batch.query",
          parameters: {
            items: safe.request.targets.map((target) => ({ nodeType: "device", nodeId: target.id, properties: ["online", "p", "l", "ct", "c"] })),
          },
        };
        const batched = await this.#run(batchRequest, signal);
        if (batched.ok) {
          const projected = projectBatchReadResponse(batched.value, safe.request.targets);
          if (projected.ok) return projected;
        }
      }
      const requests = safe.request.targets.map((target, index) => ({
        ...safe.request,
        requestId: `${safe.request.requestId}-target-${index + 1}`,
        targets: [target],
      }));
      const results = await boundedMap(requests, this.maxParallelTargets, async (targetRequest) => {
        const one = await this.#run(targetRequest, signal);
        if (!one.ok) return { ok: false, reason: safeRuntimeFailure(one.reason) };
        const projected = projectRuntimeResponse(one.value, { ...targetRequest, requireExplicitTargetId: true });
        if (!projected.ok) return projected;
        return validateSingleTargetRead(projected.states, targetRequest.targets[0].id);
      });
      if (results.some((result) => result?.reason === "runtime_batch_incomplete")) return { ok: false, reason: "runtime_batch_incomplete" };
      const failed = results.find((result) => result && result.ok === false);
      if (failed) return { ok: false, reason: failed.reason || "runtime_read_invalid" };
      return { ok: true, status: "success", states: results.flatMap((result) => result.states) };
    }
    const result = await this.#run(safe.request, signal);
    if (!result.ok) return { ok: false, reason: safeRuntimeFailure(result.reason) };
    return projectReadResponse(result.value, { ...safe.request, requireExplicitTargetId });
  }

  // This is intentionally narrower than invokeRead(): only the server-selected
  // representatives may reach it, and Runtime reads are fixed to two public
  // state properties. Browser, provider, and plan input never choose either.
  async observeState({ requestId = "state-observation", targetIds, signal } = {}) {
    if (!Array.isArray(targetIds) || targetIds.length < 1 || targetIds.length > MAX_OBSERVATION_TARGETS || !targetIds.every((id) => typeof id === "string" && /^[A-Za-z0-9._-]{1,80}$/.test(id)) || new Set(targetIds).size !== targetIds.length) {
      return { ok: false, reason: "observation_targets_not_allowed" };
    }
    if (signal?.aborted) return { ok: false, reason: "runtime_cancelled" };
    const reads = targetIds.flatMap((id) => OBSERVATION_PROPERTIES.map((property) => ({ id, property })));
    const results = await boundedMap(reads, this.maxParallelTargets, async ({ id, property }) => {
      const read = await this.invokeRead({
        requestId: `${String(requestId).slice(0, 64)}-${id}-${property}`,
        intent: "state.query",
        targets: [{ id }],
        parameters: { property },
      }, { signal, requireExplicitTargetId: true });
      if (!read.ok) return read;
      const state = read.states?.[0];
      const value = state?.[property];
      return isValidObservationValue(property, value)
        ? { ok: true, id, property, value }
        : { ok: false, reason: "runtime_observation_invalid" };
    });
    const failed = results.find((result) => result?.ok === false);
    if (failed) return { ok: false, reason: failed.reason || "runtime_observation_invalid" };
    const states = targetIds.map((id) => {
      const values = Object.fromEntries(results.filter((result) => result.id === id).map((result) => [result.property, result.value]));
      return { id, brightness: values.brightness, color: values.color, online: true };
    });
    return { ok: true, status: "success", states };
  }

  async #run(request, signal) {
    let release;
    try {
      release = await this.#runtimeGate.acquire(signal);
    } catch {
      return { ok: false, reason: "runtime_cancelled" };
    }
    try {
      if (this.persistent) {
        try {
          const value = await this.#persistentChannel().request(JSON.stringify(request), this.timeoutMs, signal);
          return { ok: true, value };
        } catch (error) {
          if (error?.message === "runtime_keep_alive_unsupported" || error?.code === "runtime_keep_alive_unsupported") {
            this.persistent = false;
            this.nativeBatch = false;
            this.runtimeChannel?.close?.();
            this.runtimeChannel = null;
          } else {
            return { ok: false, reason: safeRuntimeFailure(error?.message) };
          }
        }
      }
      return await this.run(this.runtimeBin, this.#args(), JSON.stringify(request), { signal, env: this.#env(), timeoutMs: this.timeoutMs });
    } catch {
      return { ok: false, reason: "runtime_error" };
    } finally {
      release();
    }
  }

  #persistentChannel() {
    if (!this.runtimeChannel) this.runtimeChannel = new PersistentRuntimeChannel(this.runtimeBin, this.#args(), this.#env());
    return this.runtimeChannel;
  }

  close() {
    this.runtimeChannel?.close?.();
  }

  async #confirmEventualWrite(request, failure, signal) {
    const expected = expectedSingleTargetState(request);
    if (!expected) return failure;
    if (signal?.aborted) return { ok: false, reason: "runtime_cancelled" };
    try {
      await this.sleep(EVENTUAL_WRITE_CONFIRM_DELAY_MS, signal);
    } catch {
      return signal?.aborted ? { ok: false, reason: "runtime_cancelled" } : failure;
    }
    if (signal?.aborted) return { ok: false, reason: "runtime_cancelled" };
    const read = await this.invokeRead({
      requestId: `${request.requestId}-eventual-read`,
      intent: "state.query",
      targets: [{ id: expected.id }],
      parameters: { allProperties: true },
    }, { signal, requireExplicitTargetId: true });
    if (!read.ok) return read.reason === "runtime_cancelled" ? { ok: false, reason: "runtime_cancelled" } : failure;
    const state = read.states?.find((item) => item?.id === expected.id);
    if (!state || state.online === false || !matchesExpectedState(state, expected)) return failure;
    return { ok: true, status: "success", verification: "delayed_readback" };
  }

  async #confirmBatchWrite(request, signal) {
    if (signal?.aborted) return false;
    try {
      await this.sleep(EVENTUAL_WRITE_CONFIRM_DELAY_MS, signal);
    } catch {
      return false;
    }
    if (signal?.aborted) return false;
    const read = await this.invokeRead({
      requestId: `${request.requestId}-batch-eventual-read`,
      intent: "state.query",
      targets: request.targets,
      parameters: { allProperties: true },
    }, { signal, requireExplicitTargetId: true });
    if (!read.ok || read.states?.some((state) => state.online === false)) return false;
    const actionsById = new Map(request.parameters.actions.map((action) => [action.targetId, action]));
    return read.states.every((state) => {
      const action = actionsById.get(state.id);
      return Boolean(action) && matchesExpectedState(state, { id: state.id, ...action.set });
    });
  }

  #args() {
    const args = ["invoke", "--stdin"];
    if (this.context.profile) args.push("--profile", this.context.profile);
    if (this.context.region) args.push("--region", this.context.region);
    if (this.context.houseId) args.push("--house-id", this.context.houseId);
    return args;
  }

  #env() {
    if (!this.strictRuntime) return undefined;
    const allowed = new Set(["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TMPDIR"]);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key)));
    env.HOME = os.homedir();
    env.PATH = `${path.dirname(this.runtimeBin)}:/opt/homebrew/opt/node/bin:/usr/local/bin:/usr/bin:/bin`;
    env.YEELIGHT_HOME_DIR = path.resolve(this.homeDir);
    return env;
  }
}

function isValidObservationValue(property, value) {
  if (!Number.isInteger(value)) return false;
  if (property === "brightness") return value >= 1 && value <= 100;
  if (property === "color") return value >= 0 && value <= 0xffffff;
  return false;
}

export function validateRequest(request) {
  if (!request || typeof request !== "object" || !ALLOWED_INTENTS.has(request.intent)) return { ok: false, reason: "intent_not_allowed" };
  if (!Array.isArray(request.targets) || request.targets.length < 1 || request.targets.length > MAX_TARGETS) return { ok: false, reason: "targets_not_allowed" };
  if (!request.targets.every((target) => target && typeof target === "object" && typeof target.id === "string" && /^[A-Za-z0-9._-]{1,80}$/.test(target.id))) return { ok: false, reason: "targets_not_allowed" };
  const targetIds = request.targets.map(({ id }) => id);
  if (new Set(targetIds).size !== targetIds.length) return { ok: false, reason: "targets_not_allowed" };
  if (!request.parameters || typeof request.parameters !== "object" || Array.isArray(request.parameters)) return { ok: false, reason: "parameters_not_allowed" };
  const parameters = request.intent === "lighting.design.apply"
    ? normalizeLightingParameters(request.parameters, request.targets, new Set(targetIds))
    : request.intent === "lighting.flow.execute"
      ? normalizeFlowParameters(request.parameters, request.targets, new Set(targetIds))
      : normalizeStateParameters(request.parameters);
  if (!parameters) return { ok: false, reason: "parameters_not_allowed" };
  return { ok: true, request: { contractVersion: "1.0", requestId: String(request.requestId || `interactive-light-${randomUUID()}`).slice(0, 80), locale: "en-US", utterance: "interactive-light-experiences", intent: request.intent, targets: request.targets.map(({ id }) => ({ entityType: "device", id })), parameters } };
}

export function validateReadRequest(request) {
  if (!request || typeof request !== "object" || !READ_INTENTS.has(request.intent)) return { ok: false, reason: "intent_not_allowed" };
  const targets = Array.isArray(request.targets) ? request.targets : [];
  if (request.intent === "entity.list" || request.intent === "gateway.list") {
    if (targets.length) return { ok: false, reason: "targets_not_allowed" };
  } else if (targets.length < 1 || targets.length > MAX_TARGETS || !targets.every((target) => target && typeof target === "object" && typeof target.id === "string" && /^[A-Za-z0-9._-]{1,80}$/.test(target.id))) {
    return { ok: false, reason: "targets_not_allowed" };
  }
  if (targets.length && new Set(targets.map(({ id }) => id)).size !== targets.length) return { ok: false, reason: "targets_not_allowed" };
  const parameters = request.intent === "state.query" ? normalizeStateParameters(request.parameters || {}) : {};
  if (!parameters) return { ok: false, reason: "parameters_not_allowed" };
  return { ok: true, request: { contractVersion: "1.0", requestId: String(request.requestId || `interactive-light-read-${randomUUID()}`).slice(0, 80), locale: "en-US", utterance: "interactive-light-experiences-read", intent: request.intent, targets: targets.map(({ id }) => ({ entityType: "device", id })), parameters } };
}

function normalizeLightingParameters(parameters, targets, targetIds) {
  const allowed = new Set(["hue", "saturation", "brightness", "holdMs", "power", "actions", "verification"]);
  if (Object.keys(parameters).some((key) => !allowed.has(key))) return null;
  if (Array.isArray(parameters.actions)) {
    const actions = parameters.actions.map((action) => normalizeAction(action, targetIds));
    if (actions.length !== targets.length || actions.some((action) => !action)) return null;
    const actionIds = actions.map((action) => action.targetId);
    if (new Set(actionIds).size !== actionIds.length || !actionIds.every((id) => targetIds.has(id))) return null;
    const verification = parameters.verification === "acknowledged" || parameters.verification === "batch" ? parameters.verification : undefined;
    return verification ? { actions, verification } : { actions };
  }
  const hue = Number(parameters.hue);
  const saturation = Number(parameters.saturation);
  const brightness = Number(parameters.brightness);
  if (![hue, saturation, brightness].every(Number.isFinite) || hue < 0 || hue > 359 || saturation < 0 || saturation > 100 || brightness < 1 || brightness > 100 || parameters.power !== undefined && typeof parameters.power !== "boolean") return null;
  const color = hsvToRgb(hue, saturation, brightness);
  return {
    actions: targets.map(({ id }) => ({ targetType: "device", targetId: id, set: { ...(typeof parameters.power === "boolean" ? { power: parameters.power } : {}), brightness: Math.round(brightness), color } })),
  };
}

function normalizeFlowParameters(parameters, targets, targetIds) {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return null;
  if (Object.keys(parameters).length === 1 && parameters.flow) {
    const flow = normalizeFlow(parameters.flow);
    return flow ? { flow } : null;
  }
  if (Object.keys(parameters).length !== 1 || !Array.isArray(parameters.flows) || parameters.flows.length !== targets.length) return null;
  const entries = parameters.flows.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).length !== 2 || typeof entry.targetId !== "string" || !targetIds.has(entry.targetId)) return null;
    const flow = normalizeFlow(entry.flow);
    return flow ? { targetId: entry.targetId, flow } : null;
  });
  if (entries.some((entry) => !entry) || new Set(entries.map((entry) => entry.targetId)).size !== targets.length) return null;
  return { flows: entries };
}

function normalizeFlow(flow) {
  if (!flow || typeof flow !== "object" || Array.isArray(flow)) return null;
  const allowed = new Set(["flowName", "count", "tuples", "ending"]);
  if (Object.keys(flow).some((key) => !allowed.has(key))) return null;
  const flowName = typeof flow.flowName === "string" && /^[A-Za-z0-9._:-]{1,64}$/.test(flow.flowName) ? flow.flowName : "";
  const count = flow.count;
  if (!flowName || !Number.isInteger(count) || count < 1 || count > 6 || !Array.isArray(flow.tuples) || flow.tuples.length !== count || flow.tuples.length < 1 || flow.tuples.length > 6) return null;
  if (!flow.ending || typeof flow.ending !== "object" || Array.isArray(flow.ending) || Object.keys(flow.ending).length !== 1 || flow.ending.type !== "stay") return null;
  const tuples = flow.tuples.map(normalizeFlowTuple);
  if (tuples.some((tuple) => !tuple)) return null;
  return { flowName, count, tuples, ending: { type: "stay" } };
}

function normalizeFlowTuple(tuple) {
  if (!tuple || typeof tuple !== "object" || Array.isArray(tuple)) return null;
  const allowed = new Set(["type", "duration", "set"]);
  if (Object.keys(tuple).some((key) => !allowed.has(key)) || tuple.type !== "set" || !Number.isInteger(tuple.duration) || tuple.duration < MIN_PHASE_DURATION_MS || tuple.duration > MAX_PHASE_DURATION_MS || !tuple.set || typeof tuple.set !== "object" || Array.isArray(tuple.set)) return null;
  const set = tuple.set;
  const setKeys = new Set(["p", "l", "c"]);
  if (Object.keys(set).some((key) => !setKeys.has(key)) || typeof set.p !== "boolean" || !Number.isInteger(set.l) || set.l < 1 || set.l > 100 || !Number.isInteger(set.c) || set.c < 0 || set.c > 0xffffff) return null;
  return { type: "set", duration: tuple.duration, set: { p: set.p, l: set.l, c: set.c } };
}

function flowDurationMs(flow) {
  return Array.from({ length: flow.count }, (_, index) => flow.tuples[index % flow.tuples.length].duration).reduce((sum, duration) => sum + duration, 0);
}

function normalizeAction(action, targetIds = null) {
  if (!action || typeof action !== "object" || Array.isArray(action)) return null;
  const allowed = new Set(["targetType", "targetId", "set"]);
  if (Object.keys(action).some((key) => !allowed.has(key)) || action.targetType !== "device" || !action.set || typeof action.set !== "object" || Array.isArray(action.set)) return null;
  const targetId = typeof action.targetId === "string" && /^[A-Za-z0-9._-]{1,80}$/.test(action.targetId) ? action.targetId : undefined;
  if (!targetId || targetIds && !targetIds.has(targetId)) return null;
  const set = action.set;
  const setKeys = new Set(["power", "brightness", "colorTemperature", "color"]);
  if (Object.keys(set).some((key) => !setKeys.has(key))) return null;
  if (set.power !== undefined && typeof set.power !== "boolean") return null;
  if (set.brightness !== undefined && (!Number.isInteger(set.brightness) || set.brightness < 1 || set.brightness > 100)) return null;
  if (set.colorTemperature !== undefined && (!Number.isInteger(set.colorTemperature) || set.colorTemperature < 2700 || set.colorTemperature > 6500)) return null;
  if (set.color !== undefined && (!Number.isInteger(set.color) || set.color < 0 || set.color > 0xffffff)) return null;
  if (!Object.keys(set).length) return null;
  return { targetType: "device", targetId, set: { ...set } };
}

function normalizeStateParameters(parameters) {
  const allowed = new Set(["property", "allProperties"]);
  if (Object.keys(parameters).some((key) => !allowed.has(key))) return null;
  if (parameters.allProperties === true) return {};
  if (parameters.allProperties !== undefined) return null;
  const property = String(parameters.property || "power");
  return ["power", "brightness", "color", "colorTemperature", "online"].includes(property) ? { property } : null;
}

function validateSingleTargetRead(states, targetId) {
  if (!Array.isArray(states) || states.length !== 1 || states[0]?.id !== targetId) return { ok: false, reason: "runtime_read_target_mismatch" };
  return { ok: true, states };
}

async function boundedMap(items, concurrency, worker) {
  if (!Array.isArray(items) || !items.length) return [];
  const results = new Array(items.length);
  let cursor = 0;
  let stopped = false;
  let completed = 0;
  const runWorker = async () => {
    while (!stopped) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        const result = await worker(items[index], index);
        results[index] = result;
        completed += 1;
        if (result?.ok === false) stopped = true;
      } catch {
        results[index] = { ok: false, reason: "runtime_error" };
        completed += 1;
        stopped = true;
      }
    }
  };
  const workerCount = Math.min(normalizeParallelTargets(concurrency, DEFAULT_MAX_PARALLEL_TARGETS), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  if (completed !== items.length) {
    for (let index = 0; index < results.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(results, index)) results[index] = { ok: false, reason: "runtime_batch_incomplete" };
    }
  }
  return results;
}

function normalizeParallelTargets(value, fallback = DEFAULT_MAX_PARALLEL_TARGETS) {
  const safeFallback = Number.isSafeInteger(fallback) && fallback >= 1 && fallback <= MAX_TARGETS ? fallback : DEFAULT_MAX_PARALLEL_TARGETS;
  if (value === undefined || value === null || value === "") return safeFallback;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= MAX_TARGETS ? parsed : safeFallback;
}

class RuntimeConcurrencyGate {
  #limit;
  #active = 0;
  #queue = [];

  constructor(limit) {
    this.#limit = normalizeParallelTargets(limit);
  }

  acquire(signal) {
    if (signal?.aborted) return Promise.reject(new Error("runtime_cancelled"));
    if (this.#active < this.#limit) {
      this.#active += 1;
      return Promise.resolve(() => this.#release());
    }
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, signal, onAbort: null };
      entry.onAbort = () => {
        const index = this.#queue.indexOf(entry);
        if (index >= 0) this.#queue.splice(index, 1);
        reject(new Error("runtime_cancelled"));
      };
      signal?.addEventListener("abort", entry.onAbort, { once: true });
      this.#queue.push(entry);
    });
  }

  #release() {
    this.#active = Math.max(0, this.#active - 1);
    while (this.#queue.length && this.#active < this.#limit) {
      const entry = this.#queue.shift();
      entry.signal?.removeEventListener("abort", entry.onAbort);
      if (entry.signal?.aborted) {
        entry.reject(new Error("runtime_cancelled"));
        continue;
      }
      this.#active += 1;
      entry.resolve(() => this.#release());
    }
  }
}

function expectedSingleTargetState(request) {
  if (request.targets.length !== 1 || !Array.isArray(request.parameters?.actions) || !request.parameters.actions.length) return null;
  const id = request.targets[0].id;
  const actions = request.parameters.actions;
  if (actions.some((action) => action.targetId !== id)) return null;
  const expected = { id };
  for (const action of actions) Object.assign(expected, action.set);
  return Object.keys(expected).length > 1 ? expected : null;
}

function matchesExpectedState(state, expected) {
  const properties = ["power", "brightness", "colorTemperature", "color"];
  return properties.every((property) => expected[property] === undefined || Object.prototype.hasOwnProperty.call(state, property) && state[property] === expected[property]);
}

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("runtime_cancelled"));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("runtime_cancelled"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function hsvToRgb(hue, saturation, brightness) {
  const s = saturation / 100;
  const v = brightness / 100;
  const chroma = v * s;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const [r, g, b] = segment < 1 ? [chroma, x, 0] : segment < 2 ? [x, chroma, 0] : segment < 3 ? [0, chroma, x] : segment < 4 ? [0, x, chroma] : segment < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const m = v - chroma;
  return ((Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255));
}

function runCommand(binary, args, stdin, { signal, env, timeoutMs = 30000 } = {}) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve({ ok: false, reason: "runtime_cancelled" });
    const child = spawn(binary, args, { stdio: ["pipe", "pipe", "ignore"], env });
    let output = "";
    let settled = false;
    let closed = false;
    let terminationResult = null;
    let terminationTimer = null;
    const timeout = setTimeout(() => terminate({ ok: false, reason: "runtime_timeout" }), timeoutMs);
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (terminationTimer) clearTimeout(terminationTimer);
      signal?.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const terminate = (value) => {
      if (settled || terminationResult) return;
      terminationResult = value;
      try { child.kill("SIGTERM"); } catch { /* close will still settle the bounded child process */ }
      terminationTimer = setTimeout(() => {
        if (closed || settled) return;
        try { child.kill("SIGKILL"); } catch { /* The close event remains the terminal signal. */ }
      }, TERMINATION_GRACE_MS);
    };
    const onAbort = () => terminate({ ok: false, reason: "runtime_cancelled" });
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (chunk) => {
      if (terminationResult) return;
      output += chunk;
      if (output.length > MAX_OUTPUT) terminate({ ok: false, reason: "runtime_output_too_large" });
    });
    child.on("error", () => {
      if (terminationResult) return;
      terminationResult = { ok: false, reason: "runtime_error" };
      if (closed) settle(terminationResult);
    });
    child.on("close", (code) => {
      closed = true;
      if (terminationResult) return settle(terminationResult);
      try { settle({ ok: code === 0, value: JSON.parse(output || "{}") }); } catch { settle({ ok: false, reason: "runtime_invalid_json" }); }
    });
    child.stdin.end(stdin);
  });
}

function projectRuntimeResponse(value, request = null) {
  const status = String(value?.status || "").toLowerCase();
  if (!["success", "applied", "verified", "ok"].includes(status)) {
    if (isClosedWriteVerificationMismatch(value, request)) return { ok: false, reason: RUNTIME_WRITE_VERIFICATION_MISMATCH };
    return { ok: false, reason: runtimeReason(status) };
  }
  if (request?.intent !== "state.query") return { ok: true, status };
  const states = extractStateSnapshots(value, request.targets || [], { requireExplicitTargetId: true });
  const valid = validateTargetReads(states, request.targets || []);
  return valid.ok ? { ok: true, status, states } : valid;
}

const VISITOR_PROPERTY_INTENTS = Object.freeze({
  power: "light.power.set",
  brightness: "light.brightness.set",
  colorTemperature: "light.color_temperature.set",
  color: "light.color.set",
});

const VISITOR_PROPERTY_TRACES = Object.freeze({
  power: { success: "light-power-set-command", mismatch: "light-power-set-verification-mismatch" },
  brightness: { success: "light-brightness-set-command", mismatch: "light-brightness-set-verification-mismatch" },
  colorTemperature: { success: "light-color-temperature-set-command", mismatch: "light-color-temperature-set-verification-mismatch" },
  color: { success: "light-color-set-command", mismatch: "light-color-set-verification-mismatch" },
});

function buildVisitorPropertyRequest(request, targetId, property, expectedValue, targetIndex, propertyIndex) {
  const intent = VISITOR_PROPERTY_INTENTS[property];
  if (!intent) throw new Error("visitor_property_not_allowed");
  return {
    contractVersion: "1.0",
    requestId: `${request.requestId}-visitor-${targetIndex + 1}-${propertyIndex + 1}`,
    locale: "en-US",
    utterance: "interactive-light-experiences",
    intent,
    targets: [{ entityType: "device", id: targetId }],
    parameters: { [property]: expectedValue },
  };
}

function projectVisitorPropertyReceipt(value, request) {
  const parameterNames = Object.keys(request?.parameters || {});
  const property = parameterNames[0];
  const expectedValue = request?.parameters?.[property];
  const targetId = request?.targets?.length === 1 ? request.targets[0].id : "";
  const traces = VISITOR_PROPERTY_TRACES[property];
  const result = value?.result;
  if (parameterNames.length !== 1 || !traces || request.intent !== VISITOR_PROPERTY_INTENTS[property] || !targetId || !isPlainRecord(value) || value.contractVersion !== "1.0" || value.requestId !== request.requestId || !isPlainRecord(result)) return { ok: false, reason: "runtime_error" };
  if (!isPlainRecord(result.entity) || result.entity.id !== targetId || result.entity.entityType !== "device" || result.command !== "set" || result.source !== "device_property_set_endpoint" || result.property !== property || !Object.is(result.expectedValue, expectedValue) || typeof result.verified !== "boolean" || !Object.prototype.hasOwnProperty.call(result, "verifiedValue")) return { ok: false, reason: "runtime_error" };
  if (value.status === "success" && value.traceId === traces.success && result.verified === true && Object.is(result.verifiedValue, expectedValue)) return { ok: true, status: "success" };
  if (value.status === "partial" && value.error?.code === "write_verification_mismatch" && value.traceId === traces.mismatch && result.verified === false && !Object.is(result.verifiedValue, expectedValue)) return { ok: true, status: "dispatched_unverified" };
  return { ok: false, reason: "runtime_error" };
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isClosedWriteVerificationMismatch(value, request) {
  if (request?.intent !== "lighting.design.apply" || String(value?.status || "").toLowerCase() !== "partial") return false;
  if (value?.requestId !== request.requestId || value?.error?.code !== "write_verification_mismatch") return false;
  if (value?.execution?.intent !== "lighting.design.apply" || value?.execution?.status !== "executed") return false;
  const result = value?.result;
  if (!result || typeof result !== "object" || result.capability !== "lighting.design.apply" || result.persistentWrites !== true || result.verified !== false) return false;
  const actions = request.parameters?.actions;
  const rows = result.results;
  if (!Array.isArray(actions) || !Array.isArray(rows) || !Number.isInteger(result.actionCount) || result.actionCount !== rows.length) return false;
  const expected = actions.flatMap((action) => Object.entries(action.set || {}).map(([property, value]) => ({ targetId: action.targetId, property, value })));
  if (!expected.length || expected.length !== rows.length) return false;
  const seen = new Set();
  let mismatch = false;
  for (const row of rows) {
    const targetId = row?.entity?.id;
    const property = typeof row?.property === "string" ? row.property : "";
    if (!targetId || !property || typeof row.verified !== "boolean" || !Object.prototype.hasOwnProperty.call(row, "expectedValue") || !Object.prototype.hasOwnProperty.call(row, "verifiedValue")) return false;
    const match = expected.find((item) => item.targetId === targetId && item.property === property && Object.is(item.value, row.expectedValue) && !seen.has(`${item.targetId}:${item.property}`));
    if (!match) return false;
    seen.add(`${match.targetId}:${match.property}`);
    if (row.verified === false) mismatch = true;
  }
  return mismatch && seen.size === expected.length;
}

function projectReadResponse(value, request) {
  const status = String(value?.status || "").toLowerCase();
  if (!["success", "applied", "verified", "ok"].includes(status)) return { ok: false, reason: runtimeReason(status) };
  const result = value?.result && typeof value.result === "object" ? value.result : {};
  if (request.intent === "entity.list") {
    const entities = Array.isArray(result.entities) ? result.entities.map(projectEntity).filter(Boolean) : [];
    return { ok: true, status, entities, gatewayIds: [...new Set(entities.map((item) => item.gatewayDeviceId).filter(Boolean))], houseId: safeId(result.houseId), region: safeRegion(result.region) };
  }
  if (request.intent === "gateway.list") {
    const gateways = Array.isArray(result.data?.gateways) ? result.data.gateways.map(projectGateway).filter(Boolean) : [];
    return { ok: true, status, gateways, houseId: safeId(result.houseId), region: safeRegion(result.region) };
  }
  if (request.intent === "entity.capabilities") {
    return { ok: true, status, entity: projectEntity(result.entity), capabilities: projectCapabilities(result.deviceSchema), schemaStatus: String(result.schemaStatus || "unknown").slice(0, 32) };
  }
  return projectRuntimeResponse(value, request);
}

function projectBatchReadResponse(value, targets) {
  const status = String(value?.status || "").toLowerCase();
  if (!["success", "applied", "verified", "ok"].includes(status)) return { ok: false, reason: runtimeReason(status) };
  const states = extractStateSnapshots(value, targets, { requireExplicitTargetId: true });
  const valid = validateTargetReads(states, targets);
  return valid.ok ? { ok: true, status, states } : valid;
}

function projectEntity(entity) {
  if (!entity || typeof entity !== "object") return null;
  const id = safeId(entity.id || entity.entityId);
  if (!id) return null;
  return { id, entityType: String(entity.entityType || entity.type || "").slice(0, 24), name: cleanName(entity.name), roomId: safeId(entity.roomId), gatewayDeviceId: safeId(entity.gatewayDeviceId) };
}

function projectGateway(gateway) {
  if (!gateway || typeof gateway !== "object") return null;
  const id = safeId(gateway.id);
  if (!id) return null;
  return { id, name: cleanName(gateway.name), online: gateway.online === true, bind: gateway.bind === true };
}

function projectCapabilities(schema) {
  const properties = Array.isArray(schema?.properties) ? schema.properties : Array.isArray(schema?.components?.[0]?.properties) ? schema.components[0].properties : [];
  const ids = new Set(properties.map((item) => String(item?.id || "")));
  const flowNames = collectExplicitFlowNames(schema);
  return { rgb: ids.has("color"), brightness: ids.has("brightness"), colorTemperature: ids.has("colorTemperature"), power: ids.has("power"), flow: flowNames.length > 0, flowNames };
}

function collectExplicitFlowNames(schema) {
  const names = new Set();
  const components = Array.isArray(schema?.components) ? schema.components : [];
  const sources = [schema, schema?.capabilities, ...components, ...components.flatMap((component) => [component?.capabilities, component?.capability])];
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const key of ["supportFlows", "support_flows", "flows"]) collectCapabilityNames(names, source[key], "flowName", "flow", "mode", "name", "id");
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

// Runtime capability payloads may encode the same closed list as a string,
// JSON string, array, or enabled-name map. Keep only bounded, dispatch-safe
// names and preserve the advertised spelling for the downstream Runtime.
function collectCapabilityNames(names, value, ...keys) {
  if (names.size >= MAX_CAPABILITY_NAMES || value === null || value === undefined) return;
  if (typeof value === "string") {
    const text = value.trim().slice(0, MAX_CAPABILITY_TEXT);
    if (!text) return;
    if ((text.startsWith("[") || text.startsWith("{")) && text.length <= MAX_CAPABILITY_TEXT) {
      try {
        const decoded = JSON.parse(text);
        collectCapabilityNames(names, decoded, ...keys);
        return;
      } catch {
        // Treat malformed JSON text as a delimited capability list below.
      }
    }
    for (const item of text.split(/[,;|]/)) addCapabilityName(names, item);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, MAX_CAPABILITY_NAMES)) collectCapabilityNames(names, item, ...keys);
    return;
  }
  if (typeof value !== "object") return;
  for (const key of keys) {
    if (typeof value[key] === "string") {
      addCapabilityName(names, value[key]);
      return;
    }
  }
  for (const [name, enabled] of Object.entries(value).slice(0, MAX_CAPABILITY_NAMES)) {
    if (enabled === true) addCapabilityName(names, name);
  }
}

function addCapabilityName(names, value) {
  const name = String(value || "").trim();
  if (!SAFE_FLOW_NAME.test(name) || names.size >= MAX_CAPABILITY_NAMES) return;
  const normalized = name.toLowerCase();
  if (![...names].some((item) => item.toLowerCase() === normalized)) names.add(name);
}

function normalizeRuntimeContext({ profile, region, houseId }) {
  const normalizedProfile = String(profile || "").trim();
  const normalizedRegion = String(region || "").trim().toLowerCase();
  const normalizedHouse = String(houseId || "").trim();
  if (normalizedProfile && !/^[A-Za-z0-9._-]{1,64}$/.test(normalizedProfile)) throw new Error("invalid_runtime_profile");
  if (normalizedRegion && !REGIONS.has(normalizedRegion)) throw new Error("invalid_runtime_region");
  if (normalizedHouse && !/^\d{1,32}$/.test(normalizedHouse)) throw new Error("invalid_runtime_house");
  return { profile: normalizedProfile, region: normalizedRegion, houseId: normalizedHouse };
}

function assertTrustedRuntimeBinary(runtimeBin) {
  if (typeof runtimeBin !== "string" || !path.isAbsolute(runtimeBin)) throw new Error("live_runtime_binary_must_be_absolute");
  const resolved = fs.realpathSync(runtimeBin);
  const trustedRoots = ["/opt/homebrew/", "/usr/local/", "/usr/bin/", "/bin/"];
  if (!trustedRoots.some((root) => resolved.startsWith(root))) throw new Error("live_runtime_binary_unsafe");
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o022) !== 0) throw new Error("live_runtime_binary_unsafe");
  if (typeof process.getuid === "function" && stat.uid !== process.getuid() && stat.uid !== 0) throw new Error("live_runtime_binary_owner_invalid");
  return resolved;
}

function safeId(value) { return typeof value === "string" && /^[A-Za-z0-9._-]{1,80}$/.test(value) ? value : ""; }
function safeRegion(value) { return REGIONS.has(String(value || "")) ? String(value) : ""; }
function cleanName(value) { return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80) : ""; }

const RUNTIME_STATUS_CODES = new Set(["partial", "failed", "error", "timeout", "cancelled", "blocked", "offline", "unsupported"]);
const RUNTIME_FAILURE_REASONS = new Set([
  "runtime_cancelled",
  "runtime_timeout",
  "runtime_output_too_large",
  "runtime_invalid_json",
  "runtime_protocol",
  "runtime_unavailable",
  "runtime_error",
]);

function safeRuntimeFailure(reason) {
  const value = typeof reason === "string" ? reason : "";
  return RUNTIME_FAILURE_REASONS.has(value) ? value : "runtime_error";
}

function runtimeReason(status) {
  if (!status) return "runtime_status_missing";
  return RUNTIME_STATUS_CODES.has(status) ? `runtime_${status}` : "runtime_error";
}

function extractStateSnapshots(value, targets, { requireExplicitTargetId = false } = {}) {
  const result = value?.result && typeof value.result === "object" ? value.result : value;
  const arrays = [result?.states, result?.results, result?.entities, value?.states, value?.results].filter(Array.isArray);
  const rows = arrays.flat();
  if (!rows.length && result && typeof result === "object") rows.push(result);
  const snapshots = rows.map((row) => normalizeStateSnapshot(row, targets, { requireExplicitTargetId })).filter(Boolean);
  return snapshots;
}

function validateTargetReads(states, targets) {
  const targetIds = targets.map((target) => target?.id).filter((id) => typeof id === "string");
  if (!Array.isArray(states) || states.length !== targetIds.length) return { ok: false, reason: "runtime_read_target_mismatch" };
  const stateIds = states.map((state) => state?.id);
  if (new Set(stateIds).size !== stateIds.length || stateIds.some((id) => !targetIds.includes(id))) return { ok: false, reason: "runtime_read_target_mismatch" };
  return { ok: true };
}

function normalizeStateSnapshot(row, targets, { requireExplicitTargetId = false } = {}) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const id = firstString(row.id, row.deviceId, row.targetId, row.nodeId, row.entity?.id);
  const fallbackId = !requireExplicitTargetId && targets.length === 1 ? targets[0]?.id : undefined;
  const snapshot = { id: id || fallbackId };
  const properties = row.properties && typeof row.properties === "object" ? row.properties : row;
  const propertyNames = {
    hue: ["hue", "h"],
    saturation: ["saturation", "s"],
    brightness: ["brightness", "l"],
    color: ["color", "rgb"],
    colorTemperature: ["colorTemperature", "ct"],
    power: ["power", "p"],
    online: ["online"],
  };
  for (const [name, aliases] of Object.entries(propertyNames)) {
    const key = aliases.find((candidate) => Object.prototype.hasOwnProperty.call(properties, candidate));
    if (!key) continue;
    const value = properties[key];
    if (name === "power") {
      if (typeof value === "boolean") snapshot.power = value;
    } else if (name === "online") {
      if (typeof value === "boolean") snapshot.online = value;
    } else if (Number.isFinite(Number(value))) {
      snapshot[name] = Math.round(Number(value));
    }
  }
  if (row.property && Object.prototype.hasOwnProperty.call(row, "value")) {
    const property = String(row.property);
    if (["hue", "saturation", "brightness", "color", "colorTemperature"].includes(property) && Number.isFinite(Number(row.value))) snapshot[property] = Math.round(Number(row.value));
    if (property === "power" && typeof row.value === "boolean") snapshot.power = row.value;
    if (property === "online" && typeof row.value === "boolean") snapshot.online = row.value;
  }
  return snapshot.id && Object.keys(snapshot).length > 1 ? snapshot : null;
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && /^[A-Za-z0-9._-]{1,80}$/.test(value)) || null;
}
