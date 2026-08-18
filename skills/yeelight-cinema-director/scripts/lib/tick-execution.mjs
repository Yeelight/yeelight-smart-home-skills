export function createTickRunner({ chunkPlan, selectLightingWindow, maxWaveSize, liveWindowSize, liveConcurrency = 8, liveMaxBrightness, executeTarget, recordScreeningStates, CinemaError }) {
  async function runTick(app, session, generation, plan, signal) {
    if (app.mode === "live") {
      const window = selectLightingWindow(plan, session.cursor, liveWindowSize);
      const journal = createJournalGate({
        signal,
        isCurrent: () => app.sessions.current(session.id, generation),
        record: (rows) => recordScreeningStates(app, session.id, rows),
      });
      try {
        // Persist the complete frame before any Runtime write. One durable
        // record keeps the whole selected set recoverable without serializing
        // an fsync in front of every target worker.
        if (!await journal.record(window)) return plan.rows.map((row) => ({ handle: row.handle, status: "stale" }));
        const execute = createTickExecutor(app, session, generation, signal);
        const selectedReceipts = await executeParallelChunk(window, execute, liveConcurrency, signal, journal.close);
        const byHandle = new Map(selectedReceipts.map((receipt) => [receipt.handle, receipt]));
        return plan.rows.map((row) => byHandle.get(row.handle) || { handle: row.handle, status: "not_started", reason: "worker_not_started" });
      } finally {
        journal.close();
        await journal.drain();
      }
    }
    const receipts = [];
    const chunks = chunkPlan(plan, maxWaveSize);
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const chunk = chunks[chunkIndex];
      if (signal.aborted || !app.sessions.current(session.id, generation)) {
        receipts.push(...chunks.slice(chunkIndex).flatMap((pendingChunk) => pendingChunk.map((row) => ({ handle: row.handle, status: "stale" }))));
        break;
      }
      const execute = createTickExecutor(app, session, generation, signal);
      receipts.push(...await executeSerialChunk(chunk, execute, false));
    }
    return receipts;
  }

  function createTickExecutor(app, session, generation, signal) {
    return async (row) => {
      if (signal.aborted || !app.sessions.current(session.id, generation)) return { handle: row.handle, status: "stale" };
      const target = session.targets.find((item) => item.handle === row.handle);
      try {
        if (signal.aborted || !app.sessions.current(session.id, generation)) return { handle: row.handle, status: "stale" };
        if (app.mode === "live" && Number.isInteger(row.set?.brightness) && row.set.brightness > liveMaxBrightness) throw new CinemaError("live_brightness_limit", "The live screening brightness exceeds the server safety limit.", 400);
        if (app.mode === "live") markScreeningWriteAttempt(app, session.id, row.handle);
        const receipt = await executeTarget(app, target, row, signal, false, { retrySafeError: true });
        if (receipt?.status === "acknowledged") return { handle: row.handle, status: "acknowledged" };
        if (receipt?.retryable === true) {
          return {
            handle: row.handle,
            status: "failed",
            reason: receipt.reason || "runtime_write_verification_mismatch",
            failureClass: receipt.failureClass || "verification",
            retryable: true,
          };
        }
        throw new CinemaError("runtime_unverified", "The Runtime did not acknowledge the target-bound live write.", 502);
      } catch (error) {
        if (signal.aborted || !app.sessions.current(session.id, generation)) return { handle: row.handle, status: "stale" };
        if (app.mode === "live" && isRetryableRuntimeFailure(error)) {
          return {
            handle: row.handle,
            status: "failed",
            reason: retryableReason(error),
            failureClass: "transport",
            retryable: true,
          };
        }
        if (app.mode === "live" && !isBoundVerificationFailure(error, target, row)) throw error;
        return { handle: row.handle, status: "failed", reason: error.code, failureClass: "verification", retryable: true };
      }
    };
  }

  async function executeParallelChunk(rows, execute, concurrency, signal, onFatal) {
    const receipts = new Array(rows.length);
    const limit = Math.max(1, Math.min(Number.isInteger(concurrency) ? concurrency : 1, rows.length));
    let nextIndex = 0;
    let fatal = null;

    async function worker() {
      while (true) {
        if (signal.aborted || fatal) return;
        const index = nextIndex;
        nextIndex += 1;
        if (index >= rows.length) return;
        try {
          receipts[index] = await execute(rows[index]);
        } catch (error) {
          if (!fatal) {
            fatal = error;
            onFatal?.();
          }
        }
      }
    }

    await Promise.all(Array.from({ length: limit }, () => worker()));
    if (fatal) throw fatal;
    return rows.map((row, index) => receipts[index] || { handle: row.handle, status: signal.aborted ? "stale" : "not_started" });
  }

  async function executeSerialChunk(rows, execute, live) {
    if (!live) return Promise.all(rows.map((row) => execute(row)));
    const receipts = [];
    for (const row of rows) {
      const receipt = await execute(row);
      receipts.push(receipt);
      if (receipt.status === "stale") break;
    }
    return receipts.concat(rows.slice(receipts.length).map((row) => ({ handle: row.handle, status: "not_started" })));
  }

  return runTick;
}

function markScreeningWriteAttempt(app, sessionId, handle) {
  const evidence = app.screeningWriteEvidence?.get(sessionId);
  if (evidence instanceof Set) evidence.add(handle);
}

function createJournalGate({ signal, isCurrent, record }) {
  let tail = Promise.resolve();
  let closed = false;
  const recordFrame = (rows) => {
    if (closed || signal.aborted || !isCurrent()) return Promise.resolve(false);
    const task = tail.then(async () => {
      if (closed || signal.aborted || !isCurrent()) return false;
      await record(rows);
      return true;
    });
    tail = task.catch(() => {});
    return task;
  };
  return {
    record: recordFrame,
    close: () => { closed = true; },
    drain: () => tail,
  };
}

function isBoundVerificationFailure(error, target, row) {
  const details = error?.details || {};
  return error?.code === "runtime_write_verification_mismatch"
    && details.classification === "bound_verification_mismatch"
    && String(details.runtimeId) === String(target?.runtimeId)
    && typeof details.property === "string"
    && Object.hasOwn(row?.set || {}, details.property)
    && details.expectedValue === row.set[details.property];
}

function isRetryableRuntimeFailure(error) {
  return (error?.code === "runtime_rejected" && error?.details?.safeToRetry === true)
    || error?.code === "runtime_timeout"
    || error?.code === "runtime_unavailable"
    // A process exit or malformed response may happen after the Runtime has
    // accepted a physical write. The screening journal and final readback
    // keep that state recoverable, so the next frame can continue.
    || error?.code === "runtime_failed"
    || error?.code === "runtime_protocol";
}

function retryableReason(error) {
  return error?.code === "runtime_rejected" ? "runtime_retryable" : error?.code || "runtime_retryable";
}
