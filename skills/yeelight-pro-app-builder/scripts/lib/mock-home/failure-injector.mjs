export function createFailureInjector() {
  let pending = null;
  let pendingNoop = null;
  return {
    arm(body) {
      const failure = normalizeFailure(body);
      if (failure) pending = failure;
      return failure;
    },
    armNoop(body) {
      const noop = normalizeTarget(body);
      if (noop) pendingNoop = noop;
      return noop;
    },
    async take({ method, path, authorized }) {
      if (!authorized || !pending || pending.method !== method || pending.path !== path) return null;
      const failure = pending;
      pending = failure.remaining > 1 ? { ...failure, remaining: failure.remaining - 1 } : null;
      if (failure.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, failure.delayMs));
      return failure;
    },
    async takeNoop({ method, path, authorized }) {
      if (!authorized || !pendingNoop || pendingNoop.method !== method || pendingNoop.path !== path) return null;
      const noop = pendingNoop;
      pendingNoop = noop.remaining > 1 ? { ...noop, remaining: noop.remaining - 1 } : null;
      if (noop.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, noop.delayMs));
      return noop;
    },
    reset() { pending = null; pendingNoop = null; },
  };
}

function normalizeFailure(body) {
  const target = normalizeTarget(body);
  if (!target) return null;
  const status = Number(body?.status);
  if (!Number.isInteger(status) || status < 400 || status > 599) return null;
  return { ...target, status };
}

function normalizeTarget(body) {
  const method = String(body?.method || "").toUpperCase();
  const path = String(body?.path || "");
  const delayMs = body?.delayMs === undefined ? 0 : Number(body.delayMs);
  const remaining = body?.remaining === undefined ? 1 : Number(body.remaining);
  if (!method || !path.startsWith("/apis/iot/")) return null;
  if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 5000 || !Number.isInteger(remaining) || remaining < 1 || remaining > 10) return null;
  return { method, path, delayMs, remaining };
}
