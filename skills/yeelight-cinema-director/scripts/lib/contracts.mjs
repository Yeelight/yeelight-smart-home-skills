import crypto from "node:crypto";

export const MAX_TARGETS = 160;
export const MAX_BODY_BYTES = 64 * 1024;
export const FRAME_INTERVAL_MS = 560;
export const FADE_DURATION_MS = 3200;
// Keep the server-side live ceiling aligned with the built-in UI frame value.
export const LIVE_MAX_BRIGHTNESS = 74;
export const PROOF_TTL_MS = 10 * 60 * 1000;
export const PROOF_RENEW_GRACE_MS = 5 * 60 * 1000;
export const SERVICE_ID = "yeelight-cinema-director";
export const ACTIONS = new Set(["discover", "start", "tick", "pause", "stop", "clear", "artwork"]);
export const LYRIC_CUES = new Set(["none", "fire", "warmth", "hope", "cool", "clarity"]);
export const ROLE_NAMES = new Set(["Accent", "Ambient"]);
const HANDLE_PATTERN = /^[A-Za-z0-9_-]{20,96}$/;
const PRIVATE_REQUEST_FIELDS = new Set(["runtimeId", "runtimeIds", "deviceId", "deviceIds", "roomId", "roomIds", "intent", "header", "headers", "profile", "region", "house", "houseId", "command", "shell", "raw", "token", "apiKey", "artworkUrl"]);
const ROUTE_FIELDS = new Map([
  ["/api/proof/renew", new Set()],
  ["/api/session", new Set(["handles", "roles"])],
  ["/api/session/start", new Set(["sessionId", "generation"])],
  ["/api/session/tick", new Set(["sessionId", "generation", "frame"])],
  ["/api/session/pause", new Set(["sessionId", "generation"])],
  ["/api/session/stop", new Set(["sessionId", "generation"])],
  ["/api/session/clear", new Set(["sessionId", "generation"])],
  ["/api/validation/prepare", new Set(["handles"])],
  ["/api/validation/run", new Set(["handles"])],
  ["/api/validation/recover", new Set(["recoveryId"])],
  ["/api/host/validation/prepare", new Set(["handles", "scopeHandles", "confirmation"])],
  ["/api/host/validation/run", new Set(["handles"])],
  ["/api/host/validation/recover", new Set(["recoveryId", "confirmation"])],
  ["/api/host/screening/recover", new Set(["recoveryId", "confirmation"])]
]);

export class CinemaError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = "CinemaError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function fail(code, message, status = 400, details = {}) {
  throw new CinemaError(code, message, status, details);
}

export function randomOpaque(prefix = "h") {
  return `${prefix}_${crypto.randomBytes(18).toString("base64url")}`;
}

export function randomSessionId() {
  return randomOpaque("s");
}

export function isHandle(value) {
  return typeof value === "string" && HANDLE_PATTERN.test(value);
}

export function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function publicError(error) {
  const source = error instanceof CinemaError ? error : null;
  return {
    status: source?.status || 500,
    error: source?.code || "internal_error",
    message: source?.message || "The cinema service could not complete that request.",
  };
}

export function normalizeFrame(frame) {
  if (!isPlainObject(frame)) fail("invalid_frame", "A bounded audio frame is required.");
  const keys = new Set(Object.keys(frame));
  const allowed = new Set(["energy", "hue", "saturation", "brightness", "lyricCue"]);
  if ([...keys].some((key) => !allowed.has(key))) fail("invalid_frame", "The audio frame contains an unsupported field.");
  const energy = Number(frame.energy);
  const hue = Number(frame.hue);
  const saturation = Number(frame.saturation);
  const brightness = Number(frame.brightness);
  if (!Number.isFinite(energy) || energy < 0 || energy > 1) fail("invalid_frame", "Energy must be between 0 and 1.");
  if (!Number.isInteger(hue) || hue < 0 || hue > 359) fail("invalid_frame", "Hue must be between 0 and 359.");
  if (!Number.isInteger(saturation) || saturation < 0 || saturation > 100) fail("invalid_frame", "Saturation must be between 0 and 100.");
  if (!Number.isInteger(brightness) || brightness < 1 || brightness > 100) fail("invalid_frame", "Brightness must be between 1 and 100.");
  const lyricCue = frame.lyricCue === undefined ? "none" : frame.lyricCue;
  if (!LYRIC_CUES.has(lyricCue)) fail("invalid_frame", "The lyric cue is not supported.");
  return { energy, hue, saturation, brightness, lyricCue };
}

export function assertRequest(body, route = "") {
  if (!isPlainObject(body)) fail("invalid_json", "The request body must be a JSON object.");
  if (Object.keys(body).length > 12) fail("invalid_request", "The request contains too many fields.");
  const allowed = ROUTE_FIELDS.get(route);
  if (allowed && [...Object.keys(body)].some((key) => !allowed.has(key))) fail("unknown_field", "The request contains an unsupported field.");
  if ([...Object.keys(body)].some((key) => PRIVATE_REQUEST_FIELDS.has(key))) fail("private_field_blocked", "Runtime and credential fields are server-owned.");
  if (body.action !== undefined && !ACTIONS.has(body.action)) fail("invalid_action", "The action is not supported.");
  if (body.sessionId !== undefined && !isHandle(body.sessionId)) fail("invalid_session", "The session reference is invalid.");
  if (body.generation !== undefined && (!Number.isInteger(body.generation) || body.generation < 1)) fail("invalid_generation", "The session generation is invalid.");
  if (body.handles !== undefined) {
    if (!Array.isArray(body.handles) || body.handles.length > MAX_TARGETS) fail("target_limit", `A screening supports at most ${MAX_TARGETS} selected lights.`);
    const unique = new Set(body.handles);
    if (unique.size !== body.handles.length || [...unique].some((handle) => !isHandle(handle))) fail("invalid_targets", "Target handles must be unique opaque references.");
  }
  if (body.scopeHandles !== undefined) {
    if (!Array.isArray(body.scopeHandles) || body.scopeHandles.length > MAX_TARGETS) fail("target_limit", `A screening supports at most ${MAX_TARGETS} selected lights.`);
    const unique = new Set(body.scopeHandles);
    if (unique.size !== body.scopeHandles.length || [...unique].some((handle) => !isHandle(handle))) fail("invalid_targets", "Screening scope handles must be unique opaque references.");
  }
  if (body.roles !== undefined) {
    if (!isPlainObject(body.roles) || Object.keys(body.roles).length > MAX_TARGETS) fail("invalid_roles", "Role assignments are invalid.");
    for (const [handle, role] of Object.entries(body.roles)) if (!isHandle(handle) || !ROLE_NAMES.has(role)) fail("invalid_roles", "Each selected light needs one supported role.");
  }
  if (route === "/api/session" && body.roles && body.handles && Object.keys(body.roles).some((handle) => !body.handles.includes(handle))) fail("invalid_roles", "Role assignments must reference selected lights.");
  if (body.frame !== undefined) normalizeFrame(body.frame);
  for (const field of ["movieQuery", "songQuery"]) {
    if (body[field] !== undefined && (typeof body[field] !== "string" || body[field].length > 160)) fail("invalid_query", "Search text is too long.");
  }
  if (body.artworkHandle !== undefined && !isHandle(body.artworkHandle)) fail("invalid_artwork", "The artwork reference is invalid.");
  if (body.recoveryId !== undefined && !isHandle(body.recoveryId)) fail("invalid_recovery", "The recovery reference is invalid.");
  if (body.confirmation !== undefined && (typeof body.confirmation !== "string" || body.confirmation.length > 96)) fail("invalid_confirmation", "The confirmation is invalid.");
  return body;
}

export function normalizeTargets(rawTargets) {
  if (!Array.isArray(rawTargets)) fail("invalid_targets", "A target list is required.");
  if (rawTargets.length < 1) fail("targets_required", "Select at least one online light.");
  if (rawTargets.length > MAX_TARGETS) fail("target_limit", `A screening supports at most ${MAX_TARGETS} selected lights.`);
  const seen = new Set();
  const targets = rawTargets.map((raw, index) => {
    if (!isPlainObject(raw)) fail("invalid_targets", "Each target must be an object.");
    const identity = String(raw.runtimeId || "").trim();
    if (!identity || identity.length > 160) fail("invalid_targets", "A Runtime target identity is missing.");
    if (seen.has(identity)) fail("duplicate_target", "A light was selected more than once.");
    seen.add(identity);
    const handle = isHandle(raw.handle) ? raw.handle : randomOpaque("h");
    return {
      handle,
      runtimeId: identity,
      name: cleanDisplay(raw.name, `Light ${index + 1}`),
      room: cleanDisplay(raw.room, "Unassigned"),
      online: raw.online !== false,
      capabilities: {
        power: raw.capabilities?.power !== false,
        brightness: raw.capabilities?.brightness !== false,
        color: raw.capabilities?.color === true,
        temperature: raw.capabilities?.temperature === true,
        flow: raw.capabilities?.flow === true,
      },
      isLight: raw.isLight !== false,
      preState: normalizePreState(raw.preState),
      preStateVerified: raw.preStateVerified === true,
      preStateComplete: raw.preStateComplete === true,
      requestedRole: ROLE_NAMES.has(raw.role) ? raw.role : "",
    };
  });
  const sorted = targets.sort((a, b) => `${a.room}\0${a.name}\0${a.runtimeId}`.localeCompare(`${b.room}\0${b.name}\0${b.runtimeId}`));
  return assignRoles(sorted);
}

function cleanDisplay(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, 120) : fallback;
}

export function assignRoles(targets) {
  return targets.map((target, index) => ({
    ...target,
    role: target.requestedRole || (targets.length === 1 ? "Accent" : index % 2 === 0 ? "Accent" : "Ambient"),
    ordinal: index,
  }));
}

export function publicTarget(target) {
  const result = {
    handle: target.handle,
    name: target.name,
    room: target.room,
    online: target.online,
    role: target.role,
    capabilities: { ...target.capabilities, power: target.capabilities.power !== false },
  };
  if (target.preStateVerified) {
    result.preState = { ...target.preState };
    result.preStateVerified = true;
    result.preStateComplete = target.preStateComplete === true;
  }
  return result;
}

function normalizePreState(value) {
  if (!isPlainObject(value)) return {};
  const state = {};
  if (typeof value.power === "boolean") state.power = value.power;
  if (Number.isInteger(value.brightness) && value.brightness >= 1 && value.brightness <= 100) state.brightness = value.brightness;
  if (Number.isInteger(value.color) && value.color >= 0 && value.color <= 0xFFFFFF) state.color = value.color;
  if (Number.isInteger(value.colorTemperature) && value.colorTemperature >= 1700 && value.colorTemperature <= 6500) state.colorTemperature = value.colorTemperature;
  return state;
}

export function compileLightingFrame(targets, frame, wave = 0) {
  const normalized = normalizeFrame(frame);
  return targets.map((target, index) => {
    const phase = (target.ordinal * 37 + wave * 17) % 360;
    const hue = (normalized.hue + phase + (target.role === "Ambient" ? 12 : 0)) % 360;
    const gain = target.role === "Ambient" ? 0.82 : 1;
    const brightness = Math.max(1, Math.min(100, Math.round(normalized.brightness * gain * (0.65 + normalized.energy * 0.35))));
    const set = { brightness };
    if (target.capabilities.color === true) set.color = hsvToRgb(hue, normalized.saturation, 100);
    return {
      handle: target.handle,
      role: target.role,
      wave: (wave + index) % Math.max(1, targets.length),
      set,
    };
  });
}

function hsvToRgb(hue, saturation, value) {
  const s = saturation / 100;
  const v = value / 100;
  const chroma = v * s;
  const segment = hue / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  const [red, green, blue] = segment < 1 ? [chroma, secondary, 0]
    : segment < 2 ? [secondary, chroma, 0]
      : segment < 3 ? [0, chroma, secondary]
        : segment < 4 ? [0, secondary, chroma]
          : segment < 5 ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  const match = v - chroma;
  return (Math.round((red + match) * 255) << 16)
    | (Math.round((green + match) * 255) << 8)
    | Math.round((blue + match) * 255);
}

export function publicSession(session) {
  return {
    sessionId: session.id,
    generation: session.generation,
    state: session.state,
    targets: session.targets.map(publicTarget),
    startedAt: session.startedAt,
  };
}
