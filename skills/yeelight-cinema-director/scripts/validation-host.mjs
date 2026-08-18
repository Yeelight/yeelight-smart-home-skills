#!/usr/bin/env node
import http from "node:http";
import path from "node:path";
import { isHandle } from "./lib/contracts.mjs";
import { RECOVERY_CONFIRMATION, RECOVERY_TIMEOUT_MS, VALIDATION_CONFIRMATION, VALIDATION_TIMEOUT_MS } from "./lib/validation.mjs";
import { SCREENING_RECOVERY_CONFIRMATION, SCREENING_RECOVERY_TIMEOUT_MS } from "./lib/screening-recovery-store.mjs";
import { __testing as serviceState } from "./service.mjs";

const statePath = serviceState.statePath;
// Full-scope preflight may query 18 lights in three Runtime waves. The
// Runtime adapter allows one safe read retry per request, so keep the host
// request open beyond the worst 3 * 2 * 20s read budget.
export const HOST_PREPARE_TIMEOUT_MS = 180 * 1000;
export const HOST_VALIDATION_RECOVERY_TIMEOUT_MS = RECOVERY_TIMEOUT_MS + 30 * 1000;
export const HOST_SCREENING_RECOVERY_TIMEOUT_MS = SCREENING_RECOVERY_TIMEOUT_MS + 30 * 1000;
export const HOST_VALIDATION_TIMEOUT_MS = VALIDATION_TIMEOUT_MS + RECOVERY_TIMEOUT_MS + 30 * 1000;

export async function hostValidationCommand(action, options = {}) {
  if (!["host-prepare-validation", "host-run-validation", "host-recover-validation", "host-recover-screening"].includes(action)) throw new Error("unsupported_host_validation_action");
  const state = await readState(options.statePath || statePath);
  if (!state?.port || !state.hostToken) throw new Error("service_host_token_missing");
  if (action === "host-prepare-validation") {
    if (options.confirmation !== VALIDATION_CONFIRMATION) throw new Error("confirmation_required");
    return post(state.port, "/api/host/validation/prepare", { handles: parseHandles(options.handles), scopeHandles: parseScopeHandles(options.scopeHandles), confirmation: options.confirmation }, state.hostToken, "", HOST_PREPARE_TIMEOUT_MS);
  }
  if (action === "host-run-validation") {
    if (!options.grant) throw new Error("validation_grant_required");
    return post(state.port, "/api/host/validation/run", { handles: parseHandles(options.handles) }, state.hostToken, options.grant, HOST_VALIDATION_TIMEOUT_MS);
  }
  if (!options.recoveryId || !isHandle(options.recoveryId)) throw new Error("recovery_id_required");
  if (action === "host-recover-screening") {
    if (options.confirmation !== SCREENING_RECOVERY_CONFIRMATION) throw new Error("confirmation_required");
    return post(state.port, "/api/host/screening/recover", { recoveryId: options.recoveryId, confirmation: options.confirmation }, state.hostToken, "", HOST_SCREENING_RECOVERY_TIMEOUT_MS);
  }
  return post(state.port, "/api/host/validation/recover", { recoveryId: options.recoveryId, ...(options.confirmation ? { confirmation: options.confirmation } : {}) }, state.hostToken, "", HOST_VALIDATION_RECOVERY_TIMEOUT_MS);
}

async function readState(filePath) {
  const state = await serviceState.readState(filePath);
  if (!state) throw new Error("service_host_token_missing");
  return state;
}

function parseHandles(value) {
  const handles = String(value || "").split(",").map((handle) => handle.trim()).filter(Boolean);
  if (handles.length !== 4 || new Set(handles).size !== 4 || handles.some((handle) => !isHandle(handle))) throw new Error("validation_target_count");
  return handles;
}

function parseScopeHandles(value) {
  const handles = String(value || "").split(",").map((handle) => handle.trim()).filter(Boolean);
  if (handles.length < 4 || handles.length > 160 || new Set(handles).size !== handles.length || handles.some((handle) => !isHandle(handle))) throw new Error("validation_scope_invalid");
  return handles;
}

function post(port, requestPath, body, hostToken, grant = "", timeoutMs = HOST_PREPARE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headers = {
      host: `127.0.0.1:${port}`,
      "content-type": "application/json",
      "content-length": Buffer.byteLength(payload),
      "x-cinema-host-token": hostToken,
      ...(grant ? { "x-cinema-validation-grant": grant } : {}),
    };
    const request = http.request({ hostname: "127.0.0.1", port, path: requestPath, method: "POST", headers }, (response) => {
      let output = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { output += chunk; });
      response.on("end", () => {
        let parsed;
        try { parsed = JSON.parse(output); } catch { reject(new Error("host_validation_protocol")); return; }
        if (response.statusCode >= 400) {
          const error = new Error(parsed.message || parsed.error || "host_validation_failed");
          error.code = parsed.error || "host_validation_failed";
          error.status = response.statusCode;
          reject(error);
          return;
        }
        resolve(parsed);
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error("host_validation_timeout")));
    request.on("error", reject);
    request.end(payload);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const action = process.argv[2] || "";
  hostValidationCommand(action, {
    handles: value("--handles"),
    scopeHandles: value("--scope-handles"),
    grant: value("--grant"),
    recoveryId: value("--recovery-id"),
    confirmation: value("--confirmation"),
  }).then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "error", operation: action, error: { code: error.code || "host_validation_failed", message: error.message } })}\n`);
    process.exitCode = 1;
  });
}

function value(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

export const __testing = { parseHandles, parseScopeHandles, post, statePath };
