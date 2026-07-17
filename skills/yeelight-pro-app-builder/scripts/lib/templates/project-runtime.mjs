import { actionPolicyRuntimeSource } from "../action-policy.mjs";
export { bridgePackageJson, packageJson, webPackageJson } from "../toolchain.mjs";

export function webTsconfig() {
  return { compilerOptions: { target: "ES2022", useDefineForClassFields: true, lib: ["ES2022", "DOM", "DOM.Iterable"], allowJs: false, skipLibCheck: true, esModuleInterop: true, allowSyntheticDefaultImports: true, strict: true, forceConsistentCasingInFileNames: true, module: "ESNext", moduleResolution: "Bundler", resolveJsonModule: true, isolatedModules: true, noEmit: true, jsx: "react-jsx" }, include: ["src"] };
}

export function indexHtml(spec, themeLock) {
  const pageColor = themeLock.resolvedLightTokens["--yp-semantic-page"];
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="theme-color" content="${escapeText(pageColor)}"/><link rel="icon" href="/favicon.svg" type="image/svg+xml"/><title>${escapeText(spec.product.title)}</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`;
}

export function faviconSource(themeLock) {
  const actionColor = themeLock.resolvedLightTokens["--yp-semantic-action"];
  const foregroundColor = themeLock.resolvedLightTokens["--yp-semantic-on-action"];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${escapeText(actionColor)}"/><path d="M19 17h8l5 11 5-11h8L36 35v12h-8V35z" fill="${escapeText(foregroundColor)}"/></svg>\n`;
}

export function viteConfigSource() {
  return `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nconst webPort = Number(process.env.YPA_WEB_PORT || 5173);\nconst bridgeOrigin = process.env.YPA_RELAY_ORIGIN || "http://127.0.0.1:8787";\nexport default defineConfig({ plugins: [react()], server: { host: "127.0.0.1", port: webPort, strictPort: true, proxy: { "/api": bridgeOrigin } } });\n`;
}

export function mainSource() {
  return `import { createRoot } from "react-dom/client";\nimport { App } from "./App";\ncreateRoot(document.getElementById("root")!).render(<App />);\n`;
}

export function browserRequestSource() {
  return `// 为同一 Bridge 的其它受信页面或探针预留一个并发槽位。
const maxInFlightActions = 3;
const pendingActions: Array<() => void> = [];
let inFlightActions = 0;
let sessionPromise: Promise<string> | undefined;

export async function requestAction(actionId: string, payload: unknown) {
  let token = await session();
  await acquireActionSlot();
  try {
    let response = await send(actionId, payload, token);
    if (response.status === 401 || response.status === 403) {
      sessionPromise = undefined;
      token = await session();
      response = await send(actionId, payload, token);
    }
    return response;
  } finally {
    releaseActionSlot();
  }
}

function acquireActionSlot() {
  if (inFlightActions < maxInFlightActions) {
    inFlightActions += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => pendingActions.push(resolve));
}

function releaseActionSlot() {
  inFlightActions -= 1;
  const resume = pendingActions.shift();
  if (!resume) return;
  inFlightActions += 1;
  resume();
}

function session() {
  if (!sessionPromise) sessionPromise = createSession();
  return sessionPromise;
}

async function createSession() {
  try {
    const response = await fetch("/api/session", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, cache: "no-store" });
    const body = await response.json();
    if (!response.ok || typeof body.sessionToken !== "string" || !body.sessionToken) throw new Error();
    return body.sessionToken;
  } catch {
    sessionPromise = undefined;
    throw new Error("家庭连接不可用，请稍后重试。");
  }
}

function send(actionId: string, payload: unknown, token: string) {
  return fetch("/api/actions/" + encodeURIComponent(actionId), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Yeelight-App-Session": token },
    body: JSON.stringify(payload),
  });
}
`;
}

export const moduleIntents = {
  "home.space-summary": ["entity.list", "state.query"],
  "home.lighting-summary": ["state.query"],
  "room.device-management": ["entity.list", "area.detail.get", "room.detail.get", "device.detail.get", "device.rename", "device.move", "state.query"],
  "room.lighting-control": ["state.query", "light.power.set", "light.brightness.set", "light.color_temperature.set", "light.color.set"],
  "device.curtain-control": ["state.query", "device.property.set"],
  "device.switch-control": ["state.query", "device.property.set"],
  "device.climate-control": ["state.query", "device.property.set"],
  "sensor.environment": ["state.query", "sensor.list", "sensor.event.list"],
  "scene.launcher": ["scene.list", "scene.execute"],
  "automation.manager": ["automation.list", "automation.enable", "automation.disable"],
  "group.manager": ["group.list", "group.detail.get", "group.create", "group.update", "group.members.update", "group.delete"],
  "gateway.overview": ["gateway.list", "gateway.detail.get", "gateway.stats.list", "gateway.thread.get"],
  "panel.manager": ["panel.list", "panel.get", "knob.get", "panel.button.configure"],
};

export function bridgeSource(privateActionRows = []) {
  const allowedIntents = privateActionRows.map((item) => item.intent);
  const privateActions = privateActionRows.map((item) => [item.actionId, item.intent]);
  const actionPolicies = privateActionRows.filter((item) => item.policy).map((item) => [item.actionId, item.policy]);
  return `import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";

const host = "127.0.0.1";
const port = Number(process.env.YPA_BRIDGE_PORT || 8787);
const runtimeBin = process.env.YEELIGHT_HOME_BIN || "yeelight-home";
const runtimeTimeoutMs = Math.max(1000, Number(process.env.YPA_RUNTIME_TIMEOUT_MS || 12000));
const maxBodyBytes = positiveInteger(process.env.YPA_MAX_BODY_BYTES, 1024 * 1024);
const maxConcurrent = positiveInteger(process.env.YPA_MAX_CONCURRENT, 4);
const sessionToken = randomBytes(32).toString("base64url");
const trustedWebOrigins = trustedOrigins(process.env.YPA_TRUSTED_WEB_ORIGINS);
const allowedIntents = new Set(${JSON.stringify(allowedIntents)});
const privateActions = new Map(${JSON.stringify(privateActions)});
const actionPolicies = new Map(${JSON.stringify(actionPolicies)});
let activeInvocations = 0;

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") return send(response, 200, { status: "ok" });
  if (!isTrustedHost(request.headers.host) || !isTrustedBrowserRequest(request)) {
    return send(response, 403, { status: "blocked", userMessage: "请求来源无效。" });
  }
  if (request.method === "POST" && request.url === "/api/session") {
    if (!isJsonRequest(request)) return send(response, 415, { status: "blocked", userMessage: "请求格式无效。" });
    return send(response, 200, { sessionToken });
  }
  const match = request.url?.match(/^\\/api\\/actions\\/([^/?]+)$/);
  if (request.method !== "POST" || !match) return send(response, 404, { status: "not_found" });
  if (!isJsonRequest(request)) return send(response, 415, { status: "blocked", userMessage: "请求格式无效。" });
  if (!hasValidSession(request.headers["x-yeelight-app-session"])) {
    return send(response, 401, { status: "unauthorized", userMessage: "页面会话已失效。" });
  }
  const actionId = decodeURIComponent(match[1]);
  const intent = privateActions.get(actionId);
  if (!allowedIntents.has(intent)) return send(response, 403, { status: "blocked", userMessage: "当前应用未启用此操作。" });
  const policy = actionPolicies.get(actionId);
  if (!policy) return send(response, 403, { status: "blocked", userMessage: "当前操作缺少授权策略。" });
  if (activeInvocations >= maxConcurrent) {
    return send(response, 429, { status: "busy", userMessage: "家庭连接正忙，请稍后重试。" });
  }
  activeInvocations += 1;
  try {
    const body = fromBrowser(await readBody(request));
    if (!validateActionRequest(policy, body).ok) {
      return send(response, 403, { status: "blocked", userMessage: "当前操作超出应用授权范围。" });
    }
    const payload = { contractVersion: "1.0", requestId: randomUUID(), locale: body.locale || "zh-CN", utterance: body.utterance || intent, intent, targets: Array.isArray(body.targets) ? body.targets : [], options: body.options || {}, parameters: body.parameters || {} };
    const result = await invokeRuntime(payload);
    observeActionResponse([...actionPolicies.values()], policy, result);
    return send(response, 200, toBrowser(result));
  } catch (error) {
    if (error instanceof RequestError) {
      return send(response, error.status, { status: "blocked", userMessage: error.publicMessage });
    }
    if (error instanceof RuntimeResultError) {
      return send(response, error.status, { status: "error", userMessage: error.publicMessage });
    }
    if (error instanceof RuntimeTimeoutError) {
      return send(response, 502, { status: "error", userMessage: "家庭连接响应超时，请稍后重试。" });
    }
    return send(response, 502, { status: "error", userMessage: "家庭连接不可用。" });
  } finally {
    activeInvocations -= 1;
  }
});

server.listen(port, host, () => console.log("Yeelight PRO Bridge http://" + host + ":" + port));

function invokeRuntime(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(runtimeBin, ["invoke", "--stdin"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let settled = false;
    const finish = (callback) => { if (settled) return; settled = true; clearTimeout(timer); callback(); };
    const timer = setTimeout(() => { child.kill("SIGTERM"); finish(() => reject(new RuntimeTimeoutError())); }, runtimeTimeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.resume();
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code) => {
      finish(() => {
        let result;
        try { result = JSON.parse(stdout); } catch { return reject(new Error("Runtime 返回了无效数据。")); }
        if (code !== 0) {
          if (isWriteVerificationMismatch(result)) return reject(new RuntimeResultError(409, "操作结果未通过回读确认，原有状态未改变。请重新同步后再试。"));
          return reject(new Error("Runtime 调用失败。"));
        }
        resolve(result);
      });
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const declaredLength = Number(request.headers["content-length"] || 0);
    if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
      request.resume();
      reject(new RequestError(413, "请求内容过大。"));
      return;
    }
    const chunks = [];
    let totalBytes = 0;
    let settled = false;
    request.on("data", (chunk) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBodyBytes) {
        settled = true;
        chunks.length = 0;
        request.pause();
        reject(new RequestError(413, "请求内容过大。"));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (settled) return;
      settled = true;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { reject(new RequestError(400, "请求格式无效。")); }
    });
    request.on("error", (error) => { if (!settled) { settled = true; reject(error); } });
  });
}

function isTrustedHost(value) {
  if (typeof value !== "string" || value.length > 255) return false;
  let parsed;
  try { parsed = new URL("http://" + value); } catch { return false; }
  if (parsed.username || parsed.password || parsed.pathname !== "/") return false;
  return isLoopbackHostname(parsed.hostname);
}

function isTrustedBrowserRequest(request) {
  const origin = request.headers.origin;
  if (typeof origin !== "string") return false;
  const normalized = normalizeTrustedOrigin(origin);
  if (!normalized || !trustedWebOrigins.has(normalized)) return false;
  return String(request.headers["sec-fetch-site"] || "").toLowerCase() !== "cross-site";
}

function trustedOrigins(value) {
  const configured = ("http://127.0.0.1:5173,http://localhost:5173," + String(value || "")).split(",");
  return new Set(configured.map((item) => normalizeTrustedOrigin(item.trim())).filter(Boolean));
}

function normalizeTrustedOrigin(value) {
  let parsed;
  try { parsed = new URL(value); } catch { return ""; }
  if (parsed.protocol !== "http:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return "";
  return isLoopbackHostname(parsed.hostname) ? parsed.origin : "";
}

function isLoopbackHostname(value) {
  const hostname = String(value || "").toLowerCase();
  if (hostname === "localhost") return true;
  const address = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  return address === "::1" || (net.isIP(address) === 4 && address.startsWith("127."));
}

function isJsonRequest(request) {
  return String(request.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase() === "application/json";
}

function hasValidSession(value) {
  if (typeof value !== "string") return false;
  const actual = Buffer.from(sessionToken);
  const candidate = Buffer.from(value);
  return actual.length === candidate.length && timingSafeEqual(actual, candidate);
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

class RequestError extends Error {
  constructor(status, publicMessage) {
    super(publicMessage);
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

class RuntimeTimeoutError extends Error {}

class RuntimeResultError extends Error {
  constructor(status, publicMessage) {
    super(publicMessage);
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

function isWriteVerificationMismatch(value) {
  return /write verification mismatch/i.test(String(value?.error?.message || ""));
}

${actionPolicyRuntimeSource()}

function send(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function toBrowser(value) {
  if (Array.isArray(value)) return value.map(toBrowser);
  if (!value || typeof value !== "object") return typeof value === "string" ? publicText(value) : value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [publicKey(key), toBrowser(item)]));
}

function fromBrowser(value) {
  if (Array.isArray(value)) return value.map(fromBrowser);
  if (!value || typeof value !== "object") return typeof value === "string" ? privateActions.get(value) || value : value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [privateKey(key), fromBrowser(item)]));
}

function publicKey(key) { return key.replaceAll("intents", "commands").replaceAll("Intents", "Commands").replaceAll("intent", "command").replaceAll("Intent", "Command").replaceAll("capabilities", "supports").replaceAll("Capabilities", "Supports").replaceAll("capability", "support").replaceAll("Capability", "Support").replaceAll("Bridge", "Relay").replaceAll("bridge", "relay").replaceAll("endpoint", "service").replaceAll("Endpoint", "Service").replaceAll("validation", "check").replaceAll("Validation", "Check").replaceAll("audit", "review").replaceAll("Audit", "Review"); }
function privateKey(key) { return key.replaceAll("commands", "intents").replaceAll("Commands", "Intents").replaceAll("command", "intent").replaceAll("Command", "Intent").replaceAll("supportPid", "capabilityPid").replaceAll("SupportPid", "CapabilityPid").replaceAll("supportStatus", "capabilityStatus").replaceAll("SupportStatus", "CapabilityStatus").replaceAll("groupSupport", "groupCapability").replaceAll("GroupSupport", "GroupCapability").replaceAll("supportedRelayType", "supportedBridgeType").replaceAll("SupportedRelayType", "SupportedBridgeType"); }
function publicText(value) { const action = [...privateActions].find(([, intent]) => intent === value)?.[0]; return action || value.replace(/Runtime|Bridge|CLI/g, "家庭服务").replace(/endpoint/gi, "service"); }
`;
}

function escapeText(value) {
  return String(value || "").replace(/[<&]/g, (character) => character === "<" ? "&lt;" : "&amp;");
}
