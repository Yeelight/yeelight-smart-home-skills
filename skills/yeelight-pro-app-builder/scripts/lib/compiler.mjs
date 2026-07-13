import fs from "node:fs";
import path from "node:path";

import { homeLightingSummarySource, roomLightingControlSource } from "./templates/lighting-modules.mjs";
import { deviceCurtainControlSource } from "./templates/curtain-modules.mjs";
import { deviceSwitchControlSource } from "./templates/switch-modules.mjs";
import { deviceClimateControlSource } from "./templates/climate-modules.mjs";
import { sensorEnvironmentSource } from "./templates/sensor-modules.mjs";
import { sceneLauncherSource } from "./templates/scene-modules.mjs";
import { automationManagerSource } from "./templates/automation-modules.mjs";
import { automationEditorSource } from "./templates/automation-editor.mjs";
import { groupManagerSource } from "./templates/group-modules.mjs";
import { gatewayOverviewSource } from "./templates/gateway-modules.mjs";
import { panelManagerSource } from "./templates/panel-modules.mjs";
import { installerMaintenanceSource } from "./templates/installer-modules.mjs";
import { homeSpaceSummarySource, roomDeviceManagementSource } from "./templates/space-modules.mjs";
import { appSource, bridgePackageJson, bridgeSource, faviconSource, indexHtml, mainSource, packageJson, viteConfigSource, webPackageJson, webTsconfig } from "./templates/project.mjs";
import { climateDevicesHookSource, curtainDevicesHookSource, homeModelHookSource, lightDevicesHookSource, sensorEnvironmentHookSource, switchDevicesHookSource } from "./templates/runtime-hook.mjs";
import { scenesHookSource } from "./templates/scene-hook.mjs";
import { sceneEditorSource } from "./templates/scene-editor.mjs";
import { automationsHookSource } from "./templates/automation-hook.mjs";
import { groupsHookSource } from "./templates/group-hook.mjs";
import { gatewaysHookSource } from "./templates/gateway-hook.mjs";
import { panelsHookSource } from "./templates/panel-hook.mjs";
import { knobsHookSource } from "./templates/knob-hook.mjs";
import { knobDetailSource } from "./templates/knob-modules.mjs";
import { stylesSource } from "./templates/styles.mjs";
import { selectedControllerFamilies } from "./controllers/contracts.mjs";
import { controllerSharedSource } from "./templates/controllers/shared.mjs";
import { lightingControllerSource } from "./templates/controllers/lighting.mjs";
import { curtainControllerSource } from "./templates/controllers/curtain.mjs";
import { switchControllerSource } from "./templates/controllers/switch.mjs";
import { climateControllerSource } from "./templates/controllers/climate.mjs";
import { sensorControllerSource } from "./templates/controllers/sensor.mjs";
import { controllerRegistrySource } from "./templates/controllers/registry.mjs";
import { generatedManagementIntents, prepareGeneratedManagementOperations, resolveManagementOperations } from "./management-operations.mjs";
import { unsavedNavigationGuardHookSource } from "./templates/management-unsaved-guard.mjs";
import { prepareInfrastructureOperations, resolveInfrastructureOperations } from "./infrastructure-operations.mjs";
import { browserValue, resolveBrowserActions, resolvePrivateActions, secureBrowserWorkspace } from "./browser-boundary.mjs";
import { moduleIntents } from "./templates/project-runtime.mjs";

const moduleTemplates = {
  "home.lighting-summary": { directory: "home-lighting-summary", source: homeLightingSummarySource },
  "room.lighting-control": { directory: "room-lighting-control", source: roomLightingControlSource },
  "home.space-summary": { directory: "home-space-summary", source: homeSpaceSummarySource },
  "room.device-management": { directory: "room-device-management", source: roomDeviceManagementSource },
  "device.curtain-control": { directory: "device-curtain-control", source: deviceCurtainControlSource },
  "device.switch-control": { directory: "device-switch-control", source: deviceSwitchControlSource },
  "device.climate-control": { directory: "device-climate-control", source: deviceClimateControlSource },
  "sensor.environment": { directory: "sensor-environment", source: sensorEnvironmentSource },
  "scene.launcher": { directory: "scene-launcher", source: sceneLauncherSource },
  "automation.manager": { directory: "automation-manager", source: automationManagerSource },
  "group.manager": { directory: "group-manager", source: groupManagerSource },
  "gateway.overview": { directory: "gateway-overview", source: gatewayOverviewSource },
  "panel.manager": { directory: "panel-manager", source: panelManagerSource },
  "installer.maintenance": { directory: "installer-maintenance", source: installerMaintenanceSource },
};

export function moduleDirectory(id) {
  return moduleTemplates[id]?.directory || "";
}

export function compileApplication({ spec, snapshot, outputRoot }) {
  assertProductSpec(spec);
  const selected = spec.modules.map((module) => module.id);
  const unknown = selected.filter((id) => !moduleTemplates[id]);
  if (unknown.length > 0) throw new Error(`未实现的模块: ${unknown.join(", ")}`);
  const managementOperations = {
    ...prepareGeneratedManagementOperations(resolveManagementOperations(selected, snapshot)),
    ...prepareInfrastructureOperations(resolveInfrastructureOperations(selected, snapshot), spec),
  };
  if (selected.includes("installer.maintenance")) managementOperations["installer.maintenance"] = {
    gateway: managementOperations["gateway.overview"],
    panel: managementOperations["panel.manager"],
  };
  const runtimeSnapshot = applyManagementAvailability(snapshot, managementOperations);
  assertRequiredCapabilities(selected, runtimeSnapshot, managementOperations);
  const privateActions = resolvePrivateActions(runtimeSnapshot, selected, moduleIntents, generatedManagementIntents(managementOperations));
  const browserActions = resolveBrowserActions(runtimeSnapshot, privateActions);

  fs.mkdirSync(outputRoot, { recursive: true });
  writeJSON(outputRoot, "product.spec.json", spec);
  writeJSON(outputRoot, "runtime.lock.json", runtimeSnapshot);
  writeJSON(outputRoot, "generation-manifest.json", { schemaVersion: 1, modules: selected, target: spec.target, theme: spec.theme });
  writeJSON(outputRoot, "package.json", packageJson(spec));
  writeJSON(outputRoot, "apps/web/package.json", webPackageJson());
  writeJSON(outputRoot, "apps/bridge/package.json", bridgePackageJson());
  writeJSON(outputRoot, "apps/web/tsconfig.json", webTsconfig());
  writeText(outputRoot, "apps/web/index.html", indexHtml(spec));
  writeText(outputRoot, "apps/web/public/favicon.svg", faviconSource());
  writeText(outputRoot, "apps/web/vite.config.ts", viteConfigSource());
  writeText(outputRoot, "apps/bridge/src/index.mjs", bridgeSource(privateActions));
  writeText(outputRoot, "apps/web/src/main.tsx", mainSource());
  writeText(outputRoot, "apps/web/src/vite-env.d.ts", '/// <reference types="vite/client" />\n');
  writeText(outputRoot, "apps/web/src/App.tsx", appSource(spec, selected, moduleTemplates, managementOperations));
  writeText(outputRoot, "apps/web/src/styles.css", stylesSource(spec));
  if (selected.some((id) => ["scene.launcher", "automation.manager", "group.manager"].includes(id))) {
    writeText(outputRoot, "apps/web/src/runtime/use-unsaved-navigation-guard.ts", unsavedNavigationGuardHookSource());
  }
  if (selected.some((id) => ["home.space-summary", "room.device-management"].includes(id))) writeText(outputRoot, "apps/web/src/runtime/use-home-model.ts", homeModelHookSource(spec, { deviceDirectory: selected.includes("room.device-management") }));
  if (selected.includes("device.curtain-control")) writeText(outputRoot, "apps/web/src/runtime/use-curtain-devices.ts", curtainDevicesHookSource(spec));
  if (selected.includes("device.switch-control")) writeText(outputRoot, "apps/web/src/runtime/use-switch-devices.ts", switchDevicesHookSource(spec));
  if (selected.includes("device.climate-control")) writeText(outputRoot, "apps/web/src/runtime/use-climate-devices.ts", climateDevicesHookSource(spec));
  if (selected.includes("sensor.environment")) writeText(outputRoot, "apps/web/src/runtime/use-sensor-environment.ts", sensorEnvironmentHookSource(spec));
  if (selected.includes("scene.launcher")) writeText(outputRoot, "apps/web/src/runtime/use-scenes.ts", scenesHookSource(spec, managementOperations["scene.launcher"]));
  if (selected.includes("scene.launcher") && (managementOperations["scene.launcher"]?.create.enabled || managementOperations["scene.launcher"]?.update.enabled)) {
    writeText(outputRoot, "apps/web/src/modules/scene-launcher/scene-editor.tsx", sceneEditorSource(managementOperations["scene.launcher"]));
  }
  if (selected.includes("automation.manager")) writeText(outputRoot, "apps/web/src/runtime/use-automations.ts", automationsHookSource(spec, managementOperations["automation.manager"]));
  if (selected.includes("automation.manager") && (managementOperations["automation.manager"]?.create.enabled || managementOperations["automation.manager"]?.update.enabled)) {
    writeText(outputRoot, "apps/web/src/modules/automation-manager/automation-editor.tsx", automationEditorSource(managementOperations["automation.manager"]));
  }
  if (selected.includes("group.manager")) writeText(outputRoot, "apps/web/src/runtime/use-groups.ts", groupsHookSource(spec, managementOperations["group.manager"]));
  if (selected.includes("gateway.overview")) writeText(outputRoot, "apps/web/src/runtime/use-gateways.ts", gatewaysHookSource(spec, managementOperations["gateway.overview"]));
  if (selected.includes("panel.manager")) {
    writeText(outputRoot, "apps/web/src/runtime/use-panels.ts", panelsHookSource(spec, managementOperations["panel.manager"]));
    writeText(outputRoot, "apps/web/src/runtime/use-knobs.ts", knobsHookSource(spec, managementOperations["panel.manager"]));
    writeText(outputRoot, "apps/web/src/modules/panel-manager/knob-detail.tsx", knobDetailSource());
  }
  if (selected.some((id) => ["home.lighting-summary", "room.lighting-control"].includes(id))) writeText(outputRoot, "apps/web/src/runtime/use-light-devices.ts", lightDevicesHookSource(spec));
  writeJSON(outputRoot, "apps/web/src/generated/product-spec.json", spec);
  writeJSON(outputRoot, "apps/web/src/generated/home-model.json", browserValue(runtimeSnapshot, browserActions));

  for (const id of selected) {
    const template = moduleTemplates[id];
    writeText(outputRoot, `apps/web/src/modules/${template.directory}/index.tsx`, template.source(spec, runtimeSnapshot, managementOperations[id]));
  }
  const controllerFamilies = selected.includes("room.device-management") ? selectedControllerFamilies(selected) : [];
  if (controllerFamilies.length > 0) {
    const root = "apps/web/src/modules/room-device-management/controllers";
    writeText(outputRoot, `${root}/registry.tsx`, controllerRegistrySource(selected));
    writeText(outputRoot, `${root}/shared.tsx`, controllerSharedSource(spec));
    if (controllerFamilies.includes("light")) writeText(outputRoot, `${root}/lighting.tsx`, lightingControllerSource());
    if (controllerFamilies.includes("curtain")) writeText(outputRoot, `${root}/curtain.tsx`, curtainControllerSource());
    if (controllerFamilies.includes("switch-relay")) writeText(outputRoot, `${root}/switch.tsx`, switchControllerSource());
    if (controllerFamilies.includes("climate")) writeText(outputRoot, `${root}/climate.tsx`, climateControllerSource());
    if (controllerFamilies.includes("sensor")) writeText(outputRoot, `${root}/sensor.tsx`, sensorControllerSource());
  }
  secureBrowserWorkspace(outputRoot, browserActions);
  return { outputRoot, modules: selected };
}

function assertRequiredCapabilities(selected, snapshot, managementOperations) {
  if (selected.includes("device.curtain-control")) {
    const proven = Object.values(snapshot?.entities || {}).some((entity) => entity.family === "curtain" && (entity.controls || []).some((control) => (
      control.intent === "device.property.set"
      && control.property === "targetPosition"
      && control.evidence === "preview-only"
    )));
    if (!proven) throw new Error("窗帘位置控制缺少 preview-only 能力证据");
  }
  if (selected.includes("device.switch-control")) {
    const proven = Object.values(snapshot?.entities || {}).some((entity) => entity.family === "switch-relay" && (entity.controls || []).some((control) => (
      control.intent === "device.property.set"
      && (control.property === "sp" || /^(?:0|[1-6])-sp$/.test(control.property || ""))
      && control.evidence === "preview-only"
    )));
    if (!proven) throw new Error("开关回路控制缺少 preview-only 能力证据");
  }
  if (selected.includes("device.climate-control")) {
    const proven = Object.values(snapshot?.entities || {}).some((entity) => entity.family === "climate" && (entity.controls || []).some((control) => (
      control.intent === "device.property.set"
      && control.property === "airConditionerTargetTemperature"
      && control.evidence === "preview-only"
    )));
    if (!proven) throw new Error("温控目标温度缺少 preview-only 能力证据");
  }
  if (selected.includes("sensor.environment")) {
    const proven = Object.values(snapshot?.entities || {}).some((entity) => entity.family === "sensor" && entity.readIntent === "state.query");
    if (!proven) throw new Error("传感器当前读数缺少 state.query 能力证据");
  }
  if (selected.includes("scene.launcher")) {
    if (!managementOperations["scene.launcher"]?.list.enabled) throw new Error("情景页面缺少列表读取能力证据");
  }
  if (selected.includes("automation.manager")) {
    if (!managementOperations["automation.manager"]?.list.enabled) throw new Error("自动化页面缺少列表读取能力证据");
  }
  if (selected.includes("group.manager")) {
    if (!managementOperations["group.manager"]?.list.enabled) throw new Error("设备组页面缺少列表读取能力证据");
  }
  if (selected.includes("gateway.overview")) {
    const operations = managementOperations["gateway.overview"];
    const required = ["list", "detail", "stats", "thread", "relations", "diagnose"];
    if (!required.every((name) => operations?.[name]?.enabled) || !Array.isArray(snapshot?.gateways)) throw new Error("网关总览缺少完整只读能力证据");
  }
  if (selected.includes("panel.manager")) {
    const operations = managementOperations["panel.manager"];
    if (!["list", "detail", "buttonType", "knobDetail"].every((name) => operations?.[name]?.enabled) || !Array.isArray(snapshot?.panels) || !Array.isArray(snapshot?.knobs)) throw new Error("面板管理缺少完整读取能力证据");
  }
}

function applyManagementAvailability(snapshot, operations) {
  const next = structuredClone(snapshot);
  delete next.capabilities;
  const scene = operations["scene.launcher"];
  if (scene && !scene.execute.enabled) next.scenes = (next.scenes || []).map((item) => ({ ...item, executable: false, unavailableReason: scene.execute.userMessage.replace("此操作", "执行此情景") }));
  const automation = operations["automation.manager"];
  if (automation) {
    const enabledIntents = new Set([automation.enable, automation.disable].filter((item) => item.enabled).map((item) => item.intent));
    const message = automation.enable.userMessage || automation.disable.userMessage;
    next.automations = (next.automations || []).map((item) => ({ ...item, actions: (item.actions || []).filter((action) => enabledIntents.has(action.intent)), statusUnavailableReason: message.replace("此操作", "修改状态") }));
  }
  const group = operations["group.manager"];
  if (group && !group.members.enabled) next.groups = (next.groups || []).map((item) => ({ ...item, editable: false, membersUnavailableReason: group.members.userMessage.replace("此操作", "维护成员") }));
  const panel = operations["panel.manager"];
  if (panel && (!panel.knobConfigure.enabled || !panel.knobReset.enabled)) {
    next.knobs = (next.knobs || []).map((item) => ({
      ...item,
      editable: false,
      unsupportedReason: panel.knobConfigure.userMessage || "当前旋钮仅支持查看。",
      actions: (item.actions || []).map((action) => ({ ...action, resettable: false })),
    }));
  }
  return next;
}

function assertProductSpec(spec) {
  if (spec?.schemaVersion !== 3) throw new Error("ProductSpec schemaVersion must be 3");
  if (!Array.isArray(spec.modules) || spec.modules.length === 0) throw new Error("ProductSpec requires modules");
}

function writeJSON(root, relativePath, value) {
  writeText(root, relativePath, JSON.stringify(value, null, 2) + "\n");
}

function writeText(root, relativePath, value) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, "utf8");
}
