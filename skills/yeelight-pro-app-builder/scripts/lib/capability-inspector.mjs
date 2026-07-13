import { inspectGroupManagement, inspectGroupMemberUpdates, parseCapabilityJSON as parseJSON } from "./capability-inspector-groups.mjs";
import { inspectKnobs } from "./capability-inspector-knobs.mjs";

const lightProbes = [
  { id: "power", intent: "light.power.set", property: "power", value: (state) => !Boolean(state.power) },
  { id: "brightness", intent: "light.brightness.set", property: "brightness", value: (state) => Number(state.brightness) === 50 ? 51 : 50 },
  { id: "colorTemperature", intent: "light.color_temperature.set", property: "colorTemperature", value: (state) => Number(state.colorTemperature) === 4000 ? 4100 : 4000 },
  { id: "color", intent: "light.color.set", property: "color", value: (state) => Number(state.color) === 16737792 ? 8454143 : 16737792 },
];

export async function inspectCapabilities({ spec, areas = [], rooms = [], entities = [], scenes = [], automations = [], groups = [], gateways = [], protocolRelationships = [], panels = [], knobs = [], run }) {
  if (typeof run !== "function") throw new Error("capability inspector requires a command runner");
  const versionResult = await run(["--version"]);
  if (versionResult.code !== 0) throw new Error("无法读取 yeelight-home 版本");
  const version = parseVersion(versionResult.stdout);
  const snapshot = {
    schemaVersion: 1,
    cli: { name: "yeelight-home", version, contractVersion: "1.0" },
    intents: {},
    areas: Object.fromEntries(areas.map((area) => [area.id, area])),
    rooms: Object.fromEntries(rooms.map((room) => [room.id, room])),
    entities: {},
    generatedAt: new Date().toISOString(),
  };

  if (areas.length > 0) snapshot.intents["area.list"] = { status: "proven", evidence: "live-read" };
  if (rooms.length > 0) snapshot.intents["room.list"] = { status: "proven", evidence: "live-read" };
  if (rooms.length > 0 || entities.length > 0) snapshot.intents["entity.list"] = { status: "proven", evidence: "live-read" };
  const spaceManagement = spec.modules?.some((module) => module.id === "room.device-management");
  if (spaceManagement) {
    snapshot.intents["area.detail.get"] = { status: "proven", evidence: "live-read" };
    snapshot.intents["room.detail.get"] = { status: "proven", evidence: "live-read" };
    snapshot.intents["device.detail.get"] = { status: "proven", evidence: "live-read" };
  }
  const lightingSummary = spec.modules?.some((module) => module.id === "home.lighting-summary");
  const lightingControl = spec.modules?.some((module) => module.id === "room.lighting-control");
  const curtainControl = spec.modules?.some((module) => module.id === "device.curtain-control");
  const switchControl = spec.modules?.some((module) => module.id === "device.switch-control");
  const climateControl = spec.modules?.some((module) => module.id === "device.climate-control");
  const sensorEnvironment = spec.modules?.some((module) => module.id === "sensor.environment");
  const sceneManager = spec.modules?.some((module) => module.id === "scene.launcher");
  const automationManager = spec.modules?.some((module) => module.id === "automation.manager");
  const groupManager = spec.modules?.some((module) => module.id === "group.manager");
  const gatewayOverview = spec.modules?.some((module) => module.id === "gateway.overview");
  const panelManager = spec.modules?.some((module) => module.id === "panel.manager");
  const needsDeviceState = sceneManager || automationManager || spaceManagement || lightingSummary || lightingControl
    || curtainControl || switchControl || climateControl || sensorEnvironment || panelManager;
  for (const entity of entities) {
    const read = needsDeviceState ? await inspectDeviceState(spec, entity, run) : { proven: false, state: entity.state || {} };
    const access = spaceManagement ? await inspectDeviceAccess(spec, entity, run) : {};
    const writeBlocked = entity.readOnly === true || access.readOnly === true || access.capabilityStatus === "version-mismatch";
    const controls = !writeBlocked && entity.family === "light" && (sceneManager || automationManager || lightingControl) ? await inspectLightControls(spec, entity, read.state, run) : [];
    if (!writeBlocked && entity.family === "curtain" && (sceneManager || automationManager || curtainControl)) controls.push(...await inspectCurtainControls(spec, entity, run));
    if (!writeBlocked && entity.family === "switch-relay" && (sceneManager || automationManager || switchControl)) controls.push(...await inspectSwitchControls(spec, entity, read.state, run));
    if (!writeBlocked && entity.family === "climate" && (automationManager || climateControl)) controls.push(...await inspectClimateControls(spec, entity, read.state, run));
    if (!writeBlocked && spaceManagement) controls.push(...await inspectSpaceControls(spec, rooms, entity, run));
    snapshot.entities[entity.id] = { ...entity, ...access, state: { ...(entity.state || {}), ...(read.state || {}) }, readIntent: read.proven ? "state.query" : undefined, controls };
    if (read.proven) snapshot.intents["state.query"] = { status: "proven", evidence: "live-read" };
    for (const control of controls) snapshot.intents[control.intent] = { status: "proven", evidence: control.evidence };
  }
  if (sensorEnvironment || automationManager) {
    const events = await inspectSensorEvents(spec, run);
    if (events.proven) {
      snapshot.intents["sensor.event.list"] = { status: "proven", evidence: "live-read" };
      snapshot.sensorEvents = events.items;
    }
  }
  if (spec.modules?.some((module) => module.id === "scene.launcher")) {
    snapshot.intents["scene.list"] = { status: "proven", evidence: "live-read" };
    snapshot.scenes = await inspectSceneExecutions(spec, scenes, run);
    if (snapshot.scenes.some((scene) => scene.executable)) snapshot.intents["scene.execute"] = { status: "proven", evidence: "preview-only" };
    snapshot.groups = groups;
  }
  if (automationManager) {
    snapshot.intents["automation.list"] = { status: "proven", evidence: "live-read" };
    snapshot.automations = await inspectAutomationStatusActions(spec, automations, run);
    snapshot.scenes ??= scenes;
    snapshot.groups ??= groups;
    for (const automation of snapshot.automations) {
      for (const action of automation.actions) snapshot.intents[action.intent] = { status: "proven", evidence: action.evidence };
    }
  }
  if (groupManager) {
    snapshot.intents["group.list"] = { status: "proven", evidence: "live-read" };
    snapshot.intents["group.detail.get"] = { status: "proven", evidence: "live-read" };
    snapshot.groups = await inspectGroupMemberUpdates(spec, groups, entities, run);
    if (snapshot.groups.some((group) => group.editable)) snapshot.intents["group.members.update"] = { status: "proven", evidence: "preview-only" };
    const management = await inspectGroupManagement(spec, groups, entities, run);
    for (const intent of management) snapshot.intents[intent] = { status: "proven", evidence: "preview-only" };
  }
  if (gatewayOverview) {
    snapshot.gateways = projectProtocolRelationships({ gateways, entities, rooms, relationships: protocolRelationships });
    for (const intent of ["gateway.list", "gateway.detail.get", "gateway.stats.list", "gateway.thread.get"]) snapshot.intents[intent] = { status: "proven", evidence: "live-read" };
  }
  if (panelManager) {
    snapshot.intents["panel.list"] = { status: "proven", evidence: "live-read" };
    snapshot.intents["panel.get"] = { status: "proven", evidence: "live-read" };
    snapshot.intents["knob.get"] = { status: "proven", evidence: "live-read" };
    snapshot.panels = await inspectPanelButtonAliases(spec, panels, run);
    const knobInspection = await inspectKnobs({ spec, knobs, run });
    snapshot.knobs = knobInspection.knobs;
    Object.assign(snapshot.intents, knobInspection.intents);
    snapshot.scenes ??= scenes;
    snapshot.groups ??= groups;
    if (snapshot.panels.some((panel) => panel.editable)) snapshot.intents["panel.button.configure"] = { status: "proven", evidence: "preview-only" };
  }
  return snapshot;
}

function projectProtocolRelationships({ gateways, entities, rooms, relationships }) {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const gatewayById = new Map(gateways.map((gateway) => [gateway.id, gateway]));
  const projected = relationships.flatMap((relation) => {
    const gateway = gatewayById.get(relation.gatewayId);
    if (!gateway || !["matter", "dali"].includes(String(relation.protocol).toLowerCase())) return [];
    const devices = relation.deviceIds.map((id) => entityById.get(id)).filter(Boolean).map((entity) => ({
      id: entity.id,
      name: protocolDeviceName(entity),
      roomId: entity.roomId,
      roomName: entity.roomName || roomById.get(entity.roomId)?.name || "未分配",
      online: entity.online !== false,
    }));
    const relatedRooms = relation.roomIds.map((id) => roomById.get(id)).filter(Boolean).map((room) => ({ id: room.id, name: room.name }));
    if (devices.length === 0 || relatedRooms.length === 0) return [];
    return [{ gatewayId: gateway.id, gatewayName: gateway.name, protocol: String(relation.protocol).toLowerCase(), devices, rooms: relatedRooms }];
  });
  return gateways.map((gateway) => {
    const gatewayRelationships = projected.filter((relation) => relation.gatewayId === gateway.id);
    return gatewayRelationships.length > 0 ? { ...gateway, protocolRelationships: gatewayRelationships } : gateway;
  });
}

function protocolDeviceName(entity) {
  return String(entity.displayName || entity.name || entity.id).replace(/^(?:matter|dali)-/i, "");
}

async function inspectPanelButtonAliases(spec, panels, run) {
  const houseId = spec.scope?.homeIds?.[0] || ""; const result = [];
  for (const panel of panels) {
    const buttons = [];
    for (const button of panel.buttons) {
      const request = { contractVersion: "1.0", requestId: `capability-panel-${panel.id}-${button.id}`, locale: "zh-CN", utterance: `预览修改${panel.name}${button.name}别名`, intent: "panel.button.configure", targets: [{ entityType: "device", id: panel.id }], parameters: { houseId, deviceId: panel.id, buttons: [{ id: button.id, alias: button.alias }] } };
      const execution = await run(["invoke", "--stdin", "--preview-only"], { stdin: JSON.stringify(request) }); const payload = parseJSON(execution.stdout); const preview = payload?.result?.preview; const rows = preview?.payloadPreview?.buttons;
      const proven = execution.code === 0 && payload?.status === "success" && payload?.result?.dryRun === true && payload?.warnings?.includes("dry_run_no_cloud_write") && preview?.intent === request.intent && String(preview?.payloadPreview?.deviceId || "") === panel.id && Array.isArray(rows) && String(rows[0]?.id || "") === button.id;
      buttons.push({ ...button, editable: proven, ...(proven ? { evidence: "preview-only" } : {}) });
    }
    result.push({ ...panel, buttons, editable: buttons.length > 0 && buttons.every((button) => button.editable) });
  }
  return result;
}

async function inspectAutomationStatusActions(spec, automations, run) {
  const houseId = spec.scope?.homeIds?.[0] || "";
  const inspected = [];
  for (const automation of automations) {
    const actions = [];
    for (const intent of ["automation.enable", "automation.disable"]) {
      const request = {
        contractVersion: "1.0", requestId: `capability-${intent}-${automation.id}`, locale: "zh-CN",
        utterance: `${intent.endsWith("enable") ? "启用" : "停用"}自动化${automation.name}`, intent,
        targets: [{ entityType: "automation", id: automation.id }], parameters: { houseId, automationId: automation.id },
      };
      const result = await run(["invoke", "--stdin", "--preview-only"], { stdin: JSON.stringify(request) });
      const payload = parseJSON(result.stdout);
      const planned = payload?.result?.planned || payload?.result?.preview;
      const plannedAutomationId = planned?.automationId || planned?.payloadPreview?.automationId;
      const noWrite = payload?.result?.persistentWrites === false || (
        payload?.traceId === "invoke-preview" && Array.isArray(payload?.warnings) && payload.warnings.includes("dry_run_no_cloud_write")
      );
      const proven = result.code === 0 && payload?.status === "success" && payload?.result?.dryRun === true
        && noWrite && planned?.intent === intent && String(plannedAutomationId || "") === automation.id;
      if (proven) actions.push({ intent, evidence: "preview-only" });
    }
    inspected.push({ ...automation, actions });
  }
  return inspected;
}

async function inspectSceneExecutions(spec, scenes, run) {
  const houseId = spec.scope?.homeIds?.[0] || "";
  const inspected = [];
  for (const scene of scenes) {
    const request = {
      contractVersion: "1.0",
      requestId: `capability-scene-${scene.id}`,
      locale: "zh-CN",
      utterance: `预览执行情景${scene.name}`,
      intent: "scene.execute",
      targets: [{ entityType: "scene", id: scene.id }],
      parameters: { houseId, sceneId: scene.id },
    };
    const result = await run(["invoke", "--stdin", "--preview-only"], { stdin: JSON.stringify(request) });
    const payload = parseJSON(result.stdout);
    const planned = payload?.result?.planned;
    const executable = result.code === 0
      && payload?.status === "success"
      && payload?.result?.dryRun === true
      && payload?.result?.persistentWrites === false
      && planned?.intent === "scene.execute"
      && String(planned?.sceneId || "") === scene.id;
    inspected.push({ ...scene, executable, ...(executable ? { evidence: "preview-only" } : {}) });
  }
  return inspected;
}

async function inspectSensorEvents(spec, run) {
  const houseId = spec.scope?.homeIds?.[0] || "";
  const request = {
    contractVersion: "1.0",
    requestId: "capability-sensor-events",
    locale: "zh-CN",
    utterance: "读取家庭传感器事件定义",
    intent: "sensor.event.list",
    parameters: { houseId },
  };
  const result = await run(["invoke", "--stdin"], { stdin: JSON.stringify(request) });
  const payload = parseJSON(result.stdout);
  if (result.code !== 0 || payload?.status !== "success") return { proven: false, items: [] };
  const candidates = [payload?.result?.data?.events, payload?.result?.events, payload?.result?.data];
  const items = candidates.find(Array.isArray) || [];
  return { proven: true, items };
}

async function inspectClimateControls(spec, entity, state, run) {
  const probes = [
    { id: "power", property: "airConditionerPower", value: !Boolean(state.airConditionerPower) },
    { id: "target-temperature", property: "airConditionerTargetTemperature", value: nextTemperature(state.airConditionerTargetTemperature) },
    { id: "mode", property: "airConditionerMode", value: Number(state.airConditionerMode) === 1 ? 8 : 1 },
    { id: "fan-speed", property: "airConditionerFanSpeed", value: Number(state.airConditionerFanSpeed) === 1 ? 2 : 1 },
  ];
  const houseId = spec.scope?.homeIds?.[0] || entity.houseId || "";
  const controls = [];
  for (const probe of probes) {
    if (!(probe.property in state)) continue;
    const request = {
      contractVersion: "1.0",
      requestId: `capability-climate-${entity.id}-${probe.id}`,
      locale: "zh-CN",
      utterance: "预览空调温控属性控制",
      intent: "device.property.set",
      targets: [{ entityType: "device", id: entity.id }],
      parameters: { houseId, deviceId: entity.id, property: probe.property, value: probe.value },
    };
    const result = await run(["invoke", "--stdin", "--preview-only"], { stdin: JSON.stringify(request) });
    const payload = parseJSON(result.stdout);
    const planned = payload?.result?.planned;
    if (result.code !== 0 || payload?.status !== "success") continue;
    if (payload?.result?.dryRun !== true || payload?.result?.persistentWrites !== false) continue;
    if (planned?.intent !== request.intent || planned?.property !== probe.property || planned?.value !== probe.value) continue;
    controls.push({ ...probe, intent: request.intent, evidence: "preview-only", planned });
  }
  return controls;
}

function nextTemperature(value) {
  const current = Number(value);
  if (!Number.isInteger(current) || current < 16 || current > 32) return 24;
  return current === 32 ? 31 : current + 1;
}

async function inspectSwitchControls(spec, entity, state, run) {
  const houseId = spec.scope?.homeIds?.[0] || entity.houseId || "";
  const properties = Object.keys(state || {}).filter((property) => property === "sp" || /^(?:0|[1-6])-sp$/.test(property)).sort(switchPropertyOrder);
  const controls = [];
  for (const property of properties) {
    const value = !Boolean(state[property]);
    const request = {
      contractVersion: "1.0",
      requestId: `capability-switch-${entity.id}-${property}`,
      locale: "zh-CN",
      utterance: "预览开关回路控制",
      intent: "device.property.set",
      targets: [{ entityType: "device", id: entity.id }],
      parameters: { houseId, deviceId: entity.id, property, value },
    };
    const result = await run(["invoke", "--stdin", "--preview-only"], { stdin: JSON.stringify(request) });
    const payload = parseJSON(result.stdout);
    const planned = payload?.result?.planned;
    if (result.code !== 0 || payload?.status !== "success") continue;
    if (payload?.result?.dryRun !== true || payload?.result?.persistentWrites !== false) continue;
    if (planned?.intent !== request.intent || planned?.property !== property || planned?.value !== value) continue;
    const channel = property === "sp" ? 1 : Number(property.split("-")[0]);
    controls.push({ id: channel === 0 ? "all-circuits" : `channel-${channel}`, intent: request.intent, property, channel, evidence: "preview-only", planned });
  }
  return controls;
}

function switchPropertyOrder(left, right) {
  const channel = (property) => property === "sp" ? 1 : Number(property.split("-")[0]);
  return channel(left) - channel(right);
}

async function inspectCurtainControls(spec, entity, run) {
  const houseId = spec.scope?.homeIds?.[0] || entity.houseId || "";
  const request = {
    contractVersion: "1.0",
    requestId: `capability-curtain-position-${entity.id}`,
    locale: "zh-CN",
    utterance: "预览窗帘目标位置控制",
    intent: "device.property.set",
    targets: [{ entityType: "device", id: entity.id }],
    parameters: { houseId, deviceId: entity.id, property: "targetPosition", value: 50 },
  };
  const result = await run(["invoke", "--stdin", "--preview-only"], { stdin: JSON.stringify(request) });
  const payload = parseJSON(result.stdout);
  const planned = payload?.result?.planned;
  if (result.code !== 0 || payload?.status !== "success") return [];
  if (payload?.result?.dryRun !== true || payload?.result?.persistentWrites !== false) return [];
  if (planned?.intent !== request.intent || planned?.property !== request.parameters.property || planned?.value !== request.parameters.value) return [];
  return [{ id: "position", intent: request.intent, property: request.parameters.property, evidence: "preview-only", planned }];
}

async function inspectSpaceControls(spec, rooms, entity, run) {
  const houseId = spec.scope?.homeIds?.[0] || "";
  const common = ["--house-id", houseId, "--json", "--preview-only"];
  const probes = [
    { id: "rename", intent: "device.rename", args: ["device", "rename", "--params-json", JSON.stringify({ deviceId: entity.id, name: `预览-${entity.id}` }), ...common] },
  ];
  const targetRoom = rooms.find((room) => room.id !== entity.roomId);
  if (targetRoom) probes.push({ id: "move", intent: "device.move", args: ["device", "move", "--params-json", JSON.stringify({ deviceId: entity.id, roomId: targetRoom.id }), ...common] });
  const controls = [];
  for (const probe of probes) {
    const result = await run(probe.args);
    const payload = parseJSON(result.stdout);
    const intent = payload?.result?.preview?.intent || payload?.result?.planned?.intent;
    if (result.code === 0 && payload?.status === "success" && payload?.result?.dryRun === true && intent === probe.intent) {
      controls.push({ id: probe.id, intent: probe.intent, evidence: "preview-only" });
    }
  }
  return controls;
}

async function inspectDeviceState(spec, entity, run) {
  const houseId = spec.scope?.homeIds?.[0] || entity.houseId || "";
  const result = await run(["device", "state", "--device-id", entity.id, ...(houseId ? ["--house-id", houseId] : []), "--json"]);
  const payload = parseJSON(result.stdout);
  const state = payload?.result?.properties;
  if (result.code !== 0 || payload?.status !== "success" || !state || typeof state !== "object" || Array.isArray(state)) return { proven: false, state: {} };
  return { proven: true, state };
}

async function inspectDeviceAccess(spec, entity, run) {
  const houseId = spec.scope?.homeIds?.[0] || entity.houseId || "";
  const result = await run(["device", "capabilities", "--device-id", entity.id, ...(houseId ? ["--house-id", houseId] : []), "--json"]);
  const payload = parseJSON(result.stdout);
  if (result.code !== 0 || payload?.status !== "success") {
    const detail = `${result.stdout || ""}\n${result.stderr || ""}`;
    return /schema.*requested device|requested device.*schema/i.test(detail) ? { capabilityStatus: "version-mismatch" } : {};
  }
  if (payload?.result?.schemaStatus === "not_connected") return { capabilityStatus: "version-mismatch" };
  const schema = payload?.result?.deviceSchema || payload?.result?.data?.deviceSchema;
  const properties = [
    ...(Array.isArray(schema?.properties) ? schema.properties : []),
    ...(Array.isArray(schema?.components) ? schema.components.flatMap((component) => Array.isArray(component?.properties) ? component.properties : []) : []),
  ];
  const access = properties.map((property) => String(property?.access || "").toLowerCase()).filter(Boolean);
  return access.length > 0 && access.every((value) => !value.includes("write")) ? { readOnly: true } : {};
}

async function inspectLightControls(spec, entity, state, run) {
  const houseId = spec.scope?.homeIds?.[0] || entity.houseId || "";
  const controls = [];
  for (const probe of lightProbes) {
    if (!Object.hasOwn(state || {}, probe.property)) continue;
    const value = probe.value(state || {});
    const request = {
      contractVersion: "1.0",
      requestId: `capability-light-${entity.id}-${probe.id}`,
      locale: "zh-CN",
      utterance: "预览灯光属性控制",
      intent: probe.intent,
      targets: [{ entityType: "device", id: entity.id }],
      parameters: { houseId, deviceId: entity.id, [probe.property]: value },
    };
    const result = await run(["invoke", "--stdin", "--preview-only"], { stdin: JSON.stringify(request) });
    const payload = parseJSON(result.stdout);
    const planned = payload?.result?.planned;
    if (result.code !== 0 || payload?.status !== "success") continue;
    if (payload?.result?.dryRun !== true || payload?.result?.persistentWrites !== false) continue;
    if (planned?.intent !== probe.intent || planned?.property !== probe.property || planned?.value !== value) continue;
    controls.push({ id: probe.id, intent: probe.intent, property: probe.property, evidence: "preview-only", planned });
  }
  return controls;
}

function parseVersion(output) {
  const text = String(output || "").trim();
  if (/^yeelight-home\s+dev$/i.test(text)) return "dev";
  const match = text.match(/(\d+\.\d+\.\d+)/);
  if (!match) throw new Error("无法解析 yeelight-home 版本");
  return match[1];
}
