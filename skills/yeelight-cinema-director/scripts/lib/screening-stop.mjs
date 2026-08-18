export function createStopExecutor({ executeTarget, queryState, queryStateBatch, maxWaveSize, concurrency, timeoutMs }) {
  async function executeRows(app, targets, rows, signal) {
    const byHandle = new Map(targets.map((target) => [target.handle, target]));
    const receipts = [];
    const limit = app.mode === "live" ? concurrency : maxWaveSize;
    for (let index = 0; index < rows.length; index += limit) {
      if (signal?.aborted) {
        receipts.push(...rows.slice(index).map((row) => ({ handle: row.handle, status: "timeout" })));
        break;
      }
      const chunk = rows.slice(index, index + limit);
      const chunkReceipts = await Promise.all(chunk.map(async (row) => {
        if (signal?.aborted) return { handle: row.handle, status: "timeout" };
        const target = byHandle.get(row.handle);
        if (!target || !row.set || Object.keys(row.set).length === 0) return { handle: row.handle, status: "failed" };
        try {
          const result = await executeTarget(app, target, row, signal, true);
          return { handle: row.handle, status: result?.status === "acknowledged" ? "acknowledged" : "failed" };
        } catch { return { handle: row.handle, status: signal?.aborted ? "timeout" : "failed" }; }
      }));
      receipts.push(...chunkReceipts);
    }
    return receipts;
  }

  async function queryStopState(app, targets, signal) {
    if (typeof queryStateBatch === "function") {
      try {
        const result = await queryStateBatch(app, targets, signal);
        return normalizeQueryRows(targets, result);
      } catch {
        return targets.map((target) => ({ handle: target.handle, failed: true }));
      }
    }
    const rows = [];
    for (let index = 0; index < targets.length; index += maxWaveSize) {
      const chunk = targets.slice(index, index + maxWaveSize);
      const chunkRows = await Promise.all(chunk.map(async (target) => {
        try {
          const result = await queryState(app, target, signal);
          return normalizeQueryRows([target], result)[0];
        } catch { return { handle: target.handle, failed: true }; }
      }));
      rows.push(...chunkRows);
    }
    return rows;
  }

  async function runStopPhase(app, targets, rows) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try { return { receipts: await executeRows(app, targets, rows, controller.signal), timedOut: controller.signal.aborted }; }
    finally { clearTimeout(timer); }
  }

  return { executeRows, queryStopState, runStopPhase };
}

function normalizeQueryRows(targets, result) {
  if (!Array.isArray(result)) return targets.map((target) => ({ handle: target.handle, failed: true }));
  const byRuntimeId = new Map();
  for (const row of result) {
    if (!row || typeof row.runtimeId !== "string" || byRuntimeId.has(row.runtimeId)) return targets.map((target) => ({ handle: target.handle, failed: true }));
    byRuntimeId.set(row.runtimeId, row);
  }
  return targets.map((target) => {
    const state = byRuntimeId.get(target.runtimeId);
    return state ? { handle: target.handle, runtimeId: state.runtimeId, verified: state.verified === true, power: state.power, brightness: state.brightness, color: state.color, colorTemperature: state.colorTemperature, online: state.online, simulated: state.simulated === true } : { handle: target.handle, missing: true };
  });
}

export function stateMatchesPreState(row, target) {
  if (!target.preStateVerified || !target.preStateComplete || row?.runtimeId !== target.runtimeId || row?.verified !== true || row?.online !== true || row?.simulated === true) return false;
  return Object.entries(target.preState || {}).every(([property, value]) => row[property] === value);
}

export function phaseReceipt(targets, receipts, timedOut = false) {
  const byHandle = new Map(receipts.map((row) => [row.handle, row]));
  const rows = targets.map((target) => {
    const status = byHandle.get(target.handle)?.status || "missing";
    return { handle: target.handle, status: timedOut && status === "acknowledged" ? "timeout" : status };
  });
  const failed = rows.filter((row) => row.status !== "acknowledged");
  return { status: failed.length ? failed.length === rows.length ? "uncertain" : "partial" : "acknowledged", timedOut: timedOut === true, rows };
}

export function publicQueryRow(row) {
  const bounded = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  return { handle: row.handle, verified: row.verified === true, online: row.online === true ? true : row.online === false ? false : null, power: row.power === false ? false : row.power === true ? true : null, brightness: bounded(row.brightness, 1, 100) ? row.brightness : null, color: bounded(row.color, 0, 0xFFFFFF) ? row.color : null, colorTemperature: bounded(row.colorTemperature, 1700, 6500) ? row.colorTemperature : null, simulated: row.simulated === true };
}
