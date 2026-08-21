const APPLE_MUSIC_HOST = "music.apple.com";
const APPLE_MUSIC_PATH = /^\/[a-z]{2}(?:-[a-z]{2})?\/(?:album|song)\/[^/?#]+\/\d+\/?$/i;
const APPLE_MUSIC_QUERY_KEYS = new Set(["i", "uo"]);
const PLAYER_WINDOW_NAME = "yeelight-apple-music-player";
const PLAYER_WIDTH = 320;
const PLAYER_HEIGHT = 780;
const PLAYER_GAP = 12;

export function validateAppleMusicUrl(raw) {
  let parsed;
  try { parsed = new URL(String(raw)); } catch { return null; }
  if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== APPLE_MUSIC_HOST || parsed.port || parsed.username || parsed.password || parsed.hash || !APPLE_MUSIC_PATH.test(parsed.pathname)) return null;
  for (const key of parsed.searchParams.keys()) if (!APPLE_MUSIC_QUERY_KEYS.has(key)) return null;
  for (const key of APPLE_MUSIC_QUERY_KEYS) if (parsed.searchParams.has(key) && !/^\d+$/.test(parsed.searchParams.get(key))) return null;
  return parsed.toString();
}

function screenCoordinate(windowRef, primary, fallback) {
  const value = windowRef?.[primary];
  if (Number.isFinite(value)) return value;
  const alternative = windowRef?.[fallback];
  return Number.isFinite(alternative) ? alternative : null;
}

function getAvailableScreenBounds(windowRef) {
  const screenRef = windowRef?.screen;
  if (!Number.isFinite(screenRef?.availWidth) || !Number.isFinite(screenRef?.availHeight)) return null;
  const left = Number.isFinite(screenRef.availLeft) ? screenRef.availLeft : 0;
  const top = Number.isFinite(screenRef.availTop) ? screenRef.availTop : 0;
  return { left, top, right: left + screenRef.availWidth, bottom: top + screenRef.availHeight };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function calculateAppleMusicWindowPosition(windowRef = globalThis.window, anchor = null) {
  const parentLeft = screenCoordinate(windowRef, "screenX", "screenLeft");
  const parentTop = screenCoordinate(windowRef, "screenY", "screenTop");
  if (!anchor || parentLeft === null || parentTop === null) return null;
  const left = Number(anchor.left);
  const top = Number(anchor.top);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  const width = Number.isFinite(Number(anchor.width)) ? Number(anchor.width) : 0;
  const desiredLeft = parentLeft + left + width - PLAYER_WIDTH;
  const desiredTop = parentTop + top - PLAYER_HEIGHT - PLAYER_GAP;
  const bounds = getAvailableScreenBounds(windowRef);
  if (!bounds) return { left: Math.round(desiredLeft), top: Math.round(desiredTop) };
  return {
    left: Math.round(clamp(desiredLeft, bounds.left, bounds.right - PLAYER_WIDTH)),
    top: Math.round(clamp(desiredTop, bounds.top, bounds.bottom - PLAYER_HEIGHT)),
  };
}

export function buildAppleMusicWindowFeatures(windowRef = globalThis.window, anchor = null) {
  const screenRef = windowRef?.screen;
  const anchored = calculateAppleMusicWindowPosition(windowRef, anchor);
  const left = anchored?.left ?? (Number.isFinite(screenRef?.availWidth)
    ? Math.round((Number.isFinite(screenRef.availLeft) ? screenRef.availLeft : 0) + (screenRef.availWidth - PLAYER_WIDTH) / 2)
    : null);
  const top = anchored?.top ?? (Number.isFinite(screenRef?.availHeight)
    ? Math.round((Number.isFinite(screenRef.availTop) ? screenRef.availTop : 0) + (screenRef.availHeight - PLAYER_HEIGHT) / 2)
    : null);
  return [
    "popup=yes",
    `width=${PLAYER_WIDTH}`,
    `height=${PLAYER_HEIGHT}`,
    "resizable=yes",
    "scrollbars=yes",
    ...(left === null ? [] : [`left=${left}`]),
    ...(top === null ? [] : [`top=${top}`]),
  ].join(",");
}

function isReusableWindow(player) {
  try { return Boolean(player && !player.closed); } catch { return false; }
}

export function openAppleMusicWindow(raw, windowRef = globalThis.window, existingPlayer = null, existingUrl = "", options = {}) {
  const url = validateAppleMusicUrl(raw);
  if (!url || typeof windowRef?.open !== "function") return { opened: false, reason: "url_invalid" };
  const anchor = options?.anchor || null;
  let player = null;
  let reused = false;
  if (isReusableWindow(existingPlayer)) {
    try {
      if (existingUrl !== url) existingPlayer.location.href = url;
      player = existingPlayer;
      reused = true;
    } catch {}
  }
  if (!player) {
    try { player = windowRef.open(url, PLAYER_WINDOW_NAME, buildAppleMusicWindowFeatures(windowRef, anchor)); } catch {}
  }
  if (!player) return { opened: false, reason: "popup_blocked", url };
  try {
    player.focus?.();
    if (!reused) player.resizeTo?.(PLAYER_WIDTH, PLAYER_HEIGHT);
  } catch {}
  return { opened: true, reused, navigated: reused && existingUrl !== url, url, player };
}

export const __testing = { APPLE_MUSIC_HOST, PLAYER_GAP, PLAYER_HEIGHT, PLAYER_WIDTH, PLAYER_WINDOW_NAME };
