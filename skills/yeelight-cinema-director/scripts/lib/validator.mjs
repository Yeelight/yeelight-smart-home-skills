import fs from "node:fs";
import path from "node:path";
import { createMockDevices } from "./mock.mjs";
import { compileLightingFrame, MAX_TARGETS, normalizeTargets } from "./contracts.mjs";

export function validateCinemaPackage(root) {
  const checks = [];
  const required = ["SKILL.md", "agents/openai.yaml", "scripts/server.mjs", "scripts/service.mjs", "scripts/launch.mjs", "scripts/invoke.sh", "scripts/invoke.ps1", "scripts/runtime-manifest.json", "web/index.html"];
  for (const file of required) checks.push(checkFile(root, file));
  checks.push(checkNoLegacyCode(root));
  checks.push(checkSecuritySource(root));
  checks.push(checkTopologyMatrix());
  checks.push(checkFileLengths(root));
  return { ok: checks.every((check) => check.ok), checks };
}

function checkFile(root, relative) { return { id: `file:${relative}`, ok: fs.existsSync(path.join(root, relative)), detail: relative }; }

function checkNoLegacyCode(root) {
  const forbidden = [["yeelight", "-ai"].join(""), ["QrLogin", "Client"].join(""), ["callMcp", "Tool"].join(""), ["initializeMcp", "Session"].join(""), ["api-dev", ".yeedev.com"].join(""), ["/", "Users", "/"].join(""), ["operation", "Id"].join(""), ["Author", "ization:"].join(""), ["access", "Token"].join(""), ["rawDevice", "Id"].join(""), ["MCP", "-Session"].join("")];
  const hits = [];
  visit(root, (relative, text) => {
    if (relative === "scripts/lib/validator.mjs") return;
    for (const token of forbidden) if (text.includes(token)) hits.push(`${relative}:${token}`);
  });
  return { id: "legacy-boundary", ok: hits.length === 0, detail: hits };
}

function checkSecuritySource(root) {
  const server = ["scripts/server.mjs", "scripts/lib/http.mjs"]
    .map((relative) => fs.readFileSync(path.join(root, relative), "utf8"))
    .join("\n");
  const sourceChecks = [
    ["loopback-bind", server.includes("127.0.0.1")],
    ["fixed-csp", server.includes("script-src 'self'")],
    ["no-cors", !server.includes("Access-Control-Allow-Origin")],
    ["body-limit", server.includes("MAX_BODY_BYTES")],
    ["proof", server.includes("x-cinema-proof")],
  ];
  return { id: "security-source", ok: sourceChecks.every(([, ok]) => ok), detail: sourceChecks.map(([name, ok]) => ({ name, ok })) };
}

function checkTopologyMatrix() {
  const counts = [1, 2, 18, 32, 160];
  const details = [];
  for (const count of counts) {
    const targets = normalizeTargets(createMockDevices(count));
    const rows = compileLightingFrame(targets, { energy: 0.6, hue: 210, saturation: 72, brightness: 68, lyricCue: "none" });
    const unique = new Set(rows.map((row) => row.handle));
    details.push({ count, planned: rows.length, unique: unique.size, roles: new Set(targets.map((target) => target.role)).size });
    if (rows.length !== count || unique.size !== count || targets.some((target) => !["Accent", "Ambient"].includes(target.role))) return { id: "topology-matrix", ok: false, detail: details };
  }
  let rejected = false;
  try { normalizeTargets(Array.from({ length: MAX_TARGETS + 1 }, (_, index) => ({ runtimeId: `too-many-${index}`, name: "x", room: "x", online: true, capabilities: {} }))); } catch (error) { rejected = error.code === "target_limit"; }
  return { id: "topology-matrix", ok: rejected, detail: { counts: details, reject161: rejected } };
}

function checkFileLengths(root) {
  const oversized = [];
  visit(root, (relative) => {
    if (relative.startsWith("scripts/tests/")) return;
    const filePath = path.join(root, relative);
    if (relative.endsWith(".mjs") || relative.endsWith(".js") || relative.endsWith(".html")) {
      const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).length;
      if (lines > 400) oversized.push({ path: relative, lines });
    }
  });
  return { id: "file-length", ok: oversized.length === 0, detail: oversized };
}

function visit(root, callback, current = "") {
  for (const entry of fs.readdirSync(path.join(root, current), { withFileTypes: true })) {
    const relative = path.join(current, entry.name).split(path.sep).join("/");
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    if (entry.isDirectory()) visit(root, callback, relative);
    else if (/\.(?:mjs|js|json|md|yaml|html|css|sh|ps1)$/.test(entry.name)) callback(relative, fs.readFileSync(path.join(root, relative), "utf8"));
  }
}
