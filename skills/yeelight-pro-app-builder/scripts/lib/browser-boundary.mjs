import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const forbiddenBrowserTerms = /\b(?:CLI|Bridge|intent|capability|endpoint|audit|validation)\b/i;

export function resolvePrivateActions(snapshot, selected, moduleIntents, moduleOverrides = {}) {
  const discovered = new Set([
    ...Object.entries(snapshot.intents || {}).filter(([, value]) => value?.status === "proven").map(([intent]) => intent),
    ...Object.values(snapshot.entities || {}).flatMap((entity) => (entity.controls || []).map((control) => control.intent)),
  ]);
  const allowedIntents = [...new Set(selected.flatMap((moduleId) => {
    const override = moduleOverrides[moduleId];
    return Array.isArray(override)
      ? override
      : (moduleIntents[moduleId] || []).filter((intent) => discovered.has(intent));
  }))].sort();
  return allowedIntents.map((intent) => ({
    actionId: opaqueActionId(intent),
    intent,
  }));
}

export function resolveBrowserActions(snapshot, privateActions = []) {
  const operations = new Set(privateActions.map((item) => item.intent));
  for (const intent of Object.keys(snapshot.intents || {})) operations.add(intent);
  for (const entity of Object.values(snapshot.entities || {})) {
    for (const control of entity.controls || []) if (control.intent) operations.add(control.intent);
  }
  for (const automation of snapshot.automations || []) {
    for (const action of automation.actions || []) if (action.intent) operations.add(action.intent);
  }
  return [...operations].sort().map((intent) => ({
    actionId: opaqueActionId(intent),
    intent,
  }));
}

export function opaqueActionId(intent) {
  return `a_${crypto.createHash("sha256").update(String(intent)).digest("hex").slice(0, 12)}`;
}

export function browserValue(value, privateActions) {
  return JSON.parse(browserSource(JSON.stringify(value), privateActions));
}

export function secureBrowserWorkspace(outputRoot, privateActions) {
  const webRoot = path.join(outputRoot, "apps/web");
  for (const file of listFiles(webRoot)) {
    const source = fs.readFileSync(file, "utf8");
    fs.writeFileSync(file, browserSource(source, privateActions), "utf8");
  }
  assertBrowserWorkspaceBoundary(outputRoot, privateActions.map((item) => item.intent));
}

export function assertBrowserWorkspaceBoundary(outputRoot, semanticOperations = []) {
  const webRoot = path.join(outputRoot, "apps/web");
  if (!fs.existsSync(webRoot)) throw new Error("generated browser workspace is missing");
  if (fs.existsSync(path.join(webRoot, "src/generated/runtime-lock.json"))) throw new Error("generated browser must not contain runtime-lock.json");
  for (const file of listFiles(webRoot)) {
    const source = fs.readFileSync(file, "utf8");
    const relative = path.relative(outputRoot, file);
    if (forbiddenBrowserTerms.test(source)) throw new Error(`generated browser contains an internal term: ${relative}`);
    if (/\/api\/operations\//.test(source)) throw new Error(`generated browser contains an internal operation route: ${relative}`);
    for (const operation of semanticOperations) {
      const pattern = new RegExp(`(?<![A-Za-z0-9_.])${escapeRegExp(operation)}(?![A-Za-z0-9_.])`);
      if (pattern.test(source)) throw new Error(`generated browser contains Runtime operation ${operation}: ${relative}`);
    }
  }
  return true;
}

function browserSource(source, privateActions) {
  let next = String(source);
  for (const { actionId, intent } of [...privateActions].sort((left, right) => right.intent.length - left.intent.length)) {
    const pattern = new RegExp(`(?<![A-Za-z0-9_.])${escapeRegExp(intent)}(?![A-Za-z0-9_.])`, "g");
    next = next.replace(pattern, actionId);
  }
  next = next.replaceAll("../generated/runtime-lock.json", "../generated/home-model.json");
  next = next.replaceAll("/api/operations/", "/api/actions/");
  for (const [internal, product] of [
    ["intents", "commands"], ["Intents", "Commands"], ["INTENTS", "COMMANDS"],
    ["intent", "command"], ["Intent", "Command"], ["INTENT", "COMMAND"],
    ["capabilities", "supports"], ["Capabilities", "Supports"], ["CAPABILITIES", "SUPPORTS"],
    ["capability", "support"], ["Capability", "Support"], ["CAPABILITY", "SUPPORT"],
    ["Bridge", "Relay"], ["bridge", "relay"], ["BRIDGE", "RELAY"],
    ["endpoint", "service"], ["Endpoint", "Service"], ["ENDPOINT", "SERVICE"],
    ["validation", "check"], ["Validation", "Check"], ["VALIDATION", "CHECK"],
    ["audit", "review"], ["Audit", "Review"], ["AUDIT", "REVIEW"],
  ]) next = next.replaceAll(internal, product);
  next = next.replace(/\bCLI\b/g, "local service").replace(/\bcli\b/g, "localService");
  return next;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => !path.relative(root, file).split(path.sep).some((segment) => segment === "dist" || segment === "node_modules"));
}
