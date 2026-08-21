const APPLE_MUSIC_HOST = "music.apple.com";
const APPLE_MUSIC_PATH = /^\/[a-z]{2}(?:-[a-z]{2})?\/(?:album|song)\/[^/?#]+\/\d+\/?$/i;
const APPLE_MUSIC_QUERY_KEYS = new Set(["i", "uo"]);

export function validateAppleMusicUrl(raw) {
  let parsed;
  try { parsed = new URL(String(raw)); } catch { return null; }
  if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== APPLE_MUSIC_HOST || parsed.port || parsed.username || parsed.password || parsed.hash || !APPLE_MUSIC_PATH.test(parsed.pathname)) return null;
  for (const key of parsed.searchParams.keys()) if (!APPLE_MUSIC_QUERY_KEYS.has(key)) return null;
  for (const key of APPLE_MUSIC_QUERY_KEYS) if (parsed.searchParams.has(key) && !/^\d+$/.test(parsed.searchParams.get(key))) return null;
  return parsed;
}
