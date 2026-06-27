#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const bridgeRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(bridgeRoot, "../..");
const openApiPath = path.join(bridgeRoot, "openapi.json");
const skillRequestSchemaPath = path.join(repoRoot, "skills", "yeelight-smart-home", "assets", "schemas", "skill-request.schema.json");
const skillResponseSchemaPath = path.join(repoRoot, "skills", "yeelight-smart-home", "assets", "schemas", "skill-response.schema.json");

const config = {
  host: process.env.YEELIGHT_BRIDGE_HOST || process.env.HOST || "127.0.0.1",
  port: Number.parseInt(process.env.YEELIGHT_BRIDGE_PORT || process.env.PORT || "8787", 10),
  runtimeBin: process.env.YEELIGHT_HOME_BIN || "yeelight-home",
  apiKey: process.env.YEELIGHT_BRIDGE_API_KEY || "",
  timeoutMs: Number.parseInt(process.env.YEELIGHT_BRIDGE_TIMEOUT_MS || "30000", 10),
  bodyLimitBytes: Number.parseInt(process.env.YEELIGHT_BRIDGE_BODY_LIMIT_BYTES || String(1024 * 1024), 10),
  allowedOrigins: (process.env.YEELIGHT_BRIDGE_ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
};

const openApi = readJSON(openApiPath);
const skillRequestSchema = readJSON(skillRequestSchemaPath);
const skillResponseSchema = readJSON(skillResponseSchemaPath);

const server = http.createServer(async (req, res) => {
  try {
    if (handleCors(req, res)) return;
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/health") {
      sendJSON(res, 200, healthPayload());
      return;
    }
    if (req.method === "GET" && url.pathname === "/openapi.json") {
      sendJSON(res, 200, openApi);
      return;
    }
    if (req.method === "GET" && url.pathname === "/schemas/skill-request.schema.json") {
      sendJSON(res, 200, skillRequestSchema);
      return;
    }
    if (req.method === "GET" && url.pathname === "/schemas/skill-response.schema.json") {
      sendJSON(res, 200, skillResponseSchema);
      return;
    }
    if (!authorize(req)) {
      sendJSON(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    if (req.method === "POST" && url.pathname === "/invoke") {
      const body = await readRequestJSON(req);
      const response = await invokeRuntime(normalizeSkillRequest(body));
      sendJSON(res, statusCodeForSkillResponse(response), response);
      return;
    }
    if (req.method === "POST" && url.pathname === "/mcp") {
      const body = await readRequestJSON(req);
      const response = await handleMcpRequest(body);
      sendJSON(res, 200, response);
      return;
    }

    sendJSON(res, 404, { ok: false, error: "not_found" });
  } catch (error) {
    const status = error?.statusCode || 500;
    sendJSON(res, status, {
      contractVersion: "1.0",
      requestId: error?.requestId || "bridge-error",
      status: "error",
      userMessage: error instanceof Error ? error.message : String(error),
      error: {
        code: error?.code || "bridge_error",
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

server.listen(config.port, config.host, () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.port;
  process.stdout.write(`${JSON.stringify({ event: "ready", url: `http://${config.host}:${port}` })}\n`);
});

function healthPayload() {
  return {
    ok: true,
    service: "yeelight-skill-bridge",
    skill: "yeelight-smart-home",
    contractVersion: "1.0",
    runtime: {
      command: `${config.runtimeBin} invoke --stdin`,
      timeoutMs: config.timeoutMs,
    },
  };
}

function authorize(req) {
  if (!config.apiKey) return true;
  const authorization = req.headers.authorization || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  const headerKey = req.headers["x-api-key"] || "";
  return bearer === config.apiKey || headerKey === config.apiKey;
}

function handleCors(req, res) {
  const origin = req.headers.origin || "";
  const allowAll = config.allowedOrigins.includes("*");
  if (origin && (allowAll || config.allowedOrigins.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", allowAll ? "*" : origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, x-api-key");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

async function readRequestJSON(req) {
  const text = await readRequestText(req);
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    error.code = "invalid_json";
    throw error;
  }
}

function readRequestText(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > config.bodyLimitBytes) {
        const error = new Error("Request body is too large.");
        error.statusCode = 413;
        error.code = "body_too_large";
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function normalizeSkillRequest(body) {
  const request = body && typeof body === "object" && body.request ? body.request : body;
  const missing = [];
  for (const field of ["contractVersion", "requestId", "locale", "utterance", "intent"]) {
    if (!request || typeof request[field] !== "string" || !request[field].trim()) missing.push(field);
  }
  if (missing.length > 0) {
    const error = new Error(`Missing required SkillRequest fields: ${missing.join(", ")}`);
    error.statusCode = 400;
    error.code = "invalid_skill_request";
    error.requestId = request?.requestId || "bridge-invalid-request";
    throw error;
  }
  return request;
}

function invokeRuntime(request) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.runtimeBin, ["invoke", "--stdin"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      const error = new Error("Yeelight runtime invocation timed out.");
      error.statusCode = 504;
      error.code = "runtime_timeout";
      error.requestId = request.requestId;
      reject(error);
    }, config.timeoutMs);

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      const wrapped = new Error(`Failed to start yeelight-home runtime: ${error.message}`);
      wrapped.statusCode = 502;
      wrapped.code = "runtime_start_failed";
      wrapped.requestId = request.requestId;
      reject(wrapped);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const error = new Error(stderr.trim() || `yeelight-home exited with code ${code}`);
        error.statusCode = 502;
        error.code = "runtime_failed";
        error.requestId = request.requestId;
        reject(error);
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        const error = new Error("Yeelight runtime returned non-JSON output.");
        error.statusCode = 502;
        error.code = "runtime_non_json";
        error.requestId = request.requestId;
        reject(error);
      }
    });
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

function statusCodeForSkillResponse(response) {
  if (!response || typeof response !== "object") return 502;
  if (["success", "partial", "clarification_required", "confirmation_required"].includes(response.status)) return 200;
  if (response.status === "auth_required") return 401;
  if (response.status === "not_supported" || response.status === "blocked") return 422;
  return 500;
}

async function handleMcpRequest(message) {
  if (Array.isArray(message)) return Promise.all(message.map((item) => handleMcpRequest(item)));
  const id = message?.id ?? null;
  try {
    const result = await mcpResult(message);
    return { jsonrpc: "2.0", id, result };
  } catch (error) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: error?.mcpCode || -32603,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function mcpResult(message) {
  switch (message?.method) {
    case "initialize":
      return {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "yeelight-smart-home", version: "0.1.0" },
      };
    case "ping":
      return {};
    case "tools/list":
      return {
        tools: [
          {
            name: "yeelight_skill_invoke",
            title: "Invoke Yeelight Smart Home Skill",
            description: "Invoke the Yeelight Smart Home Skill through the local yeelight-home runtime.",
            inputSchema: {
              type: "object",
              additionalProperties: false,
              required: ["request"],
              properties: {
                request: skillRequestSchema,
              },
            },
          },
        ],
      };
    case "tools/call": {
      const name = message?.params?.name;
      if (name !== "yeelight_skill_invoke") {
        const error = new Error(`Unknown tool: ${name || ""}`);
        error.mcpCode = -32602;
        throw error;
      }
      const args = message?.params?.arguments || {};
      const runtimeResponse = await invokeRuntime(normalizeSkillRequest(args.request || args));
      return {
        content: [{ type: "text", text: runtimeResponse.userMessage || JSON.stringify(runtimeResponse) }],
        structuredContent: runtimeResponse,
      };
    }
    default: {
      const error = new Error(`Unsupported MCP method: ${message?.method || ""}`);
      error.mcpCode = -32601;
      throw error;
    }
  }
}

function sendJSON(res, statusCode, value) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(value, null, 2)}\n`);
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
