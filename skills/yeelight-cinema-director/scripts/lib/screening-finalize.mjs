import { FADE_DURATION_MS } from "./contracts.mjs";
import { restorePlan, stopPlan } from "./lighting.mjs";
import { createScreeningRecoveryRecord, findScreeningRecovery, persistScreeningRecovery, recordScreeningStates, removeScreeningRecovery } from "./screening-recovery.mjs";
import { publicQueryRow, stateMatchesPreState } from "./screening-stop.mjs";
import { isValidTargetState } from "./validation-store.mjs";

export function createSnapshotFinalizer({ cancelActiveWorker }) {
  return async function finalizeSnapshot(app, snapshot, scopeTargets = null) {
    if (!snapshot.startedAt) {
      app.screeningWriteEvidence?.delete(snapshot.id);
      app.sessions.remove(snapshot.id);
      return result(200, { status: "cancelled", receipt: { rows: [], physicalVerified: false, restored: false, preparedOnly: true, recoveryQueue: [] } });
    }
    const startedAt = Date.now();
    const scopedTermination = Array.isArray(scopeTargets);
    const targets = scopeTargets || snapshot.targets;
    let screeningRecord = app.mode === "live" ? findScreeningRecovery(app, snapshot.id) || createScreeningRecoveryRecord(app, snapshot.targets, snapshot.id) : null;
    try {
      if (screeningRecord) await persistScreeningRecovery(app, screeningRecord);
      if (app.mode === "live" && scopedTermination && targets.length === 0) {
        const fullScope = snapshot.targets.map((target) => target.handle);
        screeningRecord.touchedHandles = [...fullScope];
        screeningRecord.pendingHandles = [...fullScope];
        screeningRecord.phase = "recovery";
        await persistScreeningRecovery(app, screeningRecord);
        return result(409, {
          status: "uncertain",
          receipt: {
            phase: "screening",
            status: "uncertain",
            acknowledged: false,
            physicalVerified: false,
            restored: false,
            rows: snapshot.targets.map((target) => ({ handle: target.handle, role: target.role, status: "unverified" })),
            recoveryQueue: fullScope,
            recoveryId: screeningRecord.id,
          },
        });
      }
      await cancelActiveWorker(app, snapshot.id);
      const initialRows = app.mode === "live" ? await app.stopExecutor.queryStopState(app, targets) : [];
      const evidence = app.mode === "live" ? app.screeningWriteEvidence?.get(snapshot.id) || new Set() : new Set(targets.map((target) => target.handle));
      const initialEligibility = selectWritableTargets(app, targets, initialRows, journalByHandle(app, snapshot.id, screeningRecord), evidence);
      screeningRecord = await noteBlockedTargets(app, screeningRecord, initialEligibility.blockedTargets);
      if (app.fadeMs > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(app.fadeMs, FADE_DURATION_MS)));
      // The entry snapshot is the only pre-stop selection fence. Reuse it for
      // fade/off/restore and keep one final read as the authoritative result.
      const fadeEligibility = initialEligibility;
      const fadeRows = stopPlan(fadeEligibility.writableTargets, 1);
      if (screeningRecord) await recordScreeningStates(app, snapshot.id, fadeRows);
      screeningRecord = currentScreeningRecord(app, snapshot.id, screeningRecord);
      const fadeResult = await app.stopExecutor.runStopPhase(app, fadeEligibility.writableTargets, fadeRows);
      const offEligibility = initialEligibility;
      const offRows = offEligibility.writableTargets.map((target) => ({ handle: target.handle, set: { power: false } }));
      if (screeningRecord) await recordScreeningStates(app, snapshot.id, offRows);
      screeningRecord = currentScreeningRecord(app, snapshot.id, screeningRecord);
      const offResult = await app.stopExecutor.runStopPhase(app, offEligibility.writableTargets, offRows);
      const beforeRestoreRows = initialRows;
      const restoreEligibility = initialEligibility;
      const restoreJournalRows = app.mode === "live" ? restorePlan(restoreEligibility.writableTargets) : [];
      if (screeningRecord) await recordScreeningStates(app, snapshot.id, restoreJournalRows);
      const restoreResult = await app.stopExecutor.runStopPhase(app, restoreEligibility.writableTargets, restoreJournalRows);
      const queryRows = await app.stopExecutor.queryStopState(app, targets);
      const queryByHandle = new Map(queryRows.map((row) => [row.handle, row]));
      const restored = app.mode === "live" && targets.every((target) => stateMatchesPreState(queryByHandle.get(target.handle), target));
      const phases = {
        fade: scopedPhaseReceipt(targets, fadeEligibility.writableTargets, fadeEligibility.blockedTargets, fadeResult),
        off: scopedPhaseReceipt(targets, offEligibility.writableTargets, offEligibility.blockedTargets, offResult),
        restore: scopedPhaseReceipt(targets, restoreEligibility.writableTargets, restoreEligibility.blockedTargets, restoreResult),
      };
      const acknowledged = Object.values(phases).every((phase) => phase.status === "acknowledged");
      const complete = app.mode === "live" && acknowledged && restored;
      const phasePending = new Set(Object.values(phases).flatMap((phase) => phase.rows.filter((row) => row.status !== "acknowledged").map((row) => row.handle)));
      const recoveryQueue = targets.filter((target) => !stateMatchesPreState(queryByHandle.get(target.handle), target) || phasePending.has(target.handle)).map((target) => target.handle);
      if (screeningRecord) {
        addPendingRecovery(screeningRecord, recoveryQueue);
        screeningRecord.pendingHandles = recoveryQueue;
        screeningRecord.phase = recoveryQueue.length ? "recovery" : "in_progress";
        if (recoveryQueue.length) await persistScreeningRecovery(app, screeningRecord);
        else await removeScreeningRecovery(app, screeningRecord.id);
      }
      return result(complete ? 200 : 207, {
        status: complete ? "acknowledged" : "uncertain",
        receipt: {
          phase: "stop", status: complete ? "acknowledged" : "uncertain", acknowledged,
          rows: targets.map((target) => ({ handle: target.handle, role: target.role, status: phases.restore.rows.find((row) => row.handle === target.handle)?.status || "failed" })),
          phases, physicalVerified: app.mode === "live" ? restored : false, restored,
          durationMs: Date.now() - startedAt, preStateRows: beforeRestoreRows.map(publicQueryRow),
          restoreRows: restoreResult.receipts.map((row) => ({ handle: row.handle, status: row.status })),
          queryRows: queryRows.map(publicQueryRow), recoveryQueue,
          recoveryId: recoveryQueue.length ? screeningRecord?.id || null : null,
        },
      });
    } finally {
      app.sessions.remove(snapshot.id);
      app.screeningWriteEvidence?.delete(snapshot.id);
    }
  };
}

function result(status, value) {
  return { __result: true, status, value };
}

function scopedPhaseReceipt(targets, writableTargets, blockedTargets, phaseResult) {
  const writable = new Set(writableTargets.map((target) => target.handle));
  const blocked = new Set(blockedTargets.map((target) => target.handle));
  const receipts = new Map(phaseResult.receipts.map((row) => [row.handle, row]));
  const rows = targets.map((target) => {
    const receipt = receipts.get(target.handle);
    if (receipt) return { handle: target.handle, status: phaseResult.timedOut && receipt.status === "acknowledged" ? "timeout" : receipt.status };
    if (blocked.has(target.handle)) return { handle: target.handle, status: "failed" };
    if (!writable.has(target.handle)) return { handle: target.handle, status: "acknowledged" };
    return { handle: target.handle, status: "missing" };
  });
  const failed = rows.filter((row) => row.status !== "acknowledged");
  return { status: failed.length ? failed.length === rows.length ? "uncertain" : "partial" : "acknowledged", timedOut: phaseResult.timedOut === true, rows };
}

function addPendingRecovery(record, handles) {
  for (const handle of handles) {
    if (!record.touchedHandles.includes(handle)) record.touchedHandles.push(handle);
    if (!record.pendingHandles.includes(handle)) record.pendingHandles.push(handle);
  }
}

async function noteBlockedTargets(app, record, targets) {
  if (!record || !targets.length) return record;
  const current = currentScreeningRecord(app, record.sessionId, record);
  addPendingRecovery(current, targets.map((target) => target.handle));
  await persistScreeningRecovery(app, current);
  return current;
}

function currentScreeningRecord(app, sessionId, fallback = null) {
  return findScreeningRecovery(app, sessionId) || fallback;
}

function journalByHandle(app, sessionId, fallback) {
  const record = currentScreeningRecord(app, sessionId, fallback);
  return new Map((record?.targets || []).map((target) => [target.handle, target]));
}

function selectWritableTargets(app, targets, queryRows, journalByHandle, evidence) {
  if (app.mode !== "live") return { writableTargets: targets, blockedTargets: [] };
  const byHandle = new Map(queryRows.map((row) => [row.handle, row]));
  const writableTargets = [];
  const blockedTargets = [];
  for (const target of targets) {
    const current = byHandle.get(target.handle);
    if (stateMatchesPreState(current, target)) continue;
    const eligible = evidence.has(target.handle) && isKnownScreeningState(current, target, journalByHandle.get(target.handle));
    if (eligible) writableTargets.push(target);
    else blockedTargets.push(target);
  }
  return { writableTargets, blockedTargets };
}

function isKnownScreeningState(row, target, journalTarget) {
  if (!row || row.runtimeId !== target.runtimeId || row.verified !== true || row.online !== true || row.simulated === true) return false;
  const observed = {
    power: row.power,
    brightness: row.brightness,
    ...(target.capabilities?.color ? { color: row.color } : {}),
    ...(target.capabilities?.temperature ? { colorTemperature: row.colorTemperature } : {}),
  };
  if (!isValidTargetState(observed, target)) return false;
  const knownStates = Array.isArray(journalTarget?.knownStates) && journalTarget.knownStates.length ? journalTarget.knownStates : [target.preState];
  return knownStates.some((known) => stateKey(known) === stateKey(observed));
}

function stateKey(state) {
  return JSON.stringify(Object.fromEntries(Object.keys(state || {}).sort().map((key) => [key, state[key]])));
}
