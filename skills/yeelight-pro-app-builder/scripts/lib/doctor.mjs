import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import { evaluateRuntimeCompatibility, loadRuntimeCompatibility } from "./runtime-compatibility.mjs";

export async function runBuilderDoctor({
  runtimeBin,
  outputDir,
  bridgePort,
  nodeVersion,
  npmVersion,
  run,
  inspectOutputDirectory,
  inspectPort,
}) {
  const declaration = loadRuntimeCompatibility();
  const checks = [];
  checks.push(checkNode(nodeVersion));
  checks.push(checkNpm(npmVersion));

  const versionPayload = await runJson(run, ["version", "--json"]);
  const runtimeVersion = String(versionPayload.value?.version || "unknown");
  const compatibility = evaluateRuntimeCompatibility(runtimeVersion, declaration);
  checks.push({
    id: "runtime-version",
    status: compatibility.supported ? "pass" : "fail",
    reasonId: compatibility.reasonId,
    message: compatibility.supported ? `yeelight-home ${runtimeVersion} is supported` : `yeelight-home ${runtimeVersion} is not supported`,
    remediation: compatibility.supported ? "" : `Install yeelight-home ${declaration.minimumVersion} or newer and rerun doctor.`,
  });

  const contractPayload = await runJson(run, ["intent", "schema", "--intent", "home.list", "--json"]);
  const contractVersion = contractPayload.value?.properties?.contractVersion?.const;
  checks.push(checkResult("runtime-contract", contractPayload.ok && contractVersion === declaration.contractVersion,
    `Runtime contract ${contractVersion || "unknown"}`, "Reinstall a supported yeelight-home Runtime with contract 1.0."));

  const authPayload = await runJson(run, ["auth", "status", "--json"]);
  checks.push(checkResult("runtime-authentication", authPayload.ok && authPayload.value?.authenticated === true,
    authPayload.value?.authenticated === true ? "Runtime authentication is available" : "Runtime authentication is missing",
    "Run yeelight-home auth login --qr, then rerun doctor."));

  const port = await inspectPort({ host: "127.0.0.1", port: bridgePort });
  checks.push(checkResult("bridge-port", port.available, port.available ? `Loopback port ${bridgePort} is available` : `Loopback port ${bridgePort} is occupied`,
    `Stop the process using 127.0.0.1:${bridgePort} or choose another Bridge port.`, port.reason));

  const output = inspectOutputDirectory(outputDir);
  checks.push(checkResult("output-directory", output.writable, output.writable ? `Output directory is writable: ${output.path}` : `Output directory is not writable: ${output.path}`,
    "Choose an existing writable output directory or fix its permissions.", output.reason));

  return {
    schemaVersion: 1,
    ok: checks.every((item) => item.status === "pass"),
    runtime: { binary: runtimeBin, version: runtimeVersion, contractVersion: contractVersion || "unknown" },
    outputDirectory: output.path,
    bridge: { host: "127.0.0.1", port: bridgePort },
    checks,
  };
}

export function inspectOutputDirectory(outputDir) {
  const resolved = path.resolve(String(outputDir || "."));
  let candidate = resolved;
  while (!fs.existsSync(candidate)) {
    const parent = path.dirname(candidate);
    if (parent === candidate) return { writable: false, path: resolved, reason: "missing-parent" };
    candidate = parent;
  }
  if (!fs.statSync(candidate).isDirectory()) return { writable: false, path: resolved, reason: "not-a-directory" };
  try {
    fs.accessSync(candidate, fs.constants.W_OK);
    return { writable: true, path: resolved };
  } catch {
    return { writable: false, path: resolved, reason: "permission-denied" };
  }
}

export function inspectLoopbackPort({ host = "127.0.0.1", port }) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => resolve({ available: false, host, port, reason: error.code === "EADDRINUSE" ? "address-in-use" : "bind-failed" }));
    server.listen({ host, port, exclusive: true }, () => server.close(() => resolve({ available: true, host, port })));
  });
}

function checkNode(version) {
  const [major, minor] = numericParts(version);
  const supported = (major === 20 && minor >= 19) || major >= 22;
  return checkResult("node-version", supported, `Node ${version}`, "Install Node 20.19+ or 22.12+.");
}

function checkNpm(version) {
  const [major] = numericParts(version);
  return checkResult("npm-version", major >= 10 && major < 12, `npm ${version}`, "Install npm 10 or 11.");
}

function numericParts(version) {
  return String(version || "").replace(/^v/, "").split(".").map((value) => Number(value));
}

function checkResult(id, passed, message, remediation, reasonId = "") {
  return { id, status: passed ? "pass" : "fail", message, remediation: passed ? "" : remediation, ...(reasonId ? { reasonId } : {}) };
}

async function runJson(run, args) {
  try {
    const result = await run(args);
    if (result.code !== 0) return { ok: false, value: undefined };
    return { ok: true, value: JSON.parse(String(result.stdout || "")) };
  } catch {
    return { ok: false, value: undefined };
  }
}
