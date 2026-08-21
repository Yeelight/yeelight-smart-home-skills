import { spawn } from "node:child_process";

const MAX_LINE_BYTES = 2 * 1024 * 1024;
const KEEP_ALIVE_UNSUPPORTED = "runtime_keep_alive_unsupported";

/**
 * Keeps one local Runtime process alive for a burst of JSONL requests. The
 * channel is deliberately protocol-only: semantic validation stays in the
 * command adapter and every response remains bound to its requestId.
 */
export class PersistentRuntimeChannel {
  constructor(binary, args, env, spawnProcess = spawn) {
    this.binary = binary;
    this.args = [...args, "--keep-alive"];
    this.env = env;
    this.spawnProcess = spawnProcess;
    this.child = null;
    this.buffer = "";
    this.pending = new Map();
    this.stderr = "";
    this.receivedResponse = false;
    this.closed = false;
  }

  request(payload, timeoutMs, signal) {
    if (signal?.aborted) return Promise.reject(new Error("runtime_cancelled"));
    let requestId = "";
    try { requestId = String(JSON.parse(payload)?.requestId || ""); } catch { return Promise.reject(new Error("runtime_protocol")); }
    if (!requestId) return Promise.reject(new Error("runtime_protocol"));
    const child = this.#ensureChild();
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, timer: null, cleanup: null };
      const abort = () => {
        if (!this.pending.delete(requestId)) return;
        clearTimeout(entry.timer);
        entry.cleanup?.();
        reject(new Error("runtime_cancelled"));
      };
      entry.cleanup = () => signal?.removeEventListener("abort", abort);
      entry.timer = setTimeout(() => {
        if (!this.pending.delete(requestId)) return;
        entry.cleanup?.();
        if (this.child === child) {
          this.child = null;
          child.kill();
        }
        reject(new Error("runtime_timeout"));
      }, timeoutMs);
      this.pending.set(requestId, entry);
      signal?.addEventListener("abort", abort, { once: true });
      try {
        child.stdin.write(payload.endsWith("\n") ? payload : `${payload}\n`);
      } catch {
        this.pending.delete(requestId);
        clearTimeout(entry.timer);
        entry.cleanup?.();
        reject(new Error("runtime_unavailable"));
      }
    });
  }

  close() {
    this.closed = true;
    this.#failAll(new Error("runtime_cancelled"));
    const child = this.child;
    this.child = null;
    child?.kill();
  }

  #ensureChild() {
    if (this.closed) throw new Error("runtime_unavailable");
    if (this.child) return this.child;
    this.stderr = "";
    this.receivedResponse = false;
    const child = this.spawnProcess(this.binary, this.args, {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: this.env,
    });
    this.child = child;
    child.stdout.setEncoding?.("utf8");
    child.stdout.on("data", (chunk) => this.#consume(String(chunk)));
    child.stderr?.setEncoding?.("utf8");
    child.stderr?.on("data", (chunk) => { this.stderr = `${this.stderr}${chunk}`.slice(-8192); });
    child.on("error", () => this.#failAll(new Error("runtime_unavailable")));
    child.on("close", (code) => {
      if (this.child === child) this.child = null;
      if (this.closed) return;
      const unsupported = code === 2 && !this.receivedResponse && /usage:|unknown flag|flag provided but not defined|keep-alive/i.test(this.stderr);
      this.#failAll(new Error(unsupported ? KEEP_ALIVE_UNSUPPORTED : "runtime_unavailable"));
      this.stderr = "";
    });
    return child;
  }

  #consume(chunk) {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer, "utf8") > MAX_LINE_BYTES) {
      this.#failAll(new Error("runtime_protocol"));
      this.child?.kill();
      this.buffer = "";
      return;
    }
    let newline;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let value;
      try { value = JSON.parse(line); } catch {
        this.#failAll(new Error("runtime_protocol"));
        continue;
      }
      this.receivedResponse = true;
      const requestId = String(value?.requestId || "");
      if (!requestId) {
        this.#failAll(new Error("runtime_protocol"));
        continue;
      }
      const entry = this.pending.get(requestId);
      if (!entry) continue;
      this.pending.delete(requestId);
      clearTimeout(entry.timer);
      entry.cleanup?.();
      entry.resolve(value);
    }
  }

  #failAll(error) {
    for (const [requestId, entry] of this.pending) {
      this.pending.delete(requestId);
      clearTimeout(entry.timer);
      entry.cleanup?.();
      entry.reject(error);
    }
  }
}

export const __testing = { KEEP_ALIVE_UNSUPPORTED, MAX_LINE_BYTES };
