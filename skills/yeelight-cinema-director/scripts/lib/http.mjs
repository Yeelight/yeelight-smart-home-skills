import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CinemaError, MAX_BODY_BYTES, PROOF_TTL_MS } from "./contracts.mjs";
import { proofAge, rotatePageProof } from "./lifecycle.mjs";

const packageRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const webRoot = path.join(packageRoot, "web");
const MIME = new Map([[".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".json", "application/json; charset=utf-8"], [".jpg", "image/jpeg"], [".webp", "image/webp"]]);
const STATIC_ROOTS = Object.freeze([
  { prefix: "assets/cinema/", root: path.join(packageRoot, "assets", "cinema") },
  { prefix: "", root: webRoot },
]);

export async function serveStatic(app, response, pathname, headOnly) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  if (requested === "favicon.ico") {
    response.writeHead(204, { ...securityHeaders("image/x-icon"), "Cache-Control": "no-store" });
    response.end();
    return;
  }
  if (requested.includes("..") || requested.includes("\\") || requested.startsWith("/")) return sendJson(response, 404, { error: "not_found", message: "The route was not found." });
  const mapping = STATIC_ROOTS.find(({ prefix }) => requested.startsWith(prefix));
  if (!mapping) return sendJson(response, 404, { error: "not_found", message: "The route was not found." });
  const relative = requested.slice(mapping.prefix.length);
  if (!relative) return sendJson(response, 404, { error: "not_found", message: "The route was not found." });
  const filePath = path.resolve(mapping.root, relative);
  if (!filePath.startsWith(`${mapping.root}${path.sep}`)) return sendJson(response, 404, { error: "not_found", message: "The route was not found." });
  let content;
  try { content = await fs.readFile(filePath); } catch { return sendJson(response, 404, { error: "not_found", message: "The route was not found." }); }
  if (requested === "index.html") {
    if (proofAge(app) >= PROOF_TTL_MS) rotatePageProof(app);
    content = Buffer.from(content.toString("utf8").replace("__CINEMA_PAGE_PROOF__", app.pageProof));
  }
  const headers = securityHeaders(MIME.get(path.extname(filePath).toLowerCase()) || "application/octet-stream");
  headers["Content-Length"] = content.length;
  headers["Cache-Control"] = "no-store";
  response.writeHead(200, headers);
  if (!headOnly) response.end(content); else response.end();
}

export async function serveArtwork(app, response, handle, owner) {
  try {
    const result = await app.artwork.fetch(handle, owner);
    response.writeHead(200, { ...securityHeaders(result.contentType), "Cache-Control": "no-store", "Content-Length": result.body.length });
    response.end(result.body);
  } catch { sendJson(response, 404, { error: "artwork_unavailable", message: "The artwork is unavailable." }); }
}

export async function readJson(request) {
  const type = String(request.headers["content-type"] || "");
  if (!/^application\/json(?:\s*;|$)/i.test(type)) throw new CinemaError("content_type_required", "JSON content is required.", 415);
  const declared = Number(request.headers["content-length"] || 0);
  if (declared > MAX_BODY_BYTES) throw new CinemaError("body_too_large", "The request body is too large.", 413);
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new CinemaError("body_too_large", "The request body is too large.", 413);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new CinemaError("invalid_json", "The request body is not valid JSON.", 400); }
}

export function allowedHost(request, app) {
  const host = String(request.headers.host || "").toLowerCase();
  const port = app.server?.address()?.port || app.port;
  return host === `127.0.0.1:${port}`;
}

export function sameOrigin(request, app) {
  const origin = String(request.headers.origin || "");
  const fetchSite = String(request.headers["sec-fetch-site"] || "");
  const port = app.server?.address()?.port || app.port;
  return origin === `http://127.0.0.1:${port}` && (!fetchSite || fetchSite === "same-origin");
}

export function sameOriginGet(request, app) {
  const origin = String(request.headers.origin || "");
  const fetchSite = String(request.headers["sec-fetch-site"] || "");
  const port = app.server?.address()?.port || app.port;
  return (!origin || origin === `http://127.0.0.1:${port}`) && (!fetchSite || fetchSite === "same-origin" || fetchSite === "none");
}

export function securityHeaders(contentType) {
  return {
    "Content-Type": contentType,
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src https://www.youtube.com https://www.youtube-nocookie.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

export function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { ...securityHeaders("application/json; charset=utf-8"), "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" });
  response.end(body);
}
