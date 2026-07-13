export function packageJson(spec) {
  return { name: spec.product.name, private: true, scripts: { dev: "concurrently -k -n bridge,web \"npm --workspace @app/bridge run dev\" \"npm --workspace @app/web run dev\"", build: "npm --workspace @app/web run build" }, workspaces: ["apps/*"], devDependencies: { concurrently: "latest" } };
}

export function webPackageJson() {
  return { name: "@app/web", private: true, type: "module", scripts: { dev: "vite --host 127.0.0.1", build: "tsc --noEmit && vite build" }, dependencies: { "@vitejs/plugin-react": "latest", vite: "latest", typescript: "latest", react: "latest", "react-dom": "latest", "lucide-react": "latest", "@types/react": "latest", "@types/react-dom": "latest" }, devDependencies: {} };
}

export function bridgePackageJson() {
  return { name: "@app/bridge", private: true, type: "module", scripts: { dev: "node src/index.mjs" } };
}

export function webTsconfig() {
  return { compilerOptions: { target: "ES2022", useDefineForClassFields: true, lib: ["ES2022", "DOM", "DOM.Iterable"], allowJs: false, skipLibCheck: true, esModuleInterop: true, allowSyntheticDefaultImports: true, strict: true, forceConsistentCasingInFileNames: true, module: "ESNext", moduleResolution: "Bundler", resolveJsonModule: true, isolatedModules: true, noEmit: true, jsx: "react-jsx" }, include: ["src"] };
}

export function indexHtml(spec) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="theme-color" content="#f4f8f8"/><link rel="icon" href="/favicon.svg" type="image/svg+xml"/><title>${escapeText(spec.product.title)}</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`;
}

export function faviconSource() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#087f8c"/><path d="M19 17h8l5 11 5-11h8L36 35v12h-8V35z" fill="#fff"/></svg>\n`;
}

export function viteConfigSource() {
  return `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nconst bridgeOrigin = process.env.YPA_RELAY_ORIGIN || "http://127.0.0.1:8787";\nexport default defineConfig({ plugins: [react()], server: { proxy: { "/api": bridgeOrigin } } });\n`;
}

export function mainSource() {
  return `import { createRoot } from "react-dom/client";\nimport { App } from "./App";\ncreateRoot(document.getElementById("root")!).render(<App />);\n`;
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
  return `import http from "node:http";
import { spawn } from "node:child_process";

const host = "127.0.0.1";
const port = Number(process.env.YPA_BRIDGE_PORT || 8787);
const runtimeBin = process.env.YEELIGHT_HOME_BIN || "yeelight-home";
const runtimeTimeoutMs = Math.max(1000, Number(process.env.YPA_RUNTIME_TIMEOUT_MS || 12000));
const allowedIntents = new Set(${JSON.stringify(allowedIntents)});
const privateActions = new Map(${JSON.stringify(privateActions)});

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") return send(response, 200, { status: "ok" });
  const match = request.url?.match(/^\\/api\\/actions\\/([^/?]+)$/);
  if (request.method !== "POST" || !match) return send(response, 404, { status: "not_found" });
  const intent = privateActions.get(decodeURIComponent(match[1]));
  if (!allowedIntents.has(intent)) return send(response, 403, { status: "blocked", userMessage: "当前应用未启用此操作。" });
  try {
    const body = fromBrowser(await readBody(request));
    const payload = { contractVersion: "1.0", requestId: crypto.randomUUID(), locale: body.locale || "zh-CN", utterance: body.utterance || intent, intent, targets: Array.isArray(body.targets) ? body.targets : [], options: body.options || {}, parameters: body.parameters || {} };
    return send(response, 200, toBrowser(await invokeRuntime(payload)));
  } catch (error) {
    return send(response, 502, { status: "error", userMessage: error instanceof Error ? error.message : "家庭连接不可用。" });
  }
});

server.listen(port, host, () => console.log("Yeelight PRO Bridge http://" + host + ":" + port));

function invokeRuntime(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(runtimeBin, ["invoke", "--stdin"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (callback) => { if (settled) return; settled = true; clearTimeout(timer); callback(); };
    const timer = setTimeout(() => { child.kill("SIGTERM"); finish(() => reject(new Error("家庭连接响应超时，请稍后重试。"))); }, runtimeTimeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code) => {
      finish(() => {
        if (code !== 0) return reject(new Error(stderr.trim() || "Runtime 调用失败。"));
        try { resolve(JSON.parse(stdout)); } catch { reject(new Error("Runtime 返回了无效数据。")); }
      });
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; if (body.length > 1024 * 1024) reject(new Error("请求内容过大。")); });
    request.on("end", () => { try { resolve(JSON.parse(body || "{}")); } catch { reject(new Error("请求格式无效。")); } });
    request.on("error", reject);
  });
}

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
