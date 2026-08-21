import { spawn } from "node:child_process";
import { normalizeRuntimeContext, runtimeEnvironment } from "./runtime-adapter.mjs";

export async function resolveLiveContext(options) {
  const base = normalizeRuntimeContext(options.context, { required: true });
  if (base.controlMode || base.gatewayIp || base.lanEndpoint) return base;
  const configured = await (options.runtimeConfigReader || readRuntimeConfig)(base, options);
  const configuredMode = String(configured?.controlMode || "").trim().toLowerCase();
  // Ambient config is advisory; only an explicit local mode with an endpoint
  // may change the already validated cloud context.
  if (!configured || !["local-preferred", "local-only"].includes(configuredMode) || (!configured.gatewayIp && !configured.lanEndpoint)) return base;
  try {
    return normalizeRuntimeContext({
      ...base,
      controlMode: configuredMode,
      gatewayIp: configured.gatewayIp,
      lanEndpoint: configured.lanEndpoint,
    }, { required: true });
  } catch {
    return base;
  }
}

export function readRuntimeConfig(context, options = {}) {
  const binary = options.runtimeBin || process.env.YEELIGHT_HOME_BIN || "yeelight-home";
  const args = ["config", "get", "--json", "--profile", context.profile, "--region", context.region, "--house-id", context.houseId];
  return new Promise((resolve) => {
    let child;
    try {
      const childEnv = runtimeEnvironment();
      for (const key of ["YEELIGHT_HOME_CONTROL_MODE", "YEELIGHT_HOME_GATEWAY_IP", "YEELIGHT_HOME_LAN_ENDPOINT"]) delete childEnv[key];
      child = spawn(binary, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], env: childEnv });
    } catch {
      resolve(null);
      return;
    }
    let output = "";
    const timer = setTimeout(() => { child.kill(); resolve(null); }, 1_500);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.length > 64 * 1024) {
        child.kill();
        clearTimeout(timer);
        resolve(null);
      }
    });
    discardChildStderr(child.stderr);
    child.once("error", () => { clearTimeout(timer); resolve(null); });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) { resolve(null); return; }
      try {
        const value = JSON.parse(output.trim());
        if (!value || value.ok !== true) { resolve(null); return; }
        resolve({
          controlMode: String(value.controlMode || "").trim().toLowerCase(),
          gatewayIp: String(value.gatewayIp || "").trim(),
          lanEndpoint: String(value.lanEndpoint || "").trim(),
        });
      } catch {
        resolve(null);
      }
    });
  });
}

function discardChildStderr(stream) {
  stream?.on("data", () => {});
  stream?.resume();
}
