const TERMINAL_ERRORS = new Set(["page_proof_required", "recovery_required", "validation_required", "validation_busy", "service_shutting_down"]);
const NORMAL_TICK_DELAY_MS = 620;
const TRANSPORT_LOSS_DELAY_MS = 1200;

export function canContinueTick(result) {
  if (result?.status === "skipped") return result.reason === "cadence" || result.reason === "busy";
  if (result?.status === "acknowledged") return result.receipt?.status === "acknowledged" && Array.isArray(result.receipt.rows);
  return ["partial", "uncertain"].includes(result?.status)
    && result.receipt?.status === result.status
    && Array.isArray(result.receipt.rows)
    && result.receipt.window?.continuable === true
    && Number.isInteger(result.receipt.window.selectedCount)
    && result.receipt.window.selectedCount > 0;
}

// A fetch rejection has no HTTP response, so the server may already have
// accepted the frame. Never replay that POST; schedule a later frame and let
// the server's generation/cursor or a terminal response decide the outcome.
export function isTransientTransportError(error) {
  return Boolean(error)
    && error.name !== "AbortError"
    && error.body === undefined
    && error.status === undefined;
}

export function createTickLoop({ state, $, api, audio, animateSpectrum, renderReceipts, setMessage, updateControls, refreshHealth }) {
  function isCurrentSession(session) {
    return state.session?.sessionId === session.sessionId && state.session?.generation === session.generation;
  }

  function isStaleError(error) {
    return error?.body?.error === "stale_session" || error?.body?.error === "session_expired" || error?.body?.status === "stale";
  }

  function stop(message) {
    state.running = false;
    window.clearTimeout(state.tickTimer);
    state.tickTimer = 0;
    $("console-status").textContent = "Blocked";
    setMessage(message);
    updateControls();
  }

  async function settleStaleSession(session, error) {
    if (!state.running || state.phase !== "playing" || !isCurrentSession(session)) return false;
    const body = error?.body || {};
    const rows = Array.isArray(body.receipt?.rows) ? body.receipt.rows : [];
    const recoveryQueue = body.termination?.receipt?.recoveryQueue;
    const needsRecovery = Array.isArray(recoveryQueue) && recoveryQueue.length > 0;
    state.running = false;
    window.clearTimeout(state.tickTimer);
    state.tickTimer = 0;
    state.session = null;
    state.phase = "idle";
    state.recoveryRequired = needsRecovery;
    $("console-status").textContent = needsRecovery ? "Recovery required" : "Stopped";
    renderReceipts(rows);
    setMessage(needsRecovery
      ? "Playback stopped after an unverified frame. Host recovery is required before another live screening."
      : "Playback stopped after an unverified frame. The affected lights were restored.");
    updateControls();
    try { await refreshHealth?.({ silent: true }); } catch { /* health refresh is advisory here */ }
    return true;
  }

  async function scheduleTick() {
    if (!state.running || !state.session || state.tickInFlight) return;
    const session = state.session;
    state.tickInFlight = true;
    state.frame += 1;
    const measured = audio?.energy?.();
    const energy = measured ?? (.35 + ((Math.sin(state.frame / 4) + 1) / 2) * .6);
    const hue = (24 + state.frame * 7) % 360;
    $("energy").textContent = `${Math.round(energy * 100)}%`;
    $("lyric-cue").textContent = state.frame % 12 < 5 ? "FIRE" : "NONE";
    animateSpectrum?.(energy);
    let continueLoop = false;
    let nextDelayMs = NORMAL_TICK_DELAY_MS;
    try {
      const result = await api("/api/session/tick", { method: "POST", body: JSON.stringify({ sessionId: session.sessionId, generation: session.generation, frame: { energy, hue, saturation: 74, brightness: 74, lyricCue: state.frame % 12 < 5 ? "fire" : "none" } }) });
      if (!state.running || state.phase !== "playing" || !isCurrentSession(session)) return;
      $("last-receipt").textContent = String(result.status || "unknown").toUpperCase();
      renderReceipts(result.receipt?.rows || []);
      if (canContinueTick(result)) {
        continueLoop = true;
        const window = result.receipt?.window;
        setMessage(window?.acknowledgedCount === 0
          ? "No light was acknowledged in this frame. Retrying the next frame; Stop will restore the selected lights."
          : "This frame was partially acknowledged. Continuing with the next frame; Stop will restore the selected lights.");
      } else if (result.status === "partial" || result.status === "uncertain") {
        stop("This frame was not fully verified. Playback stopped; use Stop to restore affected lights.");
      } else {
        stop("Playback stopped because the Runtime returned an incomplete frame result.");
      }
    } catch (error) {
      if (isStaleError(error)) {
        await settleStaleSession(session, error);
      } else if (isTransientTransportError(error) && state.running && state.phase === "playing" && isCurrentSession(session)) {
        continueLoop = true;
        nextDelayMs = TRANSPORT_LOSS_DELAY_MS;
        setMessage("与本地服务的连接暂时中断，保留演出并等待下一帧继续。若服务端已完成上一帧，下一帧会自动接着轮转。");
      } else if (isCurrentSession(session)) {
        const message = TERMINAL_ERRORS.has(error?.body?.error)
          ? error.message
          : `Playback stopped: ${error.message || "the Runtime request failed"}. Use Stop to restore affected lights.`;
        stop(message);
      }
    } finally {
      state.tickInFlight = false;
      if (continueLoop && state.running && state.phase === "playing" && state.session && isCurrentSession(session)) {
        window.clearTimeout(state.tickTimer);
        state.tickTimer = window.setTimeout(() => { void scheduleTick(); }, nextDelayMs);
      }
    }
  }

  return { scheduleTick, stopTickLoop: stop };
}
