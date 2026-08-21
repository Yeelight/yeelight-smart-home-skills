import { classifyDesignBatchReceipt } from "./runtime-receipts.mjs";

export async function executeBatchWindow(app, session, generation, rows, signal) {
  if (signal.aborted || !app.sessions.current(session.id, generation)) return rows.map((row) => ({ handle: row.handle, status: "stale" }));
  const targets = rows.map((row) => session.targets.find((target) => target.handle === row.handle)).filter(Boolean);
  const flowTargetCount = targets.filter((target) => target.capabilities.flow).length;
  if (app.runtime.supportsBatchFrames !== true) return null;
  // Mixed capability windows have no single batch contract. No write has
  // started in this branch, so the tick runner may use its compatibility path.
  if (targets.length !== rows.length || (flowTargetCount > 0 && flowTargetCount < targets.length)) return null;
  if (flowTargetCount === 0 && typeof app.runtime.applyDesign === "function") {
    let result;
    try {
      markBatchDispatchEvidence(app, session.id, rows);
      result = await app.runtime.applyDesign(rows.map((row) => ({ ...row, runtimeId: targets.find((target) => target.handle === row.handle)?.runtimeId })), signal, { retrySafeError: false });
    } catch (error) {
      if (isBatchRetryableRuntimeFailure(error)) return batchFailureReceipts(rows, batchFailureReason(error), "transport");
      throw error;
    }
    const expected = new Map(rows.map((row) => [String(targets.find((target) => target.handle === row.handle)?.runtimeId || ""), row.set || {}]));
    const status = classifyDesignBatchReceipt(result, expected);
    if (status === "verified") return rows.map((row) => ({ handle: row.handle, status: "acknowledged" }));
    if (status === "bound_verification_mismatch") return batchFailureReceipts(rows, "runtime_write_verification_mismatch", "verification");
    return batchFailureReceipts(rows, "runtime_batch_receipt_invalid", "verification");
  }
  if (flowTargetCount === targets.length && typeof app.runtime.executeFlows === "function") {
    let result;
    try {
      markBatchDispatchEvidence(app, session.id, rows);
      result = await app.runtime.executeFlows(rows.map((row) => ({ ...row, runtimeId: targets.find((target) => target.handle === row.handle)?.runtimeId })), signal, { retrySafeError: false });
    } catch (error) {
      if (isBatchRetryableRuntimeFailure(error)) return batchFailureReceipts(rows, batchFailureReason(error), "transport");
      throw error;
    }
    if (result?.status === "success" || result?.status === "acknowledged") return rows.map((row) => ({ handle: row.handle, status: "acknowledged" }));
    return batchFailureReceipts(rows, "runtime_batch_receipt_invalid", "verification");
  }
  return null;
}

function markBatchDispatchEvidence(app, sessionId, rows) {
  const evidence = app.screeningWriteEvidence?.get(sessionId);
  if (evidence instanceof Set) rows.forEach((row) => evidence.add(row.handle));
}

function batchFailureReceipts(rows, reason, failureClass) {
  return rows.map((row) => ({ handle: row.handle, status: "failed", reason, failureClass, retryable: true }));
}

function isBatchRetryableRuntimeFailure(error) {
  return (error?.code === "runtime_rejected" && error?.details?.safeToRetry === true)
    || error?.code === "runtime_timeout"
    || error?.code === "runtime_unavailable"
    || error?.code === "runtime_failed"
    || error?.code === "runtime_protocol";
}

function batchFailureReason(error) {
  return error?.code === "runtime_rejected" ? "runtime_retryable" : error?.code || "runtime_batch_uncertain";
}
