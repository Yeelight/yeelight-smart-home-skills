import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { URL } from "node:url";

import {
  EXPERIENCE_IDS,
  LOGICAL_SLOTS,
  boundedInteger,
  catalogItem,
  cleanText,
  publicExperienceCatalog,
  redactedExecution,
  isPlainObject,
  validateExperiencePlan,
} from "./lib/contracts.mjs";
import { buildDeterministicPlan } from "./lib/plans.mjs";
import { createTopology, publicTopology } from "./lib/topology.mjs";
import { SessionStore } from "./lib/session.mjs";
import { ProviderAdapter } from "./lib/provider.mjs";
import { ExperienceExecutor } from "./lib/executor.mjs";
import { YeelightHomeCommandAdapter } from "./lib/command-adapter.mjs";
import { LiveTopologyManager, defaultBindingPath } from "./lib/live-topology.mjs";
import { PROTOCOL_VERSION, SERVICE_ID, serviceOwnerProof, validInstanceId, validOwnerToken } from "./lib/service-contract.mjs";
import { buildSmartHomeScenePlan, getSmartHomeScene, publicSmartHomeScenes, scenePlanId } from "./lib/smart-home-scenes.mjs";

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const webRoot = path.join(packageRoot, "web");
const MAX_BODY = 32 * 1024;
const DEFAULT_SESSION_TIMEOUT_MS = 5 * 60 * 1000;
const LIVE_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const MODES = new Set(["mock-18", "proxy-4", "live-18", "live-proxy-4", "live-auto"]);
const SCENARIOS = new Set(["online", "offline", "unsupported-capability", "timeout", "partial-write", "readback-mismatch"]);
const TURN_EXPERIENCES = new Set(["shared-breath", "light-game-arena", "common-ground"]);
const GARDEN_CATEGORIES = new Set(["welcome", "focus", "ease", "wonder"]);
const GAME_ANSWERS = Object.freeze(["Cyan - silver - cyan", "Violet - amber - mint", "R"]);
const GAME_CHOICES = Object.freeze([
  Object.freeze(["Cyan - silver - cyan", "Silver - cyan - silver", "Cyan - cyan - silver"]),
  Object.freeze(["Amber - mint - violet", "Violet - amber - mint", "Mint - violet - amber"]),
  Object.freeze(["K", "R", "W"]),
]);
const DNA_CHOICES = Object.freeze([
  Object.freeze(["Ember", "Mist", "Daylight"]),
  Object.freeze(["A single point", "A wide field", "A moving edge"]),
  Object.freeze(["Barely there", "Balanced", "Full spectrum"]),
  Object.freeze(["Still", "Measured", "Restless"]),
]);
const TRANSLATION_CHOICES = new Set(["Quiet contrast", "Lower saturation", "Soft transition", "Clear warmth"]);
const IMPOSSIBLE_ONE = new Set(["Vivid + low saturation", "Alert + visually quiet", "Warm + high clarity", "Slow + still alive"]);
const IMPOSSIBLE_TWO = new Set(["More vivid", "More quiet", "More open", "More precise"]);
const PRIVATE_REQUEST_FIELDS = new Set(["targets", "deviceId", "deviceIds", "snapshot", "stateObservation", "runtimeIntent", "actions", "command", "shell", "prompt"]);
const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

export function createInteractiveServer(options = {}) {
  const port = Number.isInteger(options.port) ? options.port : 8787;
  const mode = normalizeMode(options.mode || process.env.YEELIGHT_ILE_MODE || "mock-18");
  const scenario = normalizeScenario(options.scenario || process.env.YEELIGHT_ILE_SCENARIO || "online");
  const liveContext = mode.startsWith("live") ? normalizeLiveContext(options) : null;
  if (mode.startsWith("live") && scenario !== "online") throw Object.assign(new Error("live_scenario_must_be_online"), { statusCode: 400 });
  const runtime = {
    serviceId: SERVICE_ID,
    protocolVersion: PROTOCOL_VERSION,
    instanceId: normalizeInstanceId(options.instanceId || process.env.YEELIGHT_ILE_INSTANCE_ID),
    ownerToken: normalizeOwnerToken(options.ownerToken || process.env.YEELIGHT_ILE_OWNER_TOKEN),
    mode,
    requestedMode: mode,
    scenario,
    profile: liveContext?.profile || "",
    region: liveContext?.region || "",
    houseId: liveContext?.houseId || "",
  };
  const sessions = options.sessions || new SessionStore({ timeoutMs: mode.startsWith("live") ? LIVE_SESSION_TIMEOUT_MS : DEFAULT_SESSION_TIMEOUT_MS });
  const provider = options.provider || new ProviderAdapter({ configPath: options.providerPath, transport: options.transport, sessionStore: sessions });
  const commandAdapter = options.commandAdapter || (liveContext ? new YeelightHomeCommandAdapter({ ...liveContext, strictRuntime: true }) : null);
  const liveTopology = options.liveTopology || (liveContext ? new LiveTopologyManager({ adapter: commandAdapter, bindingPath: options.bindingPath || defaultBindingPath(), ...liveContext }) : null);
  const topologyFactory = options.topologyFactory || ((selectedMode, selectedScenario) => selectedMode.startsWith("live") ? liveTopology.get(selectedMode) : createTopology(selectedMode, selectedScenario));
  const executor = options.executor || new ExperienceExecutor({ commandAdapter, topologyFactory });
  const uncertainRuns = new Map();
  sessions.setInvalidationHandler?.(({ sessionId }) => {
    executor.clearRecovery?.(sessionId);
    uncertainRuns.delete(sessionId);
  });
  const activeRuns = new Map();
  const completedRuns = new Map();
  const gardenRuns = new Map();
  const garden = createGardenAggregate();
  const ready = Promise.resolve(provider.load?.()).then(async () => {
    if (liveTopology) {
      const topology = await liveTopology.load();
      if (mode === "live-auto") {
        if (!topology?.mode || !["live-18", "live-proxy-4"].includes(topology.mode)) throw new Error("live_topology_unavailable");
        runtime.mode = topology.mode;
      } else if (topology?.mode && topology.mode !== mode) {
        throw new Error("live_binding_topology_mismatch");
      }
    }
    return true;
  });

  const server = http.createServer(async (request, response) => {
    try {
      if (!isAllowedHost(request, port, server)) return sendJson(response, 403, { error: "loopback_only" });
      if (request.method === "OPTIONS") return sendJson(response, 204, {});
      const parsed = new URL(request.url || "/", `http://127.0.0.1:${port}`);
      if (parsed.pathname.startsWith("/api/")) {
        await ready;
        return await handleApi({ request, response, parsed, sessions, provider, executor, runtime, liveTopology, activeRuns, completedRuns, uncertainRuns, gardenRuns, garden, port, server });
      }
      return serveStatic(response, parsed.pathname);
    } catch (error) {
      const projected = publicError(error);
      return sendJson(response, projected.status, projected);
    }
  });
  server.on("close", () => commandAdapter?.close?.());
  return { server, sessions, provider, executor, commandAdapter, liveTopology, runtime, garden, port, ready };
}

async function handleApi({ request, response, parsed, sessions, provider, executor, runtime, liveTopology, activeRuns, completedRuns, uncertainRuns, gardenRuns, garden, port, server }) {
  const { pathname, searchParams } = parsed;
  if (request.method === "POST" && !checkPostBoundary(request, port, server)) return sendJson(response, 403, { error: "same_origin_required" });
  if (request.method === "GET" && pathname === "/api/health") {
    const challenge = request.headers["x-yeelight-ile-challenge"];
    if (challenge !== undefined && (typeof challenge !== "string" || !/^[0-9a-f-]{16,80}$/i.test(challenge))) return sendJson(response, 403, { error: "service_owner_mismatch" });
    const health = { ok: true, serviceId: runtime.serviceId, protocolVersion: runtime.protocolVersion, instanceId: runtime.instanceId, mode: runtime.mode, requestedMode: runtime.requestedMode, scenario: runtime.scenario, liveReady: Boolean(liveTopology?.status?.().loaded) };
    if (challenge) health.ownerProof = serviceOwnerProof(runtime.ownerToken, challenge, runtime.instanceId, runtime.protocolVersion);
    return sendJson(response, 200, health);
  }
  if (request.method === "GET" && pathname === "/api/cinema/health") return await proxyCinemaHealth(response);
  if (request.method === "GET" && pathname === "/api/catalog") return sendJson(response, 200, { experiences: publicExperienceCatalog() });
  if (request.method === "GET" && pathname === "/api/smart-home/scenes") return sendJson(response, 200, { scenes: publicSmartHomeScenes() });
  if (request.method === "GET" && pathname === "/api/provider/status") return sendJson(response, 200, { provider: publicProviderStatus(provider) });
  if (request.method === "GET" && pathname === "/api/topology") {
    const mode = normalizeMode(searchParams.get("mode") || runtime.mode);
    const scenario = normalizeScenario(searchParams.get("scenario") || runtime.scenario);
    return sendJson(response, 200, { topology: publicTopology(resolveTopology(mode, scenario, liveTopology)) });
  }
  if (request.method === "POST" && pathname === "/api/session") {
    const body = await readJson(request);
    if (!isPlainObject(body) || Object.keys(body).length > 0) return sendJson(response, 400, { error: "session_payload_not_allowed" });
    const session = sessions.createSession();
    executor.clearRecovery?.();
    purgeUncertainRuns(uncertainRuns, sessions);
    purgeActiveRuns(activeRuns, completedRuns, sessions, gardenRuns, executor);
    purgeGardenRuns(gardenRuns, sessions);
    return sendJson(response, 201, publicSession(session));
  }
  const turnStartMatch = pathname.match(/^\/api\/experience\/([a-z0-9-]+)\/turn\/start$/);
  if (request.method === "POST" && turnStartMatch) {
    const body = await readJson(request);
    const experienceId = turnStartMatch[1];
    if (!TURN_EXPERIENCES.has(experienceId)) return sendJson(response, 404, { error: "turn_not_supported" });
    const sessionId = cleanText(body?.sessionId, 80);
    if (!getSession(sessions, sessionId)) return sendJson(response, 409, { error: "session_expired" });
    rejectPrivateRequestFields(body?.input);
    const derived = deriveTurnStartFeatures(experienceId, body?.input);
    const turn = sessions.createTurn(sessionId, { experienceId, phase: "A", features: derived.private });
    if (!turn) return sendJson(response, 409, { error: "session_expired" });
    return sendJson(response, 201, { turn, features: derived.public });
  }
  if (request.method === "POST" && ["/api/session/finish", "/api/session/handoff", "/api/session/reset"].includes(pathname)) {
    const body = await readJson(request);
    const sessionId = cleanText(body?.sessionId, 80);
    if (!sessionId) return sendJson(response, 400, { error: "session_required" });
    const session = getSession(sessions, sessionId);
    if (!session) return sendJson(response, 409, { error: "session_expired" });
    invalidateSession(sessions, sessionId, pathname.split("/").pop());
    executor.clearRecovery?.(sessionId);
    uncertainRuns.delete(sessionId);
    clearActiveRunsForSession(activeRuns, completedRuns, sessionId, gardenRuns);
    clearGardenRunsForSession(gardenRuns, sessionId);
    return sendJson(response, 200, { ok: true, transition: pathname.split("/").pop() });
  }
  const experienceMatch = pathname.match(/^\/api\/experience\/([a-z0-9-]+)\/run$/);
  if (request.method === "POST" && (pathname === "/api/experience/run" || experienceMatch)) {
    const body = await readJson(request);
    if (experienceMatch && !body.experienceId) body.experienceId = experienceMatch[1];
    return await runExperience({ response, body, sessions, provider, executor, runtime, liveTopology, activeRuns, completedRuns, uncertainRuns, gardenRuns, garden });
  }
  if (request.method === "POST" && pathname === "/api/smart-home/scene") {
    const body = await readJson(request);
    return await runSmartHomeScene({ response, body, sessions, provider, executor, runtime, liveTopology, activeRuns, completedRuns, uncertainRuns });
  }
  const restoreMatch = pathname.match(/^\/api\/experience\/([a-z0-9-]+)\/restore$/);
  if (request.method === "POST" && restoreMatch) {
    const body = await readJson(request);
    if (!isPlainObject(body)) return sendJson(response, 400, { error: "invalid_json" });
    body.experienceId = restoreMatch[1];
    return await restoreExperience({ response, body, sessions, provider, executor, runtime, liveTopology, uncertainRuns });
  }
  if (request.method === "POST" && pathname === "/api/staff/provider/test") {
    return sendJson(response, 200, { result: await provider.testConnection(await readJson(request)) });
  }
  if (request.method === "POST" && pathname === "/api/staff/provider/configure") {
    const candidate = await readJson(request);
    const probe = await provider.testConnection(candidate);
    if (!probe.ok) return sendJson(response, 400, { error: "provider_test_failed", message: "Provider connection test failed; the existing configuration was kept." });
    const result = await provider.configure(candidate);
    executor.clearRecovery?.();
    activeRuns.clear();
    completedRuns.clear();
    uncertainRuns.clear();
    gardenRuns.clear();
    return sendJson(response, 200, { provider: result });
  }
  if (request.method === "POST" && pathname === "/api/staff/reset") {
    activeRuns.clear();
    completedRuns.clear();
    uncertainRuns.clear();
    gardenRuns.clear();
    garden.reset();
    executor.clearRecovery?.();
    return sendJson(response, 200, { ok: sessions.resetAll("staff-reset") });
  }
  if (request.method === "GET" && pathname === "/api/staff/garden") {
    return sendJson(response, 200, { garden: garden.public() });
  }
  return sendJson(response, 404, { error: "not_found" });
}

async function proxyCinemaHealth(response) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 900);
  try {
    const upstream = await fetch("http://127.0.0.1:8789/api/health", {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok || payload?.ok !== true || payload?.serviceId !== "yeelight-cinema-director") {
      return sendJson(response, 503, { available: false, error: "cinema_unavailable", message: "Cinema Director is not ready on this computer." });
    }
    return sendJson(response, 200, { available: true, serviceId: payload.serviceId, protocolVersion: payload.protocolVersion ?? null });
  } catch (_) {
    return sendJson(response, 503, { available: false, error: "cinema_unavailable", message: "Cinema Director is not ready on this computer." });
  } finally {
    clearTimeout(timeout);
  }
}

async function restoreExperience({ response, body, sessions, provider, executor, runtime, liveTopology, uncertainRuns }) {
  if (!isPlainObject(body)) return sendJson(response, 400, { error: "invalid_json" });
  const experienceId = cleanText(body.experienceId, 64);
  if (!EXPERIENCE_IDS.has(experienceId) || !catalogItem(experienceId)) return sendJson(response, 404, { error: "unknown_experience" });
  const recoveryRef = cleanText(body.recoveryRef, 128);
  const recoveryContext = recoveryRef && typeof executor.recoveryContext === "function" ? executor.recoveryContext(recoveryRef) : null;
  if (recoveryRef && !recoveryContext) return sendJson(response, 409, { error: "live_restore_unavailable" });
  const sessionId = cleanText(body.sessionId || recoveryContext?.owner?.sessionId, 80);
  const requestId = cleanText(body.requestId || recoveryContext?.owner?.requestId, 80);
  const session = getSession(sessions, sessionId);
  if (!session || !requestId) return sendJson(response, 409, { error: "session_expired" });
  if (runtime.mode.startsWith("live") && !recoveryRef) return sendJson(response, 409, { error: "live_restore_ref_required" });
  const recovery = typeof executor.recoveryStatus === "function" ? executor.recoveryStatus() : { available: false };
  if (runtime.mode.startsWith("live") && (!recovery.available || recovery.owner?.requestId !== requestId)) return sendJson(response, 409, { error: "live_restore_unavailable" });
  const operation = beginRequest(sessions, sessionId, providerRevision(provider));
  if (!operation) return sendJson(response, 409, { error: "session_expired" });
  try {
    const execution = await executor.restore(null, {
      mode: runtime.mode,
      scenario: runtime.scenario,
      sessionId,
      requestId,
      generation: operation.sessionGeneration,
      recoveryRef,
      restoreAliases: recoveryContext?.restoreAliases || null,
      expectedCurrentDigest: recovery.currentDigest || "",
      signal: operation.signal,
      isCurrent: () => isCurrent(sessions, operation) && providerRevision(provider) === operation.configRevision,
    });
    if (!isCurrent(sessions, operation)) return sendJson(response, 409, { error: "request_discarded" });
    completeRequest(sessions, operation, "completed");
    if (execution.status === "success" && uncertainRuns.get(sessionId)?.requestId === requestId && uncertainRuns.get(sessionId)?.experienceId === experienceId) {
      const recoveryAfter = typeof executor.recoveryStatus === "function" ? executor.recoveryStatus() || { available: false } : { available: false };
      if (!recoveryAfter.available) uncertainRuns.delete(sessionId);
    }
    return sendJson(response, 200, {
      requestId,
      execution: visitorExecution(execution, executor),
      topology: publicTopology(resolveTopology(runtime.mode, runtime.scenario, liveTopology)),
    });
  } catch (error) {
    completeRequest(sessions, operation, "error");
    throw error;
  }
}

async function runSmartHomeScene({ response, body, sessions, provider, executor, runtime, liveTopology, activeRuns, completedRuns, uncertainRuns }) {
  const timing = createRunTiming();
  const timedSend = (status, value) => sendJson(response, status, value, timingHeaders(timing));
  if (!isPlainObject(body)) return timedSend(400, { error: "invalid_json" });
  const allowedFields = new Set(["sessionId", "sceneId", "runId"]);
  if (Object.keys(body).some((key) => !allowedFields.has(key))) return timedSend(400, { error: "smart_home_payload_not_allowed", message: "Only sessionId, sceneId, and runId are accepted." });

  const sceneId = cleanText(body.sceneId, 40);
  const scene = getSmartHomeScene(sceneId);
  if (!scene) return timedSend(404, { error: "unknown_smart_home_scene", message: "That Smart Home scene is not available." });
  const sessionId = cleanText(body.sessionId, 80);
  if (!getSession(sessions, sessionId)) return timedSend(409, { error: "session_expired" });
  const runId = body.runId === undefined ? crypto.randomUUID() : cleanText(body.runId, 96);
  if (!runId) return timedSend(400, { error: "smart_home_run_id_required", message: "A non-empty runId is required." });

  const mode = runtime.mode;
  const scenario = runtime.scenario;
  const experienceId = scenePlanId(sceneId);
  const runKey = `smart-home:${sessionId}:${sceneId}:${runId}`;
  purgeActiveRuns(activeRuns, completedRuns, sessions, null, executor);
  purgeUncertainRuns(uncertainRuns, sessions);

  const completed = completedRuns.get(runKey);
  if (completed?.sessionId === sessionId && completed.experienceId === experienceId) return timedSend(Number.isInteger(completed.status) ? completed.status : 200, cloneValue(completed.body));
  const uncertain = uncertainRuns.get(sessionId);
  if (uncertain) {
    if (uncertain.runKey === runKey) return timedSend(uncertain.status, cloneValue(uncertain.body));
    return timedSend(409, { error: "recovery_required", message: "Restart or restore the previous light interaction before starting another one.", retryDisposition: "restart" });
  }
  const active = activeRuns.get(runKey);
  if (active) return timedSend(409, { error: "request_in_progress", message: "This Smart Home scene is already running." });
  const activeForRunId = [...activeRuns.values()].find((item) => item.sessionId === sessionId && item.runId === runId);
  if (activeForRunId) return timedSend(409, { error: "request_id_conflict", message: "This run id is already bound to another Smart Home scene." });
  const activeForSession = [...activeRuns.values()].find((item) => item.sessionId === sessionId);
  if (activeForSession) return timedSend(409, { error: "request_in_progress", message: "Finish the current visitor action before starting another." });

  const revision = providerRevision(provider);
  const requestRecord = beginRequest(sessions, sessionId, revision);
  if (!requestRecord) return timedSend(409, { error: "session_expired" });
  activeRuns.set(runKey, { runId, sessionId, experienceId, request: requestRecord });
  let executionStarted = false;
  const finishError = (status, error, message, retryDisposition = executionStarted ? "restart" : "new_run") => {
    const result = { error, message, status, retryDisposition };
    if (executionStarted) rememberUncertainRun(uncertainRuns, { sessionId, experienceId, runId, runKey, requestId: requestRecord.requestId, status, body: result });
    if (isCurrent(sessions, requestRecord)) {
      completeRequest(sessions, requestRecord, "error");
      rememberCompletedRun(completedRuns, runKey, { sessionId, experienceId, status, body: result });
    }
    return timedSend(status, result);
  };

  try {
    const plan = buildSmartHomeScenePlan(sceneId);
    const checkedPlan = validateExperiencePlan(plan, experienceId);
    if (!checkedPlan.ok) return finishError(422, "plan_rejected", "The Smart Home preset did not pass validation.");
    executionStarted = true;
    const execution = await measureRunStage(timing, "execute", () => executor.execute(plan, {
      sessionId,
      requestId: requestRecord.requestId,
      generation: requestRecord.sessionGeneration,
      mode,
      scenario,
      signal: requestRecord.signal,
      verifyLive: mode.startsWith("live") ? false : true,
      isCurrent: () => isCurrent(sessions, requestRecord) && providerRevision(provider) === requestRecord.configRevision,
    }));
    if (!isCurrent(sessions, requestRecord)) {
      const result = { error: "request_discarded", message: "This Smart Home action was discarded after execution began.", status: 409, retryDisposition: "restart" };
      rememberUncertainRun(uncertainRuns, { sessionId, experienceId, runId, runKey, requestId: requestRecord.requestId, status: 409, body: result });
      return timedSend(409, result);
    }
    if (execution.status === "success" && mode.startsWith("live")) {
      liveTopology?.markWriteValidated(mode);
      const verifiedTopology = resolveTopology(mode, scenario, liveTopology);
      if (execution.evidence) execution.evidence.label = verifiedTopology.evidenceLabel;
    } else if (execution.status === "acknowledged" && mode.startsWith("live") && execution.evidence) {
      execution.evidence.label = mode === "live-proxy-4" ? "EU 4-light quadrant-proxy command acknowledged" : "Live light command acknowledged; physical state not verified";
    }
    completeRequest(sessions, requestRecord, "completed");
    const result = {
      requestId: requestRecord.requestId,
      runId,
      scene: publicSmartHomeScene(scene),
      plan: publicSmartHomePlan(plan, scene),
      execution: smartHomeExecution(execution, executor),
      topology: publicSmartHomeTopology(resolveTopology(mode, scenario, liveTopology)),
    };
    if (executionNeedsRecoveryLock(execution, mode)) rememberUncertainRun(uncertainRuns, { sessionId, experienceId, runId, runKey, requestId: requestRecord.requestId, status: 200, body: result });
    rememberCompletedRun(completedRuns, runKey, { sessionId, experienceId, body: result });
    return timedSend(200, result);
  } catch (error) {
    const projected = publicError(error, { executionStarted });
    if (executionStarted) rememberUncertainRun(uncertainRuns, { sessionId, experienceId, runId, runKey, requestId: requestRecord.requestId, status: projected.status, body: projected });
    if (isCurrent(sessions, requestRecord)) {
      completeRequest(sessions, requestRecord, "error");
      rememberCompletedRun(completedRuns, runKey, { sessionId, experienceId, status: projected.status, body: projected });
    }
    return timedSend(projected.status, projected);
  } finally {
    const currentRun = activeRuns.get(runKey);
    if (currentRun?.request?.requestId === requestRecord.requestId && currentRun.request.sessionGeneration === requestRecord.sessionGeneration) activeRuns.delete(runKey);
  }
}

async function runExperience({ response, body, sessions, provider, executor, runtime, liveTopology, activeRuns, completedRuns, uncertainRuns, gardenRuns, garden }) {
  const timing = createRunTiming();
  const timedSend = (status, value) => sendJson(response, status, value, timingHeaders(timing));
  if (!isPlainObject(body)) return timedSend(400, { error: "invalid_json" });
  const experienceId = cleanText(body.experienceId, 64);
  if (!EXPERIENCE_IDS.has(experienceId) || !catalogItem(experienceId)) return timedSend(404, { error: "unknown_experience" });
  const sessionId = cleanText(body.sessionId, 80);
  const session = getSession(sessions, sessionId);
  if (!session) return timedSend(409, { error: "session_expired" });
  rejectPrivateRequestFields(body.input);
  const mode = runtime.mode;
  const scenario = runtime.scenario;
  const runId = cleanText(body.runId || body.requestId, 96) || crypto.randomUUID();
  const runKey = `${sessionId}:${experienceId}:${runId}`;
  purgeActiveRuns(activeRuns, completedRuns, sessions, gardenRuns, executor);
  purgeGardenRuns(gardenRuns, sessions);
  purgeUncertainRuns(uncertainRuns, sessions);
  const completed = completedRuns.get(runKey);
  if (completed?.sessionId === sessionId && completed.experienceId === experienceId) {
    return timedSend(Number.isInteger(completed.status) ? completed.status : 200, cloneValue(completed.body));
  }
  const uncertain = uncertainRuns.get(sessionId);
  if (uncertain) {
    if (uncertain.runKey === runKey) return timedSend(uncertain.status, cloneValue(uncertain.body));
    return timedSend(409, { error: "recovery_required", message: "Restart or restore the previous light interaction before starting another one.", retryDisposition: "restart" });
  }
  const active = activeRuns.get(runKey);
  if (active && (active.sessionId !== sessionId || active.experienceId !== experienceId)) return timedSend(409, { error: "request_id_conflict" });
  if (active) return timedSend(409, { error: "request_in_progress", message: "This visitor action is already running." });
  const activeForSession = [...activeRuns.values()].find((item) => item.sessionId === sessionId);
  if (activeForSession) return timedSend(409, { error: "request_in_progress", message: "Finish the current visitor action before starting another." });

  const gardenRunKey = experienceId === "intention-garden" ? sessionId : "";
  const existingGardenRun = gardenRunKey ? gardenRuns.get(gardenRunKey) : null;
  if (existingGardenRun) return timedSend(409, { error: "request_in_progress", message: "This visitor's garden seed is already being planted." });

  if (experienceId === "intention-garden" && sessions.hasGardenSeed?.(sessionId)) {
    return timedSend(409, { error: "garden_session_already_seeded", message: "This visitor session has already planted one garden seed." });
  }

  let input;
  const turnReceipt = cleanText(body.turnReceipt, 128);
  if (turnReceipt) {
    if (!TURN_EXPERIENCES.has(experienceId)) return timedSend(409, { error: "turn_not_supported" });
    const consumed = sessions.consumeTurn(sessionId, { receipt: turnReceipt, experienceId, phase: "A" });
    if (!consumed.ok) return timedSend(409, { error: consumed.reason });
    input = deriveTurnContinuation(experienceId, body.input, consumed.record.features);
  } else {
    input = deriveFeatures(experienceId, body.input);
  }

  const revision = providerRevision(provider);
  const requestRecord = beginRequest(sessions, sessionId, revision);
  if (!requestRecord) return timedSend(409, { error: "session_expired" });
  activeRuns.set(runKey, { runId, sessionId, experienceId, request: requestRecord });
  if (gardenRunKey && !existingGardenRun) gardenRuns.set(gardenRunKey, requestRecord);
  let executionStarted = false;
  const finishError = (status, error, message, retryDisposition = executionStarted ? "restart" : "new_run") => {
    const body = { error, message, status, retryDisposition };
    if (executionStarted) rememberUncertainRun(uncertainRuns, { sessionId, experienceId, runId, runKey, requestId: requestRecord.requestId, status, body });
    if (turnReceipt) sessions.completeTurn(sessionId, turnReceipt, "failed");
    if (isCurrent(sessions, requestRecord)) {
      completeRequest(sessions, requestRecord, "error");
      rememberCompletedRun(completedRuns, runKey, { sessionId, experienceId, status, body });
    }
    return sendJson(response, status, body, timingHeaders(timing));
  };
  try {
    if (experienceId === "no-shared-prompt") {
      if (input.inspectState !== true) {
        return finishError(400, "state_inspection_required", "This experience requires the server-side state inspection step.");
      }
      const observation = await measureRunStage(timing, "state", () => inspectStateObservation({ executor, runtime, liveTopology, requestId: requestRecord.requestId, signal: requestRecord.signal }));
      if (!observation.ok) {
        return finishError(503, "state_inspection_unavailable", "The bound installation could not be inspected, so no second composition was attempted.");
      }
      input = { ...input, stateObservation: observation.value, public: { ...input.public, stateObservation: observation.value } };
    }
    const interpreted = await measureRunStage(timing, "provider", () => mode.startsWith("live")
      ? provider.interpret({ experienceId, input, request: requestRecord, session })
      : { status: "fallback", plan: buildDeterministicPlan(experienceId, input, "deterministic") });
    if (!isCurrent(sessions, requestRecord)) return sendJson(response, 409, { error: "request_discarded" }, timingHeaders(timing));
    if (interpreted?.status === "discarded") return finishError(409, "request_discarded", "This visitor action was discarded before execution.", "restart");
    const plan = interpreted?.plan || buildDeterministicPlan(experienceId, input, "fallback");
    const checkedPlan = validateExperiencePlan(plan, experienceId);
    if (!checkedPlan.ok) {
      return finishError(422, "plan_rejected", "The generated light plan did not pass validation.");
    }
    if (mode.startsWith("live")) {
      resolveTopology(mode, "online", liveTopology);
    }
    executionStarted = true;
    const execution = await measureRunStage(timing, "execute", () => executor.execute(plan, {
      sessionId,
      requestId: requestRecord.requestId,
      generation: requestRecord.sessionGeneration,
      mode,
      scenario,
      signal: requestRecord.signal,
      // The exhibition visitor path uses a fixed command-acknowledged mode for
      // live control. The browser and Provider cannot opt into this flag. A
      // failed or cancelled dispatch still reconciles once inside the executor.
      verifyLive: mode.startsWith("live") ? false : true,
      isCurrent: () => isCurrent(sessions, requestRecord) && providerRevision(provider) === requestRecord.configRevision,
    }));
    if (!isCurrent(sessions, requestRecord)) {
      const body = { error: "request_discarded", message: "This visitor action was discarded after execution began.", status: 409, retryDisposition: "restart" };
      rememberUncertainRun(uncertainRuns, { sessionId, experienceId, runId, runKey, requestId: requestRecord.requestId, status: 409, body });
      return sendJson(response, 409, body, timingHeaders(timing));
    }
    if (execution.status === "success" && runtime.mode.startsWith("live")) {
      liveTopology?.markWriteValidated(runtime.mode);
      const verifiedTopology = resolveTopology(runtime.mode, runtime.scenario, liveTopology);
      if (execution.evidence) execution.evidence.label = verifiedTopology.evidenceLabel;
    } else if (execution.status === "acknowledged" && runtime.mode.startsWith("live") && execution.evidence) {
      execution.evidence.label = runtime.mode === "live-proxy-4"
        ? "EU 4-light quadrant-proxy command acknowledged"
        : "Live light command acknowledged; physical state not verified";
    }
    const gardenCommit = experienceId === "intention-garden"
      ? garden.commit({ sessionId, category: input.category, status: execution.status, isCurrent: () => isCurrent(sessions, requestRecord), claim: () => sessions.claimGardenSeed?.(sessionId) })
      : null;
    if (turnReceipt && execution.status === "success") sessions.completeTurn(sessionId, turnReceipt, "committed");
    completeRequest(sessions, requestRecord, "completed");
    const result = {
      requestId: requestRecord.requestId,
      plan: publicPlan(plan, experienceId),
      features: input.public,
      garden: gardenCommit?.public || undefined,
      execution: visitorExecution(execution, executor),
      topology: publicTopology(resolveTopology(mode, scenario, liveTopology)),
    };
    result.runId = runId;
    if (executionNeedsRecoveryLock(execution, mode)) rememberUncertainRun(uncertainRuns, { sessionId, experienceId, runId, runKey, requestId: requestRecord.requestId, status: 200, body: result });
    rememberCompletedRun(completedRuns, runKey, { sessionId, experienceId, body: result });
    return sendJson(response, 200, result, timingHeaders(timing));
  } catch (error) {
    const projected = publicError(error, { executionStarted });
    if (executionStarted) rememberUncertainRun(uncertainRuns, { sessionId, experienceId, runId, runKey, requestId: requestRecord.requestId, status: projected.status, body: projected });
    if (turnReceipt) sessions.completeTurn(sessionId, turnReceipt, "failed");
    if (isCurrent(sessions, requestRecord)) {
      completeRequest(sessions, requestRecord, "error");
      rememberCompletedRun(completedRuns, runKey, { sessionId, experienceId, status: projected.status, body: projected });
    }
    return sendJson(response, projected.status, projected, timingHeaders(timing));
  } finally {
    const currentRun = activeRuns.get(runKey);
    if (currentRun?.request?.requestId === requestRecord.requestId && currentRun.request.sessionGeneration === requestRecord.sessionGeneration) activeRuns.delete(runKey);
    if (gardenRunKey && gardenRuns.get(gardenRunKey)?.requestId === requestRecord.requestId) gardenRuns.delete(gardenRunKey);
  }
}

function deriveFeatures(experienceId, raw, options = {}) {
  const value = isPlainObject(raw) ? raw : {};
  if (experienceId === "fortune-light") {
    const date = cleanText(value.date, 10);
    const city = cleanText(value.city, 40);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !city) throw Object.assign(new Error("valid_date_and_city_required"), { statusCode: 400 });
    const seed = hash(`${date}:${city.toLowerCase()}`);
    const elements = ["Wood", "Fire", "Earth", "Metal", "Water"];
    const primary = elements[seed % elements.length];
    const secondary = elements[(seed >> 3) % elements.length] === primary ? elements[(seed + 1) % elements.length] : elements[(seed >> 3) % elements.length];
    return { primary, secondary, ratio: 55 + (seed % 21), public: { primary, secondary, ratio: 55 + (seed % 21) } };
  }
  if (experienceId === "memory-capsule") {
    const text = cleanText(value.text, 120);
    const mood = ["bright", "quiet", "curious", "steady"].includes(value.mood) ? value.mood : "steady";
    return { mood, lengthBucket: text.length < 30 ? "short" : text.length < 80 ? "medium" : "long", public: { mood, lengthBucket: text.length < 30 ? "short" : text.length < 80 ? "medium" : "long" } };
  }
  if (experienceId === "shared-breath") {
    const cadenceBand = normalizeCadence(value.cadence || value.tempo);
    return { cadenceBand, public: { cadenceBand } };
  }
  if (experienceId === "common-ground") {
    const groundCategory = normalizeGround(value.choice || value.groundChoice || value.right);
    return { groundCategory, public: { privateChoice: true } };
  }
  if (experienceId === "light-game-arena") {
    const rounds = normalizeGameRounds(value.rounds, boundedInteger(options.defaultRound, 0, 2, 0));
    const score = rounds.reduce((total, item) => total + (item.answer === GAME_ANSWERS[item.round] ? 1 : 0), 0);
    return { score, roundsCompleted: rounds.length, public: { score, roundsCompleted: rounds.length } };
  }
  if (experienceId === "light-dna") {
    const choices = normalizeDnaChoices(value.rounds);
    const intensity = averageBounded(value.intensity, 20, 80, 52);
    const signalBand = dnaSignalBand(choices);
    return { signalBand, ratio: intensity, roundsCompleted: choices.length, public: { signalBand, ratio: intensity, roundsCompleted: choices.length } };
  }
  if (experienceId === "sensory-translator") {
    const brightness = boundedInteger(value.comfortBrightness, 24, 72, 48);
    const pace = boundedInteger(value.motionPace, 0, 3, 1);
    const choices = [enumChoice(value.choices?.[0], TRANSLATION_CHOICES)].filter(Boolean);
    const comfort = brightness <= 40 ? "soft" : brightness >= 60 ? "vivid" : "balanced";
    const tempo = ["still", "measured", "restless", "restless"][pace];
    const scene = cleanText(value.scene, 24);
    return { choices, comfort, ratio: brightness, scene, tempo, public: { choices, comfort, ratio: brightness, scene, tempo } };
  }
  if (experienceId === "impossible-light") {
    const choices = [enumChoice(value.choices?.[0], IMPOSSIBLE_ONE), enumChoice(value.choices?.[1], IMPOSSIBLE_TWO)].filter(Boolean);
    const ratio = boundedInteger(value.resolutionBias, 25, 75, 50);
    return { choices, ratio, public: { choices, ratio } };
  }
  if (experienceId === "intention-garden") {
    const category = normalizeGardenCategory(value.intention || value.category || value.choices?.[0]);
    return { category, public: { category } };
  }
  if (experienceId === "no-shared-prompt") {
    const intent = normalizeStateIntent(value.intent || value.stateIntent);
    const inspectState = value.inspectState === true;
    return { intent, inspectState, public: { intent, inspectState } };
  }
  const choices = Array.isArray(value.choices) ? value.choices.filter((item) => typeof item === "string").map((item) => cleanText(item, 28)).filter(Boolean).slice(0, 4) : [];
  const numbers = Array.isArray(value.taps) ? value.taps.filter((item) => Number.isFinite(Number(item))).slice(0, 16).map((item) => Math.max(80, Math.min(1200, Math.round(Number(item))))) : [];
  const features = { choices, taps: numbers, comfort: ["soft", "balanced", "vivid"].includes(value.comfort) ? value.comfort : "balanced", scene: cleanText(value.scene, 24), tempo: cleanText(value.tempo, 16) };
  return { ...features, public: { choices, comfort: features.comfort, scene: features.scene, tempo: features.tempo, tapCount: numbers.length } };
}

function enumChoice(value, allowed) {
  const candidate = cleanText(value, 48);
  return allowed.has(candidate) ? candidate : "";
}

function averageBounded(value, minimum, maximum, fallback) {
  const values = Array.isArray(value) ? value : [value];
  const numbers = values.map((item) => Number(item)).filter(Number.isFinite).map((item) => boundedInteger(item, minimum, maximum, fallback));
  if (!numbers.length) return fallback;
  return boundedInteger(numbers.reduce((sum, item) => sum + item, 0) / numbers.length, minimum, maximum, fallback);
}

function normalizeDnaChoices(value) {
  if (!Array.isArray(value) || value.length !== DNA_CHOICES.length) throw Object.assign(new Error("light_dna_incomplete"), { statusCode: 400 });
  const choices = value.map((item, index) => {
    const answer = isPlainObject(item) ? item.answer : item;
    const normalized = enumChoice(answer, new Set(DNA_CHOICES[index] || []));
    if (!normalized) throw Object.assign(new Error("light_dna_incomplete"), { statusCode: 400 });
    return normalized;
  });
  return choices;
}

function dnaSignalBand(choices) {
  const score = choices.reduce((total, choice, index) => {
    const position = DNA_CHOICES[index].indexOf(choice);
    return total + (position / Math.max(1, DNA_CHOICES[index].length - 1)) * 100;
  }, 0) / DNA_CHOICES.length;
  if (score <= 33) return "quiet";
  if (score >= 67) return "expressive";
  return "balanced";
}

function normalizeGameRounds(value, defaultRound = 0) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const rounds = [];
  for (const [index, item] of value.slice(0, 3).entries()) {
    const answer = isPlainObject(item) ? item.answer : item;
    const suppliedRound = isPlainObject(item) ? item.round : undefined;
    const round = Number.isInteger(suppliedRound) ? suppliedRound : defaultRound + index;
    if (round < 0 || round >= GAME_ANSWERS.length || seen.has(round)) continue;
    const normalized = enumChoice(answer, new Set(GAME_CHOICES[round] || []));
    if (!normalized) continue;
    seen.add(round);
    rounds.push({ round, answer: normalized });
  }
  return rounds.sort((left, right) => left.round - right.round);
}

function deriveTurnStartFeatures(experienceId, raw) {
  const derived = deriveFeatures(experienceId, raw);
  if (experienceId === "shared-breath") return { private: { cadenceBand: derived.cadenceBand }, public: { phase: "A" } };
  if (experienceId === "common-ground") return { private: { groundCategory: derived.groundCategory }, public: { phase: "A", privateChoice: true } };
  if (experienceId === "light-game-arena") return { private: { gameScore: derived.score, roundsCompleted: derived.roundsCompleted }, public: { phase: "A", roundsCompleted: derived.roundsCompleted } };
  throw Object.assign(new Error("turn_not_supported"), { statusCode: 400 });
}

function deriveTurnContinuation(experienceId, raw, previous) {
  const current = deriveFeatures(experienceId, raw, { defaultRound: previous?.roundsCompleted });
  if (experienceId === "shared-breath") {
    return { cadenceA: previous.cadenceBand, cadenceB: current.cadenceBand, tempo: "shared", public: { turns: 2, cadenceBand: "shared" } };
  }
  if (experienceId === "common-ground") {
    const overlap = previous.groundCategory === current.groundCategory ? "direct" : "complementary";
    return { left: previous.groundCategory, right: current.groundCategory, overlap, public: { turns: 2, overlap } };
  }
  if (experienceId === "light-game-arena") {
    const score = Math.max(0, Math.min(3, Number(previous.gameScore) || 0)) + Math.max(0, Math.min(1, current.score));
    return { score, roundsCompleted: 3, public: { score, roundsCompleted: 3 } };
  }
  throw Object.assign(new Error("turn_not_supported"), { statusCode: 400 });
}

function normalizeCadence(value) {
  const text = String(value || "medium").toLowerCase();
  if (text.startsWith("quick")) return "quick";
  if (text.startsWith("slow")) return "slow";
  return "medium";
}

function normalizeGround(value) {
  const text = String(value || "focus").toLowerCase();
  if (text.includes("open")) return "openness";
  if (text.includes("color")) return "color";
  if (text.includes("quiet")) return "quiet";
  return "focus";
}

function normalizeGardenCategory(value) {
  const text = String(value || "wonder").toLowerCase();
  if (text.includes("welcome")) return "welcome";
  if (text.includes("focus")) return "focus";
  if (text.includes("ease")) return "ease";
  return "wonder";
}

function normalizeStateIntent(value) {
  const text = String(value || "Hold stillness").toLowerCase();
  if (text.includes("warm")) return "warmth";
  if (text.includes("focus")) return "focus";
  if (text.includes("bridge")) return "bridge";
  return "stillness";
}

function rejectPrivateRequestFields(input) {
  if (!isPlainObject(input)) return;
  const rejected = Object.keys(input).find((key) => PRIVATE_REQUEST_FIELDS.has(key));
  if (rejected) throw Object.assign(new Error("visitor_runtime_field_not_allowed"), { statusCode: 400, field: rejected });
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest().readUInt32BE(0);
}

function rememberUncertainRun(uncertainRuns, { sessionId, experienceId, runId, runKey, requestId, status, body }) {
  if (!uncertainRuns || !sessionId || !runKey) return;
  uncertainRuns.set(sessionId, { sessionId, experienceId, runId, runKey, requestId, status, body: cloneValue(body) });
}

function purgeUncertainRuns(uncertainRuns, sessions) {
  if (!uncertainRuns) return;
  for (const [sessionId] of uncertainRuns) if (!getSession(sessions, sessionId)) uncertainRuns.delete(sessionId);
}

function executionNeedsRecoveryLock(execution, mode) {
  if (!execution || execution.status === "success") return false;
  if (execution.status === "partial" || execution.status === "error") return true;
  return String(mode).startsWith("live") && execution.status === "blocked" && Boolean(execution.recovery?.needed);
}

function purgeActiveRuns(activeRuns, completedRuns, sessions, gardenRuns = null, executor = null) {
  for (const [runKey, record] of activeRuns) {
    if (!getSession(sessions, record.sessionId) || !sessions.isCurrent(record.request)) {
      activeRuns.delete(runKey);
      if (gardenRuns) clearGardenRunForRequest(gardenRuns, record.sessionId, record.request?.requestId);
      executor?.clearRecovery?.(record.sessionId);
    }
  }
  for (const [runKey, result] of completedRuns) {
    if (!getSession(sessions, result.sessionId)) completedRuns.delete(runKey);
  }
}

function purgeGardenRuns(gardenRuns, sessions) {
  for (const [sessionId, requestRecord] of gardenRuns) {
    if (!getSession(sessions, sessionId) || !sessions.isCurrent(requestRecord)) gardenRuns.delete(sessionId);
  }
}

function clearGardenRunForRequest(gardenRuns, sessionId, requestId) {
  if (gardenRuns.get(sessionId)?.requestId === requestId) gardenRuns.delete(sessionId);
}

function clearGardenRunsForSession(gardenRuns, sessionId) {
  gardenRuns.delete(sessionId);
}

function clearActiveRunsForSession(activeRuns, completedRuns, sessionId, gardenRuns = null) {
  for (const [runKey, record] of activeRuns) {
    if (record.sessionId !== sessionId) continue;
    activeRuns.delete(runKey);
    if (gardenRuns) clearGardenRunForRequest(gardenRuns, sessionId, record.request?.requestId);
  }
  for (const [runKey, result] of completedRuns) if (result.sessionId === sessionId) completedRuns.delete(runKey);
}

function rememberCompletedRun(completedRuns, runKey, result) {
  completedRuns.set(runKey, { sessionId: result.sessionId, experienceId: result.experienceId, status: Number.isInteger(result.status) ? result.status : 200, body: cloneValue(result.body) });
  while (completedRuns.size > 64) completedRuns.delete(completedRuns.keys().next().value);
}

function publicPlan(plan, experienceId) {
  const privateTurnCopy = {
    "shared-breath": {
      summary: "Two private cadences found a comfortable shared rhythm.",
      explanation: "Only the combined cadence category shaped the shared light sequence; each private turn stays out of the public result.",
    },
    "common-ground": {
      summary: "Two private priorities found a small, workable overlap.",
      explanation: "The installation resolves only the compatible overlap. The individual choices remain private to their turns.",
    },
    "light-game-arena": {
      summary: "The three-round light game resolved with a bounded score.",
      explanation: "The lights presented the questions; only the final score and completed rounds are shown in the result.",
    },
  }[experienceId];
  return {
    experienceId,
    aiRole: cleanText(plan.aiRole, 48),
    source: cleanText(plan.source, 24),
    summary: cleanText(privateTurnCopy?.summary || plan.summary, 180),
    explanation: cleanText(privateTurnCopy?.explanation || plan.explanation, 360),
  };
}

function publicSmartHomeScene(scene) {
  return {
    id: scene.id,
    title: cleanText(scene.title, 48),
    summary: cleanText(scene.summary, 180),
    intent: cleanText(scene.intent, 180),
    effect: cleanText(scene.effect, 220),
    accent: cleanText(scene.accent, 24),
  };
}

function publicSmartHomePlan(plan, scene) {
  return {
    source: "preset",
    summary: cleanText(scene.summary, 180),
    explanation: cleanText(plan.explanation, 360),
  };
}

function smartHomeExecution(execution, executor) {
  const safe = visitorExecution(execution, executor);
  // Scene controls are intentionally outcome-only. The public endpoint does
  // not need per-slot aliases or state rows to explain a preset response.
  const { physicalResults: _physicalResults, logicalStates: _logicalStates, ...publicResult } = safe;
  return publicResult;
}

function publicSmartHomeTopology(topology) {
  return {
    mode: cleanText(topology?.mode, 24, "unknown"),
    reduced: Boolean(topology?.reduced),
    physicalCount: boundedInteger(topology?.physicalCount, 0, LOGICAL_SLOTS.length, 0),
    logicalCount: boundedInteger(topology?.logicalCount, 0, LOGICAL_SLOTS.length, LOGICAL_SLOTS.length),
    evidenceLabel: cleanText(topology?.evidenceLabel, 100, "unverified"),
    scenario: cleanText(topology?.scenario, 32, "unknown"),
  };
}

function visitorExecution(execution, executor) {
  const safe = redactedExecution(execution);
  if (safe.recovery.restoreAvailable && typeof executor.recoverySummary === "function") {
    try {
      const recoveryRef = cleanText(executor.recoverySummary()?.recoveryRef, 128);
      if (recoveryRef) safe.recovery.recoveryRef = recoveryRef;
    } catch {
      // Recovery remains unavailable if the opaque reference cannot be projected.
    }
  }
  return safe;
}

async function inspectStateObservation({ executor, runtime, liveTopology, requestId, signal }) {
  try {
    const result = typeof executor.inspectState === "function"
      ? await executor.inspectState({ mode: runtime.mode, scenario: runtime.scenario, requestId, signal })
      : { ok: false, reason: "observation_api_unavailable" };
    if (!result?.ok || !Array.isArray(result.states) || result.states.length === 0) return { ok: false, reason: result?.reason || "state_query_failed" };
    const states = result.states;
    const online = states.filter((state) => state?.online !== false).length;
    const brightness = states.map((state) => Number(state?.brightness)).filter(Number.isFinite);
    const hues = states.map((state) => Number.isFinite(Number(state?.hue)) ? Number(state.hue) : colorToHue(state?.color)).filter(Number.isFinite);
    const averageBrightness = brightness.length ? brightness.reduce((sum, value) => sum + value, 0) / brightness.length : 0;
    const colorFamily = hues.length ? classifyColorFamily(hues) : "unknown";
    return {
      ok: true,
      value: {
        brightnessBand: averageBrightness < 34 ? "low" : averageBrightness > 68 ? "high" : "medium",
        colorFamily,
        onlineBand: result.source === "bounded_observation" ? "sampled-responsive" : online === states.length ? "all-online" : online === 0 ? "offline" : "mixed-online",
        sampleCoverage: projectSampleCoverage(result.sampleCoverage, states.length),
      },
    };
  } catch {
    return { ok: false, reason: "state_query_failed" };
  }
}

function projectSampleCoverage(coverage, sampledCount) {
  const sampled = Number.isInteger(coverage?.sampledCount) ? coverage.sampledCount : sampledCount;
  const total = Number.isInteger(coverage?.totalTargets) ? coverage.totalTargets : sampledCount;
  return {
    sampledCount: Math.max(0, Math.min(LOGICAL_SLOTS.length, sampled)),
    totalTargets: Math.max(0, Math.min(LOGICAL_SLOTS.length, total)),
    scope: cleanText(coverage?.scope || "state sample", 48),
  };
}

function colorToHue(value) {
  const color = Number(value);
  if (!Number.isInteger(color) || color < 0 || color > 0xffffff) return Number.NaN;
  const red = ((color >> 16) & 0xff) / 255;
  const green = ((color >> 8) & 0xff) / 255;
  const blue = (color & 0xff) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (!delta) return 0;
  const hue = max === red ? 60 * (((green - blue) / delta) % 6) : max === green ? 60 * (((blue - red) / delta) + 2) : 60 * (((red - green) / delta) + 4);
  return (hue + 360) % 360;
}

function classifyColorFamily(hues) {
  const average = hues.reduce((sum, value) => sum + ((value % 360) + 360) % 360, 0) / hues.length;
  return average >= 25 && average < 95 ? "warm" : average >= 95 && average < 210 ? "green-cyan" : average >= 210 && average < 300 ? "blue-violet" : "rose-red";
}

function createGardenAggregate({ maxPerCategory = 24, maxTotal = 96 } = {}) {
  const counts = Object.fromEntries([...GARDEN_CATEGORIES].map((category) => [category, 0]));
  return {
    commit({ category, status, isCurrent, claim }) {
      const normalized = GARDEN_CATEGORIES.has(category) ? category : "wonder";
      if (status !== "success" || isCurrent?.() === false) return { committed: false, duplicate: false, public: this.public() };
      const claimed = typeof claim === "function" ? claim() : { ok: true };
      if (!claimed?.ok) return { committed: false, duplicate: Boolean(claimed?.duplicate), public: this.public() };
      const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
      if (counts[normalized] < maxPerCategory && total < maxTotal) counts[normalized] += 1;
      return { committed: true, duplicate: false, public: this.public() };
    },
    public() { return { counts: { ...counts }, total: Object.values(counts).reduce((sum, value) => sum + value, 0), caps: { perCategory: maxPerCategory, total: maxTotal } }; },
    reset() { for (const category of GARDEN_CATEGORIES) counts[category] = 0; },
  };
}

function cloneValue(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function normalizeInstanceId(value) {
  if (value === undefined || value === "") return crypto.randomUUID();
  if (!validInstanceId(String(value))) throw new Error("service_instance_invalid");
  return String(value);
}

function normalizeOwnerToken(value) {
  if (value === undefined || value === "") return crypto.randomUUID();
  if (!validOwnerToken(String(value))) throw new Error("service_owner_token_invalid");
  return String(value);
}

function normalizeMode(value) {
  const mode = String(value || "mock-18");
  if (!MODES.has(mode)) throw Object.assign(new Error("unsupported_mode"), { statusCode: 400 });
  return mode;
}

function normalizeLiveContext(options) {
  const profile = cleanText(options.profile, 64);
  const region = cleanText(options.region, 8).toLowerCase();
  const houseId = cleanText(options.houseId || options.house_id, 32);
  const runtimeBin = cleanText(options.runtimeBin, 240);
  if (profile !== "ifa-eu" || region !== "eu" || !/^\d{1,32}$/.test(houseId)) throw Object.assign(new Error("live_context_fixed_to_ifa_eu"), { statusCode: 400 });
  if (!runtimeBin || !path.isAbsolute(runtimeBin)) throw Object.assign(new Error("live_runtime_binary_required"), { statusCode: 400 });
  return { profile, region, houseId, runtimeBin };
}

function resolveTopology(mode, scenario, liveTopology) {
  if (String(mode).startsWith("live")) return liveTopology?.get(mode) || (() => { throw new Error("live_topology_unavailable"); })();
  return createTopology(mode, scenario);
}

function normalizeScenario(value) {
  const scenario = String(value || "online");
  if (!SCENARIOS.has(scenario)) throw Object.assign(new Error("unsupported_scenario"), { statusCode: 400 });
  return scenario;
}

function providerRevision(provider) {
  if (typeof provider.configRevision === "function") return provider.configRevision();
  const status = typeof provider.status === "function" ? provider.status() : null;
  return Number(provider.revision || status?.configRevision || 0);
}

function getSession(store, id) {
  return store.getSession ? store.getSession(id) : store.get(id);
}

function beginRequest(store, sessionId, revision) {
  return store.createRequest ? store.createRequest(sessionId, revision) : store.beginRequest(sessionId, revision);
}

function completeRequest(store, requestRecord, status) {
  if (store.complete) store.complete(requestRecord, status);
  else requestRecord.state = status;
}

function isCurrent(store, requestRecord) {
  return store.isCurrent ? store.isCurrent(requestRecord) : Boolean(requestRecord?.state === "active");
}

function invalidateSession(store, sessionId, reason) {
  if (store.invalidate) store.invalidate(sessionId, reason);
  else if (store.finish) store.finish(sessionId, reason);
}

function publicSession(session) {
  return { sessionId: cleanText(session.sessionId || session.id, 80), generation: session.generation, configRevision: session.configRevision || 0, expiresAt: session.expiresAt };
}

function publicProviderStatus(provider) {
  const status = typeof provider.status === "function" ? provider.status() : {};
  return {
    configured: Boolean(status.configured),
    state: cleanText(status.state, 32, "unconfigured"),
    mode: cleanText(status.mode, 32, "unconfigured"),
    configRevision: Number.isInteger(status.configRevision) ? status.configRevision : 0,
  };
}

function isAllowedHost(request, port, server) {
  const host = String(request.headers.host || "");
  const actualPort = server.address()?.port || port;
  return host === `127.0.0.1:${actualPort}`;
}

function checkPostBoundary(request, port, server) {
  const expectedOrigin = `http://127.0.0.1:${server.address()?.port || port}`;
  const origin = request.headers.origin;
  const fetchSite = String(request.headers["sec-fetch-site"] || "");
  return origin === expectedOrigin && fetchSite !== "cross-site" && fetchSite !== "same-site";
}

async function readJson(request) {
  const contentType = String(request.headers["content-type"] || "");
  if (!contentType.startsWith("application/json")) throw Object.assign(new Error("json_required"), { statusCode: 415 });
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("body_too_large"), { statusCode: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw Object.assign(new Error("invalid_json"), { statusCode: 400 }); }
}

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; frame-ancestors 'none'", ...headers });
  response.end(status === 204 ? undefined : JSON.stringify(value));
}

function createRunTiming() {
  return { startedAt: process.hrtime.bigint(), state: 0, provider: 0, execute: 0 };
}

async function measureRunStage(timing, name, operation) {
  const startedAt = process.hrtime.bigint();
  try {
    return await operation();
  } finally {
    timing[name] = durationMs(startedAt);
  }
}

function timingHeaders(timing) {
  const metrics = [
    ["ile-total", durationMs(timing.startedAt)],
    ["ile-state", timing.state],
    ["ile-provider", timing.provider],
    ["ile-execute", timing.execute],
  ];
  return { "server-timing": metrics.map(([name, duration]) => `${name};dur=${duration}`).join(", ") };
}

function durationMs(startedAt) {
  const value = Number(process.hrtime.bigint() - startedAt) / 1e6;
  return Math.max(0, Math.min(600000, Math.round(Number.isFinite(value) ? value : 0)));
}

function serveStatic(response, pathname) {
  if (pathname === "/favicon.ico") return sendJson(response, 204, {});
  const requested = pathname === "/" ? "/index.html" : pathname === "/staff" ? "/staff.html" : pathname;
  const file = path.resolve(webRoot, `.${decodeURIComponent(requested)}`);
  let realFile;
  let realRoot;
  try {
    realRoot = fs.realpathSync(webRoot);
    realFile = fs.realpathSync(file);
  } catch {
    return sendJson(response, 404, { error: "not_found" });
  }
  if (!realFile.startsWith(`${realRoot}${path.sep}`) || !fs.statSync(realFile).isFile()) return sendJson(response, 404, { error: "not_found" });
  response.writeHead(200, { "content-type": MIME.get(path.extname(realFile)) || "application/octet-stream", "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'self'; connect-src 'self' http://127.0.0.1:8789; frame-ancestors 'none'" });
  fs.createReadStream(realFile).pipe(response);
}

function publicError(error, { executionStarted = false } = {}) {
  const known = new Map([
    ["valid_date_and_city_required", [400, "valid_input", "Enter a valid date and birthplace."]],
    ["light_dna_incomplete", [400, "light_dna_incomplete", "Complete all four light signals before revealing the signature."]],
    ["unsupported_mode", [400, "unsupported_mode", "This installation mode is unavailable."]],
    ["live_binding_topology_mismatch", [503, "live_binding_topology_mismatch", "The saved light binding does not match the requested installation mode."]],
    ["unsupported_scenario", [400, "unsupported_scenario", "This test scenario is unavailable."]],
    ["json_required", [415, "json_required", "This action requires a JSON request."]],
    ["invalid_json", [400, "invalid_json", "The request could not be read."]],
    ["body_too_large", [413, "body_too_large", "The request is too large."]],
    ["turn_not_supported", [404, "turn_not_supported", "This experience does not use a sequential turn."]],
    ["turn_unavailable", [409, "turn_unavailable", "That private turn is no longer available."]],
    ["turn_expired", [409, "turn_expired", "That private turn has expired."]],
    ["turn_replayed", [409, "turn_replayed", "That private turn has already been used."]],
    ["unknown_smart_home_scene", [404, "unknown_smart_home_scene", "That Smart Home scene is not available."]],
    ["smart_home_run_id_required", [400, "smart_home_run_id_required", "A non-empty runId is required."]],
    ["recovery_required", [409, "recovery_required", "Restart or restore the previous light interaction before starting another one."]],
    ["request_in_progress", [409, "request_in_progress", "This visitor action is already in progress."]],
    ["request_id_conflict", [409, "request_id_conflict", "This run id is already bound to another experience."]],
    ["garden_session_already_seeded", [409, "garden_session_already_seeded", "This visitor session has already planted one garden seed."]],
    ["state_inspection_required", [400, "state_inspection_required", "Allow the server to inspect the bound light state for this experience."]],
    ["state_inspection_unavailable", [503, "state_inspection_unavailable", "The installation state could not be inspected, so the experience was not run."]],
    ["visitor_runtime_field_not_allowed", [400, "visitor_runtime_field_not_allowed", "This request contains a field reserved for the local adapter."]],
    ["live_context_fixed_to_ifa_eu", [400, "live_context_fixed_to_ifa_eu", "Live mode is reserved for the approved ifa-eu EU profile."]],
  ]);
  const [status, code, message] = known.get(error?.message) || [500, "experience_failed", "The experience could not complete."];
  const restartOnly = new Set(["valid_input", "light_dna_incomplete", "turn_not_supported", "turn_unavailable", "turn_expired", "turn_replayed", "unknown_smart_home_scene", "smart_home_run_id_required", "recovery_required", "request_in_progress", "request_id_conflict", "garden_session_already_seeded", "state_inspection_required", "visitor_runtime_field_not_allowed", "live_context_fixed_to_ifa_eu", "session_expired", "request_discarded"]);
  const retryDisposition = executionStarted || restartOnly.has(code) ? "restart" : "new_run";
  return { error: code, message, status, retryDisposition };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createInteractiveServer({ port: Number(process.env.YEELIGHT_ILE_PORT || 8787) });
  app.server.listen(app.port, "127.0.0.1", () => {
    process.stdout.write(`Yeelight interactive experiences: http://127.0.0.1:${app.port}\n`);
    process.stdout.write(`Provider setup: http://127.0.0.1:${app.port}/staff\n`);
  });
}
