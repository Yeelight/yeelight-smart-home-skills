import { CinemaError, MAX_TARGETS, randomOpaque } from "./contracts.mjs";
import { DEFAULT_RECOVERY_PATH, loadRecoveryRecords, saveRecoveryRecords } from "./validation-store.mjs";
import { CLEANUP_CONCURRENCY, PREFLIGHT_CONCURRENCY, RECOVERY_CONFIRMATION, RECOVERY_TIMEOUT_MS, RECOVERY_TTL_MS, VALIDATION_CONFIRMATION, VALIDATION_GRANT_TTL_MS, VALIDATION_MAX_BRIGHTNESS, VALIDATION_READBACK_DELAYS_MS, VALIDATION_TARGET_COUNT, VALIDATION_TIMEOUT_MS } from "./validation-constants.mjs";
import { __testing as validationHelpers, bounded, deadline, expectedState, mapWithConcurrency, preflightError, publicState, queryOne, sameState, snapshotTarget, validateTargets } from "./validation-helpers.mjs";
import { applyDesignStep, applyOne } from "./validation-operations.mjs";

export { applyOne };

export { CLEANUP_CONCURRENCY, PREFLIGHT_CONCURRENCY, RECOVERY_CONFIRMATION, RECOVERY_TIMEOUT_MS, RECOVERY_TTL_MS, VALIDATION_CONFIRMATION, VALIDATION_GRANT_TTL_MS, VALIDATION_MAX_BRIGHTNESS, VALIDATION_READBACK_DELAYS_MS, VALIDATION_TARGET_COUNT, VALIDATION_TIMEOUT_MS } from "./validation-constants.mjs";

export async function loadValidationRecovery(app) { for (const record of await loadRecoveryRecords(app.recoveryPath || DEFAULT_RECOVERY_PATH, app.context)) app.recoveryRecords.set(record.id, record); }

export async function prepareValidationGrant(app, targets, scopeTargets = targets) {
  if (app.mode !== "live") throw new CinemaError("validation_live_only", "Physical validation requires live Runtime mode.", 409);
  const verifiedScope = await refreshLiveTargets(app.runtime, validateScopeTargets(scopeTargets), undefined);
  const scopeByHandle = new Map(verifiedScope.map((target) => [target.handle, target]));
  const verifiedTargets = validateTargets(targets).map((target) => scopeByHandle.get(target.handle)).filter(Boolean);
  if (verifiedTargets.length !== VALIDATION_TARGET_COUNT) throw new CinemaError("validation_scope_invalid", "The four validation lights must belong to the bound screening scope.", 409);
  const id = randomOpaque("g");
  const now = app.clock();
  app.validationGrants.set(id, {
    id,
    handles: verifiedTargets.map((target) => target.handle).sort(),
    targets: verifiedTargets,
    scopeHandles: verifiedScope.map((target) => target.handle).sort(),
    scopeTargets: verifiedScope,
    createdAt: now,
    expiresAt: now + VALIDATION_GRANT_TTL_MS,
  });
  return { grant: id, expiresAt: now + VALIDATION_GRANT_TTL_MS, targets: verifiedTargets, scopeTargets: verifiedScope };
}

export function consumeValidationGrant(app, grant, handles) {
  const record = app.validationGrants.get(grant);
  if (!record || record.expiresAt <= app.clock()) throw new CinemaError("validation_grant_invalid", "The physical validation approval has expired or is invalid.", 428);
  const requested = [...handles].sort();
  if (requested.length !== record.handles.length || requested.some((handle, index) => handle !== record.handles[index])) throw new CinemaError("validation_grant_scope", "The physical validation approval does not match the confirmed lights.", 409);
  app.validationGrants.delete(grant);
  return record;
}

function validateScopeTargets(targets) {
  if (!Array.isArray(targets) || targets.length < VALIDATION_TARGET_COUNT || targets.length > MAX_TARGETS) throw new CinemaError("validation_scope_invalid", "The screening validation scope is invalid.", 409);
  const handles = new Set(targets.map((target) => target?.handle));
  const runtimeIds = new Set(targets.map((target) => target?.runtimeId));
  if (handles.size !== targets.length || runtimeIds.size !== targets.length || targets.some((target) => !target || !target.online || target.isLight !== true || target.preStateComplete !== true)) throw new CinemaError("validation_scope_invalid", "The screening validation scope contains an invalid light.", 409);
  return targets;
}

export async function refreshLiveTargets(runtime, targets, signal) {
  if (typeof runtime.queryStateBatch === "function") {
    let states;
    // The startup detail read already established an explicit online fact for
    // every target. Batch state endpoints may omit online for an otherwise
    // complete row, so avoid reopening a slow single-target fallback storm;
    // writable properties still need a fresh exact batch snapshot below.
    try { states = await runtime.queryStateBatch(targets, signal, { skipOnlineFallback: true }); } catch { throw preflightError(); }
    if (!Array.isArray(states) || states.length !== targets.length) throw preflightError();
    const byRuntimeId = new Map();
    for (const state of states) {
      const runtimeId = String(state?.runtimeId || "");
      if (!runtimeId || byRuntimeId.has(runtimeId)) throw preflightError();
      byRuntimeId.set(runtimeId, state);
    }
    if (byRuntimeId.size !== targets.length || targets.some((target) => !byRuntimeId.has(String(target.runtimeId)))) throw preflightError();
    return targets.map((target) => refreshTargetState(target, byRuntimeId.get(String(target.runtimeId))));
  }
  const refreshed = new Array(targets.length);
  await mapWithConcurrency(targets, PREFLIGHT_CONCURRENCY, async (target, index) => {
    let result;
    try { result = await runtime.queryState([target], signal); } catch { throw preflightError(); }
    const state = exactSingleState(result, target.runtimeId);
    refreshed[index] = refreshTargetState(target, state);
  });
  return refreshed;
}

async function queryValidationStates(app, targets, signal) {
  if (!targets.length) return [];
  if (typeof app.runtime.queryStateBatch === "function") {
    try {
      const states = await app.runtime.queryStateBatch(targets, signal);
      if (!Array.isArray(states) || states.length !== targets.length) return null;
      const byRuntimeId = new Map(states.map((state) => [String(state?.runtimeId || ""), state]));
      if (byRuntimeId.size !== targets.length || targets.some((target) => !byRuntimeId.has(String(target.runtimeId)))) return null;
      return targets.map((target) => byRuntimeId.get(String(target.runtimeId)));
    } catch {
      return null;
    }
  }
  return Promise.all(targets.map((target) => queryOne(app, target, signal)));
}

function refreshTargetState(target, state) {
  const online = state?.online === undefined ? target.online === true : state.online === true;
  if (!state || state.runtimeId !== target.runtimeId || state.verified !== true || !online || state.simulated === true || typeof state.power !== "boolean" || !bounded(state.brightness, 1, 100)) throw preflightError();
  const preState = {
    power: state.power,
    brightness: state.brightness,
    ...(bounded(state.color, 0, 0xFFFFFF) ? { color: state.color } : {}),
    ...(bounded(state.colorTemperature, 1700, 6500) ? { colorTemperature: state.colorTemperature } : {}),
  };
  const preStateComplete = (!target.capabilities.color || preState.color !== undefined)
    && (!target.capabilities.temperature || preState.colorTemperature !== undefined);
  if (!target.isLight || target.online !== true || target.preStateComplete !== true || !preStateComplete) throw preflightError();
  return { ...target, online: true, power: preState.power, brightness: preState.brightness, color: preState.color, colorTemperature: preState.colorTemperature, preState, preStateVerified: true, preStateComplete: true };
}

function exactSingleState(result, runtimeId) {
  if (!Array.isArray(result) || result.length !== 1) return null;
  const [state] = result;
  return state && state.runtimeId === runtimeId ? state : null;
}

export async function runPhysicalValidation(app, targets) {
  if (app.mode !== "live") throw new CinemaError("validation_live_only", "Physical validation requires live Runtime mode.", 409);
  const verifiedTargets = validateTargets(targets);
  const operation = deadline(app.clock, VALIDATION_TIMEOUT_MS);
  let refreshedTargets;
  try {
    const currentTargets = await refreshLiveTargets(app.runtime, verifiedTargets, operation.signal);
    if (currentTargets.some((target, index) => !sameState({ ...target.preState, verified: true, online: true, simulated: false }, verifiedTargets[index].preState))) throw new CinemaError("validation_state_changed", "A confirmed light state changed before the physical validation started.", 409);
    refreshedTargets = currentTargets.map((target, index) => ({ ...target, preState: { ...verifiedTargets[index].preState } }));
  } catch (error) {
    operation.cancel();
    throw error;
  }
  const record = createRecoveryRecord(app, refreshedTargets);
  app.recoveryRecords.set(record.id, record);
  try {
    await persistRequired(app);
  } catch (error) {
    app.recoveryRecords.delete(record.id);
    throw error;
  }
  const rows = refreshedTargets.map((target) => ({ handle: target.handle, name: target.name, room: target.room, preState: { ...target.preState }, write: { status: "pending" }, fadeOff: { status: "not_started" }, restore: { status: "not_started" } }));
  const touched = [];
  let operationError = null;
  try {
    // The exact pre-state batch above is the write fence for this bounded
    // validation. Successful Runtime receipts already bind each property;
    // only failed/uncertain writes pay for a single-target补查.
    for (let index = 0; index < refreshedTargets.length; index += 1) {
      const target = refreshedTargets[index];
      const row = rows[index];
      record.touchedHandles.push(target.handle);
      await persistRequired(app);
      touched.push(target);
      try {
        const receipt = await applyOne(app, target, { power: true, brightness: VALIDATION_MAX_BRIGHTNESS }, operation.signal, { retrySafeError: false });
        row.write = {
          status: receipt.status === "acknowledged" ? "verified" : "failed",
          verification: "runtime_receipt",
        };
      } catch (error) {
        const after = operation.signal.aborted ? null : await queryOne(app, target, operation.signal, { retrySafeError: false });
        row.write = {
          status: after && sameState(after, expectedState(target, { power: true, brightness: VALIDATION_MAX_BRIGHTNESS }))
            ? "verified"
            : operation.signal.aborted ? "timeout" : error?.code === "validation_write_failed" ? "failed" : after ? "uncertain" : "failed",
          ...(after ? { readback: publicState(after), verification: "failure_readback" } : {}),
        };
        break;
      }
    }
  } catch (error) {
    operationError = error;
  } finally {
    operation.cancel();
  }

  const cleanup = deadline(app.clock, RECOVERY_TIMEOUT_MS);
  const pendingRecovery = new Set();
  const restoredHandles = new Set();
  record.phase = "recovery";
  record.pendingHandles = touched.map((target) => target.handle);
  await persistRecoveryRecords(app);
  try {
    await mapWithConcurrency(touched, CLEANUP_CONCURRENCY, async (target) => {
      const row = rows.find((item) => item.handle === target.handle);
      try {
        const receipt = await applyOne(app, target, { power: false, brightness: 1 }, cleanup.signal, { retrySafeError: false });
        row.fadeOff = {
          status: receipt.status === "acknowledged" ? "verified" : "failed",
          verification: "runtime_receipt",
        };
      } catch {
        const state = cleanup.signal.aborted ? null : await queryOne(app, target, cleanup.signal, { retrySafeError: false });
        row.fadeOff = {
          status: cleanup.signal.aborted
            ? "timeout"
            : !cleanup.signal.aborted && state && sameState(state, expectedState(target, { power: false, brightness: 1 })) ? "verified" : "failed",
          ...(state ? { readback: publicState(state) } : {}),
        };
      }
    });

    await mapWithConcurrency(touched, CLEANUP_CONCURRENCY, async (target) => {
      const row = rows.find((item) => item.handle === target.handle);
      // A successful fade/off receipt and the durable journal are the bounded
      // restore fence. Unknown phase failures stay out of this direct write.
      if (row.fadeOff.status !== "verified") {
        row.restore = { status: cleanup.signal.aborted ? "timeout" : "conflict" };
        return;
      }
      try {
        const receipt = await applyOne(app, target, target.preState, cleanup.signal, { retrySafeError: false });
        row.restore = {
          status: receipt.status === "acknowledged" ? "verified" : "failed",
          verification: "runtime_receipt",
        };
      } catch {
        row.restore = { status: cleanup.signal.aborted ? "timeout" : "failed" };
      }
    });

    // Final batch read is the authoritative physical evidence for recovery.
    const finalStates = await queryValidationStates(app, touched, cleanup.signal);
    const finalByRuntimeId = new Map((finalStates || []).filter((state) => state && typeof state.runtimeId === "string").map((state) => [state.runtimeId, state]));
    for (const target of touched) {
      const row = rows.find((item) => item.handle === target.handle);
      const state = finalByRuntimeId.get(target.runtimeId);
      if (state) row.restore.readback = publicState(state);
      if (state && sameState(state, target.preState)) {
        row.restore.status = "verified";
        restoredHandles.add(target.handle);
      } else {
        if (row.restore.status === "verified") row.restore.status = cleanup.signal.aborted ? "timeout" : state ? "uncertain" : "failed";
        pendingRecovery.add(target);
      }
    }
    record.pendingHandles = record.pendingHandles.filter((handle) => !restoredHandles.has(handle));
    await persistRecoveryRecords(app);
  } finally {
    cleanup.cancel();
  }

  const persistenceFailed = app.recoveryPersistenceError === true;
  if (record.pendingHandles.length === 0 && !persistenceFailed) {
    app.recoveryRecords.delete(record.id);
    if (!await persistRecoveryRecords(app)) {
      record.phase = "recovery";
      record.pendingHandles = touched.map((target) => target.handle);
      app.recoveryRecords.set(record.id, record);
    }
  } else if (record.pendingHandles.length === 0) {
    record.pendingHandles = touched.map((target) => target.handle);
    record.phase = "recovery";
  }
  const recoveryId = app.recoveryRecords.has(record.id) ? record.id : "";
  const complete = !operationError
    && !persistenceFailed
    && !recoveryId
    && touched.length === refreshedTargets.length
    && rows.every((row) => row.write.status === "verified" && row.fadeOff.status === "verified" && row.restore.status === "verified")
    && pendingRecovery.size === 0;
  if (complete) app.liveValidationPassed = true;
  return {
    status: complete ? "complete" : recoveryId ? "uncertain" : "partial",
    complete,
    targetCount: refreshedTargets.length,
    rows,
    recoveryId: recoveryId || null,
    maxBrightness: VALIDATION_MAX_BRIGHTNESS,
    recoveryPersistent: app.recoveryPersistenceError !== true,
  };
}

export async function recoverValidation(app, record) {
  if (!record) throw new CinemaError("recovery_not_found", "The physical validation recovery record is unavailable.", 404);
  if (record.expiresAt <= app.clock()) record.expired = true;
  const cleanup = deadline(app.clock, RECOVERY_TIMEOUT_MS);
  const rows = [];
  const pending = [];
  const touched = new Set(record.touchedHandles);
  try {
    for (const target of record.targets) {
      const row = { handle: target.handle, restore: { status: "pending" } };
      if (!touched.has(target.handle)) {
        row.restore.status = "not_touched";
        rows.push(row);
        continue;
      }
      try {
        const receipt = await applyOne(app, target, target.preState, cleanup.signal, { retrySafeError: false });
        row.restore = {
          status: receipt.status === "acknowledged" ? "acknowledged" : "failed",
          verification: "runtime_receipt",
        };
        const state = cleanup.signal.aborted ? null : await queryOne(app, target, cleanup.signal);
        row.restore.readback = publicState(state);
        if (!state || !sameState(state, target.preState)) { row.restore.status = cleanup.signal.aborted ? "timeout" : state ? "uncertain" : "failed"; pending.push(target); }
        else row.restore.status = "verified";
      } catch { row.restore.status = cleanup.signal.aborted ? "timeout" : "failed"; pending.push(target); }
      rows.push(row);
    }
  } finally {
    cleanup.cancel();
  }
  if (pending.length) {
    record.targets = pending;
    record.touchedHandles = pending.map((target) => target.handle);
    record.pendingHandles = pending.map((target) => target.handle);
    record.phase = record.expired === true ? "manual_recovery_required" : "recovery";
    record.attempts += 1;
    const persistent = await persistRecoveryRecords(app);
    return { status: "uncertain", complete: false, recoveryId: record.id, rows, recoveryPersistent: persistent, expired: record.expired === true, manualRecoveryRequired: record.expired === true };
  }
  app.recoveryRecords.delete(record.id);
  const persistent = await persistRecoveryRecords(app);
  if (!persistent) {
    record.phase = record.expired === true ? "manual_recovery_required" : "recovery";
    record.touchedHandles = [...touched];
    record.pendingHandles = [];
    app.recoveryRecords.set(record.id, record);
    return { status: "uncertain", complete: false, recoveryId: record.id, rows, recoveryPersistent: false, expired: record.expired === true, manualRecoveryRequired: record.expired === true };
  }
  return { status: "complete", complete: true, recoveryId: null, rows, recoveryPersistent: true, expired: record.expired === true, manualRecoveryRequired: false };
}
export async function pruneRecoveryRecords(app) {
  for (const [id, grant] of app.validationGrants) if (grant.expiresAt <= app.clock()) app.validationGrants.delete(id);
  let changed = false;
  for (const record of app.recoveryRecords.values()) {
    if (record.expired !== true && record.expiresAt <= app.clock()) { record.expired = true; record.phase = "manual_recovery_required"; changed = true; }
  }
  if (changed) await persistRecoveryRecords(app);
}
export function hasPendingRecovery(app) { return app.recoveryRecords.size > 0; }
function createRecoveryRecord(app, targets) {
  const now = app.clock();
  return { id: randomOpaque("r"), targets: targets.map(snapshotTarget), touchedHandles: [], pendingHandles: [], phase: "in_progress", attempts: 0, createdAt: now, updatedAt: now, expiresAt: now + RECOVERY_TTL_MS, context: app.context };
}

async function persistRecoveryRecords(app) {
  try {
    for (const record of app.recoveryRecords.values()) record.updatedAt = app.clock();
    await saveRecoveryRecords(app.recoveryPath || DEFAULT_RECOVERY_PATH, app.recoveryRecords, app.context);
    app.recoveryPersistenceError = false; return true;
  } catch { app.recoveryPersistenceError = true; return false; }
}

async function persistRequired(app) { if (!await persistRecoveryRecords(app)) throw new CinemaError("recovery_persistence_failed", "The physical validation recovery journal could not be persisted; no further light writes are allowed.", 503); }

export const __testing = { ...validationHelpers, DEFAULT_RECOVERY_PATH, applyDesignStep };
