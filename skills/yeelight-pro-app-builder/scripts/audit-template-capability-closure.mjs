import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { automationsHookSource } from "./lib/templates/automation-hook.mjs";
import { gatewaysHookSource } from "./lib/templates/gateway-hook.mjs";
import { groupsHookSource } from "./lib/templates/group-hook.mjs";
import { knobsHookSource } from "./lib/templates/knob-hook.mjs";
import { panelsHookSource } from "./lib/templates/panel-hook.mjs";
import { scenesHookSource } from "./lib/templates/scene-hook.mjs";

const args = parseArgs(process.argv.slice(2));
const evidenceDir = path.resolve(String(args["evidence-dir"] || "template-closure-evidence"));
const spec = { scope: { homeIds: ["990001"] } };
const automationTypes = ["AutomationStatusAction", "AutomationItem", "AutomationCondition", "AutomationRuleAction", "AutomationTrigger", "AutomationDetail", "AutomationDraft", "AutomationOperationResult", "AutomationRegistryCondition", "AutomationRegistryTarget", "AutomationCapabilityRegistry"];

const domains = [
  auditDomain("scene", scenesHookSource, ["SceneItem", "SceneAction", "SceneDetail", "SceneDraft", "SceneTargetOption", "SceneOperationResult"], [
    sourceCase("list-only", sceneOperations()),
    sourceCase("list-execute", sceneOperations({ execute: true }), { required: ["scene.execute"], forbidden: ["SceneDraft", "draftParameters"] }),
    sourceCase("detail", sceneOperations({ detail: true }), { required: ["SceneDetail", "loadDetail"], forbidden: ["SceneDraft", "draftParameters"] }),
    sourceCase("detail-create", sceneOperations({ detail: true, create: true }), { required: ["SceneDraft", "draftParameters", "scene.create"], forbidden: ["scene.update", "scene.test", "scene.delete"] }),
    sourceCase("detail-update", sceneOperations({ detail: true, update: true }), { required: ["SceneDraft", "draftParameters", "scene.update"], forbidden: ["scene.create", "scene.test", "scene.delete"] }),
    sourceCase("detail-test", sceneOperations({ detail: true, test: true }), { required: ["SceneDetail", "scene.test"], forbidden: ["SceneDraft", "draftParameters", "scene.create", "scene.update", "scene.delete"] }),
    sourceCase("detail-delete", sceneOperations({ detail: true, delete: true }), { required: ["SceneDetail", "scene.delete"], forbidden: ["SceneDraft", "draftParameters", "scene.create", "scene.update", "scene.test"] }),
    sourceCase("full", sceneOperations({ detail: true, create: true, update: true, test: true, execute: true, delete: true }), { required: ["scene.create", "scene.update", "scene.test", "scene.execute", "scene.delete"] }),
  ]),
  auditDomain("automation", automationsHookSource, automationTypes, [
    sourceCase("read-only", automationOperations(), { forbidden: ["previewCreate", "createAutomation", "previewUpdate", "updateAutomation", "previewDelete", "deleteAutomation"] }),
    sourceCase("full", automationOperations({ detail: true, supported: true, supportedV2: true, create: true, update: true, enable: true, disable: true, delete: true }), { required: ["previewCreate", "createAutomation", "previewUpdate", "updateAutomation", "previewDelete", "deleteAutomation"] }),
  ]),
  auditDomain("group", groupsHookSource, ["GroupDevice", "GroupRoom", "GroupItem", "GroupDetail", "GroupDraft", "GroupOperationResult"], [
    sourceCase("read-only", groupOperations({ detail: true }), { forbidden: ["previewCreate", "createGroup", "previewUpdate", "updateGroup", "updateMembers", "previewDelete", "deleteGroup"] }),
    sourceCase("full", groupOperations({ detail: true, create: true, update: true, members: true, delete: true }), { required: ["previewCreate", "createGroup", "previewUpdate", "updateGroup", "updateMembers", "previewDelete", "deleteGroup"] }),
  ]),
  auditDomain("gateway", gatewaysHookSource, ["GatewayErrors", "Room", "Gateway"], [
    sourceCase("read-only", gatewayOperations(), { forbidden: ["const deleteGateway"] }),
    sourceCase("delete", gatewayOperations({ delete: true }), { required: ["const deleteGateway"] }),
  ]),
  auditDomain("panel", panelsHookSource, ["PanelEvent", "PanelButton", "PanelItem", "KnobItem", "TargetOption", "Errors"], [
    sourceCase("read-only", panelOperations()),
    sourceCase("full", panelOperations({ configure: true, eventUpdate: true, eventBatch: true, eventReset: true })),
  ], "type-reference-and-bridge-policy"),
  auditDomain("knob", knobsHookSource, ["KnobAction", "KnobItem", "KnobTarget"], [
    sourceCase("read-only", panelOperations()),
    sourceCase("full", panelOperations({ knobConfigure: true, knobReset: true })),
  ], "type-reference-and-bridge-policy"),
];

const report = {
  schemaVersion: 1,
  kind: "management-template-capability-closure",
  status: domains.every((domain) => domain.status === "passed") ? "passed" : "failed",
  generatedAt: new Date().toISOString(),
  domains,
};
fs.mkdirSync(evidenceDir, { recursive: true });
const outputPath = path.join(evidenceDir, "template-capability-closure.json");
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, outputPath, domains: domains.length, cases: domains.reduce((total, domain) => total + domain.cases.length, 0) }, null, 2));
if (report.status !== "passed") process.exitCode = 1;

function auditDomain(id, render, typeNames, cases, auditMode = "source-ownership") {
  const results = cases.map((entry) => auditCase(render(spec, entry.operations), typeNames, entry));
  return { id, auditMode, status: results.every((entry) => entry.status === "passed") ? "passed" : "failed", cases: results };
}

function auditCase(source, typeNames, entry) {
  const types = Object.fromEntries(typeNames.map((name) => {
    const declarations = count(source, new RegExp(`(?:export\\s+)?type\\s+${name}\\b`, "g"));
    const references = count(source, new RegExp(`\\b${name}\\b`, "g"));
    return [name, { declarations, references }];
  }));
  const danglingTypes = Object.entries(types).filter(([, value]) => value.references > 0 && value.declarations === 0).map(([name]) => name);
  const duplicateTypes = Object.entries(types).filter(([, value]) => value.declarations > 1).map(([name]) => name);
  const missingRequired = entry.required.filter((token) => !source.includes(token));
  const forbiddenPresent = entry.forbidden.filter((token) => source.includes(token));
  const passed = danglingTypes.length === 0 && duplicateTypes.length === 0 && missingRequired.length === 0 && forbiddenPresent.length === 0;
  return { id: entry.id, status: passed ? "passed" : "failed", sha256: crypto.createHash("sha256").update(source).digest("hex"), types, danglingTypes, duplicateTypes, missingRequired, forbiddenPresent };
}

function sourceCase(id, operations, checks = {}) {
  return { id, operations, required: checks.required || [], forbidden: checks.forbidden || [] };
}

function sceneOperations(enabled = {}) { return operations(["detail", "create", "update", "test", "execute", "delete"], "scene", enabled); }
function automationOperations(enabled = {}) { return operations(["detail", "supported", "supportedV2", "create", "update", "enable", "disable", "delete"], "automation", enabled); }
function groupOperations(enabled = {}) { return operations(["detail", "create", "update", "members", "delete"], "group", enabled); }
function gatewayOperations(enabled = {}) { return operations(["list", "detail", "stats", "thread", "relations", "diagnose", "delete"], "gateway", enabled); }
function panelOperations(enabled = {}) { return operations(["list", "detail", "buttonType", "knobDetail", "configure", "eventUpdate", "eventBatch", "eventReset", "knobConfigure", "knobReset"], "panel", enabled); }

function operations(names, domain, enabled) {
  return Object.fromEntries(names.map((name) => [name, { enabled: enabled[name] === true, intent: `${domain}.${name}`, userMessage: "当前仅支持查看。" }]));
}

function count(source, pattern) { return [...source.matchAll(pattern)].length; }

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    result[key] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return result;
}
