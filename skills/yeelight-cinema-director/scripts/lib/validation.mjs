import { CinemaError, MAX_TARGETS, randomOpaque } from "./contracts.mjs";
import { DEFAULT_RECOVERY_PATH, loadRecoveryRecords, saveRecoveryRecords } from "./validation-store.mjs";
import { classifyDesignReceipt } from "./runtime-adapter.mjs";
import { CLEANUP_CONCURRENCY, PREFLIGHT_CONCURRENCY, RECOVERY_CONFIRMATION, RECOVERY_TIMEOUT_MS, RECOVERY_TTL_MS, VALIDATION_CONFIRMATION, VALIDATION_GRANT_TTL_MS, VALIDATION_MAX_BRIGHTNESS, VALIDATION_READBACK_DELAYS_MS, VALIDATION_TARGET_COUNT, VALIDATION_TIMEOUT_MS } from "./validation-constants.mjs";
import { __testing as validationHelpers, bounded, deadline, expectedState, isKnownValidationState, mapWithConcurrency, preflightError, propertiesMatch, publicState, queryOne, queryUntilPropertiesMatch, sameState, snapshotTarget, trustedState, validateTargets } from "./validation-helpers.mjs";

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
    try { states = await runtime.queryStateBatch(targets, signal); } catch { throw preflightError(); }
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

function refreshTargetState(target, state) {
  if (!state || state.runtimeId !== target.runtimeId || state.verified !== true || state.online !== true || state.simulated === true || typeof state.power !== "boolean" || !bounded(state.brightness, 1, 100)) throw preflightError();
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
    for (let index = 0; index < refreshedTargets.length; index += 1) {
      const target = refreshedTargets[index];
      const row = rows[index];
      const before = await queryOne(app, target, operation.signal);
      if (!before || !sameState(before, target.preState)) { row.write = { status: operation.signal.aborted ? "timeout" : "conflict" }; break; }
      record.touchedHandles.push(target.handle);
      await persistRequired(app);
      touched.push(target);
      try {
        const receipt = await applyOne(app, target, { power: true, brightness: VALIDATION_MAX_BRIGHTNESS }, operation.signal, { retrySafeError: false });
        row.write = { status: receipt.status };
      } catch { row.write = { status: operation.signal.aborted ? "timeout" : "failed" }; break; }
      const after = await queryOne(app, target, operation.signal);
      row.write.readback = publicState(after);
      if (!after || !sameState(after, expectedState(target, { power: true, brightness: VALIDATION_MAX_BRIGHTNESS }))) {
        row.write.status = operation.signal.aborted ? "timeout" : after ? "uncertain" : "failed";
        break;
      }
      row.write.status = "verified";
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
        row.fadeOff = { status: receipt.status };
        const state = await queryOne(app, target, cleanup.signal);
        row.fadeOff.readback = publicState(state);
        row.fadeOff.status = state && sameState(state, expectedState(target, { power: false, brightness: 1 })) ? "verified" : cleanup.signal.aborted ? "timeout" : "uncertain";
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
      const current = await queryOne(app, target, cleanup.signal);
      if (!current || !isKnownValidationState(current, target)) {
        row.restore = { status: cleanup.signal.aborted ? "timeout" : "conflict" };
        pendingRecovery.add(target);
        return;
      }
      try {
        const receipt = await applyOne(app, target, target.preState, cleanup.signal, { retrySafeError: false });
        row.restore = { status: receipt.status };
        const state = await queryOne(app, target, cleanup.signal);
        row.restore.readback = publicState(state);
        if (!state || !sameState(state, target.preState)) {
          row.restore.status = cleanup.signal.aborted ? "timeout" : state ? "uncertain" : "failed";
          pendingRecovery.add(target);
        } else {
          row.restore.status = "verified";
          restoredHandles.add(target.handle);
        }
      } catch {
        row.restore = { status: cleanup.signal.aborted ? "timeout" : "failed" };
        pendingRecovery.add(target);
      }
    });
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

export async function recoverValidation(app, record, options = {}) {
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
      const current = await queryOne(app, target, cleanup.signal);
      if (current && sameState(current, target.preState)) {
        row.restore.status = "verified";
        rows.push(row);
        continue;
      }
      if (!current || !isKnownValidationState(current, target, options)) {
        row.restore.status = cleanup.signal.aborted ? "timeout" : "conflict";
        pending.push(target);
        rows.push(row);
        continue;
      }
      try {
        const receipt = await applyOne(app, target, target.preState, cleanup.signal, { retrySafeError: false });
        row.restore.status = receipt.status;
        const state = await queryOne(app, target, cleanup.signal);
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

export async function applyOne(app, target, set, signal, options = {}) {
  const entries = Object.entries(set || {});
  const power = entries.find(([property]) => property === "power")?.[1];
  const designSet = Object.fromEntries(entries.filter(([property]) => property !== "power"));
  if (Object.keys(designSet).length > 0) await applyDesignStep(app, target, designSet, signal, options);
  // Design writes can wake a light; always fix the requested power state last.
  if (typeof power === "boolean") await applyPower(app, target, power, signal, designSet, options);
  return { status: "acknowledged" };
}

async function applyDesignStep(app, target, set, signal, options = {}) {
  let result;
  const usesPropertyRuntime = typeof app.runtime.applyProperties === "function";
  try {
    result = usesPropertyRuntime
      ? await app.runtime.applyProperties(target, set, signal, options)
      : await app.runtime.applyDesign([{ handle: target.handle, runtimeId: target.runtimeId, set }], signal, options);
  } catch (error) {
    if (isBoundPropertyMismatch(error, target, set)) {
      const observed = await queryUntilPropertiesMatch(app, target, set, signal, VALIDATION_READBACK_DELAYS_MS);
      if (observed) return { status: "acknowledged", verification: "readback" };
    }
    throw error;
  }
  // The property adapter verifies each fixed `light.*` write before returning
  // this compact acknowledgement. Design receipts use the stricter formal
  // `lighting.design.apply` envelope below and must remain separate.
  if (usesPropertyRuntime && result?.status === "acknowledged") return { status: "acknowledged" };
  const formalStatus = classifyDesignReceipt(result, target.runtimeId, set);
  if (formalStatus === "verified") return { status: "acknowledged" };
  if (formalStatus === "bound_verification_mismatch") {
    const observed = await queryUntilPropertiesMatch(app, target, set, signal, VALIDATION_READBACK_DELAYS_MS);
    if (observed) return { status: "acknowledged", verification: "readback" };
  } else {
    const row = result?.rows?.find((item) => item.handle === target.handle);
    const status = String(row?.status || "").toLowerCase();
    if (["acknowledged", "success", "applied", "verified", "ok"].includes(status)) return { status: "acknowledged" };
  }
  throw new CinemaError("validation_write_failed", "A validation write was not acknowledged or verified.", 502, { classification: formalStatus });
}

async function applyPower(app, target, power, signal, designSet = {}, options = {}) {
  if (typeof app.runtime.applyPower === "function") {
    try {
      const receipt = await app.runtime.applyPower(target, power, signal, options);
      if (receipt?.status !== "acknowledged") throw new CinemaError("validation_write_failed", "A power design write was not acknowledged.", 502);
      return receipt;
    } catch (error) {
      if (!isBoundPowerMismatch(error)) throw error;
      if (!Number.isInteger(designSet.brightness) || designSet.brightness < 1 || designSet.brightness > 100) throw error;
      const observed = await queryOne(app, target, signal);
      if (!trustedState(observed) || !propertiesMatch(observed, designSet)) throw error;
      if (observed.power === power) return { status: "acknowledged", verification: "readback" };
      if (typeof app.runtime.setPower !== "function") throw error;
      const fallback = await app.runtime.setPower(target, power, signal, options);
      if (fallback?.status !== "acknowledged") throw new CinemaError("validation_write_failed", "A fallback power write was not acknowledged.", 502);
      return { ...fallback, verification: "direct_power_fallback" };
    }
  }
  if (typeof app.runtime.setPower === "function") {
    const receipt = await app.runtime.setPower(target, power, signal, options);
    if (receipt?.status !== "acknowledged") throw new CinemaError("validation_write_failed", "A power write was not acknowledged.", 502);
    return receipt;
  }
  return applyDesignStep(app, target, { power }, signal, options);
}

function isBoundPowerMismatch(error) {
  return error?.code === "runtime_write_verification_mismatch"
    && error?.details?.intent === "lighting.design.apply"
    && error?.details?.property === "power"
    && error?.details?.classification === "bound_verification_mismatch";
}

function isBoundPropertyMismatch(error, target, set) {
  const details = error?.details || {};
  return error?.code === "runtime_write_verification_mismatch"
    && details.classification === "bound_verification_mismatch"
    && String(details.runtimeId) === String(target.runtimeId)
    && Object.hasOwn(set, details.property)
    && details.expectedValue === set[details.property];
}

export const __testing = { ...validationHelpers, DEFAULT_RECOVERY_PATH, applyDesignStep };
