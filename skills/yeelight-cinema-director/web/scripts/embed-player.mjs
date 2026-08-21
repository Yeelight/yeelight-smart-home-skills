const YOUTUBE_WATCH_HOSTS = new Set(["www.youtube.com", "youtube.com"]);
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const EMBED_ORIGIN = "https://www.youtube-nocookie.com";
const PLAYER_ERROR_CODES = new Set([2, 5, 100, 101, 150, 153]);
const PLAYBACK_CHECK_TIMEOUT_MS = 15_000;

const embedRecords = new WeakMap();
let nextGeneration = 0;

export function extractYouTubeVideoId(candidate) {
  if (!candidate || typeof candidate.id !== "string" || !YOUTUBE_VIDEO_ID.test(candidate.id)) return null;
  if (typeof candidate.url !== "string") return null;
  let parsed;
  try { parsed = new URL(candidate.url); } catch { return null; }
  if (parsed.protocol !== "https:" || !YOUTUBE_WATCH_HOSTS.has(parsed.hostname.toLowerCase())) return null;
  const id = parsed.searchParams.get("v") || parsed.pathname.split("/").filter(Boolean).pop() || "";
  return id === candidate.id ? id : null;
}

export function buildYouTubeEmbedConfig(candidate, locationRef = globalThis.location) {
  const id = extractYouTubeVideoId(candidate);
  if (!id) return null;
  const url = new URL(`/embed/${id}`, EMBED_ORIGIN);
  url.searchParams.set("playsinline", "1");
  url.searchParams.set("rel", "0");
  const origin = getPageOrigin(locationRef);
  if (origin) {
    url.searchParams.set("enablejsapi", "1");
    url.searchParams.set("origin", origin);
  }
  return {
    id,
    src: url.toString(),
    title: `${typeof candidate.title === "string" && candidate.title.trim() ? candidate.title.trim() : "Selected soundtrack"} player`,
    allow: "autoplay; encrypted-media; fullscreen; picture-in-picture",
    referrerPolicy: "strict-origin-when-cross-origin",
    loading: "lazy",
  };
}

export function parseYouTubePlayerMessage(raw, expectedVideoId, expectedFrameId) {
  if (typeof raw !== "string") return null;
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data !== "object" || data.channel !== "widget" || data.id !== expectedFrameId || typeof data.event !== "string") return null;
  if (data.event === "initialDelivery") {
    const videoData = data.info?.videoData;
    if (!videoData || typeof videoData !== "object" || videoData.video_id !== expectedVideoId || typeof videoData.isPlayable !== "boolean") return null;
    return videoData.isPlayable ? { type: "playable" } : { type: "unavailable", errorCode: normalizePlayerErrorCode(videoData.errorCode) };
  }
  if (data.event === "onReady") return { type: "ready" };
  if (data.event === "onError" && Number.isInteger(data.info) && PLAYER_ERROR_CODES.has(data.info)) return { type: "unavailable", errorCode: data.info };
  return null;
}

export function mountYouTubeEmbed(container, candidate, documentRef = globalThis.document, options = {}) {
  const config = buildYouTubeEmbedConfig(candidate, options.locationRef ?? globalThis.location);
  if (!config || !container || !documentRef?.createElement) return false;
  clearYouTubeEmbed(container);
  const iframe = documentRef.createElement("iframe");
  const generation = ++nextGeneration;
  const frameId = `youtube-player-frame-${generation}`;
  const windowRef = options.windowRef ?? globalThis.window ?? globalThis;
  const record = { container, iframe, frameId, videoId: config.id, generation, playable: null, timers: [], checkTimer: null, windowRef, onMessage: null, onState: typeof options.onState === "function" ? options.onState : () => {} };
  const active = () => embedRecords.get(container) === record && containerHasFrame(container, iframe);
  const notify = (event) => {
    if (!active()) return;
    try { record.onState({ ...event, videoId: record.videoId, generation }); } catch {}
  };
  const markUnavailable = (errorCode, reason = "player_error") => {
    if (!active()) return;
    if (record.checkTimer) clearTimeout(record.checkTimer);
    record.playable = false;
    notify({ status: "unavailable", reason, errorCode: normalizePlayerErrorCode(errorCode) });
  };
  const onMessage = (event) => {
    if (!active() || event.origin !== EMBED_ORIGIN || event.source !== iframe.contentWindow) return;
    const parsed = parseYouTubePlayerMessage(event.data, record.videoId, record.frameId);
    if (!parsed) return;
    if (parsed.type === "playable") {
      record.playable = true;
      return;
    }
    if (parsed.type === "ready") {
      if (record.playable === true) {
        if (record.checkTimer) clearTimeout(record.checkTimer);
        notify({ status: "ready" });
      }
      return;
    }
    if (parsed.type === "unavailable") markUnavailable(parsed.errorCode);
  };
  record.onMessage = onMessage;
  const sendListening = () => {
    if (!active() || !iframe.contentWindow?.postMessage) return;
    try { iframe.contentWindow.postMessage(JSON.stringify({ event: "listening", id: record.frameId, channel: "widget" }), EMBED_ORIGIN); } catch {}
  };
  iframe.id = frameId;
  iframe.src = config.src;
  iframe.title = config.title;
  iframe.allow = config.allow;
  iframe.referrerPolicy = config.referrerPolicy;
  iframe.loading = config.loading;
  iframe.allowFullscreen = true;
  iframe.setAttribute("aria-label", config.title);
  iframe.addEventListener?.("load", sendListening);
  iframe.addEventListener?.("error", () => markUnavailable(null, "embed_error"));
  windowRef.addEventListener?.("message", onMessage);
  embedRecords.set(container, record);
  container.replaceChildren(iframe);
  container.hidden = false;
  notify({ status: "checking" });
  sendListening();
  record.timers.push(setTimeout(sendListening, 250), setTimeout(sendListening, 1_000), setTimeout(sendListening, 3_000));
  record.checkTimer = setTimeout(() => markUnavailable(null, "playback_check_timeout"), PLAYBACK_CHECK_TIMEOUT_MS);
  record.timers.push(record.checkTimer);
  return true;
}

export function clearYouTubeEmbed(container) {
  if (!container) return;
  const record = embedRecords.get(container);
  if (record) {
    embedRecords.delete(container);
    for (const timer of record.timers) clearTimeout(timer);
    record.windowRef.removeEventListener?.("message", record.onMessage);
  }
  container.replaceChildren();
  container.hidden = true;
}

function getPageOrigin(locationRef) {
  if (!locationRef || !["http:", "https:"].includes(locationRef.protocol) || typeof locationRef.origin !== "string") return null;
  try {
    const origin = new URL(locationRef.origin).origin;
    return origin === locationRef.origin ? origin : null;
  } catch { return null; }
}

function normalizePlayerErrorCode(value) { return Number.isInteger(value) && PLAYER_ERROR_CODES.has(value) ? value : null; }

function containerHasFrame(container, iframe) {
  if (typeof container.contains === "function") return container.contains(iframe);
  return Array.isArray(container.children) ? container.children.includes(iframe) : false;
}
