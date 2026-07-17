import { inspectCapabilities } from "./capability-inspector.mjs";
import { compileApplication } from "./compiler.mjs";
import { compileProductSpec } from "./product-spec.mjs";
import { discoverRuntimeModel } from "./runtime-discovery.mjs";
import { prepareGeneratedManagementOperations, projectManagementCapabilityProfile, resolveManagementOperations } from "./management-operations.mjs";
import { prepareInfrastructureOperations, projectInfrastructureCapabilityProfile, resolveInfrastructureOperations } from "./infrastructure-operations.mjs";
import { assertAvailableModules, evaluateModuleAvailability } from "./module-availability.mjs";
import { moduleIntents } from "./templates/project-runtime.mjs";

const familyConsumers = {
  light: ["home.lighting-summary", "room.lighting-control", "room.device-management", "scene.launcher", "automation.manager", "group.manager", "panel.manager", "installer.maintenance"],
  curtain: ["device.curtain-control", "room.device-management", "scene.launcher", "automation.manager", "group.manager", "panel.manager", "installer.maintenance"],
  "switch-relay": ["device.switch-control", "room.device-management", "scene.launcher", "automation.manager", "group.manager", "panel.manager", "installer.maintenance"],
  climate: ["device.climate-control", "room.device-management", "automation.manager", "panel.manager", "installer.maintenance"],
  sensor: ["sensor.environment", "room.device-management", "automation.manager", "installer.maintenance"],
  gateway: ["gateway.overview", "installer.maintenance"],
  "panel-screen": ["panel.manager", "installer.maintenance"],
  knob: ["panel.manager", "installer.maintenance"],
};

const snapshotCollectionConsumers = {
  scenes: ["scene.launcher", "automation.manager", "panel.manager"],
  automations: ["automation.manager"],
  groups: ["scene.launcher", "automation.manager", "group.manager", "panel.manager"],
  gateways: ["gateway.overview", "installer.maintenance"],
  panels: ["panel.manager", "installer.maintenance"],
  knobs: ["panel.manager", "installer.maintenance"],
  sensorEvents: ["sensor.environment", "automation.manager"],
};

export async function buildApp({ request, title, name, choices = {}, themeFile, agentTheme, outputRoot, run, capabilityProfile, skipModules = [], allowPartial = false }) {
  if (!outputRoot) throw new Error("buildApp requires outputRoot");
  const prepared = await prepareBuild({ request, title, name, choices, themeFile, agentTheme, run, capabilityProfile, skipModules });
  const resolved = resolveEffectiveSpec({ requestedSpec: prepared.spec, availability: prepared.availability, allowPartial });
  const omittedModules = [...prepared.omittedModules, ...resolved.omittedModules];
  const compilationSnapshot = projectSnapshotForSpec(prepared.snapshot, resolved.spec);
  const compilation = compileApplication({
    spec: resolved.spec,
    snapshot: compilationSnapshot,
    outputRoot,
    generationPlan: { requestedModules: prepared.requestedSpec.modules.map((module) => module.id), omittedModules },
  });
  return { ...prepared, spec: resolved.spec, omittedModules, compilation };
}

export async function prepareBuild({ request, title, name, choices = {}, themeFile, agentTheme, run, capabilityProfile, skipModules = [] }) {
  const requestedSpec = compileProductSpec({ request, title, name, choices, themeFile, agentTheme });
  const skipped = applyExplicitModuleSkips(requestedSpec, skipModules);
  const spec = skipped.spec;
  const model = await discoverRuntimeModel({ spec, run });
  const snapshot = await inspectCapabilities({ spec, ...model, run });
  const selected = spec.modules.map((module) => module.id);
  const capabilities = {
    ...projectManagementCapabilityProfile(spec.modules, capabilityProfile),
    ...projectInfrastructureCapabilityProfile(selected, capabilityProfile),
  };
  if (Object.keys(capabilities).length > 0) snapshot.capabilities = capabilities;
  const operations = {
    ...prepareGeneratedManagementOperations(resolveManagementOperations(spec.modules, snapshot)),
    ...prepareInfrastructureOperations(resolveInfrastructureOperations(selected, snapshot), spec),
  };
  const availability = evaluateModuleAvailability({ spec, snapshot, operations });
  return { requestedSpec, spec, model, snapshot, operations, availability, omittedModules: skipped.omittedModules };
}

export function reportModuleAvailability(prepared) {
  const active = new Map(prepared.availability.map((item) => [item.moduleId, item]));
  const skipped = new Set(prepared.omittedModules
    .filter((item) => item.source === "skip-modules")
    .map((item) => item.moduleId));
  return prepared.requestedSpec.modules.map(({ id: moduleId }) => active.get(moduleId) || {
    moduleId,
    status: skipped.has(moduleId) ? "skipped" : "unavailable",
    requiredEvidence: [],
    provenEvidence: [],
    reasonIds: skipped.has(moduleId) ? ["module-explicitly-skipped"] : ["module-not-evaluated"],
    objects: [],
    remediation: [],
    message: skipped.has(moduleId) ? "已通过 --skip-modules 在 discovery 前显式跳过。" : "模块未完成能力评估。",
  });
}

export function applyExplicitModuleSkips(spec, skipModules = []) {
  const requested = new Set(spec.modules.map((module) => module.id));
  const skipped = [...new Set(skipModules.filter(Boolean))];
  const unknown = skipped.filter((moduleId) => !requested.has(moduleId));
  if (unknown.length > 0) throw new Error(`--skip-modules 包含未请求模块: ${unknown.join(", ")}`);
  const omittedModules = skipped.map((moduleId) => ({ moduleId, reasonIds: ["module-explicitly-skipped"], source: "skip-modules" }));
  const diagnostics = [...(spec.diagnostics || []), ...skipped.map((moduleId) => ({ code: "module-explicitly-skipped", moduleId, reasonIds: ["module-explicitly-skipped"] }))];
  const modules = spec.modules.filter((module) => !skipped.includes(module.id));
  if (modules.length === 0) throw new Error("所有请求模块已被显式跳过");
  return { spec: { ...spec, modules, deviceFamilies: filterDeviceFamilies(spec.deviceFamilies, modules), diagnostics }, omittedModules };
}

export function resolveEffectiveSpec({ requestedSpec, availability, allowPartial = false }) {
  if (!allowPartial) {
    assertAvailableModules(availability);
    return { spec: requestedSpec, omittedModules: [] };
  }
  const unavailable = availability.filter((item) => item.status !== "available");
  const omittedIds = new Set(unavailable.map((item) => item.moduleId));
  const modules = requestedSpec.modules.filter((module) => !omittedIds.has(module.id));
  if (modules.length === 0) throw new Error("所有请求模块均不可用，未生成空应用");
  const omittedModules = unavailable.map((item) => ({ moduleId: item.moduleId, reasonIds: item.reasonIds, source: "allow-partial" }));
  const diagnostics = [...(requestedSpec.diagnostics || []), ...unavailable.map((item) => ({ code: "module-omitted-unavailable", moduleId: item.moduleId, reasonIds: item.reasonIds }))];
  return { spec: { ...requestedSpec, modules, deviceFamilies: filterDeviceFamilies(requestedSpec.deviceFamilies, modules), diagnostics }, omittedModules };
}

export function projectSnapshotForSpec(snapshot, spec) {
  const next = structuredClone(snapshot);
  const selected = new Set((spec.modules || []).map((module) => module.id));
  const families = new Set((spec.deviceFamilies || []).map((family) => family === "switch" ? "switch-relay" : family));
  const groupEntityIds = selected.has("group.manager")
    ? new Set((next.groups || []).flatMap((group) => [...(group.deviceIds || []), ...(group.eligibleDeviceIds || [])]).map(String))
    : new Set();
  const includeKnobTargets = selected.has("panel.manager") && (next.knobs || []).some((knob) => knob.editable === true);
  if (families.size > 0 || groupEntityIds.size > 0 || includeKnobTargets) {
    next.entities = Object.fromEntries(Object.entries(next.entities || {})
      .filter(([id, entity]) => families.has(entity.family)
        || groupEntityIds.has(String(entity.id || id))
        || (includeKnobTargets && isKnobDeviceTarget(entity)))
      .map(([id, entity]) => [id, families.has(entity.family) ? entity : withoutEntityOperations(entity)]));
  }
  if (!selected.has("installer.maintenance")) {
    for (const [key, consumers] of Object.entries(snapshotCollectionConsumers)) {
      if (!consumers.some((moduleId) => selected.has(moduleId))) delete next[key];
    }
    const operations = {
      ...resolveManagementOperations(spec.modules, next),
      ...resolveInfrastructureOperations([...selected], next),
    };
    const allowedIntents = new Set([
      ...[...selected].flatMap((moduleId) => moduleIntents[moduleId] || []),
      ...Object.values(operations).flatMap((moduleOperations) => Object.values(moduleOperations).map((operation) => operation.intent)),
      ...Object.values(next.entities || {}).flatMap((entity) => [
        entity.readIntent,
        ...(entity.controls || []).map((control) => control.intent),
      ]),
    ].filter(Boolean));
    next.intents = Object.fromEntries(Object.entries(next.intents || {})
      .filter(([intent]) => allowedIntents.has(intent)));
  }
  delete next.diagnostics;
  return next;
}

function filterDeviceFamilies(families = [], modules) {
  const selected = new Set(modules.map((module) => module.id));
  return families.filter((family) => {
    const normalized = family === "switch" ? "switch-relay" : family;
    const consumers = familyConsumers[normalized];
    return !consumers || consumers.some((moduleId) => selected.has(moduleId));
  });
}

function isKnobDeviceTarget(entity) {
  if (entity.readOnly === true || entity.capabilityStatus === "version-mismatch" || entity.supportStatus === "version-mismatch") return false;
  const state = entity.state && typeof entity.state === "object" ? entity.state : {};
  return ["power", "switchPower", "airConditionerPower", "brightness", "colorTemperature"]
    .some((property) => state[property] !== undefined);
}

function withoutEntityOperations(entity) {
  const { readIntent: _readIntent, controls: _controls, ...target } = entity;
  return target;
}
