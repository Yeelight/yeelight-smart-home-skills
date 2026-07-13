import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateJSONSchema } from "../capabilities/json-schema.mjs";

const mockRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../assets/mock-home");

export function loadReferenceHomeFixture(fixtureId = "reference-home") {
  if (!/^[a-z0-9-]+$/i.test(fixtureId)) throw new Error("invalid mock fixture id");
  const largeHome = fixtureId === "reference-home-large";
  const alias = fixtureId === "comprehensive" || largeHome ? "reference-home" : fixtureId;
  const fixtureDir = path.join(mockRoot, alias);
  if (!fs.existsSync(fixtureDir)) return loadLegacyFixture(fixtureId);
  const manifest = readJSON(path.join(fixtureDir, "manifest.json"));
  const fixture = { schemaVersion: manifest.schemaVersion, id: manifest.id, title: manifest.title };
  const overlays = [];
  for (const fragmentName of manifest.fragments) {
    const fragmentFile = path.join(fixtureDir, fragmentName);
    verifyFragmentDigest(fragmentFile, fragmentName, manifest.fragmentSha256?.[fragmentName]);
    const fragment = readJSON(fragmentFile);
    for (const [key, value] of Object.entries(fragment)) {
      if (key === "deviceOverlays") overlays.push(...value);
      else if (Array.isArray(value)) fixture[key] = [...(fixture[key] || []), ...value];
      else if (value && typeof value === "object") fixture[key] = { ...(fixture[key] || {}), ...value };
      else fixture[key] = value;
    }
  }
  applyDeviceOverlays(fixture, overlays);
  if (largeHome) expandLargeHome(fixture);
  validateJSONSchema(readJSON(path.join(fixtureDir, manifest.schema)), fixture, "referenceHome");
  validateReferenceHomeFixture(fixture);
  return fixture;
}

function expandLargeHome(fixture) {
  const targetCount = 108;
  const sourceDevices = structuredClone(fixture.devices);
  for (let index = fixture.devices.length; index < targetCount; index += 1) {
    const source = sourceDevices[index % sourceDevices.length];
    const sequence = String(index + 1).padStart(3, "0");
    fixture.devices.push({
      ...structuredClone(source),
      id: `998${sequence}`,
      name: `扩展设备 ${sequence}`,
      alias: `全屋扩展 ${sequence}`,
      gatewayDeviceId: source.gatewayDeviceId || "992900",
    });
  }
  fixture.id = "reference-home";
  fixture.title = `${fixture.title}（108 设备）`;
}

function verifyFragmentDigest(file, fragmentName, expected) {
  if (!/^[a-f0-9]{64}$/.test(String(expected || ""))) throw new Error(`reference home fragment ${fragmentName} has no valid sha256`);
  const actual = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (actual !== expected) throw new Error(`reference home fragment digest mismatch: ${fragmentName}`);
}

export function validateReferenceHomeFixture(fixture) {
  for (const [key, minimum] of Object.entries({ areas: 4, rooms: 12, devices: 40, groups: 8, scenes: 12, automations: 12 })) {
    if (!Array.isArray(fixture[key]) || fixture[key].length < minimum) throw new Error(`reference home requires at least ${minimum} ${key}`);
  }
  const ids = new Set([fixture.home?.id]);
  for (const collection of [fixture.areas, fixture.rooms, fixture.devices, fixture.groups, fixture.scenes, fixture.automations]) {
    for (const item of collection) {
      if (!item?.id || ids.has(item.id)) throw new Error(`duplicate or missing fixture id: ${item?.id || "missing"}`);
      ids.add(item.id);
    }
  }
  const areaIds = new Set(fixture.areas.map((item) => item.id));
  const roomIds = new Set(fixture.rooms.map((item) => item.id));
  const deviceIds = new Set(fixture.devices.map((item) => item.id));
  const groupIds = new Set(fixture.groups.map((item) => item.id));
  const sceneIds = new Set(fixture.scenes.map((item) => item.id));
  for (const room of fixture.rooms) if (!areaIds.has(room.areaId)) throw new Error(`room ${room.id} references unknown area ${room.areaId}`);
  for (const device of fixture.devices) {
    if (!roomIds.has(device.roomId)) throw new Error(`device ${device.id} references unknown room ${device.roomId}`);
    if (!device.family || !device.category || !device.typeName || !Array.isArray(device.schemaProperties) || !device.properties) throw new Error(`device ${device.id} is incomplete`);
    for (const property of device.schemaProperties) if (!Object.hasOwn(device.properties, property)) throw new Error(`device ${device.id} schema property ${property} is missing`);
  }
  for (const group of fixture.groups) {
    if (!roomIds.has(group.roomId)) throw new Error(`group ${group.id} references unknown room ${group.roomId}`);
    if (!group.description || !group.icon || !group.groupCapability || !group.groupCategory || !Number.isInteger(group.componentId)) throw new Error(`group ${group.id} metadata is incomplete`);
    for (const deviceId of group.deviceIds) if (!deviceIds.has(deviceId)) throw new Error(`group ${group.id} references unknown device ${deviceId}`);
  }
  for (const scene of fixture.scenes) {
    if (scene.roomId && !roomIds.has(scene.roomId)) throw new Error(`scene ${scene.id} references unknown room ${scene.roomId}`);
    const payload = scene.editablePayload;
    if (!scene.description || !scene.icon || payload?.sceneId !== scene.id || !Array.isArray(payload?.actions) || payload.actions.length === 0) throw new Error(`scene ${scene.id} editable payload is incomplete`);
    for (const action of payload.actions) validateManagementTarget({ owner: `scene ${scene.id}`, action, roomIds, deviceIds, groupIds, sceneIds });
  }
  const automationKinds = new Set();
  for (const automation of fixture.automations) {
    const payload = automation.editablePayload;
    if (payload?.automationId !== automation.id || !payload.trigger || !Array.isArray(payload.actions) || payload.actions.length === 0) throw new Error(`automation ${automation.id} editable payload is incomplete`);
    automationKinds.add(automation.equivalenceClass);
    validateAutomationTrigger(automation.id, payload.trigger, { roomIds, deviceIds, groupIds, sceneIds });
    for (const action of payload.actions) validateManagementTarget({ owner: `automation ${automation.id}`, action, roomIds, deviceIds, groupIds, sceneIds });
  }
  for (const kind of ["timer", "event", "threshold", "change", "and", "or"]) if (!automationKinds.has(kind)) throw new Error(`reference home missing automation equivalence class ${kind}`);
  if (!Array.isArray(fixture.automationSupported) || fixture.automationSupported.length < 4 || !Array.isArray(fixture.automationSupportedV2) || fixture.automationSupportedV2.length < 2) throw new Error("reference home automation supported catalogs are incomplete");
  for (const event of fixture.sensorEvents || []) if (!deviceIds.has(event.deviceId)) throw new Error(`sensor event ${event.eventId} references unknown device ${event.deviceId}`);
  validateInfrastructure(fixture, { roomIds, deviceIds, sceneIds });
  return fixture;
}

function validateInfrastructure(fixture, { roomIds, deviceIds, sceneIds }) {
  const gatewayIds = new Set(fixture.devices.filter((device) => device.family === "gateway").map((device) => device.id));
  const devicesById = new Map(fixture.devices.map((device) => [device.id, device]));
  for (const [gatewayId, relations] of Object.entries(fixture.gatewaySceneRelations || {})) {
    if (!gatewayIds.has(gatewayId)) throw new Error(`gateway scene relation references unknown gateway ${gatewayId}`);
    for (const sceneId of relations) if (!sceneIds.has(sceneId)) throw new Error(`gateway ${gatewayId} references unknown scene ${sceneId}`);
  }
  for (const gatewayId of Object.keys(fixture.gatewayDiagnostics || {})) if (!gatewayIds.has(gatewayId)) throw new Error(`diagnostics reference unknown gateway ${gatewayId}`);
  for (const relation of fixture.protocolRelationships || []) {
    if (!gatewayIds.has(relation.gatewayId)) throw new Error(`protocol relation references unknown gateway ${relation.gatewayId}`);
    if (!relation.protocol || !Array.isArray(relation.deviceIds) || relation.deviceIds.length === 0 || !Array.isArray(relation.roomIds) || relation.roomIds.length === 0) throw new Error(`protocol relation ${relation.gatewayId} is incomplete`);
    const relatedRoomIds = new Set();
    for (const deviceId of relation.deviceIds) {
      if (!deviceIds.has(deviceId)) throw new Error(`protocol relation references unknown device ${deviceId}`);
      const device = devicesById.get(deviceId);
      if (device.gatewayDeviceId !== relation.gatewayId) throw new Error(`protocol relation ${relation.gatewayId} disagrees with device ${deviceId} gateway association`);
      if (!device.protocols?.some((protocol) => String(protocol?.id || "").toLowerCase() === String(relation.protocol).toLowerCase())) throw new Error(`protocol relation ${relation.gatewayId} disagrees with device ${deviceId} protocol fact`);
      relatedRoomIds.add(device.roomId);
    }
    for (const roomId of relation.roomIds) if (!roomIds.has(roomId)) throw new Error(`protocol relation references unknown room ${roomId}`);
    const declaredRoomIds = new Set(relation.roomIds);
    if (relatedRoomIds.size !== declaredRoomIds.size || [...relatedRoomIds].some((roomId) => !declaredRoomIds.has(roomId))) throw new Error(`protocol relation ${relation.gatewayId} disagrees with device room association`);
  }
  for (const deviceId of Object.keys(fixture.panelClickCounts || {})) if (!deviceIds.has(deviceId)) throw new Error(`panel click counter references unknown device ${deviceId}`);
}

function validateAutomationTrigger(automationId, trigger, ids) {
  if (trigger.conditionType) {
    if (!["and", "or"].includes(trigger.conditionType) || !Array.isArray(trigger.conditions) || trigger.conditions.length < 2) throw new Error(`automation ${automationId} condition group is invalid`);
    for (const condition of trigger.conditions) validateAutomationTrigger(automationId, condition, ids);
    return;
  }
  if (trigger.conditionKind === "alarm") {
    if (!/^\d{2}:\d{2}:\d{2}$/.test(trigger.time || "")) throw new Error(`automation ${automationId} alarm trigger is invalid`);
    return;
  }
  validateManagementTarget({ owner: `automation ${automationId} trigger`, action: trigger, ...ids });
}

function validateManagementTarget({ owner, action, roomIds, deviceIds, groupIds, sceneIds }) {
  if (!action?.targetType || !action.targetId) throw new Error(`${owner} target is incomplete`);
  const targets = { room: roomIds, device: deviceIds, group: groupIds, scene: sceneIds };
  const collection = targets[action.targetType];
  if (!collection || !collection.has(String(action.targetId))) throw new Error(`${owner} references unknown ${action.targetType} ${action.targetId}`);
}

function applyDeviceOverlays(fixture, overlays) {
  const devices = new Map((fixture.devices || []).map((device) => [device.id, device]));
  for (const overlay of overlays) {
    const device = devices.get(overlay.deviceId);
    if (!device) throw new Error(`device overlay references unknown device ${overlay.deviceId}`);
    Object.assign(device, structuredClone(Object.fromEntries(Object.entries(overlay).filter(([key]) => key !== "deviceId"))));
  }
}

function loadLegacyFixture(fixtureId) {
  const file = path.join(mockRoot, `${fixtureId}.json`);
  return readJSON(file);
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
