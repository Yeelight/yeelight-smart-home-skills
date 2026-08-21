import http from "node:http";
import crypto from "node:crypto";
import { CatalogAdapter, ArtworkAdapter } from "./lib/external.mjs";
import { assertRequest, CinemaError, FADE_DURATION_MS, LIVE_MAX_BRIGHTNESS, MAX_TARGETS, publicError, publicSession, publicTarget, randomOpaque } from "./lib/contracts.mjs";
import { chunkPlan, createLightingPlan, mergeReceipts, MAX_WAVE_SIZE, selectLightingWindow } from "./lib/lighting.mjs";
import { CinemaSessionStore } from "./lib/session.mjs";
import { MockRuntimeAdapter } from "./lib/mock.mjs";
import { classifyDesignBatchReceipt, classifyDesignReceipt, normalizeRuntimeContext, YeelightHomeRuntimeAdapter } from "./lib/runtime-adapter.mjs";
import { expireActiveSession, invalidateSession, renewProof, requireLiveSession, scheduleSessionExpiry, validProof } from "./lib/lifecycle.mjs";
import { allowedHost, readJson, sameOrigin, sameOriginGet, securityHeaders, sendJson, serveArtwork, serveStatic } from "./lib/http.mjs";
import { applyOne, hasPendingRecovery, loadValidationRecovery, pruneRecoveryRecords, refreshLiveTargets } from "./lib/validation.mjs";
import { DEFAULT_RECOVERY_PATH } from "./lib/validation-store.mjs";
import { DEFAULT_SCREENING_RECOVERY_PATH } from "./lib/screening-recovery-store.mjs";
import { STOP_PHASE_CONCURRENCY, STOP_PHASE_TIMEOUT_MS, createScreeningRecoveryRecord, findScreeningRecovery, hasAnyPendingRecovery, loadScreeningRecovery, persistScreeningRecovery, pruneScreeningRecoveryRecords, recordScreeningStates, recoverScreeningRequest as recoverScreeningRequestWithDeps } from "./lib/screening-recovery.mjs";
import { createStopExecutor, stateMatchesPreState } from "./lib/screening-stop.mjs";
import { createSnapshotFinalizer } from "./lib/screening-finalize.mjs";
import { prepareValidationRequest, recoverValidationRequest, runValidationRequest } from "./lib/validation-routes.mjs";
import { createTickRunner } from "./lib/tick-execution.mjs";
import { executeBatchWindow } from "./lib/tick-batch.mjs";

// Every live frame covers the frozen selected target set. Runtime calls remain
// bounded so a 160-light screening cannot create an unbounded process burst.
const LIVE_TICK_WINDOW_SIZE = MAX_TARGETS;
// EU Runtime latency is dominated by per-target network round trips. Keep the
// pool bounded, but allow one additional wave of the normal 18-light home.
export const LIVE_TICK_CONCURRENCY = 12;
// Keep explicitly retryable outages alive long enough for a transient
// home/network issue to recover. A persistent all-failed outage still stops
// after a bounded grace period so an unattended session cannot run forever.
export const MAX_CONSECUTIVE_RECOVERABLE_FAILURE_WINDOWS = 300;
const validationRouteDeps = { enqueueTransition, assertWritable, hasPendingRecoveryState };
export function createCinemaServer(options = {}) {
  const mode = options.mode === "live" ? "live" : "mock";
  const clock = options.clock || Date.now;
  const context = mode === "live" ? normalizeRuntimeContext(options.context, { required: true }) : {};
  const runtime = options.runtime || (mode === "live" ? new YeelightHomeRuntimeAdapter({ live: true, binary: options.runtimeBin, context }) : new MockRuntimeAdapter({ count: options.mockCount || 2 }));
  const sessions = options.sessions || new CinemaSessionStore({ timeoutMs: options.sessionTimeoutMs, clock });
  const catalog = options.catalog || new CatalogAdapter({ fixtures: options.fixtures });
  const artwork = options.artwork || new ArtworkAdapter({ transport: options.artworkTransport, clock: options.clock });
  const pageProof = crypto.randomBytes(24).toString("base64url");
  const targetBook = new Map();
  const instanceId = options.instanceId || process.env.YEELIGHT_CINEMA_INSTANCE || randomOpaque("i");
  const app = { mode, runtime, sessions, catalog, artwork, targetBook, context, startupSignal: options.startupSignal, hostToken: typeof options.hostToken === "string" ? options.hostToken : "", recoveryPath: mode === "live" ? options.recoveryPath || DEFAULT_RECOVERY_PATH : null, screeningRecoveryPath: mode === "live" ? options.screeningRecoveryPath || DEFAULT_SCREENING_RECOVERY_PATH : null, recoveryRecords: new Map(), screeningRecoveryRecords: new Map(), screeningWriteEvidence: new Map(), validationGrants: new Map(), validationScope: new Map(), validationActive: false, liveValidationPassed: mode !== "live", pageProof, pageProofIssuedAt: clock(), clock, instanceId, port: options.port || 8789, fadeMs: Number.isInteger(options.fadeMs) ? options.fadeMs : FADE_DURATION_MS, activeWorker: null, transition: Promise.resolve(), expiryTimers: new Map(), shuttingDown: false, shutdownPromise: null };
  app.stopExecutor = createStopExecutor({ executeTarget, executeBatch: executeBatchRows, queryState: async (owner, target, signal) => owner.runtime.queryState([target], signal), queryStateBatch: typeof runtime.queryStateBatch === "function" ? async (owner, targets, signal, options) => owner.runtime.queryStateBatch(targets, signal, options) : null, maxWaveSize: MAX_WAVE_SIZE, concurrency: STOP_PHASE_CONCURRENCY, timeoutMs: STOP_PHASE_TIMEOUT_MS });
  app.finalizeSnapshot = createSnapshotFinalizer({ cancelActiveWorker });
  const ready = loadTargets(app);
  const server = http.createServer((request, response) => handleRequest(app, request, response));
  app.server = server;
  app.ready = ready;
  return app;
}
async function loadTargets(app) {
  if (app.mode === "live") {
    await loadValidationRecovery(app);
    await loadScreeningRecovery(app);
  }
  const devices = await app.runtime.discover(app.startupSignal);
  for (const device of devices) {
    const handle = randomOpaque("h");
    const target = { ...device, handle };
    app.targetBook.set(handle, target);
  }
  return app;
}
async function handleRequest(app, request, response) {
  try {
    if (!allowedHost(request, app)) return sendJson(response, 403, { error: "loopback_only", message: "The local host is required." });
    const url = new URL(request.url || "/", `http://127.0.0.1:${app.port}`);
    const result = url.pathname.startsWith("/api/")
      ? await handleApi(app, request, response, url)
      : request.method !== "GET" && request.method !== "HEAD"
        ? sendJson(response, 405, { error: "method_not_allowed", message: "The method is not allowed." })
        : await serveStatic(app, response, url.pathname, request.method === "HEAD");
    return result?.__result ? sendJson(response, result.status, result.value) : result;
  } catch (error) {
    const projected = publicError(error);
    return sendJson(response, projected.status, projected);
  }
}
async function handleApi(app, request, response, url) {
  if (request.method === "OPTIONS") return sendJson(response, 405, { error: "method_not_allowed", message: "Cross-origin preflight is not supported." });
  if (app.shuttingDown && url.pathname !== "/api/health") return sendJson(response, 503, { error: "service_shutting_down", message: "The cinema service is shutting down." });
  const hostValidation = url.pathname.startsWith("/api/host/validation/") || url.pathname.startsWith("/api/host/screening/");
  if (hostValidation && !validHostToken(request, app)) return sendJson(response, 403, { error: "host_confirmation_required", message: "The AI host must authorize this physical validation." });
  const renewalRequest = request.method === "POST" && url.pathname === "/api/proof/renew";
  if (!hostValidation && request.method === "POST" && !sameOrigin(request, app)) return sendJson(response, 403, { error: "same_origin_required", message: "A same-origin page proof is required." });
  if (!hostValidation && request.method === "POST" && !validProof(request, app, { allowRenewal: renewalRequest })) return sendJson(response, 403, { error: "page_proof_required", message: "The page session proof is invalid or expired." });
  if (!hostValidation && request.method === "GET" && url.pathname !== "/api/health" && (!sameOriginGet(request, app) || !validProof(request, app))) return sendJson(response, 403, { error: "page_proof_required", message: "The page session proof is invalid or expired." });
  const suppliedProof = String(request.headers["x-cinema-proof"] || "");
  await expireActiveSession(app, enqueueTransition, finalizeSnapshot);
  await pruneRecoveryRecords(app);
  await pruneScreeningRecoveryRecords(app);
  if (request.method === "GET" && url.pathname === "/api/health") return sendJson(response, 200, { ok: true, serviceId: "yeelight-cinema-director", instanceId: app.instanceId, mode: app.mode, controlMode: app.mode === "live" ? app.context.controlMode || "configured" : "mock", lanConfigured: app.mode === "live" ? Boolean(app.context.gatewayIp || app.context.lanEndpoint) : false, targetCount: app.targetBook.size, validationReady: app.mode !== "live" ? true : app.liveValidationPassed, recoveryRequired: hasPendingRecoveryState(app, app.sessions.active()?.id || "") });
  if (request.method === "GET" && url.pathname === "/api/devices") return sendJson(response, 200, { devices: [...app.targetBook.values()].filter((target) => target.online).map(publicTarget) });
  if (request.method === "GET" && url.pathname === "/api/catalog/movies") {
    const movies = await app.catalog.searchMovies(url.searchParams.get("q") || "");
    return sendJson(response, 200, { movies: movies.map((movie) => publicMovie(app, movie)) });
  }
  if (request.method === "GET" && url.pathname === "/api/catalog/songs") return sendJson(response, 200, { songs: await app.catalog.searchSongs({ title: url.searchParams.get("movie") || "" }) });
  if (request.method === "GET" && url.pathname === "/api/catalog/youtube") return sendJson(response, 200, { videos: await app.catalog.searchYouTube({ title: url.searchParams.get("song") || "" }) });
  const artworkMatch = url.pathname.match(/^\/api\/artwork\/([A-Za-z0-9_-]{20,96})$/);
  if (request.method === "GET" && artworkMatch) {
    return serveArtwork(app, response, artworkMatch[1], suppliedProof);
  }
  if (request.method !== "POST") return sendJson(response, 404, { error: "not_found", message: "The route was not found." });
  const body = assertRequest(await readJson(request), url.pathname);
  if (url.pathname === "/api/proof/renew") { assertWritable(app); return sendJsonResult(200, renewProof(app, suppliedProof)); }
  if (url.pathname === "/api/validation/prepare" || url.pathname === "/api/validation/run" || url.pathname === "/api/validation/recover" || url.pathname === "/api/screening/recover") throw new CinemaError("host_confirmation_required", "Physical recovery is controlled by the AI host after conversational confirmation.", 403);
  if (url.pathname === "/api/host/validation/prepare") return prepareValidationRequest(app, body, validationRouteDeps);
  if (url.pathname === "/api/host/validation/run") return runValidationRequest(app, request, body, validationRouteDeps);
  if (url.pathname === "/api/host/validation/recover") return recoverValidationRequest(app, body, validationRouteDeps);
  if (url.pathname === "/api/host/screening/recover") return recoverScreeningRequest(app, body);
  if (url.pathname === "/api/session") return createSession(app, body);
  if (url.pathname === "/api/session/start") return startSession(app, body);
  if (url.pathname === "/api/session/tick") return tickSession(app, body);
  if (url.pathname === "/api/session/pause") return pauseSession(app, body);
  if (url.pathname === "/api/session/clear") return clearPreparedSession(app, body);
  if (url.pathname === "/api/session/stop") return stopSession(app, body);
  return sendJson(response, 404, { error: "not_found", message: "The route was not found." });
}
function createSession(app, body) {
  return enqueueTransition(app, async () => {
    assertWritable(app);
    if (app.mode === "live" && hasPendingRecoveryState(app)) throw new CinemaError("recovery_required", "Restore the previous physical or screening recovery before starting another live session.", 409);
    if (!Array.isArray(body.handles) || body.handles.length < 1) throw new CinemaError("targets_required", "Choose at least one discovered light.", 400);
    const active = app.sessions.active();
    if (active && active.state !== "stopped") {
      const snapshot = app.sessions.snapshot(active.id);
      invalidateSession(app, active.id, "replaced");
      await finalizeSnapshot(app, snapshot); assertWritable(app);
    }
    const roleMap = body.roles || {};
    let rawTargets = body.handles.map((handle) => ({ ...app.targetBook.get(handle), role: roleMap[handle] || "" }));
    if (rawTargets.some((target) => !target || !target.online)) throw new CinemaError("target_unavailable", "A selected light is unavailable.", 409);
    if (app.mode === "live" && app.liveValidationPassed) {
      assertLiveValidationScope(app, rawTargets);
      rawTargets = await refreshLiveTargets(app.runtime, rawTargets);
    } else if (app.mode === "live") {
      rawTargets = await refreshLiveTargets(app.runtime, rawTargets);
    }
    const session = app.sessions.create(rawTargets);
    if (app.mode === "live") app.screeningWriteEvidence.set(session.id, new Set());
    scheduleSessionExpiry(app, session, enqueueTransition, finalizeSnapshot);
    return sendJsonResult(201, { status: "ok", session: publicSession(session) });
  });
}
function startSession(app, body) {
  return requireLiveSession(app, body.sessionId, enqueueTransition, finalizeSnapshot).then(async (session) => {
    assertWritable(app);
    if (app.mode === "live" && hasPendingRecoveryState(app, session.id)) throw new CinemaError("recovery_required", "Restore the previous physical or screening recovery before starting another live session.", 409);
    if (app.mode === "live" && !app.liveValidationPassed) throw new CinemaError("validation_required", "Complete the bounded physical validation before starting a live screening.", 409);
    if (app.mode === "live") assertLiveValidationScope(app, session.targets);
    if (body.generation !== undefined && body.generation !== session.generation) throw new CinemaError("stale_session", "The screening generation is no longer current.", 409);
    // Write the screening journal before the first live frame so a process crash
    // cannot leave selected lights without a durable restore scope.
    if (app.mode === "live" && !findScreeningRecovery(app, session.id)) await persistScreeningRecovery(app, createScreeningRecoveryRecord(app, session.targets, session.id));
    const next = app.sessions.begin(session.id);
    return sendJsonResult(200, { status: "ok", session: app.sessions.public(next.id) });
  });
}
async function tickSession(app, body) {
  const session = await requireLiveSession(app, body.sessionId, enqueueTransition, finalizeSnapshot);
  assertWritable(app);
  if (app.mode === "live" && hasPendingRecoveryState(app, session.id)) throw new CinemaError("recovery_required", "Restore the previous physical or screening recovery before sending a live frame.", 409);
  if (app.mode === "live" && !app.liveValidationPassed) throw new CinemaError("validation_required", "Complete the bounded physical validation before sending a live frame.", 409);
  if (app.validationActive) throw new CinemaError("validation_busy", "Physical validation currently owns the light targets.", 409);
  if (!app.sessions.current(session.id, body.generation)) throw new CinemaError("stale_session", "The screening generation is no longer current.", 409);
  if (!app.sessions.canSendFrame(session.id, body.generation, app.clock())) return sendJsonResult(202, { status: "skipped", reason: "cadence" });
  const frame = app.mode === "live" ? { ...body.frame, brightness: Math.min(body.frame.brightness, LIVE_MAX_BRIGHTNESS) } : body.frame;
  const plan = createLightingPlan(session.targets, frame, session.wave);
  if (app.activeWorker) return sendJsonResult(202, { status: "skipped", reason: "busy" });
  const controller = new AbortController();
  const worker = { sessionId: session.id, generation: body.generation, controller, promise: runTick(app, session, body.generation, plan, controller.signal) };
  app.activeWorker = worker;
  try {
    const receipts = await worker.promise;
    const result = mergeReceipts(session.targets, receipts);
    if (!app.sessions.current(session.id, body.generation)) return sendJsonResult(409, { status: "stale", receipt: result });
    if (app.mode === "live") {
      const window = selectLightingWindow(plan, session.cursor, LIVE_TICK_WINDOW_SIZE);
      const selectedHandles = new Set(window.map((row) => row.handle));
      const selectedRows = result.rows.filter((row) => selectedHandles.has(row.handle));
      const selectedAcknowledged = selectedRows.filter((row) => ["acknowledged", "verified"].includes(row.status)).length;
      const selectedFailures = selectedRows.filter((row) => row.status === "failed");
      const selectedStatusesValid = selectedRows.length === window.length
        && selectedRows.every((row) => ["acknowledged", "verified", "failed"].includes(row.status))
        && selectedFailures.every((row) => row.retryable === true);
      const failureStreak = app.sessions.recordWindowResult(session.id, selectedAcknowledged);
      const failureBudgetExhausted = selectedAcknowledged === 0 && failureStreak > MAX_CONSECUTIVE_RECOVERABLE_FAILURE_WINDOWS;
      result.window = {
        selectedCount: selectedRows.length,
        acknowledgedCount: selectedAcknowledged,
        failedCount: selectedFailures.length,
        continuable: selectedStatusesValid && !failureBudgetExhausted,
        consecutiveFailureWindows: failureStreak,
        failureBudgetRemaining: Math.max(0, MAX_CONSECUTIVE_RECOVERABLE_FAILURE_WINDOWS - failureStreak),
      };
      if (!result.window.continuable) {
        const termination = await finalizeTickTermination(app, session, body.generation, "partial_tick_window_failed");
        if (!termination) return sendJsonResult(409, { status: "stale", receipt: result });
        const terminalResult = termination?.__result ? termination.value : termination;
        return sendJsonResult(409, { status: "stale", receipt: result, termination: terminalResult });
      }
    }
    app.sessions.nextWave(session.id);
    if (app.mode === "live") app.sessions.advanceCursor(session.id, session.targets.length);
    return sendJsonResult(result.status === "acknowledged" ? 200 : 207, { status: result.status, receipt: result });
  } catch (error) {
    if (app.mode === "live" && app.sessions.current(session.id, body.generation)) {
      const termination = await finalizeTickTermination(app, session, body.generation, "tick_failed");
      if (termination) {
        const terminalResult = termination?.__result ? termination.value : termination;
        return sendJsonResult(409, { status: "stale", reason: "tick_failed", termination: terminalResult });
      }
    }
    throw error;
  } finally {
    if (app.activeWorker === worker) app.activeWorker = null;
  }
}

function finalizeTickTermination(app, session, generation, reason) {
  return enqueueTransition(app, async () => {
    if (!app.sessions.current(session.id, generation)) return null;
    const snapshot = app.sessions.snapshot(session.id);
    const screeningRecord = findScreeningRecovery(app, snapshot.id);
    if (!screeningRecord) {
      const recovery = createScreeningRecoveryRecord(app, snapshot.targets, snapshot.id);
      recovery.touchedHandles = snapshot.targets.map((target) => target.handle);
      recovery.pendingHandles = [...recovery.touchedHandles];
      recovery.phase = "recovery";
      await persistScreeningRecovery(app, recovery);
      invalidateSession(app, session.id, reason);
      app.sessions.remove(session.id);
      app.screeningWriteEvidence?.delete(session.id);
      return sendJsonResult(409, {
        status: "uncertain",
        reason: "recovery_record_missing",
        receipt: {
          phase: "screening",
          status: "uncertain",
          acknowledged: false,
          physicalVerified: false,
          restored: false,
          rows: snapshot.targets.map((target) => ({ handle: target.handle, status: "unverified" })),
          recoveryQueue: recovery.pendingHandles,
          recoveryId: recovery.id,
        },
      });
    }
    invalidateSession(app, session.id, reason);
    // Finalize against the complete frozen snapshot. The finalizer performs a
    // query-first eligibility check and only writes targets with live evidence,
    // so unstarted workers remain untouched while their recovery scope stays
    // visible to the final readback.
    return finalizeSnapshot(app, snapshot);
  });
}
async function pauseSession(app, body) {
  const session = await requireLiveSession(app, body.sessionId, enqueueTransition, finalizeSnapshot);
  assertWritable(app);
  if (body.generation !== undefined && body.generation !== session.generation) throw new CinemaError("stale_session", "The screening generation is no longer current.", 409);
  const next = app.sessions.pause(session.id);
  await cancelActiveWorker(app, session.id);
  return sendJsonResult(200, { status: "ok", session: app.sessions.public(next.id) });
}
function clearPreparedSession(app, body) {
  return enqueueTransition(app, async () => {
    assertWritable(app); const session = await requireLiveSession(app, body.sessionId, enqueueTransition, finalizeSnapshot, true); if (!Number.isInteger(body.generation) || body.generation !== session.generation) throw new CinemaError("stale_session", "The screening generation is no longer current.", 409); if (session.state !== "ready" || session.startedAt) throw new CinemaError("clear_requires_prepared", "Only a prepared screening can be cleared.", 409);
    invalidateSession(app, session.id, "clear"); app.sessions.remove(session.id); app.screeningWriteEvidence?.delete(session.id); return sendJsonResult(200, { status: "cancelled", receipt: { rows: [], physicalVerified: false, restored: false, preparedOnly: true, recoveryQueue: [] } });
  });
}
function stopSession(app, body) {
  return enqueueTransition(app, async () => {
    assertWritable(app); const session = await requireLiveSession(app, body.sessionId, enqueueTransition, finalizeSnapshot, true);
    if (!Number.isInteger(body.generation) || body.generation !== session.generation) throw new CinemaError("stale_session", "The screening generation is no longer current.", 409);
    const snapshot = app.sessions.snapshot(session.id);
    invalidateSession(app, session.id, "stop");
    return finalizeSnapshot(app, snapshot);
  });
}
async function executeTarget(app, target, row, signal, forceDesign = false, options = {}) {
  const request = { ...row, runtimeId: target.runtimeId };
  if (target.capabilities.flow && !forceDesign) return app.runtime.executeFlow(request, signal, options);
  // EU live playback uses the verified single-property Runtime intents. Keep
  // design writes for mock playback and the power-inclusive stop/recovery path.
  if (app.mode === "live" && !forceDesign && typeof app.runtime.applyProperties === "function") {
    const result = await applyOne(app, target, request.set, signal, { ...options, parallelProperties: true });
    return result?.status === "acknowledged"
      ? { handle: row.handle, status: "acknowledged" }
      : { handle: row.handle, status: "failed" };
  }
  const result = await app.runtime.applyDesign([request], signal, forceDesign ? { retrySafeError: false } : options);
  if (app.mode === "live") {
    const expectedSet = Object.fromEntries(Object.entries(request.set || {}).filter(([property]) => ["power", "brightness", "colorTemperature", "color"].includes(property)));
    const formalStatus = classifyDesignReceipt(result, target.runtimeId, expectedSet);
    if (formalStatus === "bound_verification_mismatch") return { handle: row.handle, status: "failed", reason: "runtime_write_verification_mismatch", failureClass: "verification", retryable: true };
    if (!Object.keys(expectedSet).length || formalStatus !== "verified") return { handle: row.handle, status: "failed" };
    return { handle: row.handle, status: "acknowledged" };
  }
  const rowResult = result?.rows?.find((item) => item.handle === row.handle);
  return rowResult || { status: result?.status === "acknowledged" ? "acknowledged" : "failed" };
}
const runTick = createTickRunner({
  chunkPlan,
  selectLightingWindow,
  maxWaveSize: MAX_WAVE_SIZE,
  liveWindowSize: LIVE_TICK_WINDOW_SIZE,
  liveConcurrency: LIVE_TICK_CONCURRENCY,
  liveMaxBrightness: LIVE_MAX_BRIGHTNESS,
  executeTarget,
  executeBatch: executeBatchWindow,
  recordScreeningStates,
  CinemaError,
});

function enqueueTransition(app, operation) {
  const task = app.transition.then(operation, operation);
  app.transition = task.catch(() => {});
  return task;
}
function assertWritable(app) { if (app.shuttingDown) throw new CinemaError("service_shutting_down", "The cinema service is shutting down.", 503); }
async function cancelActiveWorker(app, sessionId) {
  const worker = app.activeWorker;
  if (!worker || worker.sessionId !== sessionId) return;
  worker.controller.abort();
  try { await worker.promise; } catch {}
  if (app.activeWorker === worker) app.activeWorker = null;
}
const executeRows = (app, targets, rows, signal) => app.stopExecutor.executeRows(app, targets, rows, signal);
const runStopPhase = (app, targets, rows) => app.stopExecutor.runStopPhase(app, targets, rows);
async function executeBatchRows(app, targets, rows, signal) {
  if (app.mode !== "live" || app.runtime?.supportsBatchFrames !== true || typeof app.runtime.applyDesign !== "function") return null;
  const byHandle = new Map(targets.map((target) => [target.handle, target]));
  const batchRows = rows.map((row) => ({ ...row, runtimeId: byHandle.get(row.handle)?.runtimeId })).filter((row) => row.runtimeId);
  if (batchRows.length !== rows.length || batchRows.length < 2) return null;
  try {
    const result = await app.runtime.applyDesign(batchRows, signal, { retrySafeError: false, verificationMode: "acknowledged" });
    const expected = new Map(batchRows.map((row) => [String(row.runtimeId), row.set || {}]));
    const classification = classifyDesignBatchReceipt(result, expected);
    if (classification === "verified" || classification === "acknowledged") return rows.map((row) => ({ handle: row.handle, status: "acknowledged" }));
    const reason = classification === "bound_verification_mismatch" ? "runtime_write_verification_mismatch" : "runtime_batch_receipt_invalid";
    return rows.map((row) => ({ handle: row.handle, status: "failed", reason, failureClass: "verification", retryable: true }));
  } catch (error) {
    const reason = signal?.aborted ? "runtime_cancelled" : error?.code || "runtime_batch_uncertain";
    return rows.map((row) => ({ handle: row.handle, status: signal?.aborted ? "timeout" : "failed", reason, failureClass: "transport", retryable: true }));
  }
}
function recoverScreeningRequest(app, body) {
  return recoverScreeningRequestWithDeps(app, body, { enqueueTransition, assertWritable, CinemaError, sendJsonResult, queryStopState: (owner, targets, signal) => owner.stopExecutor.queryStopState(owner, targets, signal), queryStopStateBatch: (owner, targets, signal, options) => owner.runtime.queryStateBatch(targets, signal, options), stateMatchesPreState, executeTarget, executeBatch: executeBatchRows, persistScreeningRecovery });
}
function assertLiveValidationScope(app, targets) {
  if (!app.liveValidationPassed || !(app.validationScope instanceof Map) || app.validationScope.size < 1) {
    throw new CinemaError("validation_required", "Complete the bounded physical validation before starting a live screening.", 409);
  }
  if (targets.some((target) => {
    const authorized = app.validationScope.get(target.handle);
    return !authorized || authorized.runtimeId !== target.runtimeId;
  })) throw new CinemaError("validation_scope", "The selected lights were not part of the current live Runtime validation scope.", 409);
}
function hasPendingRecoveryState(app, exceptSessionId = "") {
  return hasAnyPendingRecovery(app, hasPendingRecovery, exceptSessionId);
}
function finalizeSnapshot(app, snapshot, scopeTargets = null) {
  return app.finalizeSnapshot(app, snapshot, scopeTargets);
}
function validHostToken(request, app) {
  const supplied = String(request.headers["x-cinema-host-token"] || "");
  if (!app.hostToken || !supplied || supplied.length !== app.hostToken.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(app.hostToken)); } catch { return false; }
}
export async function shutdownCinemaServer(app) {
  if (app.shutdownPromise) return app.shutdownPromise;
  app.shuttingDown = true;
  app.shutdownPromise = enqueueTransition(app, async () => {
    try {
      const active = app.sessions.active();
      if (active && active.state !== "stopped") {
        const snapshot = app.sessions.snapshot(active.id);
        invalidateSession(app, active.id, "shutdown");
        await finalizeSnapshot(app, snapshot);
      } else if (app.activeWorker) {
        app.activeWorker.controller.abort();
        try { await app.activeWorker.promise; } catch {}
        app.activeWorker = null;
      }
    } finally {
      app.sessions.clear();
      app.screeningWriteEvidence.clear();
      for (const timer of app.expiryTimers.values()) clearTimeout(timer);
      app.expiryTimers.clear();
      app.runtime?.close?.();
    }
  });
  return app.shutdownPromise;
}
function publicMovie(app, movie) { const result = { id: movie.id, title: movie.title, year: movie.year || null }; if (movie.artworkUrl) result.artworkHandle = app.artwork.sign(movie.artworkUrl, app.pageProof); return result; }
function sendJsonResult(status, value) { return { __result: true, status, value }; }
export const __testing = { allowedHost, sameOrigin, sameOriginGet, validProof, securityHeaders };
