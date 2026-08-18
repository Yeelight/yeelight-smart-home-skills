import net from "node:net";
import { CinemaError } from "./contracts.mjs";

export const VALID_REGIONS = new Set(["cn", "sg", "us", "eu"]);
export const CONTROL_MODES = new Set(["cloud", "local-preferred", "local-only"]);
export const DEFAULT_LAN_PORT = "18080";
export const CONTEXT_VALUE = /^[A-Za-z0-9._-]{1,128}$/;

export function normalizeGatewayIp(value) {
  const raw = String(value || "").trim().replace(/^\[|\]$/g, "");
  if (!raw) return "";
  if (!net.isIP(raw) || !isLocalHost(raw)) throw new CinemaError("invalid_live_context", "The gateway host must be a private or local IP address.", 400);
  return raw;
}

export function normalizeLanEndpoint(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let parsed;
  try { parsed = new URL(raw); } catch { throw new CinemaError("invalid_live_context", "The LAN endpoint is invalid.", 400); }
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || !host || !isLocalHost(host)) throw new CinemaError("invalid_live_context", "The LAN endpoint must be a local HTTP(S) /mcp endpoint without credentials.", 400);
  const endpointPath = parsed.pathname.replace(/\/+$/, "") || "/mcp";
  if (endpointPath !== "/mcp") throw new CinemaError("invalid_live_context", "The LAN endpoint path must be /mcp.", 400);
  parsed.hostname = host;
  parsed.port = parsed.port || DEFAULT_LAN_PORT;
  parsed.pathname = "/mcp";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

export function endpointHost(value) {
  return new URL(value).hostname.replace(/^\[|\]$/g, "");
}

function isLocalHost(value) {
  const host = String(value || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost") return true;
  const version = net.isIP(host);
  if (version === 4) {
    const parts = host.split(".").map(Number);
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 169 && parts[1] === 254 || parts[0] === 192 && parts[1] === 168 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
  }
  if (version !== 6) return false;
  if (host === "::1") return true;
  const groups = expandIPv6(host);
  if (!groups) return false;
  const first = groups[0];
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
}

function expandIPv6(value) {
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || halves.length === 1 && missing !== 0) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right].map((part) => Number.parseInt(part, 16));
  return groups.length === 8 && groups.every((part) => Number.isInteger(part) && part >= 0 && part <= 0xffff) ? groups : null;
}
