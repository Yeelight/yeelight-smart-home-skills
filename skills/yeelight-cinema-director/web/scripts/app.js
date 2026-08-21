import { AudioEngine } from "./audio.mjs";
import { setupAudioControls } from "./audio-controls.mjs";
import { setupCatalog } from "./catalog-ui.mjs";
import { createTickLoop } from "./tick-loop.mjs";
import { createCinemaUi } from "./ui.mjs";

let proof = document.querySelector('meta[name="cinema-proof"]')?.content || "";
const audio = new AudioEngine();
const state = {
  devices: [],
  selected: new Set(),
  roles: new Map(),
  movie: null,
  song: null,
  audioReady: false,
  session: null,
  phase: "idle",
  commandPending: false,
  preparePending: false,
  running: false,
  tickTimer: 0,
  tickInFlight: false,
  frame: 0,
  audioSource: "none",
  live: false,
  controlMode: "mock",
  validationReady: true,
  recoveryRequired: false,
  youtubeCandidate: null,
};
const $ = (id) => document.getElementById(id);
const { animateSpectrum, renderReceipts, setMessage } = createCinemaUi({ $, state });
let proofRenewal = null;

async function renewProof() {
  if (proofRenewal) return proofRenewal;
  proofRenewal = (async () => {
    const response = await fetch("/api/proof/renew", { method: "POST", headers: { origin: location.origin, "content-type": "application/json", "x-cinema-proof": proof }, body: "{}" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.proof !== "string") throw Object.assign(new Error(body.message || body.error || "Proof renewal failed"), { body, status: response.status });
    proof = body.proof;
    return body;
  })().finally(() => { proofRenewal = null; });
  return proofRenewal;
}

const api = async (path, options = {}) => {
  const { _retry = false, ...requestOptions } = options;
  const headers = { ...(requestOptions.body ? { "content-type": "application/json" } : {}), ...(requestOptions.headers || {}) };
  headers["x-cinema-proof"] = proof;
  if (requestOptions.method === "POST") headers.origin = location.origin;
  const response = await fetch(path, { ...requestOptions, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok && !_retry && response.status === 403 && body.error === "page_proof_required") {
    await renewProof();
    return api(path, { ...requestOptions, _retry: true });
  }
  if (!response.ok) throw Object.assign(new Error(body.message || body.error || "Request failed"), { body, status: response.status });
  return body;
};

function applyHealth(health, silent = false) {
  const wasReady = state.validationReady;
  state.live = health.mode === "live";
  state.controlMode = health.controlMode || (state.live ? "configured" : "mock");
  state.validationReady = state.live ? health.validationReady === true : true;
  state.recoveryRequired = state.live && health.recoveryRequired === true;
  $("mode-label").textContent = state.live ? "Mode: live runtime" : "Mode: mock preview";
  $("hardware-boundary").textContent = state.live
    ? (state.recoveryRequired ? "Host recovery required before Start" : state.validationReady ? state.controlMode === "local-preferred" ? "Selected lights only · gateway preferred" : state.controlMode === "local-only" ? "Selected lights only · gateway only" : "Selected lights only" : "Host validation required before Start")
    : "Mock preview never touches hardware";
  const note = $("validation-note");
  note.hidden = !state.live || (!state.recoveryRequired && state.validationReady);
  if (state.live && state.recoveryRequired) note.textContent = "A previous physical validation needs host recovery before another screening can be prepared.";
  else if (state.live && !state.validationReady) note.textContent = "Prepare only captures a read-only snapshot. The AI host must complete the bounded four-light validation before Start.";
  if (!silent && state.live && state.recoveryRequired) setMessage("Live runtime is waiting for the host to recover the previous physical validation.");
  else if (!silent && state.live && !state.validationReady) setMessage("Live runtime is waiting for the host's bounded four-light validation.");
  if (!silent && state.live && state.validationReady && !wasReady) setMessage(state.session ? "Host validation is complete. Start the prepared screening when ready." : "Host validation is complete. Select the lights for this screening.");
  updateSelection();
  updateControls();
}

async function refreshDevices() {
  const data = await api("/api/devices");
  state.devices = data.devices || [];
  for (const handle of [...state.selected]) if (!state.devices.some((device) => device.handle === handle)) state.selected.delete(handle);
  renderDevices();
}

async function refreshHealth({ silent = false } = {}) {
  try {
    const health = await api("/api/health");
    applyHealth(health, silent);
    if (Number.isInteger(health.targetCount) && health.targetCount !== state.devices.length) await refreshDevices();
    return health;
  } catch (error) {
    if (!silent) setMessage(error.message);
    return null;
  }
}

async function boot() {
  try {
    const [health, devices] = await Promise.all([api("/api/health"), api("/api/devices")]);
    state.devices = devices.devices || [];
    $("service-state").textContent = "Ready";
    renderDevices();
    applyHealth(health);
  } catch (error) {
    $("service-state").textContent = "Unavailable";
    setMessage(error.message);
  }
  window.setInterval(() => { void refreshHealth({ silent: true }); }, 15000);
  scheduleProofRenewal();
}

function scheduleProofRenewal() {
  window.setTimeout(async () => {
    try { await renewProof(); } catch { return; }
    scheduleProofRenewal();
  }, 8 * 60 * 1000);
}

function renderDevices() {
  const host = $("device-list");
  host.replaceChildren();
  for (const [index, device] of state.devices.entries()) {
    const label = document.createElement("label");
    label.className = "device-item";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = state.selected.has(device.handle);
    input.addEventListener("change", () => {
      input.checked ? state.selected.add(device.handle) : state.selected.delete(device.handle);
      updateSelection();
    });
    const meta = document.createElement("span");
    meta.className = "device-meta";
    const name = document.createElement("strong");
    name.textContent = device.name;
    const room = document.createElement("span");
    room.textContent = device.room;
    meta.append(name, room);
    const role = document.createElement("select");
    role.className = "role-select";
    const defaultRole = state.devices.length === 1 ? "Accent" : index % 2 === 0 ? "Accent" : "Ambient";
    const roleValue = state.roles.get(device.handle) || device.role || defaultRole;
    state.roles.set(device.handle, roleValue);
    for (const value of ["Accent", "Ambient"]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      option.selected = roleValue === value;
      role.append(option);
    }
    role.addEventListener("change", () => state.roles.set(device.handle, role.value));
    label.append(input, meta, role);
    host.append(label);
  }
  updateSelection();
}

function contentReady() { return Boolean(state.movie && (state.song || state.audioReady)); }
function hasStarted() { return state.phase === "playing" || state.phase === "paused"; }

function updateSelection() {
  $("selection-count").textContent = String(state.selected.size);
  $("create-session").disabled = state.selected.size === 0 || !contentReady() || Boolean(state.session) || state.commandPending || state.recoveryRequired;
}

function updateControls() {
  const session = Boolean(state.session);
  const prepareButton = $("create-session");
  const selectionButtonsDisabled = state.commandPending || state.devices.length === 0;
  $("select-all-lights").disabled = selectionButtonsDisabled;
  $("select-none-lights").disabled = selectionButtonsDisabled;
  prepareButton.disabled = state.selected.size === 0 || !contentReady() || session || state.commandPending || state.recoveryRequired;
  prepareButton.textContent = state.preparePending ? "Preparing..." : "Prepare screening";
  prepareButton.setAttribute("aria-busy", state.preparePending ? "true" : "false");
  $("start-show").textContent = state.phase === "paused" ? "Resume" : "Start";
  $("start-show").disabled = !session || !["ready", "paused"].includes(state.phase) || (state.live && (!state.validationReady || state.recoveryRequired)) || state.commandPending;
  $("pause-show").disabled = !session || state.phase !== "playing" || state.commandPending;
  $("stop-show").disabled = !session || !hasStarted() || state.commandPending;
  document.querySelectorAll("#device-list input, #device-list select").forEach((control) => { control.disabled = state.commandPending; });
}

function setLightSelection(selected) {
  if (state.commandPending) return;
  state.selected.clear();
  if (selected) for (const device of state.devices) state.selected.add(device.handle);
  renderDevices();
}

function isStaleSessionError(error) {
  return error?.body?.error === "stale_session" || error?.body?.error === "session_expired" || error?.body?.status === "stale";
}

function resetLocalSession(status, message) {
  state.running = false;
  window.clearTimeout(state.tickTimer);
  state.tickTimer = 0;
  state.session = null;
  state.phase = "idle";
  $("console-status").textContent = status;
  renderReceipts([]);
  setMessage(message);
}

async function clearPreparedSession() {
  const session = state.session;
  if (!session) return true;
  if (state.phase !== "ready") {
    setMessage("Stop the current screening before changing content.");
    return false;
  }
  if (state.commandPending) return false;
  state.commandPending = true;
  updateControls();
  try {
    await api("/api/session/clear", { method: "POST", body: JSON.stringify({ sessionId: session.sessionId, generation: session.generation }) });
    resetLocalSession("Standby", "Prepared screening cleared. Choose new content.");
    return true;
  } catch (error) {
    if (isStaleSessionError(error)) {
      resetLocalSession("Session expired", "Screening session is no longer active. Choose new content.");
      return true;
    }
    setMessage(error.message);
    return false;
  } finally {
    state.commandPending = false;
    updateControls();
  }
}

const { scheduleTick } = createTickLoop({
  state, $, api, audio, animateSpectrum, renderReceipts, setMessage, updateControls, refreshHealth,
});

$("create-session").addEventListener("click", async () => {
  if (state.commandPending || state.session || state.selected.size === 0) return;
  const handles = [...state.selected];
  const roles = Object.fromEntries(handles.map((handle) => [handle, state.roles.get(handle) || state.devices.find((device) => device.handle === handle)?.role || "Accent"]));
  state.commandPending = true;
  state.preparePending = true;
  state.phase = "preparing";
  $("console-status").textContent = "Preparing";
  setMessage(state.live ? "Checking selected lights and capturing a read-only snapshot..." : "Building the screening snapshot...");
  updateControls();
  try {
    if (state.live) await refreshHealth({ silent: true });
    const data = await api("/api/session", { method: "POST", body: JSON.stringify({ handles, roles }) });
    state.session = data.session;
    state.phase = "ready";
    $("console-status").textContent = "Prepared";
    setMessage(state.live && !state.validationReady ? "Read-only snapshot ready. The AI host must complete validation before Start." : "Snapshot ready. Start when your audio is playing.");
    renderReceipts([]);
  } catch (error) {
    state.phase = "idle";
    if (error.body?.error === "validation_required") applyHealth({ mode: "live", validationReady: false }, true);
    setMessage(error.message);
  } finally {
    state.commandPending = false;
    state.preparePending = false;
    updateControls();
  }
});

$("select-all-lights").addEventListener("click", () => setLightSelection(true));
$("select-none-lights").addEventListener("click", () => setLightSelection(false));

$("start-show").addEventListener("click", async () => {
  const session = state.session;
  if (!session || state.commandPending || !["ready", "paused"].includes(state.phase)) return;
  state.commandPending = true;
  updateControls();
  try {
    state.session = (await api("/api/session/start", { method: "POST", body: JSON.stringify({ sessionId: session.sessionId, generation: session.generation }) })).session;
    state.phase = "playing";
    state.running = true;
    $("console-status").textContent = "Playing";
    setMessage("Screening is live. Audio features are driving the selected lights.");
    void scheduleTick();
  } catch (error) {
    if (isStaleSessionError(error) && state.session?.sessionId === session.sessionId && state.session?.generation === session.generation) {
      resetLocalSession("Session expired", "Screening session is no longer active. Prepare a new screening.");
      return;
    }
    setMessage(error.message);
  } finally {
    state.commandPending = false;
    updateControls();
  }
});

$("pause-show").addEventListener("click", async () => {
  const session = state.session;
  if (!session || state.commandPending || state.phase !== "playing") return;
  state.commandPending = true;
  state.running = false;
  window.clearTimeout(state.tickTimer);
  updateControls();
  try {
    state.session = (await api("/api/session/pause", { method: "POST", body: JSON.stringify({ sessionId: session.sessionId, generation: session.generation }) })).session;
    state.phase = "paused";
    $("console-status").textContent = "Paused";
    setMessage("Screening paused. Resume or stop when ready.");
  } catch (error) {
    if (isStaleSessionError(error) && state.session?.sessionId === session.sessionId && state.session?.generation === session.generation) {
      resetLocalSession("Session expired", "Screening session is no longer active. Prepare a new screening.");
      return;
    }
    state.phase = "playing";
    state.running = true;
    void scheduleTick();
    setMessage(error.message);
  } finally {
    state.commandPending = false;
    updateControls();
  }
});

$("stop-show").addEventListener("click", async () => {
  const session = state.session;
  if (!session || state.commandPending || !hasStarted()) return;
  state.commandPending = true;
  state.running = false;
  window.clearTimeout(state.tickTimer);
  state.phase = "stopping";
  $("console-status").textContent = "Fading";
  updateControls();
  try {
    const result = await api("/api/session/stop", { method: "POST", body: JSON.stringify({ sessionId: session.sessionId, generation: session.generation }) });
    renderReceipts(result.receipt?.rows || []);
    if (!state.live) {
      setMessage("Mock preview ended. No hardware was changed.");
      $("console-status").textContent = "Preview ended";
    } else {
      const recoveryId = result.receipt?.recoveryId || null;
      if (result.status === "uncertain" || recoveryId) {
        state.recoveryRequired = true;
        $("console-status").textContent = "Recovery required";
        setMessage("Screening ended uncertainly. The AI host must recover the affected lights before another live screening.");
        await refreshHealth({ silent: true });
      } else {
        setMessage(`Screening ended: ${result.status}`);
        $("console-status").textContent = "Stopped";
        await refreshHealth({ silent: true });
      }
    }
  } catch (error) {
    setMessage(error.message);
    $("console-status").textContent = "Uncertain";
  } finally {
    state.session = null;
    state.phase = "idle";
    state.commandPending = false;
    updateControls();
  }
});

const { clearSharedAudio } = setupAudioControls({ $, audio, state, updateSelection, setMessage });
setupCatalog({ state, $, api, setMessage, updateSelection, clearPreparedSession, clearSharedAudio });
updateControls();
boot();
