import crypto from "node:crypto";
import { CinemaError, PROOF_RENEW_GRACE_MS, PROOF_TTL_MS } from "./contracts.mjs";

export function validProof(request, app, options = {}) {
  const supplied = String(request.headers["x-cinema-proof"] || "");
  if (!safeEqual(supplied, app.pageProof)) return false;
  const age = proofAge(app);
  return age < PROOF_TTL_MS || options.allowRenewal === true && age <= PROOF_TTL_MS + PROOF_RENEW_GRACE_MS;
}

export function renewProof(app, suppliedProof) {
  if (proofAge(app) > PROOF_TTL_MS + PROOF_RENEW_GRACE_MS || !safeEqual(suppliedProof, app.pageProof)) throw new CinemaError("page_proof_required", "The page session proof is invalid or expired.", 403);
  rotatePageProof(app);
  return { status: "ok", proof: app.pageProof, expiresAt: app.pageProofIssuedAt + PROOF_TTL_MS };
}

export function rotatePageProof(app) {
  app.pageProof = crypto.randomBytes(24).toString("base64url");
  app.pageProofIssuedAt = app.clock();
  return app.pageProof;
}

export function proofAge(app) { return app.clock() - app.pageProofIssuedAt; }

export function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function scheduleSessionExpiry(app, session, enqueueTransition, finalizeSnapshot) {
  cancelSessionExpiry(app, session.id);
  const delay = Math.max(0, session.expiresAt - app.clock());
  const timer = setTimeout(() => {
    app.expiryTimers.delete(session.id);
    void enqueueTransition(app, () => finalizeExpiredSession(app, session.id, finalizeSnapshot));
  }, delay);
  timer.unref?.();
  app.expiryTimers.set(session.id, timer);
}

export function expireActiveSession(app, enqueueTransition, finalizeSnapshot) {
  const active = app.sessions.active();
  if (!active || active.expiresAt > app.clock()) return Promise.resolve(false);
  return enqueueTransition(app, () => finalizeExpiredSession(app, active.id, finalizeSnapshot));
}

export async function requireLiveSession(app, sessionId, enqueueTransition, finalizeSnapshot, insideTransition = false) {
  const session = app.sessions.peek(sessionId);
  if (!session || session.state === "stopped" || app.sessions.active()?.id !== sessionId) throw new CinemaError("stale_session", "The screening session is no longer active.", 409);
  if (session.expiresAt <= app.clock()) {
    const finalize = insideTransition ? finalizeExpiredSession(app, sessionId, finalizeSnapshot) : enqueueTransition(app, () => finalizeExpiredSession(app, sessionId, finalizeSnapshot));
    await finalize;
    throw new CinemaError("session_expired", "The cinema session has expired.", 409);
  }
  return session;
}

export async function finalizeExpiredSession(app, sessionId, finalizeSnapshot) {
  const current = app.sessions.active();
  if (!current || current.id !== sessionId || current.expiresAt > app.clock()) return false;
  const snapshot = app.sessions.snapshot(current.id);
  invalidateSession(app, current.id, "expired");
  await finalizeSnapshot(app, snapshot);
  return true;
}

export function cancelSessionExpiry(app, sessionId) {
  const timer = app.expiryTimers.get(sessionId);
  if (timer) clearTimeout(timer);
  app.expiryTimers.delete(sessionId);
}

export function invalidateSession(app, sessionId, reason) {
  cancelSessionExpiry(app, sessionId);
  return app.sessions.invalidate(sessionId, reason);
}
