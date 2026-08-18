import { isHandle, CinemaError, publicTarget } from "./contracts.mjs";
import { consumeValidationGrant, prepareValidationGrant, RECOVERY_CONFIRMATION, recoverValidation, runPhysicalValidation, VALIDATION_CONFIRMATION, VALIDATION_TARGET_COUNT } from "./validation.mjs";

export function prepareValidationRequest(app, body, deps) {
  return deps.enqueueTransition(app, async () => {
    deps.assertWritable(app);
    if (app.mode !== "live") throw new CinemaError("validation_live_only", "Physical validation requires live Runtime mode.", 409);
    if (body.confirmation !== VALIDATION_CONFIRMATION) throw new CinemaError("confirmation_required", "The AI host must receive the exact physical validation confirmation before preparing the test.", 428);
    if (app.validationActive || app.sessions.active() || app.activeWorker) throw new CinemaError("validation_busy", "Stop the current screening before preparing physical validation.", 409);
    if (deps.hasPendingRecoveryState(app)) throw new CinemaError("recovery_required", "Restore the previous physical or screening recovery before preparing another one.", 409);
    if (!Array.isArray(body.handles) || body.handles.length !== VALIDATION_TARGET_COUNT) throw new CinemaError("validation_target_count", "Physical validation requires exactly four selected lights.", 400);
    const targets = body.handles.map((handle) => app.targetBook.get(handle));
    const scopeHandles = Array.isArray(body.scopeHandles)
      ? body.scopeHandles
      : app.targetBook.size === VALIDATION_TARGET_COUNT && [...app.targetBook.keys()].every((handle) => body.handles.includes(handle))
        ? [...app.targetBook.keys()]
        : null;
    if (!scopeHandles || scopeHandles.length < VALIDATION_TARGET_COUNT) throw new CinemaError("validation_scope_required", "The host must bind the exact screening light set before validation.", 400);
    const scopeTargets = scopeHandles.map((handle) => app.targetBook.get(handle));
    if (scopeTargets.some((target) => !target) || new Set(scopeTargets.map((target) => target.runtimeId)).size !== scopeTargets.length || body.handles.some((handle) => !scopeHandles.includes(handle))) {
      throw new CinemaError("validation_scope_invalid", "The validation lights must belong to the explicitly bound screening set.", 409);
    }
    const prepared = await prepareValidationGrant(app, targets, scopeTargets);
    return sendJsonResult(200, { status: "ready", grant: prepared.grant, expiresAt: prepared.expiresAt, targets: prepared.targets.map(publicTarget) });
  });
}

function runValidationRequest(app, request, body, deps) {
  const grant = String(request.headers["x-cinema-validation-grant"] || "");
  if (!isHandle(grant)) return sendJsonResult(428, { status: "confirmation_required", message: "A short-lived physical validation approval is required after the conversational confirmation." });
  return deps.enqueueTransition(app, async () => {
    deps.assertWritable(app);
    if (app.mode !== "live") throw new CinemaError("validation_live_only", "Physical validation requires live Runtime mode.", 409);
    if (app.validationActive || app.sessions.active() || app.activeWorker) throw new CinemaError("validation_busy", "Stop the current screening before physical validation.", 409);
    if (deps.hasPendingRecoveryState(app)) throw new CinemaError("recovery_required", "Restore the previous physical or screening recovery before starting another one.", 409);
    if (!Array.isArray(body.handles) || body.handles.length !== VALIDATION_TARGET_COUNT) throw new CinemaError("validation_target_count", "Physical validation requires exactly four selected lights.", 400);
    const grantRecord = consumeValidationGrant(app, grant, body.handles);
    app.liveValidationPassed = false;
    app.validationScope.clear();
    app.validationActive = true;
    try {
      const result = await runPhysicalValidation(app, grantRecord.targets);
      if (result.complete) for (const target of grantRecord.scopeTargets) app.validationScope.set(target.handle, { runtimeId: target.runtimeId });
      return sendJsonResult(result.complete ? 200 : 207, { status: result.status, validation: result });
    } finally { app.validationActive = false; }
  });
}

function recoverValidationRequest(app, body, deps) {
  return deps.enqueueTransition(app, async () => {
    deps.assertWritable(app);
    if (app.mode !== "live") throw new CinemaError("validation_live_only", "Physical validation recovery requires live Runtime mode.", 409);
    if (app.validationActive || app.sessions.active() || app.activeWorker) throw new CinemaError("validation_busy", "Stop the current screening before restoring physical validation.", 409);
    const record = app.recoveryRecords.get(body.recoveryId);
    if (!record) throw new CinemaError("recovery_not_found", "The physical validation recovery record is unavailable.", 404);
    if (record.expiresAt <= app.clock()) { record.expired = true; record.phase = "manual_recovery_required"; }
    if (record.expired === true && body.confirmation !== RECOVERY_CONFIRMATION) throw new CinemaError("manual_recovery_confirmation_required", "An expired recovery record requires explicit host confirmation before retrying.", 428);
    app.validationActive = true;
    try {
      const result = await recoverValidation(app, record, { allowPowerOnAtFadeOff: body.confirmation === RECOVERY_CONFIRMATION });
      return sendJsonResult(result.complete ? 200 : 207, { status: result.status, recovery: result });
    } finally { app.validationActive = false; }
  });
}

export { recoverValidationRequest, runValidationRequest };

function sendJsonResult(status, value) { return { __result: true, status, value }; }
