import crypto from "node:crypto";

const DEFAULT_SESSION_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_TURN_TIMEOUT_MS = 2 * 60 * 1000;

export class SessionStore {
  #active = null;
  #timeoutMs;
  #timer = null;
  #onInvalidate;

  constructor({ timeoutMs = DEFAULT_SESSION_TIMEOUT_MS, onInvalidate = null } = {}) {
    this.#timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.round(timeoutMs) : DEFAULT_SESSION_TIMEOUT_MS;
    this.#onInvalidate = typeof onInvalidate === "function" ? onInvalidate : null;
  }

  setInvalidationHandler(handler) {
    this.#onInvalidate = typeof handler === "function" ? handler : null;
  }

  createSession() {
    if (this.#active) this.invalidate(this.#active.id, "session_replaced");
    const createdAt = Date.now();
    this.#active = {
      id: crypto.randomBytes(32).toString("base64url"),
      generation: crypto.randomUUID(),
      createdAt,
      expiresAt: createdAt + this.#timeoutMs,
      requests: new Map(),
      turns: new Map(),
      turnTimers: new Map(),
      state: {},
    };
    const sessionId = this.#active.id;
    this.#timer = setTimeout(() => {
      if (this.#active?.id === sessionId) this.invalidate(sessionId, "timeout");
    }, this.#timeoutMs);
    this.#timer.unref?.();
    return this.#publicSession(this.#active);
  }

  get(sessionId) {
    if (!this.#active || this.#active.id !== sessionId) return null;
    if (this.#active.expiresAt <= Date.now()) {
      this.invalidate(this.#active.id, "timeout");
      return null;
    }
    return this.#active;
  }

  createRequest(sessionId, configRevision) {
    const session = this.get(sessionId);
    if (!session) return null;
    const controller = new AbortController();
    const request = {
      sessionId,
      sessionGeneration: session.generation,
      requestId: crypto.randomUUID(),
      configRevision,
      state: "active",
      createdAt: Date.now(),
      controller,
      signal: controller.signal,
    };
    session.requests.set(request.requestId, request);
    return { ...request };
  }

  createTurn(sessionId, { experienceId, phase = "A", features = {}, ttlMs = 2 * 60 * 1000 } = {}) {
    const session = this.get(sessionId);
    if (!session || typeof experienceId !== "string" || !experienceId || typeof phase !== "string" || !phase) return null;
    this.#pruneTurns(session);
    const createdAt = Date.now();
    const turnTtl = Number.isFinite(ttlMs) && ttlMs > 0 ? Math.round(ttlMs) : DEFAULT_TURN_TIMEOUT_MS;
    const record = {
      receipt: crypto.randomBytes(24).toString("base64url"),
      sessionId: session.id,
      sessionGeneration: session.generation,
      experienceId,
      phase,
      features: cloneValue(features),
      state: "issued",
      createdAt,
      expiresAt: createdAt + turnTtl,
    };
    session.turns.set(record.receipt, record);
    const timer = setTimeout(() => {
      if (this.#active?.id !== session.id || session.turns.get(record.receipt) !== record) return;
      if (record.state === "issued") {
        record.features = {};
        record.state = "expired";
      }
      session.turnTimers.delete(record.receipt);
    }, turnTtl);
    timer.unref?.();
    session.turnTimers.set(record.receipt, timer);
    return this.#publicTurn(record);
  }

  consumeTurn(sessionId, { receipt, experienceId, phase = "A" } = {}) {
    const session = this.get(sessionId);
    const record = session?.turns.get(receipt);
    if (!session || !record || record.sessionId !== session.id || record.sessionGeneration !== session.generation || record.experienceId !== experienceId || record.phase !== phase) {
      return { ok: false, reason: "turn_unavailable" };
    }
    if (record.expiresAt <= Date.now()) {
      this.#clearTurnTimer(session, receipt);
      record.features = {};
      record.state = "expired";
      return { ok: false, reason: "turn_expired" };
    }
    if (record.state !== "issued") return { ok: false, reason: "turn_replayed" };
    // This is deliberately synchronous. No provider or Runtime work may occur
    // before the receipt changes state, so concurrent B submissions cannot both
    // consume the same private turn.
    const features = cloneValue(record.features);
    this.#clearTurnTimer(session, receipt);
    record.features = {};
    record.state = "consumed";
    record.consumedAt = Date.now();
    return { ok: true, record: { ...record, features } };
  }

  completeTurn(sessionId, receipt, state = "committed") {
    const session = this.get(sessionId);
    const record = session?.turns.get(receipt);
    if (!record || record.sessionId !== sessionId || !["consumed", "committed"].includes(record.state)) return false;
    if (state !== "committed" && state !== "consumed" && state !== "failed") return false;
    record.state = state;
    if (state === "committed") record.committedAt = Date.now();
    // Keep a tiny terminal tombstone so an immediate replay returns the stable
    // `turn_replayed` error, while consumed private features remain cleared.
    record.features = {};
    this.#clearTurnTimer(session, receipt);
    return true;
  }

  hasGardenSeed(sessionId) {
    const session = this.get(sessionId);
    return Boolean(session?.state.gardenSeedClaimed);
  }

  claimGardenSeed(sessionId) {
    const session = this.get(sessionId);
    if (!session) return { ok: false, reason: "session_expired" };
    if (session.state.gardenSeedClaimed) return { ok: false, duplicate: true };
    session.state.gardenSeedClaimed = true;
    return { ok: true };
  }

  isCurrent(request) {
    const session = this.get(request?.sessionId);
    const current = session?.requests.get(request?.requestId);
    return Boolean(current && current.state === "active" && current.configRevision === request.configRevision && current.sessionGeneration === request.sessionGeneration);
  }

  invalidate(sessionId, reason = "invalidated") {
    const session = this.#active?.id === sessionId ? this.#active : null;
    if (!session) return false;
    for (const request of session.requests.values()) {
      if (request.state === "active") {
        request.state = "discarded";
        request.controller.abort(reason);
      }
    }
    session.invalidatedReason = reason;
    session.requests.clear();
    session.turns.clear();
    for (const timer of session.turnTimers.values()) clearTimeout(timer);
    session.turnTimers.clear();
    session.state = {};
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#active = null;
    try { this.#onInvalidate?.({ sessionId, reason }); } catch { /* cleanup hooks cannot block invalidation */ }
    return true;
  }

  finish(sessionId) { return this.invalidate(sessionId, "finish"); }
  handoff(sessionId) { return this.invalidate(sessionId, "handoff"); }
  resetAll(reason = "staff-reset") { return this.#active ? this.invalidate(this.#active.id, reason) : false; }

  discardForRevision(revision, reason = "provider_revision_changed") {
    const session = this.#active;
    if (!session) return 0;
    let discarded = 0;
    for (const request of session.requests.values()) {
      if (request.state === "active" && request.configRevision !== revision) {
        request.state = "discarded";
        request.controller.abort(reason);
        discarded += 1;
      }
    }
    return discarded;
  }

  complete(request, state) {
    const session = this.get(request?.sessionId);
    const current = session?.requests.get(request?.requestId);
    if (!current || !this.isCurrent(request)) return false;
    current.state = state;
    session.requests.delete(request.requestId);
    return true;
  }

  #publicSession(session) {
    return {
      id: session.id,
      sessionId: session.id,
      generation: session.generation,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    };
  }

  #pruneTurns(session) {
    const now = Date.now();
    for (const [receipt, turn] of session.turns) {
      if (turn.expiresAt <= now || turn.state !== "issued") {
        this.#clearTurnTimer(session, receipt);
        session.turns.delete(receipt);
      }
    }
  }

  #clearTurnTimer(session, receipt) {
    const timer = session.turnTimers.get(receipt);
    if (timer) clearTimeout(timer);
    session.turnTimers.delete(receipt);
  }

  #publicTurn(turn) {
    return {
      receipt: turn.receipt,
      experienceId: turn.experienceId,
      phase: turn.phase,
      expiresAt: turn.expiresAt,
      nextPhase: "B",
    };
  }
}

function cloneValue(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}
