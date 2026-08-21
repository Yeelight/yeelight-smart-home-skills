import { spawn } from "node:child_process";
import { CinemaError } from "./contracts.mjs";

export const MAX_RUNTIME_OUTPUT_BYTES = 2 * 1024 * 1024;
const RUNTIME_ENV_KEYS = new Set(["PATH", "HOME", "USER", "TMPDIR", "TMP", "TEMP", "APPDATA", "LOCALAPPDATA", "USERPROFILE", "SYSTEMROOT", "YEELIGHT_HOME_PROFILE", "YEELIGHT_HOME_CONFIG_DIR", "YEELIGHT_HOME_DATA_DIR", "YEELIGHT_HOME_HOUSE_ID", "YEELIGHT_CLOUD_REGION", "YEELIGHT_HOME_CONTROL_MODE", "YEELIGHT_HOME_GATEWAY_IP", "YEELIGHT_HOME_LAN_ENDPOINT"]);

export class PersistentRuntimeChannel {
  constructor(binary, context, spawnProcess = spawn, environment = null) {
    this.binary = binary;
    this.context = context;
    this.spawnProcess = spawnProcess;
    this.environment = environment;
    this.child = null;
    this.buffer = "";
    this.pending = new Map();
    this.closed = false;
    this.stderr = "";
    this.receivedResponse = false;
  }

  request(payload, timeoutMs, signal) {
    if (signal?.aborted) return Promise.reject(new CinemaError("runtime_cancelled", "The Runtime request was cancelled.", 504));
    const requestId = String(JSON.parse(payload).requestId || "");
    if (!requestId) return Promise.reject(new CinemaError("runtime_protocol", "The Runtime request id is missing.", 502));
    const child = this.ensureChild();
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, timer: null };
      entry.timer = setTimeout(() => {
        if (!this.pending.delete(requestId)) return;
        entry.cleanup?.();
        // A timed-out keep-alive request can still produce a late response.
        // Retire the whole child so that response cannot contaminate the next
        // request on a newly-created channel.
        if (this.child === child) {
          this.child = null;
          child.kill();
        }
        reject(new CinemaError("runtime_timeout", "The local Runtime request timed out.", 504));
      }, timeoutMs);
      this.pending.set(requestId, entry);
      const abort = () => {
        if (!this.pending.delete(requestId)) return;
        clearTimeout(entry.timer);
        entry.cleanup?.();
        reject(new CinemaError("runtime_cancelled", "The Runtime request was cancelled.", 504));
      };
      entry.cleanup = () => signal?.removeEventListener("abort", abort);
      signal?.addEventListener("abort", abort, { once: true });
      try {
        child.stdin.write(payload.endsWith("\n") ? payload : `${payload}\n`);
      } catch (error) {
        this.pending.delete(requestId);
        clearTimeout(entry.timer);
        entry.cleanup?.();
        reject(new CinemaError("runtime_unavailable", "The local Yeelight Runtime is unavailable.", 503, { cause: String(error) }));
      }
    });
  }

  ensureChild() {
    if (this.closed) throw new CinemaError("runtime_unavailable", "The local Yeelight Runtime is closed.", 503);
    if (this.child) return this.child;
    this.stderr = "";
    this.receivedResponse = false;
    const child = this.spawnProcess(this.binary, ["invoke", "--stdin", "--keep-alive"], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: this.environment || process.env,
    });
    this.child = child;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => this.consume(String(chunk)));
    captureStderr(child.stderr, (chunk) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-8 * 1024);
    });
    child.on("error", () => this.failAll(new CinemaError("runtime_unavailable", "The local Yeelight Runtime is unavailable.", 503)));
    child.on("close", (code) => {
      if (this.child === child) this.child = null;
      if (this.closed) return;
      const unsupported = isKeepAliveUnsupported(code, this.stderr, this.receivedResponse);
      this.stderr = "";
      this.failAll(unsupported
        ? new CinemaError("runtime_keep_alive_unsupported", "The installed Yeelight Runtime does not support the persistent invoke protocol.", 503, { unsupported: true })
        : new CinemaError(code === 0 ? "runtime_unavailable" : "runtime_failed", "The local Yeelight Runtime stopped unexpectedly.", 502));
    });
    return child;
  }

  consume(chunk) {
    this.buffer += chunk;
    if (this.buffer.length > MAX_RUNTIME_OUTPUT_BYTES * 2) {
      this.failAll(new CinemaError("runtime_protocol", "The local Runtime response was too large.", 502));
      this.child?.kill();
      this.buffer = "";
      return;
    }
    let newline;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let parsed;
      try { parsed = JSON.parse(line); } catch { this.failAll(new CinemaError("runtime_protocol", "The local Runtime returned invalid JSON.", 502)); continue; }
      this.receivedResponse = true;
      const requestId = String(parsed.requestId || "");
      // Late or unbound responses are discarded and never satisfy another request.
      if (!requestId) {
        this.failAll(new CinemaError("runtime_protocol", "The local Runtime response id is missing.", 502));
        continue;
      }
      const entry = this.pending.get(requestId);
      if (!entry) continue;
      this.pending.delete(requestId);
      clearTimeout(entry.timer);
      entry.cleanup?.();
      if (parsed?.error && !isStructuredPartialDesignReceipt(parsed)) {
        entry.reject(new CinemaError("runtime_rejected", "The Runtime could not complete the semantic request.", 502, {
          runtimeError: parsed.error,
          safeToRetry: parsed.result?.safeToRetry === true,
          traceId: parsed.traceId,
        }));
      } else {
        entry.resolve(parsed);
      }
    }
  }

  failAll(error) {
    for (const [requestId, entry] of this.pending) {
      this.pending.delete(requestId);
      clearTimeout(entry.timer);
      entry.cleanup?.();
      entry.reject(error);
    }
  }

  close() {
    this.closed = true;
    this.failAll(new CinemaError("runtime_cancelled", "The Runtime channel was closed.", 504));
    const child = this.child;
    this.child = null;
    if (child) child.kill();
  }
}

export async function invokeWithRetry(binary, payload, timeoutMs, signal, context, retrySafeError, runner = runInvoke) {
  try {
    return await runner(binary, payload, timeoutMs, signal, context);
  } catch (error) {
    if (error?.details?.safeToRetry === true && retrySafeError !== false) return runner(binary, payload, timeoutMs, signal, context);
    throw error;
  }
}

export function runInvoke(binary, payload, timeoutMs, signal, context = {}, spawnProcess = spawn) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CinemaError("runtime_cancelled", "The Runtime request was cancelled.", 504));
      return;
    }
    const child = spawnProcess(binary, ["invoke", "--stdin"], { shell: false, stdio: ["pipe", "pipe", "pipe"], env: runtimeEnvironment(process.env, context) });
    let output = "";
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(value);
    };
    const abort = () => { child.kill(); finish(new CinemaError("runtime_cancelled", "The Runtime request was cancelled.", 504)); };
    const timer = setTimeout(() => { child.kill(); finish(new CinemaError("runtime_timeout", "The Runtime request timed out.", 504)); }, timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.setEncoding("utf8");
    discardStderr(child.stderr);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.length > MAX_RUNTIME_OUTPUT_BYTES) {
        child.kill();
        finish(new CinemaError("runtime_protocol", "The local Runtime response was too large.", 502));
      }
    });
    child.on("error", () => finish(new CinemaError("runtime_unavailable", "The local Yeelight Runtime is unavailable.", 503)));
    child.on("close", (code) => {
      if (code !== 0) return finish(new CinemaError("runtime_failed", "The local Yeelight Runtime rejected the request.", 502));
      try {
        const parsed = JSON.parse(output.trim().split(/\r?\n/).filter(Boolean).pop() || "{}");
        if (parsed && parsed.error && !isStructuredPartialDesignReceipt(parsed)) return finish(new CinemaError("runtime_rejected", "The Runtime could not complete that semantic request.", 502, { runtimeError: parsed.error, safeToRetry: parsed.result?.safeToRetry === true, traceId: parsed.traceId }));
        finish(null, parsed);
      } catch {
        finish(new CinemaError("runtime_protocol", "The local Runtime returned an invalid response.", 502));
      }
    });
    if (signal?.aborted) return abort();
    child.stdin.end(payload);
  });
}

export function runtimeEnvironment(source = process.env, overrides = {}) {
  const merged = { ...source, ...overrides };
  return Object.fromEntries([...RUNTIME_ENV_KEYS]
    .filter((key) => typeof merged[key] === "string" && merged[key] !== "")
    .map((key) => [key, merged[key]]));
}

export function discardStderr(stream) {
  stream?.on("data", () => {});
  stream?.resume();
}

function captureStderr(stream, onChunk) {
  if (!stream) return;
  stream.setEncoding?.("utf8");
  stream.on("data", (chunk) => onChunk(String(chunk)));
  stream.resume?.();
}

function isKeepAliveUnsupported(code, stderr, receivedResponse) {
  if (receivedResponse || code !== 2) return false;
  const text = String(stderr || "").toLowerCase();
  return text.includes("usage:")
    || text.includes("unknown flag")
    || text.includes("flag provided but not defined")
    || text.includes("keep-alive");
}

function isStructuredPartialDesignReceipt(value) {
  return value?.status === "partial"
    && value?.result?.capability === "lighting.design.apply"
    && value?.result?.persistentWrites === true
    && Array.isArray(value?.result?.results);
}
