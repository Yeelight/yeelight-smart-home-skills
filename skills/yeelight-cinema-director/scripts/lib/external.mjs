import dns from "node:dns/promises";
import https from "node:https";
import net from "node:net";
import { CinemaError, randomOpaque } from "./contracts.mjs";
import { createYouTubeCatalog, MAX_YOUTUBE_WEB_BODY_BYTES } from "./youtube.mjs";

const ARTWORK_HOSTS = new Set(["image.tmdb.org", "m.media-amazon.com", "is1-ssl.mzstatic.com"]);
const YOUTUBE_HOSTS = new Set(["www.youtube.com", "youtube.com", "i.ytimg.com"]);
const CATALOG_HOSTS = new Set(["v3.sg.media-imdb.com", "itunes.apple.com", "lrclib.net", "www.googleapis.com", "www.youtube.com"]);
const MAX_ARTWORK_BYTES = 6 * 1024 * 1024;
const MAX_CATALOG_BYTES = 2 * 1024 * 1024;
const CATALOG_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 128;
const ARTWORK_HANDLE_TTL_MS = 10 * 60 * 1000;
const ARTWORK_HANDLE_MAX_ENTRIES = 256;
const CATALOG_USER_AGENT = "YeelightCinemaDirector/1.0 (local cinema skill)";

export class CatalogAdapter {
  constructor(options = {}) {
    this.transport = options.transport || defaultTransport;
    this.fixtures = options.fixtures || null;
    this.cache = new Map();
    this.inflight = new Map();
    this.cacheMaxEntries = Number.isInteger(options.cacheMaxEntries) && options.cacheMaxEntries > 0 ? options.cacheMaxEntries : CACHE_MAX_ENTRIES;
    this.cacheTtlMs = Number.isInteger(options.cacheTtlMs) && options.cacheTtlMs > 0 ? options.cacheTtlMs : CACHE_TTL_MS;
  }

  async searchMovies(query) {
    const value = cleanQuery(query);
    if (!value) return [];
    if (this.fixtures?.movies) return this.fixtures.movies.filter((movie) => movie.title.toLowerCase().includes(value.toLowerCase())).slice(0, 12);
    return this.cached(`movie:${value}`, async () => projectMovies(await this.transport("movies", { query: value })));
  }

  async searchSongs(movie) {
    const title = cleanQuery(movie?.title);
    if (!title) return [];
    if (this.fixtures?.songs) return this.fixtures.songs.filter((song) => song.movieTitle.toLowerCase() === title.toLowerCase()).slice(0, 20);
    return this.cached(`song:${title}`, async () => projectSongs(await this.transport("songs", { title })));
  }

  async searchYouTube(song) {
    const title = cleanQuery(song?.title);
    if (!title) return [];
    if (this.fixtures?.youtube) return this.fixtures.youtube.filter((item) => item.title.toLowerCase().includes(title.toLowerCase())).slice(0, 8);
    return this.cached(`youtube:${title}`, async () => projectYouTube(await this.transport("youtube", { title })));
  }

  async lyrics(song) {
    const title = cleanQuery(song?.title);
    if (!title) return { synced: [], plain: "" };
    if (this.fixtures?.lyrics?.[title]) return this.fixtures.lyrics[title];
    return this.cached(`lyrics:${title}`, async () => projectLyrics(await this.transport("lyrics", { title })));
  }

  async cached(key, load) {
    const hit = this.cache.get(key);
    const now = Date.now();
    for (const [entryKey, entry] of this.cache) if (entry.expiresAt <= now) this.cache.delete(entryKey);
    if (hit && hit.expiresAt > now) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit.value;
    }
    if (hit) this.cache.delete(key);
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const request = (async () => {
      try {
        const value = await load();
        while (this.cache.size >= this.cacheMaxEntries) this.cache.delete(this.cache.keys().next().value);
        this.cache.set(key, { value, expiresAt: Date.now() + this.cacheTtlMs });
        return value;
      } catch (error) {
        if (error instanceof CinemaError) throw error;
        throw new CinemaError("catalog_unavailable", "The external cinema catalog is temporarily unavailable.", 503);
      } finally {
        if (this.inflight.get(key) === request) this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, request);
    return request;
  }
}

export class ArtworkAdapter {
  constructor(options = {}) {
    this.transport = options.transport || defaultArtworkTransport;
    this.handles = new Map();
    this.handleIndex = new Map();
    this.clock = options.clock || Date.now;
    this.handleTtlMs = Number.isInteger(options.handleTtlMs) && options.handleTtlMs > 0 ? options.handleTtlMs : ARTWORK_HANDLE_TTL_MS;
    this.handleMaxEntries = Number.isInteger(options.handleMaxEntries) && options.handleMaxEntries > 0 ? options.handleMaxEntries : ARTWORK_HANDLE_MAX_ENTRIES;
  }

  sign(url, sessionId) {
    const parsed = validateArtworkUrl(url);
    const normalizedUrl = parsed.toString();
    const now = this.clock();
    this.purgeExpired(now);
    const indexKey = ownerUrlKey(sessionId, normalizedUrl);
    const existingHandle = this.handleIndex.get(indexKey);
    const existing = existingHandle ? this.handles.get(existingHandle) : null;
    if (existing && existing.expiresAt > now) {
      this.handles.delete(existingHandle);
      existing.expiresAt = now + this.handleTtlMs;
      existing.lastUsedAt = now;
      this.handles.set(existingHandle, existing);
      return existingHandle;
    }
    if (existingHandle) this.handleIndex.delete(indexKey);
    while (this.handles.size >= this.handleMaxEntries) this.evictOldest();
    const handle = randomOpaque("art");
    this.handles.set(handle, { url: normalizedUrl, sessionId, indexKey, expiresAt: now + this.handleTtlMs, lastUsedAt: now });
    this.handleIndex.set(indexKey, handle);
    return handle;
  }

  async fetch(handle, sessionId) {
    this.purgeExpired(this.clock());
    const entry = this.handles.get(handle);
    if (!entry || entry.sessionId && entry.sessionId !== sessionId) throw new Error("artwork_handle_invalid");
    this.handles.delete(handle);
    entry.lastUsedAt = this.clock();
    this.handles.set(handle, entry);
    const response = await this.transport(entry.url);
    if (!response || response.status < 200 || response.status >= 300 || response.redirected) throw new Error("artwork_unavailable");
    if (!/^image\/(?:jpeg|png|webp)$/.test(String(response.contentType || ""))) throw new Error("artwork_type_invalid");
    if (response.body.length > MAX_ARTWORK_BYTES) throw new Error("artwork_too_large");
    return { body: response.body, contentType: response.contentType };
  }

  purgeExpired(now = this.clock()) {
    for (const [handle, entry] of this.handles) {
      if (entry.expiresAt <= now) {
        this.handles.delete(handle);
        if (this.handleIndex.get(entry.indexKey) === handle) this.handleIndex.delete(entry.indexKey);
      }
    }
  }

  evictOldest() {
    const oldest = this.handles.entries().next().value;
    if (!oldest) return;
    const [handle, entry] = oldest;
    this.handles.delete(handle);
    if (this.handleIndex.get(entry.indexKey) === handle) this.handleIndex.delete(entry.indexKey);
  }
}

function ownerUrlKey(sessionId, url) { return `${String(sessionId)}\0${url}`; }

export function validateArtworkUrl(raw) {
  let parsed;
  try { parsed = new URL(String(raw)); } catch { throw new Error("artwork_url_invalid"); }
  if (parsed.protocol !== "https:" || parsed.port && parsed.port !== "443" || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("artwork_url_invalid");
  if (!ARTWORK_HOSTS.has(parsed.hostname.toLowerCase())) throw new Error("artwork_host_blocked");
  return parsed;
}

export function validateYouTubeUrl(raw) {
  let parsed;
  try { parsed = new URL(String(raw)); } catch { return null; }
  if (parsed.protocol !== "https:" || !YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) return null;
  const id = parsed.searchParams.get("v") || parsed.pathname.split("/").filter(Boolean).pop() || "";
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? { id, url: `https://www.youtube.com/watch?v=${id}` } : null;
}

async function defaultTransport(kind, input) {
  if (kind === "movies") return searchMovieCatalog(input.query);
  if (kind === "songs") return searchSongCatalog(input.title);
  if (kind === "youtube") return searchYouTubeCatalog(input.title);
  if (kind === "lyrics") return searchLyricsCatalog(input.title);
  return { items: [] };
}

async function searchMovieCatalog(query) {
  const term = cleanQuery(query);
  const endpoint = new URL(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(imdbSlug(term))}.json`);
  const data = await fetchCatalogJson(endpoint);
  const items = Array.isArray(data?.d) ? data.d
    .filter((item) => item && item.id && item.l && item.i?.imageUrl && (item.qid === "movie" || item.q === "feature"))
    .map((item) => ({
      id: String(item.id).slice(0, 80),
      title: String(item.l).slice(0, 160),
      year: Number(item.y) || null,
      artwork: String(item.i.imageUrl),
    }))
    .slice(0, 12) : [];
  return { items };
}

async function searchSongCatalog(title, fetchImpl = fetch) {
  const endpoint = new URL("https://itunes.apple.com/search");
  for (const [key, value] of Object.entries({ term: `${title} original soundtrack`, country: "US", media: "music", entity: "song", limit: 24 })) endpoint.searchParams.set(key, value);
  const data = await fetchCatalogJson(endpoint, fetchImpl);
  const normalizedTitle = normalizeSearchText(title);
  const items = (Array.isArray(data?.results) ? data.results : [])
    .filter((item) => item && item.trackId && item.trackName && item.collectionName)
    .map((item) => ({
      id: String(item.trackId).slice(0, 80),
      movieTitle: String(item.collectionName || "").slice(0, 160),
      title: String(item.trackName).slice(0, 160),
      artist: String(item.artistName || "").slice(0, 120),
      durationMs: Number(item.trackTimeMillis) || 0,
      album: String(item.collectionName || "").slice(0, 160),
    }))
    .filter((item) => normalizeSearchText(item.album).includes(normalizedTitle) && /(soundtrack|motion picture|original score|film score)/i.test(item.album))
    .slice(0, 20);
  return { items };
}

async function searchLyricsCatalog(title) {
  const endpoint = new URL("https://lrclib.net/api/search");
  endpoint.searchParams.set("track_name", title);
  const data = await fetchCatalogJson(endpoint);
  const best = (Array.isArray(data) ? data : []).find((item) => item?.trackName);
  return { synced: parseTimedLyrics(best?.syncedLyrics), plain: String(best?.plainLyrics || "").slice(0, 40_000) };
}

async function fetchCatalogJson(url, fetchImpl = fetch, request = {}) {
  const endpoint = url instanceof URL ? url : new URL(String(url));
  if (endpoint.protocol !== "https:" || (endpoint.port && endpoint.port !== "443") || !CATALOG_HOSTS.has(endpoint.hostname.toLowerCase())) throw new CinemaError("catalog_host_blocked", "The cinema catalog provider is not allowed.", 502);
  const youtubeWeb = request.kind === "youtube-web";
  if (youtubeWeb && !isExactYouTubeWebEndpoint(endpoint)) throw new CinemaError("catalog_host_blocked", "The cinema catalog provider is not allowed.", 502);
  if (youtubeWeb && typeof request.body !== "string") throw new CinemaError("catalog_request_invalid", "The cinema catalog request is invalid.", 400);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CATALOG_TIMEOUT_MS);
  try {
    const response = await fetchImpl(endpoint, {
      method: youtubeWeb ? "POST" : "GET",
      ...(youtubeWeb ? { body: request.body } : {}),
      redirect: "error",
      signal: controller.signal,
      headers: { accept: "application/json", ...(youtubeWeb ? { "content-type": "application/json" } : {}), "user-agent": CATALOG_USER_AGENT },
    });
    if (!response.ok) throw new CinemaError("catalog_unavailable", "The external cinema catalog is temporarily unavailable.", 503);
    const contentType = String(response.headers.get("content-type") || "");
    const standardJson = /^(?:application|text)\/json(?:\s*;|$)/i.test(contentType);
    const itunesJson = endpoint.hostname.toLowerCase() === "itunes.apple.com" && /^text\/javascript(?:\s*;|$)/i.test(contentType);
    if ((!standardJson && !itunesJson) || (youtubeWeb && !standardJson)) throw new CinemaError("catalog_invalid_response", "The cinema catalog returned an unsupported response.", 502);
    const body = await readCatalogBody(response);
    try { return JSON.parse(body); } catch { throw new CinemaError("catalog_invalid_response", "The cinema catalog returned invalid data.", 502); }
  } catch (error) {
    if (error instanceof CinemaError) throw error;
    if (error?.name === "AbortError") throw new CinemaError("catalog_timeout", "The cinema catalog request timed out.", 504);
    throw new CinemaError("catalog_unavailable", "The external cinema catalog is temporarily unavailable.", 503);
  } finally {
    clearTimeout(timer);
  }
}

function isExactYouTubeWebEndpoint(endpoint) {
  return endpoint.hostname.toLowerCase() === "www.youtube.com"
    && endpoint.username === ""
    && endpoint.password === ""
    && endpoint.pathname === "/youtubei/v1/search"
    && endpoint.searchParams.size === 1
    && endpoint.searchParams.get("prettyPrint") === "false";
}

async function readCatalogBody(response) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_CATALOG_BYTES) throw new CinemaError("catalog_too_large", "The cinema catalog response is too large.", 502);
  if (!response.body) return "";
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_CATALOG_BYTES) throw new CinemaError("catalog_too_large", "The cinema catalog response is too large.", 502);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function imdbSlug(value) {
  return String(value || "film").normalize("NFKC").trim().replace(/\s+/g, "_").slice(0, 120) || "film";
}

function normalizeSearchText(value) {
  return String(value || "").toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");
}

function parseTimedLyrics(value) {
  const rows = [];
  for (const line of String(value || "").split(/\r?\n/)) {
    const text = line.replace(/\[\d+:\d+(?:\.\d+)?\]/g, "").trim().slice(0, 240);
    for (const stamp of line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)) rows.push({ timeMs: (Number(stamp[1]) * 60 + Number(stamp[2])) * 1000, text });
  }
  return rows.sort((left, right) => left.timeMs - right.timeMs).slice(0, 4000);
}

async function defaultArtworkTransport(url) {
  const parsed = new URL(url);
  const records = await assertPublicDns(parsed.hostname);
  const address = records.find((record) => record.family === 4) || records[0];
  return requestArtwork(parsed, address);
}

function requestArtwork(parsed, address) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let total = 0;
    const chunks = [];
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error); else resolve(value);
    };
    const request = https.request({
      protocol: "https:", hostname: parsed.hostname, port: 443, path: `${parsed.pathname}${parsed.search}`,
      method: "GET", servername: parsed.hostname, lookup: (_hostname, _options, callback) => callback(null, address.address, address.family)
    }, (response) => {
      const contentLength = Number(response.headers["content-length"] || 0);
      if (contentLength > MAX_ARTWORK_BYTES) {
        response.destroy();
        return finish(new Error("artwork_too_large"));
      }
      response.on("data", (chunk) => {
        total += chunk.length;
        if (total > MAX_ARTWORK_BYTES) {
          response.destroy();
          finish(new Error("artwork_too_large"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => finish(null, {
        status: response.statusCode || 0,
        redirected: (response.statusCode || 0) >= 300 && (response.statusCode || 0) < 400,
        contentType: String(response.headers["content-type"] || ""),
        body: Buffer.concat(chunks)
      }));
      response.on("error", (error) => finish(error));
    });
    const timer = setTimeout(() => { request.destroy(); finish(new Error("artwork_timeout")); }, 10_000);
    request.once("close", () => clearTimeout(timer));
    request.once("error", (error) => finish(error));
    request.end();
  });
}

function cleanQuery(value) { return typeof value === "string" ? value.trim().slice(0, 160) : ""; }
function projectMovies(value) { return (value?.items || []).filter((item) => item?.id && item?.title).slice(0, 12).map((item) => ({ id: boundedString(item.id, 80), title: boundedString(item.title, 160), year: Number(item.year) || null, artworkUrl: item.artwork ? validateArtworkUrl(item.artwork).toString() : "" })); }
function projectSongs(value) { return (value?.items || []).filter((item) => item?.id && item?.title).slice(0, 20).map((item) => ({ id: boundedString(item.id, 80), movieTitle: boundedString(item.movieTitle, 160), title: boundedString(item.title, 160), artist: boundedString(item.artist, 120), durationMs: Number(item.durationMs) || 0 })); }
function projectYouTube(value) { return (value?.items || []).map((item) => ({ item, video: validateYouTubeUrl(item.url || `https://www.youtube.com/watch?v=${item.id}`) })).filter(({ video }) => video).slice(0, 8).map(({ item, video }) => ({ id: video.id, url: video.url, title: boundedString(item.title || item.name || video.id, 160) })); }
function projectLyrics(value) { return { synced: Array.isArray(value?.synced) ? value.synced.filter((row) => row && Number.isFinite(row.timeMs)).slice(0, 4000).map((row) => ({ timeMs: Math.max(0, Math.min(86_400_000, Number(row.timeMs))), text: boundedString(row.text, 240) })) : [], plain: boundedString(value?.plain, 40_000) }; }
function boundedString(value, max) { return typeof value === "string" ? value.slice(0, max) : ""; }

async function assertPublicDns(hostname, resolve = dns.lookup) {
  const records = await resolve(hostname, { all: true });
  if (!records.length || records.some((record) => isPrivateAddress(record.address))) throw new Error("private_dns_blocked");
  return records;
}

export function isPrivateAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a >= 224 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 0) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0);
  }
  if (net.isIP(address) !== 6) return true;
  const value = String(address).toLowerCase().split("%", 1)[0];
  if (value.startsWith("::ffff:")) return isPrivateAddress(value.slice(7));
  const number = ipv6ToBigInt(value);
  if (number === null) return true;
  const first = Number(number >> 112n);
  return first < 0x2000 || first > 0x3fff || first === 0x2001 && (Number((number >> 96n) & 0xffffn) === 0x0db8 || Number((number >> 96n) & 0xffffn) === 0x0010 || Number((number >> 96n) & 0xffffn) === 0x0002 || Number((number >> 96n) & 0xffffn) === 0x0020);
}

function ipv6ToBigInt(value) {
  const parts = value.includes("::") ? (() => {
    const [left, right] = value.split("::");
    const leftParts = left ? left.split(":") : [];
    const rightParts = right ? right.split(":") : [];
    return [...leftParts, ...Array(8 - leftParts.length - rightParts.length).fill("0"), ...rightParts];
  })() : value.split(":");
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) return null;
  return parts.reduce((result, part) => (result << 16n) | BigInt(`0x${part}`), 0n);
}

const searchYouTubeCatalog = createYouTubeCatalog({ fetchCatalogJson, validateYouTubeUrl, cleanQuery, boundedString });
export const __testing = { assertPublicDns, requestArtwork, fetchCatalogJson, searchSongCatalog, searchYouTubeCatalog, MAX_YOUTUBE_WEB_BODY_BYTES, CACHE_MAX_ENTRIES, MAX_ARTWORK_BYTES, MAX_CATALOG_BYTES, ARTWORK_HANDLE_TTL_MS, ARTWORK_HANDLE_MAX_ENTRIES };
