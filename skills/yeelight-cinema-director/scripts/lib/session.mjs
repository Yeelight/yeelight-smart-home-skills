import crypto from "node:crypto";
import { CinemaError, FRAME_INTERVAL_MS, MAX_TARGETS, normalizeTargets, publicSession, randomSessionId } from "./contracts.mjs";

export class CinemaSessionStore {
  constructor(options = {}) {
    this.timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : 30 * 60 * 1000;
    this.clock = typeof options.clock === "function" ? options.clock : Date.now;
    this.sessions = new Map();
    this.activeId = "";
  }

  create(targets = []) {
    const normalized = normalizeTargets(targets);
    if (normalized.length > MAX_TARGETS) throw new CinemaError("target_limit", "Too many lights selected.", 400);
    if (this.activeId) this.invalidate(this.activeId, "replaced");
    const now = this.clock();
    const session = {
      id: randomSessionId(),
      generation: 1,
      state: "ready",
      targets: Object.freeze(normalized.map((target) => Object.freeze({ ...target, capabilities: Object.freeze({ ...target.capabilities }) }))),
      startedAt: null,
      expiresAt: now + this.timeoutMs,
      lastFrameAt: 0,
      wave: 0,
      cursor: 0,
      consecutiveFailureWindows: 0,
      stoppedReason: "",
    };
    this.sessions.set(session.id, session);
    this.activeId = session.id;
    return session;
  }

  get(id) {
    const session = this.sessions.get(id);
    if (!session) return null;
    if (session.expiresAt <= this.clock()) return null;
    return session;
  }

  require(id) {
    const session = this.get(id);
    if (!session) throw new CinemaError("session_expired", "The cinema session has expired.", 409);
    return session;
  }

  requireActive(id) {
    const session = this.require(id);
    if (session.state === "stopped" || this.activeId !== id) throw new CinemaError("stale_session", "The screening session is no longer active.", 409);
    return session;
  }

  peek(id) {
    return this.sessions.get(id) || null;
  }

  active() {
    return this.activeId ? this.peek(this.activeId) : null;
  }

  current(id, generation) {
    const session = this.get(id);
    return Boolean(session && session.generation === generation && session.state === "playing");
  }

  begin(id) {
    const session = this.require(id);
    if (session.state === "ready" || session.state === "paused") session.state = "playing";
    if (!session.startedAt) session.startedAt = this.clock();
    return session;
  }

  pause(id) {
    const session = this.require(id);
    if (session.state === "playing") session.state = "paused";
    return session;
  }

  nextWave(id) {
    const session = this.require(id);
    session.wave = (session.wave + 1) % Math.max(1, session.targets.length);
    return session.wave;
  }

  advanceCursor(id, step = 1) {
    const session = this.require(id);
    const targetCount = Math.max(1, session.targets.length);
    const increment = Number.isInteger(step) && step > 0 ? step : 1;
    session.cursor = (session.cursor + increment) % targetCount;
    return session.cursor;
  }

  recordWindowResult(id, acknowledgedCount) {
    const session = this.require(id);
    session.consecutiveFailureWindows = acknowledgedCount > 0 ? 0 : session.consecutiveFailureWindows + 1;
    return session.consecutiveFailureWindows;
  }

  canSendFrame(id, generation, now = this.clock()) {
    const session = this.get(id);
    if (!session || session.generation !== generation || session.state !== "playing") return false;
    if (session.lastFrameAt && now - session.lastFrameAt < FRAME_INTERVAL_MS) return false;
    session.lastFrameAt = now;
    return true;
  }

  invalidate(id, reason = "stopped") {
    const session = this.sessions.get(id);
    if (!session) return null;
    session.generation += 1;
    session.state = "stopped";
    session.stoppedReason = reason;
    if (this.activeId === id) this.activeId = "";
    return session;
  }

  snapshot(id) {
    const session = this.sessions.get(id);
    if (!session) throw new CinemaError("session_expired", "The cinema session has expired.", 409);
    return Object.freeze({
      id: session.id,
      generation: session.generation,
      targets: session.targets,
      state: session.state,
      startedAt: session.startedAt,
      stoppedReason: session.stoppedReason,
    });
  }

  public(id) {
    return publicSession(this.require(id));
  }

  clear() {
    for (const id of this.sessions.keys()) this.invalidate(id, "clear");
    this.sessions.clear();
    this.activeId = "";
  }

  remove(id) {
    this.sessions.delete(id);
    if (this.activeId === id) this.activeId = "";
  }

  size() {
    return this.sessions.size;
  }
}

export function requestId() {
  return crypto.randomBytes(12).toString("hex");
}
