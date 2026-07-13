import { INFRASTRUCTURE_READ_PROBES, INFRASTRUCTURE_WRITE_PROBES } from "./reference-probes-infrastructure.mjs";

const READ_PROBES = {
  "home.read": (server) => ["home", "list", "--json"],
  "area.read": (server) => ["entity", "list", "--house-id", server.homeId, "--json"],
  "room.read": (server) => ["room", "list", "--house-id", server.homeId, "--json"],
  "device.directory.read": (server) => ["device", "list", "--house-id", server.homeId, "--json"],
  "device.detail.read": (server) => deviceDetail(server, "992001"),
  "device.state.read": (server) => deviceState(server, "992001"),
  "sensor.environment.read": (server) => ["sensor", "list", "--house-id", server.homeId, "--json"],
  "sensor.security.read": (server) => ["sensor", "events", "--house-id", server.homeId, "--json"],
  "scene.read": (server) => ["scene", "list", "--house-id", server.homeId, "--json"],
  "scene.detail.read": (server) => invokeRead(server, "scene-detail", "scene.detail.get", { entityType: "scene", id: "994001" }, { sceneId: "994001" }),
  "automation.read": (server) => ["automation", "list", "--house-id", server.homeId, "--json"],
  "automation.detail.read": (server) => invokeRead(server, "automation-detail", "automation.detail.get", { entityType: "automation", id: "995001" }, { automationId: "995001" }),
  "automation.supported.read": (server) => invokeRead(server, "automation-supported", "automation.supported.list"),
  "automation.supported.v2.read": (server) => invokeRead(server, "automation-supported-v2", "automation.supported.v2.list"),
  "group.read": (server) => ["group", "list", "--house-id", server.homeId, "--json"],
  "group.detail.read": (server) => invokeRead(server, "group-detail", "group.detail.get", { entityType: "group", id: "993001" }, { groupId: "993001" }),
  ...INFRASTRUCTURE_READ_PROBES,
  "matter.trait.read": (server) => deviceDetail(server, "992801"),
  "dali.trait.read": (server) => deviceDetail(server, "992010"),
};

const WRITE_PROBES = {
  "light.power.write": deviceMutation({ deviceId: "992001", stateKey: "p", intent: "light.power.set", parameters: { power: false }, restoreParameters: { power: true } }),
  "light.brightness.write": deviceMutation({ deviceId: "992001", stateKey: "l", intent: "light.brightness.set", parameters: { brightness: 51 }, restoreParameters: { brightness: 72 } }),
  "light.color-temperature.write": deviceMutation({ deviceId: "992002", stateKey: "ct", intent: "light.color_temperature.set", parameters: { colorTemperature: 3600 }, restoreParameters: { colorTemperature: 3000 } }),
  "light.color.write": deviceMutation({ deviceId: "992003", stateKey: "c", intent: "light.color.set", parameters: { color: 16711680 }, restoreParameters: { color: 8454143 } }),
  "curtain.position.write": deviceMutation({ deviceId: "992101", stateKey: "targetPosition", intent: "device.property.set", parameters: { deviceId: "992101", property: "targetPosition", value: 40 }, restoreParameters: { deviceId: "992101", property: "targetPosition", value: 65 } }),
  "relay.circuit.write": deviceMutation({ deviceId: "992201", stateKey: "sp", intent: "device.property.set", parameters: { deviceId: "992201", property: "switchPower", value: false }, restoreParameters: { deviceId: "992201", property: "switchPower", value: true } }),
  "climate.control.write": deviceMutation({ deviceId: "992301", stateKey: "actt", intent: "device.property.set", parameters: { deviceId: "992301", property: "airConditionerTargetTemperature", value: 25 }, restoreParameters: { deviceId: "992301", property: "airConditionerTargetTemperature", value: 24 } }),
  "scene.execute": {
    target: { entityType: "scene", id: "994001" },
    intent: "scene.execute",
    parameters: { sceneId: "994001" },
    read: (server) => server.fixture.sceneExecutions["994001"] || 0,
    readback: () => null,
    restore: async ({ server }) => {
      const response = await fetch(`${server.origin}/__mock/reset`, { method: "POST" });
      if (!response.ok) throw new Error("reference-home reset failed after scene execution");
    },
  },
  "scene.test": {
    target: { entityType: "scene", id: "994001" },
    intent: "scene.test",
    parameters: { sceneId: "994001" },
    read: (server) => server.fixture.sceneExecutions["994001"] || 0,
    restore: resetReferenceHome,
  },
  "scene.create": createMutation({
    intent: "scene.create",
    prefix: "能力探针情景",
    collection: "scenes",
    parameters: (server, name) => ({ name, actions: structuredClone(findScene(server, "994001").editablePayload.actions) }),
    deleteIntent: "scene.delete",
    entityType: "scene",
  }),
  "scene.update": updateMutation({
    intent: "scene.update",
    entityType: "scene",
    entityId: "994001",
    idParameter: "sceneId",
    find: findScene,
    parameters: (before) => ({ sceneId: before.id, name: `${before.name} 已验证`, actions: structuredClone(before.editablePayload.actions) }),
    restoreParameters: (before) => ({ sceneId: before.id, name: before.name, description: before.description, icon: before.icon, actions: structuredClone(before.editablePayload.actions) }),
  }),
  "scene.delete": deleteMutation({ intent: "scene.delete", entityType: "scene", entityId: "994012", collection: "scenes" }),
  "automation.create": createMutation({
    intent: "automation.create",
    prefix: "能力探针自动化",
    collection: "automations",
    parameters: (server, name) => ({ ...automationParameters(findAutomation(server, "995001")), name }),
    deleteIntent: "automation.delete",
    entityType: "automation",
  }),
  "automation.update": updateMutation({
    intent: "automation.update",
    entityType: "automation",
    entityId: "995001",
    idParameter: "automationId",
    find: findAutomation,
    parameters: (before) => ({ ...automationParameters(before), automationId: before.id, name: `${before.name} 已验证` }),
    restoreParameters: (before) => ({ ...automationParameters(before), automationId: before.id, name: before.name }),
  }),
  "automation.status.write": {
    target: { entityType: "automation", id: "995003" },
    intent: "automation.enable",
    parameters: { automationId: "995003" },
    restoreIntent: "automation.disable",
    restoreParameters: { automationId: "995003" },
    read: (server) => findAutomation(server, "995003").status,
    readback: (server) => ["automation", "list", "--house-id", server.homeId, "--json"],
  },
  "automation.delete": deleteMutation({ intent: "automation.delete", entityType: "automation", entityId: "995012", collection: "automations" }),
  "group.create": createMutation({
    intent: "group.create",
    prefix: "能力探针设备组",
    collection: "groups",
    parameters: (server, name) => ({ name, roomId: "991001", groupCapability: "light", groupCategory: "lighting", deviceIds: ["992001"] }),
    deleteIntent: "group.delete",
    entityType: "group",
  }),
  "group.update": updateMutation({
    intent: "group.update",
    entityType: "group",
    entityId: "993001",
    idParameter: "groupId",
    find: findGroup,
    parameters: (before) => ({ groupId: before.id, name: `${before.name} 已验证`, description: `${before.description} 已验证` }),
    restoreParameters: (before) => ({ groupId: before.id, name: before.name, description: before.description, icon: before.icon, roomId: before.roomId }),
  }),
  "group.members.write": {
    target: { entityType: "group", id: "993001" },
    intent: "group.members.update",
    parameters: { groupId: "993001", deviceIds: ["992001", "992010", "992011"] },
    restoreParameters: { groupId: "993001", deviceIds: ["992001", "992010"] },
    read: (server) => [...findGroup(server, "993001").deviceIds],
    readback: (server) => ["group", "list", "--house-id", server.homeId, "--json"],
  },
  "group.delete": deleteMutation({ intent: "group.delete", entityType: "group", entityId: "993008", collection: "groups" }),
  ...INFRASTRUCTURE_WRITE_PROBES,
};

export async function runReferenceCapabilityProbe({ capability, run, server }) {
  const readCommand = READ_PROBES[capability.id];
  if (readCommand) {
    const read = readCommand(server);
    const command = Array.isArray(read) ? read : read.command;
    await runJSON(run, capability.probeId, command, Array.isArray(read) ? {} : { stdin: read.stdin, acceptedStatuses: read.acceptedStatuses });
    return { status: "read-proven", evidence: [{ type: "runtime-read", probeId: capability.probeId, command, exitCode: 0 }] };
  }
  const mutation = WRITE_PROBES[capability.id];
  if (!mutation) throw new Error(`no reference probe for capability ${capability.id}`);
  const before = mutation.read(server);
  const parameters = typeof mutation.parameters === "function" ? mutation.parameters(server) : mutation.parameters;
  await invoke(run, server, capability.probeId, mutation.intent, mutation.target, parameters, true);
  if (!isEqual(before, mutation.read(server))) throw new Error(`${capability.id} preview mutated reference state`);
  await invoke(run, server, `${capability.probeId}-write`, mutation.intent, mutation.target, parameters, false);
  if (mutation.readback) {
    const command = mutation.readback(server);
    if (command) await runJSON(run, `${capability.probeId}-readback`, command);
  }
  const after = mutation.read(server);
  if (isEqual(before, after)) throw new Error(`${capability.id} write did not change reference state`);
  if (mutation.restore) await mutation.restore({ run, server, before, after });
  else await invoke(run, server, `${capability.probeId}-restore`, mutation.restoreIntent || mutation.intent, mutation.target, mutation.restoreParameters, false);
  const restored = mutation.read(server);
  if (!isEqual(before, restored)) throw new Error(`${capability.id} did not restore reference state: before=${JSON.stringify(before)} restored=${JSON.stringify(restored)}`);
  return {
    status: "write-proven",
    evidence: [{
      type: "runtime-preview-and-mock-write",
      probeId: capability.probeId,
      command: ["invoke", "--stdin"],
      exitCode: 0,
      previewOnly: true,
      previewStateUnchanged: true,
      writeRestored: true,
      before,
      after,
      restored,
    }],
  };
}

function deviceMutation({ deviceId, stateKey, intent, parameters, restoreParameters }) {
  return {
    target: { entityType: "device", id: deviceId },
    intent,
    parameters,
    restoreParameters,
    read: (server) => findDevice(server, deviceId).properties[stateKey],
    readback: (server) => deviceState(server, deviceId),
  };
}

async function invoke(run, server, id, intent, target, parameters, previewOnly) {
  return runJSON(run, id, ["invoke", "--stdin"], {
    stdin: JSON.stringify({
      contractVersion: "1.0",
      requestId: `capability-probe-${id}`,
      locale: "zh-CN",
      utterance: id,
      intent,
      ...(target ? { targets: [target] } : {}),
      parameters: { houseId: server.homeId, ...parameters },
      ...(previewOnly ? { options: { previewOnly: true } } : {}),
    }),
  });
}

function invokeRead(server, requestId, intent, target, parameters = {}) {
  return {
    command: ["invoke", "--stdin"],
    stdin: JSON.stringify({
      contractVersion: "1.0",
      requestId: `capability-probe-${requestId}`,
      locale: "zh-CN",
      utterance: requestId,
      intent,
      ...(target ? { targets: [target] } : {}),
      parameters: { houseId: server.homeId, ...parameters },
    }),
  };
}

function createMutation({ intent, prefix, collection, parameters, deleteIntent, entityType }) {
  const name = `${prefix}-01`;
  return {
    intent,
    parameters: (server) => parameters(server, name),
    read: (server) => server.fixture[collection].find((item) => item.name === name)?.id || "",
    readback: (server) => collection === "scenes"
      ? ["scene", "list", "--house-id", server.homeId, "--json"]
      : collection === "automations"
        ? ["automation", "list", "--house-id", server.homeId, "--json"]
        : ["group", "list", "--house-id", server.homeId, "--json"],
    restore: async ({ run, server, after }) => {
      await invoke(run, server, `${intent}-cleanup`, deleteIntent, { entityType, id: after }, { [`${entityType}Id`]: after, confirmed: true }, false);
    },
  };
}

function updateMutation({ intent, entityType, entityId, idParameter, find, parameters, restoreParameters }) {
  return {
    target: { entityType, id: entityId },
    intent,
    parameters: (server) => parameters(structuredClone(find(server, entityId))),
    restoreParameters: (server) => restoreParameters(structuredClone(server.__probeBefore)),
    read: (server) => structuredClone(find(server, entityId)),
    restore: async ({ run, server, before }) => {
      server.__probeBefore = before;
      await invoke(run, server, `${intent}-restore`, intent, { entityType, id: entityId }, { [idParameter]: entityId, ...restoreParameters(before) }, false);
      delete server.__probeBefore;
    },
  };
}

function deleteMutation({ intent, entityType, entityId, collection }) {
  return {
    target: { entityType, id: entityId },
    intent,
    parameters: { [`${entityType}Id`]: entityId, confirmed: true },
    read: (server) => Boolean(server.fixture[collection].some((item) => item.id === entityId)),
    restore: resetReferenceHome,
  };
}

async function resetReferenceHome({ server }) {
  const response = await fetch(`${server.origin}/__mock/reset`, { method: "POST" });
  if (!response.ok) throw new Error("reference-home reset failed after management mutation");
}

function automationParameters(automation) {
  const payload = automation.editablePayload;
  return {
    name: automation.name,
    activeWindow: structuredClone(payload.activeWindow),
    repeat: payload.repeat,
    trigger: structuredClone(payload.trigger),
    actions: structuredClone(payload.actions),
    version: payload.version,
  };
}

async function runJSON(run, id, command, options = {}) {
  const result = await run(command, options);
  let payload;
  try { payload = JSON.parse(result.stdout); } catch { throw new Error(`${id} returned invalid JSON: ${result.stderr || result.stdout}`); }
  const acceptedStatuses = new Set(options.acceptedStatuses || ["success"]);
  if (result.code !== 0 || (!acceptedStatuses.has(payload.status) && payload.ok !== true)) throw new Error(`${id} failed: ${result.stderr || result.stdout}`);
  return payload;
}

function deviceDetail(server, deviceId) {
  return ["device", "detail", "--device-id", deviceId, "--house-id", server.homeId, "--json"];
}

function deviceState(server, deviceId) {
  return ["device", "state", "--device-id", deviceId, "--house-id", server.homeId, "--json"];
}

function findDevice(server, deviceId) {
  return server.fixture.devices.find((item) => item.id === deviceId);
}

function findAutomation(server, automationId) {
  return server.fixture.automations.find((item) => item.id === automationId);
}

function findScene(server, sceneId) {
  return server.fixture.scenes.find((item) => item.id === sceneId);
}

function findGroup(server, groupId) {
  return server.fixture.groups.find((item) => item.id === groupId);
}

function isEqual(left, right) {
  return JSON.stringify(sortValue(left)) === JSON.stringify(sortValue(right));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
