import { CinemaError, randomOpaque } from "./contracts.mjs";
import { DEFAULT_SCREENING_RECOVERY_PATH, SCREENING_RECOVERY_CONFIRMATION, SCREENING_RECOVERY_TIMEOUT_MS, SCREENING_RECOVERY_TTL_MS, loadScreeningRecoveryRecords, saveScreeningRecoveryRecords } from "./screening-recovery-store.mjs";
import { isValidTargetState } from "./validation-store.mjs";

// Stop/recovery writes remain bounded while reducing the number of cloud
// waves for the normal 18-light household.
export const STOP_PHASE_CONCURRENCY = 8;
export const STOP_PHASE_TIMEOUT_MS = 120 * 1000;

export function hasAnyPendingRecovery(app, hasValidationPending, exceptSessionId = "") {
  return hasValidationPending(app) || [...app.screeningRecoveryRecords.values()].some((record) => (
    record.sessionId !== exceptSessionId
    && Array.isArray(record.pendingHandles)
    && record.pendingHandles.length > 0
  ));
}

export async function loadScreeningRecovery(app) {
  for (const record of await loadScreeningRecoveryRecords(app.screeningRecoveryPath || DEFAULT_SCREENING_RECOVERY_PATH, app.context)) app.screeningRecoveryRecords.set(record.id, record);
}

export async function pruneScreeningRecoveryRecords(app) {
  if (app.mode !== "live") return;
  let changed = false;
  for (const record of app.screeningRecoveryRecords.values()) {
    if (record.expiresAt <= app.clock() && record.phase !== "manual_recovery_required") {
      record.phase = "manual_recovery_required";
      changed = true;
    }
  }
  if (changed) await saveScreeningRecoveryRecords(app.screeningRecoveryPath, app.screeningRecoveryRecords, app.context);
}

export function createScreeningRecoveryRecord(app, targets, sessionId = "") {
  const now = app.clock();
  return {
    id: randomOpaque("r"), kind: "screening", targets: targets.map((target) => ({
      handle: target.handle, runtimeId: target.runtimeId, name: target.name, room: target.room,
      online: true, isLight: true, capabilities: { ...target.capabilities }, preState: { ...target.preState }, knownStates: [{ ...target.preState }],
      preStateVerified: target.preStateVerified === true, preStateComplete: target.preStateComplete === true,
    })),
    // Persist the full selected-frame recovery scope before playback. Runtime
    // workers are concurrent, so the durable scope is intentionally
    // conservative; Stop still queries current state and uses live write
    // evidence before touching a target.
    touchedHandles: [], pendingHandles: [],
    ...(sessionId ? { sessionId } : {}), phase: "in_progress", attempts: 0, createdAt: now, updatedAt: now, expiresAt: now + SCREENING_RECOVERY_TTL_MS, context: app.context,
  };
}

export function findScreeningRecovery(app, sessionId) {
  return [...app.screeningRecoveryRecords.values()].find((record) => record.sessionId === sessionId) || null;
}

export async function recordScreeningState(app, sessionId, handle, set) {
  const currentRecord = findScreeningRecovery(app, sessionId);
  if (!currentRecord) throw new CinemaError("recovery_record_missing", "The screening recovery journal is unavailable.", 503);
  const record = cloneScreeningRecord(currentRecord);
  const target = record.targets.find((candidate) => candidate.handle === handle);
  if (!target) throw new CinemaError("recovery_scope_invalid", "The screening recovery target scope is invalid.", 409);
  markTouched(record, [handle]);
  const knownStates = Array.isArray(target.knownStates) && target.knownStates.length ? target.knownStates : [{ ...target.preState }];
  const nextState = { ...knownStates[knownStates.length - 1], ...set };
  if (!isValidTargetState(nextState, target)) throw new CinemaError("recovery_state_invalid", "The screening recovery state is invalid.", 409);
  target.knownStates = appendKnownState(target, knownStates, nextState);
  await persistScreeningRecovery(app, record);
}

export async function recordScreeningStates(app, sessionId, rows) {
  const currentRecord = findScreeningRecovery(app, sessionId);
  if (!currentRecord) throw new CinemaError("recovery_record_missing", "The screening recovery journal is unavailable.", 503);
  const record = cloneScreeningRecord(currentRecord);
  markTouched(record, rows.map((row) => row.handle));
  for (const row of rows) {
    const target = record.targets.find((candidate) => candidate.handle === row.handle);
    if (!target || !row.set) throw new CinemaError("recovery_scope_invalid", "The screening recovery target scope is invalid.", 409);
    const knownStates = Array.isArray(target.knownStates) && target.knownStates.length ? target.knownStates : [{ ...target.preState }];
    const nextState = { ...knownStates[knownStates.length - 1], ...row.set };
    if (!isValidTargetState(nextState, target)) throw new CinemaError("recovery_state_invalid", "The screening recovery state is invalid.", 409);
    target.knownStates = appendKnownState(target, knownStates, nextState);
  }
  await persistScreeningRecovery(app, record);
}

function markTouched(record, handles) {
  const targetHandles = new Set(record.targets.map((target) => target.handle));
  const unique = [...new Set(handles)];
  if (unique.some((handle) => !targetHandles.has(handle))) throw new CinemaError("recovery_scope_invalid", "The screening recovery target scope is invalid.", 409);
  for (const handle of unique) {
    if (!record.touchedHandles.includes(handle)) record.touchedHandles.push(handle);
    if (!record.pendingHandles.includes(handle)) record.pendingHandles.push(handle);
  }
}

export async function persistScreeningRecovery(app, record) {
  record.updatedAt = app.clock();
  const nextRecords = new Map(app.screeningRecoveryRecords);
  nextRecords.set(record.id, record);
  await saveScreeningRecoveryRecords(app.screeningRecoveryPath || DEFAULT_SCREENING_RECOVERY_PATH, nextRecords, app.context);
  app.screeningRecoveryRecords.clear();
  for (const [id, value] of nextRecords) app.screeningRecoveryRecords.set(id, value);
}

export async function removeScreeningRecovery(app, recordId) {
  const nextRecords = new Map(app.screeningRecoveryRecords);
  nextRecords.delete(recordId);
  await saveScreeningRecoveryRecords(app.screeningRecoveryPath || DEFAULT_SCREENING_RECOVERY_PATH, nextRecords, app.context);
  app.screeningRecoveryRecords.clear();
  for (const [id, record] of nextRecords) app.screeningRecoveryRecords.set(id, record);
}

export async function recoverScreeningRecord(app, record, deps) {
  const targetByHandle = new Map(record.targets.map((target) => [target.handle, target]));
  const pendingHandles = Array.isArray(record.pendingHandles) ? record.pendingHandles : [];
  if (new Set(pendingHandles).size !== pendingHandles.length || pendingHandles.some((handle) => !targetByHandle.has(handle) || !record.touchedHandles.includes(handle))) {
    throw new CinemaError("recovery_scope_invalid", "The screening recovery target scope is invalid.", 409);
  }
  const operation = createDeadline(app.clock, deps.recoveryTimeoutMs || SCREENING_RECOVERY_TIMEOUT_MS);
  const rows = [];
  const targets = pendingHandles.map((handle) => targetByHandle.get(handle));
  // An expired journal may outlive a successful physical restore. Reconcile
  // that orphaned state once before issuing another irreversible write burst.
  // Normal Stop/Restore stays write-first; this guard only applies when no
  // active screening can still own the recovery record.
  if (record.phase === "manual_recovery_required" && typeof deps.queryStopStateBatch === "function" && typeof deps.stateMatchesPreState === "function") {
    try {
      const currentRows = await deps.queryStopStateBatch(app, targets, operation.signal, { skipOnlineFallback: true });
      const currentByHandle = mapRowsByHandle(currentRows, targets);
      const restored = targets.every((target) => {
        const row = currentByHandle.get(target.handle);
        // The EU batch properties endpoint omits `online` but only returns a
        // row after reading the device. Treat that omission as online evidence
        // for this reconciliation-only path; explicit false remains failure.
        const reconciled = withKnownOnline(row, target);
        return deps.stateMatchesPreState(reconciled, target);
      });
      if (restored) {
        await removeScreeningRecovery(app, record.id);
        operation.cancel();
        return {
          status: "complete",
          complete: true,
          recoveryId: null,
          rows: targets.map((target) => ({ handle: target.handle, status: "verified", reason: "already_restored" })),
        };
      }
    } catch {
      // A failed reconciliation read must not claim physical recovery; fall
      // through to the existing bounded restore path.
    }
  }
  try {
    if (typeof deps.queryStopStateBatch === "function") {
      rows.push(...await recoverScreeningRecordBatch(app, targets, deps, operation.signal));
    } else {
      rows.push(...await recoverScreeningRecordSerial(app, targets, deps, operation.signal));
    }
  } finally {
    operation.cancel();
  }
  const pending = rows.filter((row) => row.status !== "verified").map((row) => row.handle);
  record.pendingHandles = pending;
  record.phase = pending.length ? "recovery" : "in_progress";
  record.attempts += 1;
  if (pending.length) await persistScreeningRecovery(app, record);
  else {
    await removeScreeningRecovery(app, record.id);
  }
  return { status: pending.length ? "uncertain" : "complete", complete: pending.length === 0, recoveryId: pending.length ? record.id : null, rows };
}

async function recoverScreeningRecordBatch(app, targets, deps, signal) {
  const statuses = new Map();
  const writable = [];
  for (const target of targets) {
    if (signal.aborted) {
      statuses.set(target.handle, "timeout");
    } else {
      writable.push(target);
    }
  }

  for (let index = 0; index < writable.length; index += STOP_PHASE_CONCURRENCY) {
    if (signal.aborted) {
      for (const target of writable.slice(index)) statuses.set(target.handle, "timeout");
      break;
    }
    const chunk = writable.slice(index, index + STOP_PHASE_CONCURRENCY);
    if (typeof deps.executeBatch === "function" && chunk.length > 1) {
      const batchRows = chunk.map((target) => ({ handle: target.handle, set: target.preState }));
      const batchResult = await deps.executeBatch(app, targets, batchRows, signal);
      if (Array.isArray(batchResult)) {
        for (const row of batchResult) statuses.set(row.handle, row.status);
        continue;
      }
    }
    const results = await Promise.all(chunk.map(async (target) => {
      try {
        const receipt = await deps.executeTarget(app, target, { handle: target.handle, set: target.preState }, signal, true, { retrySafeError: false });
        return { handle: target.handle, status: receipt.status === "acknowledged" ? "acknowledged" : "failed" };
      } catch {
        return { handle: target.handle, status: signal.aborted ? "timeout" : "failed" };
      }
    }));
    for (const row of results) statuses.set(row.handle, row.status);
  }

  const finalRows = writable.length && !signal.aborted
    ? await deps.queryStopStateBatch(app, targets, signal, { skipOnlineFallback: true })
    : [];
  const finalByHandle = mapRowsByHandle(finalRows, targets);
  return targets.map((target) => {
    const status = statuses.get(target.handle);
    const final = withKnownOnline(finalByHandle.get(target.handle), target);
    // The final physical readback is authoritative. A gateway can return an
    // incomplete or failed batch receipt after the device has already applied
    // the restore, so never issue another write when the pre-state matches.
    if (deps.stateMatchesPreState(final, target)) return { handle: target.handle, status: "verified" };
    if (status === "failed" || status === "timeout") return { handle: target.handle, status };
    return { handle: target.handle, status: signal.aborted ? "timeout" : "uncertain" };
  });
}

async function recoverScreeningRecordSerial(app, targets, deps, signal) {
  const rows = [];
  for (let index = 0; index < targets.length; index += STOP_PHASE_CONCURRENCY) {
    if (signal.aborted) {
      rows.push(...targets.slice(index).map((target) => ({ handle: target.handle, status: "timeout" })));
      break;
    }
    const chunk = targets.slice(index, index + STOP_PHASE_CONCURRENCY);
    const results = await Promise.all(chunk.map(async (target) => {
      if (signal.aborted) return { handle: target.handle, status: "timeout" };
      try {
        const receipt = await deps.executeTarget(app, target, { handle: target.handle, set: target.preState }, signal, true, { retrySafeError: false });
        const final = signal.aborted ? null : withKnownOnline((await deps.queryStopState(app, [target], signal))[0], target);
        return { handle: target.handle, status: receipt.status === "acknowledged" && deps.stateMatchesPreState(final, target) ? "verified" : "uncertain" };
      } catch { return { handle: target.handle, status: signal.aborted ? "timeout" : "failed" }; }
    }));
    rows.push(...results);
  }
  return rows;
}

function withKnownOnline(row, target) {
  return row && row.online === undefined && target.online === true ? { ...row, online: true } : row;
}

function mapRowsByHandle(rows, targets) {
  const targetByRuntimeId = new Map(targets.map((target) => [String(target.runtimeId), target.handle]));
  const byHandle = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const handle = row?.handle || targetByRuntimeId.get(String(row?.runtimeId || ""));
    if (handle) byHandle.set(handle, row);
  }
  return byHandle;
}

export function recoverScreeningRequest(app, body, deps) {
  return deps.enqueueTransition(app, async () => {
    deps.assertWritable(app);
    if (app.mode !== "live") throw new deps.CinemaError("validation_live_only", "Screening recovery requires live Runtime mode.", 409);
    if (app.validationActive || app.sessions.active() || app.activeWorker) throw new deps.CinemaError("validation_busy", "Stop the current screening before restoring lights.", 409);
    const record = app.screeningRecoveryRecords.get(body.recoveryId);
    if (!record) throw new deps.CinemaError("recovery_not_found", "The screening recovery record is unavailable.", 404);
    if (body.confirmation !== SCREENING_RECOVERY_CONFIRMATION) throw new deps.CinemaError("confirmation_required", "Explicit host confirmation is required to restore the screening lights.", 428);
    const result = await recoverScreeningRecord(app, record, deps);
    return deps.sendJsonResult(result.complete ? 200 : 207, { status: result.status, recovery: result });
  });
}

function stateKey(state) {
  return JSON.stringify(Object.fromEntries(Object.keys(state || {}).sort().map((key) => [key, state[key]])));
}

function appendKnownState(target, knownStates, nextState) {
  const preState = { ...target.preState };
  const preStateKey = stateKey(preState);
  const unique = new Map();
  for (const state of [...knownStates, nextState]) unique.set(stateKey(state), state);
  unique.delete(preStateKey);
  return [preState, ...[...unique.values()].slice(-7)];
}

function cloneScreeningRecord(record) {
  return {
    ...record,
    targets: record.targets.map((target) => ({
      ...target,
      capabilities: { ...target.capabilities },
      preState: { ...target.preState },
      knownStates: target.knownStates.map((state) => ({ ...state })),
    })),
    touchedHandles: [...record.touchedHandles],
    pendingHandles: [...record.pendingHandles],
    context: { ...record.context },
  };
}

function createDeadline(clock, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(timer), expiresAt: clock() + timeoutMs };
}

export const __testing = { STOP_PHASE_CONCURRENCY, STOP_PHASE_TIMEOUT_MS, SCREENING_RECOVERY_TIMEOUT_MS };
