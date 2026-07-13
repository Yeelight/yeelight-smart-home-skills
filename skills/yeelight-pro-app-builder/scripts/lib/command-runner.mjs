import { spawn } from "node:child_process";

export function createCommandRunner({ runtimeBin = process.env.YEELIGHT_HOME_BIN || "yeelight-home", profile = "", region = "", env = {} } = {}) {
  return (args, options = {}) => {
    const offline = args.includes("--version") || ["intent", "explain", "version", "help"].includes(args[0]);
    const contextual = offline ? args : [
      ...args,
      ...(profile && !args.includes("--profile") ? ["--profile", profile] : []),
      ...(region && !args.includes("--region") ? ["--region", region] : []),
    ];
    return runCommand(runtimeBin, contextual, env, options);
  };
}

function runCommand(runtimeBin, args, env, { stdin, timeoutMs = 120000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(runtimeBin, args, {
      env: { ...process.env, ...env },
      stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (code, error = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ code, stdout, stderr: error || stderr });
    };
    const append = (current, chunk) => {
      const next = current + chunk;
      return next.length > 32 * 1024 * 1024 ? next.slice(-32 * 1024 * 1024) : next;
    };
    child.stdout.on("data", (chunk) => { stdout = append(stdout, String(chunk)); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, String(chunk)); });
    if (stdin !== undefined) child.stdin.end(String(stdin));
    child.on("error", (error) => finish(1, error.message));
    child.on("close", (code) => finish(code ?? 1));
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(1, "yeelight-home command timed out");
    }, normalizeTimeout(timeoutMs));
  });
}

function normalizeTimeout(timeoutMs) {
  const value = Number(timeoutMs);
  return Number.isInteger(value) && value >= 10 && value <= 120000 ? value : 120000;
}
