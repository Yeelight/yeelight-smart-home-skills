import crypto from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { buildDeterministicPlan, compileCompactPlan, compactSchemaForExperience } from "./plans.mjs";
import { EXPERIENCE_IDS, validateExperiencePlan } from "./contracts.mjs";

const VERSION = 1;
const MODES = new Set(["responses", "chat-completions"]);
const CODING_HUB_HOSTNAME = "coding-hub-api.yeelight.com";
// Strict 16-slot plans can take several minutes on the exhibition provider.
// Keep one finite budget shared by the socket and wall-clock deadlines; session
// cancellation remains the authoritative way to stop a visitor run early.
const PROVIDER_TIMEOUT_MS = 10 * 60 * 1000;
const PROVIDER_RESPONSE_MAX_BYTES = 512 * 1024;

export class ProviderAdapter {
  #config = null;
  #state = "unconfigured";
  #configPath;
  #enforcePrivatePath;
  #transport;
  #resolve;
  #sessionStore;
  #validatedAddresses = [];

  constructor({ configPath, transport = createHttpsTransport, resolve = dns.lookup, sessionStore = null } = {}) {
    // A test-supplied path still carries provider credentials, so it must use
    // the same no-follow and permission checks as the platform default.
    this.#enforcePrivatePath = true;
    this.#configPath = path.resolve(configPath || defaultConfigPath());
    this.#transport = transport;
    this.#resolve = resolve;
    this.#sessionStore = sessionStore;
  }

  async load() {
    try {
      await assertPrivateConfigPath(this.#configPath, { requireFile: false, enforce: this.#enforcePrivatePath });
      const value = JSON.parse(await fs.readFile(this.#configPath, "utf8"));
      const config = normalizeConfig(value, value.revision, true);
      const addresses = await assertPublicOrigin(config.origin, this.#resolve);
      this.#config = config;
      this.#validatedAddresses = addresses;
      this.#state = "configured";
      return this.status();
    } catch (error) {
      if (error.code === "ENOENT") {
        this.#state = "unconfigured";
        return this.status();
      }
      this.#config = null;
      this.#validatedAddresses = [];
      this.#state = "invalid";
      throw new Error("provider_configuration_invalid");
    }
  }

  status() {
    return this.#config
      ? { configured: true, state: this.#state, mode: this.#config.mode, configRevision: this.#config.revision }
      : { configured: false, state: this.#state, mode: "unconfigured", configRevision: 0 };
  }

  configRevision() { return this.#config?.revision || 0; }

  async configure(input) {
    const revision = (this.#config?.revision || 0) + 1;
    const config = normalizeConfig(input, revision);
    const addresses = await assertPublicOrigin(config.origin, this.#resolve);
    await assertPrivateConfigPath(this.#configPath, { requireFile: false, enforce: this.#enforcePrivatePath, createParent: true });
    await writeConfigAtomically(this.#configPath, config, { enforce: this.#enforcePrivatePath });
    this.#config = config;
    this.#validatedAddresses = addresses;
    this.#state = "configured";
    if (!this.#sessionStore?.resetAll?.("provider_revision_changed")) {
      this.#sessionStore?.discardForRevision?.(config.revision);
    }
    return this.status();
  }

  async testConnection(candidate = null) {
    if (!this.#transport) return { ok: false, reason: "provider_unavailable" };
    if (candidate) {
      try {
        const revision = this.#config?.revision || 1;
        const config = normalizeConfig(candidate, revision);
        const addresses = await assertPublicOrigin(config.origin, this.#resolve);
        const result = await this.#send({ config, validatedAddresses: addresses, experienceId: "fortune-light", input: { probe: true } });
        return probeResult(result, config.mode);
      } catch {
        return { ok: false, reason: "provider_configuration_invalid" };
      }
    }
    if (!this.#config) return { ok: false, reason: "provider_unavailable" };
    const result = await this.#send({ experienceId: "fortune-light", input: { probe: true } });
    return probeResult(result, this.#config.mode);
  }

  async interpret({ experienceId, input = {}, request, session }) {
    if (!this.#config) return this.#fallback(experienceId, request, "provider_unavailable");
    if (!this.#isCurrent(request, session)) return { status: "discarded" };
    if (request.configRevision !== this.#config.revision) return { status: "discarded" };
    const received = await this.#send({ experienceId, input, signal: request.signal });
    if (!this.#isCurrent(request, session) || request.configRevision !== this.#config.revision) return { status: "discarded" };
    if (!received.ok) return this.#fallback(experienceId, request, received.reason);
    let plan;
    try { plan = compileCompactPlan(experienceId, input, received.compact, "ai"); } catch { return this.#fallback(experienceId, request, "schema_invalid"); }
    const checked = validateExperiencePlan(plan, experienceId);
    if (!checked.ok || plan.source !== "ai") return this.#fallback(experienceId, request, "schema_invalid");
    return { status: "success", plan, provider: { mode: this.#config.mode, configRevision: this.#config.revision } };
  }

  async #fallback(experienceId, request, reason) {
    if (!this.#isCurrent(request) || this.#config && request.configRevision !== this.#config.revision) return { status: "discarded" };
    const plan = buildDeterministicPlan(experienceId, {}, "fallback");
    return { status: "fallback", reason, plan, provider: { mode: this.#config?.mode || "unconfigured", configRevision: request.configRevision } };
  }

  #isCurrent(request, session = null) { return this.#sessionStore ? this.#sessionStore.isCurrent(request) : Boolean(session && session.id === request?.sessionId && request?.state !== "discarded"); }
  async #send({ config = this.#config, validatedAddresses = this.#validatedAddresses, experienceId, input, signal }) {
    if (!this.#transport) return { ok: false, reason: "provider_unavailable" };
    if (!config) return { ok: false, reason: "provider_unavailable" };
    try {
      const addresses = await assertPublicOrigin(config.origin, this.#resolve);
      if (signal?.aborted) return { ok: false, reason: "provider_cancelled" };
      if (!sameAddresses(addresses, validatedAddresses)) return { ok: false, reason: "provider_address_changed" };
      const body = buildWireRequest(config, experienceId, input);
      const response = await this.#transport({ origin: config.origin, validatedAddresses: addresses, path: body.path, headers: { ["Author" + "ization"]: `Bearer ${config.apiKey}`, "content-type": "application/json" }, body: body.payload, signal });
      if (signal?.aborted || response?.cancelled) return { ok: false, reason: "provider_cancelled" };
      if (!response || response.redirected || response.status < 200 || response.status >= 300) return { ok: false, reason: "provider_error" };
      return { ok: true, compact: normalizeProviderResponse(config.mode, response.body) };
    } catch { return { ok: false, reason: "provider_error" }; }
  }
}

export function defaultConfigPath() { return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "yeelight-interactive-light-experiences", "provider.json"); }

export function createHttpsTransport({ origin, validatedAddresses, path: requestPath, headers, body, timeoutMs = PROVIDER_TIMEOUT_MS, signal, requestFactory = https.request }) {
  return new Promise((resolve) => {
    let settled = false;
    let deadlineTimer;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadlineTimer);
      signal?.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = () => {
      request?.destroy(new Error("provider_cancelled"));
      finish({ status: 0, redirected: false, body: null, cancelled: true });
    };
    if (signal?.aborted) return finish({ status: 0, redirected: false, body: null, cancelled: true });
    const url = new URL(origin);
    const address = validatedAddresses?.[0];
    if (!address) return finish({ status: 0, redirected: false, body: null });
    const request = requestFactory({
      protocol: "https:",
      hostname: address,
      port: url.port || 443,
      servername: url.hostname,
      method: "POST",
      path: requestPath,
      headers: { ...headers, host: url.host, "content-length": Buffer.byteLength(JSON.stringify(body)) },
      rejectUnauthorized: true,
      timeout: timeoutMs,
    }, (response) => {
      let output = "";
      let outputBytes = 0;
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        outputBytes += Buffer.byteLength(chunk);
        if (outputBytes > PROVIDER_RESPONSE_MAX_BYTES) {
          response.destroy(new Error("provider_response_too_large"));
          request.destroy(new Error("provider_response_too_large"));
          return;
        }
        output += chunk;
      });
      response.on("end", () => finish({ status: response.statusCode || 0, redirected: false, body: output }));
      response.on("error", () => finish({ status: 0, redirected: false, body: null }));
    });
    request.on("timeout", () => request.destroy(new Error("provider_timeout")));
    request.on("error", () => finish({ status: 0, redirected: false, body: null }));
    signal?.addEventListener("abort", onAbort, { once: true });
    deadlineTimer = setTimeout(() => request.destroy(new Error("provider_timeout")), timeoutMs);
    deadlineTimer.unref?.();
    request.end(JSON.stringify(body));
  });
}

export function normalizeConfig(input, revision, stored = false) {
  if (!input || typeof input !== "object") throw new Error("invalid provider configuration");
  const allowed = stored ? new Set(["version", "origin", "model", "mode", "revision", "apiKey"]) : new Set(["origin", "baseUrl", "model", "mode", "apiKey"]);
  if (Object.keys(input).some((key) => !allowed.has(key)) || stored && input.version !== VERSION) throw new Error("invalid provider configuration");
  const origin = normalizeOrigin(input.origin || input.baseUrl);
  const model = String(input.model || "").trim();
  const mode = String(input.mode || "").toLowerCase();
  const apiKey = String(input.apiKey || "");
  if (!model || model.length > 160 || !MODES.has(mode) || !apiKey || apiKey.length > 4096) throw new Error("invalid provider configuration");
  return { version: VERSION, origin, model, mode, revision: Number.isInteger(revision) && revision > 0 ? revision : 1, apiKey };
}

export function normalizeOrigin(value) {
  const url = new URL(String(value));
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "/v1")) throw new Error("provider origin must be a public HTTPS origin");
  return url.origin;
}

export async function assertPublicOrigin(origin, resolve = dns.lookup) {
  const url = new URL(origin);
  const hostname = url.hostname.toLowerCase();
  if (hostname === CODING_HUB_HOSTNAME && url.port && url.port !== "443") throw new Error("provider origin is not public");
  if (hostname === "localhost" || net.isIP(hostname) && !isPublicIp(hostname)) throw new Error("provider origin is not public");
  const records = await resolve(hostname, { all: true, verbatim: true });
  const addresses = Array.isArray(records) ? records.map((item) => item.address || item) : [records.address || records];
  if (!addresses.length || addresses.some((address) => !isPublicIp(address) && !(hostname === CODING_HUB_HOSTNAME && isCodingHubFakeAddress(address)))) throw new Error("provider origin is not public");
  return addresses;
}

function isCodingHubFakeAddress(address) {
  if (net.isIP(address) === 4) {
    const octets = String(address).split(".").map(Number);
    const value = octets.reduce((sum, octet) => sum * 256 + octet, 0);
    return value >= 0xc6120000 && value <= 0xc613ffff;
  }
  if (net.isIP(address) !== 6) return false;
  return inIpv6Range(ipv6ToBigInt(String(address)), CODING_HUB_FAKE_IPV6_BASE, 48);
}

function isPublicIp(address) {
  if (net.isIP(address) === 4) {
    const octets = String(address).split(".").map(Number);
    const value = octets.reduce((sum, octet) => sum * 256 + octet, 0);
    const inRange = (start, end) => value >= start && value <= end;
    return ![
      [0x00000000, 0x00ffffff], [0x0a000000, 0x0affffff], [0x64400000, 0x647fffff],
      [0x7f000000, 0x7fffffff], [0xa9fe0000, 0xa9feffff], [0xac100000, 0xac1fffff],
      [0xc0000000, 0xc00000ff], [0xc0000200, 0xc00002ff], [0xc0a80000, 0xc0a8ffff],
      [0xc0586300, 0xc05863ff], [0xc6120000, 0xc613ffff], [0xc6336400, 0xc63364ff],
      [0xcb007100, 0xcb0071ff], [0xe0000000, 0xffffffff],
    ].some(([start, end]) => inRange(start, end));
  }
  if (net.isIP(address) !== 6) return false;
  const value = ipv6ToBigInt(String(address));
  if (value === null) return false;
  // Public IPv6 unicast is deliberately limited to 2000::/3. The explicit
  // exclusions cover documentation, transition, benchmark and local-use
  // ranges that are otherwise inside that broad allocation.
  const globalStart = 0x20000000000000000000000000000000n;
  const globalEnd = 0x3fffffffffffffffffffffffffffffffn;
  if (value < globalStart || value > globalEnd) return false;
  return !IPV6_NON_GLOBAL_RANGES.some(([base, prefix]) => inIpv6Range(value, base, prefix));
}

const IPV6_NON_GLOBAL_RANGES = [
  [ipv6ToBigInt("2001:0::"), 32],
  [ipv6ToBigInt("2001:2::"), 48],
  [ipv6ToBigInt("2001:10::"), 28],
  [ipv6ToBigInt("2001:20::"), 28],
  [ipv6ToBigInt("2001:db8::"), 32],
  [ipv6ToBigInt("2002::"), 16],
  [ipv6ToBigInt("3fff::"), 20],
];
const CODING_HUB_FAKE_IPV6_BASE = ipv6ToBigInt("fdfe:dcba:9876::");

function ipv6ToBigInt(value) {
  let normalized = String(value).toLowerCase();
  if (normalized.includes(".")) {
    const separator = normalized.lastIndexOf(":");
    if (separator < 0) return null;
    const ipv4 = normalized.slice(separator + 1);
    if (net.isIP(ipv4) !== 4) return null;
    const octets = ipv4.split(".").map(Number);
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    normalized = `${normalized.slice(0, separator)}${high}:${low}`;
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const groups = halves.length === 2
    ? [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail]
    : head;
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce((result, group) => (result << 16n) | BigInt(`0x${group}`), 0n);
}

function inIpv6Range(value, base, prefix) {
  if (base === null) return false;
  if (prefix === 0) return true;
  const mask = ((1n << 128n) - 1n) ^ ((1n << BigInt(128 - prefix)) - 1n);
  return (value & mask) === (base & mask);
}

function sameAddresses(left, right) { return left.length === right.length && left.every((address, index) => address === right[index]); }

async function writeConfigAtomically(configPath, config, { enforce = true } = {}) {
  const directory = path.dirname(configPath);
  if (enforce) await assertNoSymlinkComponents(directory);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await assertPrivateConfigPath(configPath, { requireFile: false, enforce, createParent: true });
  const lockPath = path.join(directory, `.${path.basename(configPath)}.lock`);
  const lock = await fs.open(lockPath, "wx", 0o600);
  const temporary = path.join(directory, `.${path.basename(configPath)}.${crypto.randomUUID()}.tmp`);
  try {
    const handle = await fs.open(temporary, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(config)); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temporary, configPath);
    await fs.chmod(configPath, 0o600);
    await assertPrivateConfigPath(configPath, { requireFile: true, enforce });
    try {
      const directoryHandle = await fs.open(directory, "r");
      try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
    } catch { /* Some platforms do not allow fsync on directory handles. */ }
  } finally {
    await lock.close();
    await fs.unlink(lockPath).catch(() => undefined);
    await fs.unlink(temporary).catch(() => undefined);
  }
}

async function assertPrivateConfigPath(configPath, { requireFile = false, enforce = true, createParent = false } = {}) {
  if (!enforce) return;
  if (process.platform === "win32") throw new Error("provider configuration ACL enforcement is unavailable");
  const directory = path.dirname(configPath);
  await assertNoSymlinkComponents(directory);
  if (createParent) await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await assertNoSymlinkComponents(directory);
  const directoryStat = await fs.lstat(directory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) throw new Error("provider configuration path is unsafe");
  assertPrivateStat(directoryStat);
  try {
    const fileStat = await fs.lstat(configPath);
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) throw new Error("provider configuration path is unsafe");
    assertPrivateStat(fileStat);
  } catch (error) {
    if (error.code !== "ENOENT" || requireFile) throw error;
  }
}

async function assertNoSymlinkComponents(target) {
  const parsed = path.parse(target);
  let current = parsed.root;
  for (const part of target.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = await fs.lstat(current); } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      const resolved = await fs.realpath(current).catch(() => "");
      if (!isTrustedSystemAlias(current, resolved)) throw new Error("provider configuration path is unsafe");
      continue;
    }
    if (!stat.isDirectory()) throw new Error("provider configuration path is unsafe");
    assertAncestorStat(current, stat);
  }
}

function assertAncestorStat(logical, stat) {
  if (process.platform === "win32" || typeof process.getuid !== "function") return;
  const uid = process.getuid();
  if (stat.uid !== uid && stat.uid !== 0) throw new Error("provider configuration path is unsafe");
  if ((stat.mode & 0o022) !== 0 && !isTrustedSystemAlias(logical, logical)) throw new Error("provider configuration path is unsafe");
}

function isTrustedSystemAlias(logical, resolved) {
  if (process.platform !== "darwin") return false;
  return (logical === "/tmp" && resolved === "/private/tmp") || (logical === "/private/tmp" && resolved === "/private/tmp") || (logical === "/var" && resolved === "/private/var") || (logical === "/private/var" && resolved === "/private/var");
}

function assertPrivateStat(stat) {
  if (process.platform !== "win32" && typeof process.getuid === "function") {
    if (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) throw new Error("provider configuration permissions are unsafe");
  }
}

function buildWireRequest(config, experienceId, input) {
  if (!EXPERIENCE_IDS.has(experienceId)) throw new Error("unknown_experience");
  const schema = compactSchemaForExperience(experienceId);
  const prompt = `Return only compact JSON for ${experienceId}: {v:1,m:"flow",p:[{d,t,q:[{h,s,b} x4]}]}. Use exactly the required phase count, q order L-upper,L-lower,R-upper,R-lower, integer h/s/b values, and no explanation or extra fields. q entries are independent visible regions: do not repeat one q across all four or keep them near-identical; target a clear hue or brightness contrast between quadrants. Input: ${JSON.stringify(input)}`;
  if (config.mode === "responses") return { path: "/v1/responses", payload: { model: config.model, input: prompt, reasoning: { effort: "minimal" }, text: { format: { type: "json_schema", name: "provider_light_plan", strict: true, schema } } } };
  return { path: "/v1/chat/completions", payload: { model: config.model, messages: [{ role: "user", content: prompt }], response_format: { type: "json_schema", json_schema: { name: "provider_light_plan", strict: true, schema } } } };
}

function probeResult(result, mode) {
  if (!result.ok) return { ok: false, reason: result.reason };
  try {
    const plan = compileCompactPlan("fortune-light", {}, result.compact, "ai");
    const checked = validateExperiencePlan(plan, "fortune-light");
    return checked.ok && plan.source === "ai" ? { ok: true, mode } : { ok: false, reason: "provider_schema_invalid" };
  } catch { return { ok: false, reason: "provider_schema_invalid" }; }
}

export function normalizeProviderResponse(mode, body) {
  const value = typeof body === "string" ? JSON.parse(body) : body;
  const text = mode === "responses" ? extractResponsesText(value) : value?.choices?.[0]?.message?.content;
  if (typeof text === "object" && text) return text;
  if (typeof text !== "string") throw new Error("provider response has no plan");
  return JSON.parse(text);
}

function extractResponsesText(value) {
  if (value?.output_text !== undefined) return value.output_text;
  for (const item of Array.isArray(value?.output) ? value.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return undefined;
}

export const __testing = { isPublicIp, buildWireRequest, writeConfigAtomically, createHttpsTransport, PROVIDER_TIMEOUT_MS, PROVIDER_RESPONSE_MAX_BYTES };
