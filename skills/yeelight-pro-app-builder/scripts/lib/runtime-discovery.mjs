export async function discoverRuntimeModel({ spec, run }) {
  if (typeof run !== "function") throw new Error("runtime discovery requires a command runner");
  const houseId = spec.scope?.homeIds?.[0] || "";
  const common = ["--json", ...(houseId ? ["--house-id", houseId] : [])];
  const needsAreas = spec.modules?.some((module) => ["home.space-summary", "room.device-management"].includes(module.id)) === true;
  const areas = needsAreas
    ? arrayAt(await runJSON(run, ["area", "list", ...common], "读取区域失败"), ["result", "data", "areas"])
    : [];
  const normalizedAreas = areas.map((area) => ({ id: String(area.id || area.areaId || ""), name: String(area.name || area.title || "") })).filter((area) => area.id && area.name);
  const areaById = new Map(normalizedAreas.map((area) => [area.id, area.name]));
  const roomsPayload = await runJSON(run, ["room", "list", ...common], "读取房间失败");
  const rooms = arrayAt(roomsPayload, ["result", "data", "rooms"]);
  const roomAreaById = new Map(rooms.map((room) => [String(room.id || room.roomId || ""), String(room.areaId || "")]).filter(([roomId, areaId]) => roomId && areaId));
  if (needsAreas && roomAreaById.size < rooms.length) {
    for (const area of normalizedAreas) {
      const detailPayload = await runJSON(run, ["area", "detail", "--area-id", area.id, ...common], `读取区域详情失败: ${area.id}`);
      const detailRooms = arrayAt(detailPayload, ["result", "data", "detail", "rooms"]);
      for (const room of detailRooms) {
        const roomId = String(room.id || room.roomId || "");
        if (roomId) roomAreaById.set(roomId, area.id);
      }
    }
  }
  const normalizedRooms = rooms.map((room) => {
    const normalized = { id: String(room.id || room.roomId || ""), name: String(room.name || room.title || "") };
    if (!needsAreas) return normalized;
    const areaId = roomAreaById.get(normalized.id) || "";
    return { ...normalized, areaId, areaName: areaById.get(areaId) || "未分区" };
  }).filter((room) => room.id && room.name);
  const roomById = new Map(normalizedRooms.map((room) => [room.id, room.name]));
  const roomDetailById = new Map(normalizedRooms.map((room) => [room.id, room]));
  const requestedRooms = spec.scope?.roomNames || [];
  const missingRooms = requestedRooms.filter((name) => ![...roomById.values()].includes(name));
  if (missingRooms.length > 0) throw new Error(`未找到请求的房间: ${missingRooms.join(", ")}`);

  const requestedFamilies = new Set(spec.deviceFamilies || []);
  const sceneManager = spec.modules?.some((module) => module.id === "scene.launcher");
  const automationManager = spec.modules?.some((module) => module.id === "automation.manager");
  const groupManager = spec.modules?.some((module) => module.id === "group.manager");
  const gatewayOverview = spec.modules?.some((module) => module.id === "gateway.overview");
  const panelManager = spec.modules?.some((module) => module.id === "panel.manager");
  const installerMaintenance = spec.modules?.some((module) => module.id === "installer.maintenance");
  const requestedDeviceFamilies = new Set([...requestedFamilies].filter((family) => family !== "gateway"));
  const needsDevices = requestedDeviceFamilies.size > 0 || sceneManager || automationManager || groupManager || spec.modules?.some((module) => ["home.space-summary", "room.device-management"].includes(module.id));
  const devices = needsDevices
    ? arrayAt(await runJSON(run, ["device", "list", ...common], "读取设备失败"), ["result", "data", "devices"])
    : [];
  const selected = devices.filter((device) => {
    const roomName = roomById.get(String(device.roomId || "")) || "";
    if (!spec.scope?.includeAllRooms && !requestedRooms.includes(roomName)) return false;
    if (installerMaintenance) return true;
    const family = inferFamily(device);
    const knobTarget = panelManager && ["light", "curtain", "switch-relay", "climate"].includes(family);
    return sceneManager || automationManager || groupManager || knobTarget || requestedDeviceFamilies.size === 0 || requestedDeviceFamilies.has(family);
  });

  const entities = [];
  for (const device of selected) {
    const id = String(device.id || device.deviceId || "");
    if (!id) continue;
    const detail = !installerMaintenance && (groupManager || panelManager) && !sceneManager && !automationManager ? {} : objectAt(await runJSON(run, ["device", "detail", "--device-id", id, ...common], `读取设备详情失败: ${id}`), ["result", "data", "detail"]);
    const roomId = String(device.roomId || detail.roomId || "");
    const room = roomDetailById.get(roomId);
    entities.push({
      id,
      entityType: "device",
      name: String(device.name || device.deviceName || id),
      displayName: presentableName(device),
      roomId,
      roomName: room?.name || "未分配",
      areaId: room?.areaId || "",
      areaName: room?.areaName || "未分区",
      family: inferFamily(device),
      modelName: String(device.typeName || detail.typeName || ""),
      protocols: explicitProtocols(detail.properties),
      online: typeof detail.properties?.online === "boolean" ? detail.properties.online : device.online !== false,
      ...(device.gatewayDeviceId || detail.gatewayDeviceId ? { gatewayDeviceId: String(detail.gatewayDeviceId || device.gatewayDeviceId) } : {}),
      ...(device.readOnly === true || detail.properties?.readOnly === true ? { readOnly: true } : {}),
      ...(device.capabilityStatus || detail.properties?.capabilityStatus ? { capabilityStatus: String(device.capabilityStatus || detail.properties.capabilityStatus) } : {}),
      capabilityPid: String(device.capabilityPid || detail.capabilityPid || ""),
      state: normalizeState(detail.properties),
    });
  }
  const scenes = spec.modules?.some((module) => module.id === "scene.launcher") || automationManager || panelManager
    ? await discoverScenes(run, common, roomById)
    : [];
  const automations = spec.modules?.some((module) => module.id === "automation.manager")
    ? await discoverAutomations(run, common)
    : [];
  const groups = sceneManager || groupManager || automationManager || panelManager ? await discoverGroups(run, common, roomById, entities) : [];
  const gateways = gatewayOverview ? await discoverGateways(run, common, roomById) : [];
  const protocolRelationships = installerMaintenance ? buildProtocolRelationships(entities) : [];
  const { panels, knobs } = panelManager ? await discoverPanels(run, common, roomById, entities) : { panels: [], knobs: [] };
  return { areas: normalizedAreas, rooms: normalizedRooms, entities, scenes, automations, groups, gateways, protocolRelationships, panels, knobs };
}

export async function discoverScopedEntities(options) {
  return (await discoverRuntimeModel(options)).entities;
}

async function runJSON(run, args, message) {
  const result = await run(args);
  let payload;
  try {
    payload = JSON.parse(String(result.stdout || "{}"));
  } catch {
    throw new Error(`${message}: 返回内容不是 JSON`);
  }
  if (result.code !== 0 || payload.status !== "success") {
    throw new Error(`${message}: ${payload.userMessage || payload.status || result.code}`);
  }
  return payload;
}

function inferFamily(device) {
  const text = [device.name, device.deviceName, device.typeName, device.category].filter(Boolean).join(" ").toLowerCase();
  if (/curtain|窗帘|卷帘/.test(text)) return "curtain";
  if (/sensor|传感|人体|温湿度|照度/.test(text)) return "sensor";
  if (/panel|面板|屏/.test(text)) return "panel-screen";
  if (/knob|旋钮/.test(text)) return "knob";
  if (/gateway|网关|中枢/.test(text)) return "gateway";
  if (/climate|温控|空调|地暖|新风/.test(text)) return "climate";
  if (/switch|开关|relay|继电器/.test(text) && !/light|灯/.test(text)) return "switch-relay";
  if (/light|灯|照明/.test(text)) return "light";
  return "other";
}

function presentableName(device) {
  const raw = String(device.name || device.deviceName || device.typeName || "未命名设备");
  const withoutFamily = raw.replace(/^(light|curtain|sensor|panel|gateway|knob|climate|switch|other)-/i, "");
  return withoutFamily.replace(/-\d{6,}-\d{2}$/i, "").trim() || raw;
}

function normalizeState(properties) {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return {};
  return Object.fromEntries(Object.entries(properties).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value)));
}

function explicitProtocols(properties) {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return [];
  const protocols = [];
  if (properties.matterLinked === true || properties.matterNodeId || properties.matterFabricId) protocols.push("matter");
  if (properties.daliVersion || properties.daliDeviceType !== undefined || properties.daliSwitchType !== undefined) protocols.push("dali");
  return protocols;
}

function buildProtocolRelationships(entities) {
  const relationships = new Map();
  for (const entity of entities) {
    if (entity.family === "gateway" || !entity.gatewayDeviceId || !entity.roomId) continue;
    for (const protocol of entity.protocols || []) {
      if (!["matter", "dali"].includes(protocol)) continue;
      const key = `${entity.gatewayDeviceId}:${protocol}`;
      const relation = relationships.get(key) || { gatewayId: entity.gatewayDeviceId, protocol, deviceIds: [], roomIds: [] };
      if (!relation.deviceIds.includes(entity.id)) relation.deviceIds.push(entity.id);
      if (!relation.roomIds.includes(entity.roomId)) relation.roomIds.push(entity.roomId);
      relationships.set(key, relation);
    }
  }
  return [...relationships.values()];
}

async function discoverScenes(run, common, roomById) {
  const payload = await runJSON(run, ["scene", "list", ...common], "读取情景失败");
  return arrayAt(payload, ["result", "data", "scenes"]).map((scene) => {
    const id = String(scene.id || scene.sceneId || "");
    const roomId = String(scene.roomId || "");
    return { id, name: String(scene.name || scene.sceneName || id), roomId, roomName: roomById.get(roomId) || "全屋" };
  }).filter((scene) => scene.id && scene.name);
}

async function discoverAutomations(run, common) {
  const payload = await runJSON(run, ["automation", "list", ...common], "读取自动化失败");
  return arrayAt(payload, ["result", "data", "automations"]).map((automation) => {
    const id = String(automation.id || automation.automationId || "");
    const status = String(automation.status ?? "").trim().toLowerCase();
    return { id, name: String(automation.name || automation.automationName || id), enabled: ["1", "true", "enabled", "on"].includes(status) };
  }).filter((automation) => automation.id && automation.name);
}

async function discoverGroups(run, common, roomById, entities) {
  const payload = await runJSON(run, ["group", "list", ...common], "读取设备组失败");
  const groups = arrayAt(payload, ["result", "data", "groups"]);
  const result = [];
  for (const group of groups) {
    const id = String(group.id || group.groupId || "");
    if (!id) continue;
    const detailPayload = await runJSON(run, ["group", "detail", "--group-id", id, ...common], `读取设备组详情失败: ${id}`);
    const detail = objectAt(detailPayload, ["result", "data", "detail"]);
    const roomId = String(detail.roomId || group.roomId || "");
    const devices = Array.isArray(detail.devices) ? detail.devices : [];
    const deviceIds = devices.map((device) => String(device.id || device.deviceId || "")).filter(Boolean);
    const inferred = inferGroupClassification(deviceIds, entities);
    const componentId = Number(detail.componentId || group.componentId || 0);
    result.push({
      id,
      name: String(detail.name || group.name || id),
      roomId,
      roomName: roomId ? roomById.get(roomId) || "未知空间" : "家庭设备组",
      deviceIds,
      groupCapability: String(detail.groupCapability || group.groupCapability || inferred.capability),
      groupCategory: String(detail.groupCategory || group.groupCategory || inferred.category),
      ...(componentId ? { componentId } : {}),
    });
  }
  return result;
}

function inferGroupClassification(deviceIds, entities) {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const families = [...new Set(deviceIds.map((id) => entityById.get(id)?.family).filter(Boolean))];
  if (families.length !== 1) return { capability: "custom", category: "custom" };
  const family = families[0];
  if (family === "light") return { capability: "light", category: "lighting" };
  if (family === "curtain") return { capability: "curtain", category: "shading" };
  if (family === "switch-relay") return { capability: "switch", category: "electrical" };
  if (family === "sensor") return { capability: "sensor", category: "sensor" };
  if (["gateway", "bridge"].includes(family)) return { capability: "infrastructure", category: "infrastructure" };
  return { capability: "custom", category: "custom" };
}

async function discoverGateways(run, common, roomById) {
  const listPayload = await runJSON(run, ["gateway", "list", ...common], "读取网关列表失败");
  const statsPayload = await runJSON(run, ["gateway", "stats", ...common], "读取网关统计失败");
  const rows = arrayAt(listPayload, ["result", "data", "gateways"]);
  const statsById = new Map(arrayAt(statsPayload, ["result", "data", "gateways"]).map((item) => [String(item.id || item.gatewayId || item.deviceId || ""), item]));
  return Promise.all(rows.map(async (item) => {
    const id = String(item.id || item.gatewayId || item.deviceId || "");
    const detailPayload = await runJSON(run, ["gateway", "detail", "--gateway-id", id, ...common], `读取网关详情失败: ${id}`);
    const threadPayload = await runJSON(run, ["gateway", "thread", "--gateway-id", id, ...common], `读取网关 Thread 信息失败: ${id}`);
    const detail = objectAt(detailPayload, ["result", "data", "detail"]); const stats = statsById.get(id) || {}; const roomId = String(detail.roomId || item.roomId || "");
    return { id, name: String(detail.name || item.name || id), roomId, roomName: roomById.get(roomId) || "家庭网关", online: Boolean(detail.online ?? item.online), model: String(detail.model || item.model || ""), firmwareVersion: String(detail.firmwareVersion || item.firmwareVersion || ""), configCount: numberValue(detail.configCount ?? item.configCount), supportedBridgeType: stringList(detail.supportedBridgeType || item.supportedBridgeType), deviceCount: numberValue(stats.deviceCount), roomCount: numberValue(stats.roomCount), threadInfo: objectAt(threadPayload, ["result", "data", "threadInfo"]) };
  }));
}

async function discoverPanels(run, common, roomById, entities) {
  const listPayload = await runJSON(run, ["panel", "list", ...common], "读取面板列表失败");
  const panelRows = arrayAt(listPayload, ["result", "data", "panels"]);
  const panels = await Promise.all(panelRows.map(async (item) => {
    const id = String(item.id || item.did || item.deviceId || "");
    const payload = await runJSON(run, ["panel", "detail", "--panel-id", id, ...common], `读取面板详情失败: ${id}`);
    const detail = objectAt(payload, ["result", "data", "detail"]); const groups = objectAt(payload, ["result", "data", "buttons"]);
    const buttons = Object.values(groups).flatMap((rows) => Array.isArray(rows) ? rows : []).map(normalizePanelButton).filter((button) => button.id);
    const roomId = String(detail.roomId || item.roomId || "");
    return { id, name: String(detail.name || detail.alias || item.name || id), roomId, roomName: roomById.get(roomId) || "未分配", online: Boolean(detail.online ?? item.online), typeName: String(detail.typeName || "面板"), gatewayDeviceId: String(detail.gatewayDeviceId || ""), buttons };
  }));
  const knobs = await Promise.all(entities.filter((entity) => entity.family === "knob").map(async (entity) => {
    const payload = await runJSON(run, ["knob", "detail", "--knob-id", entity.id, ...common], `读取旋钮详情失败: ${entity.id}`);
    const multi = objectAt(payload, ["result", "data", "multi"]);
    const actions = Array.isArray(multi.actions) ? multi.actions.map(normalizeKnobAction) : [];
    const detailComplete = actions.length > 0 && actions.every((action) => action.id && Number.isInteger(action.index) && action.configType);
    return {
      id: entity.id,
      name: String(multi.name || entity.displayName || entity.name),
      roomId: entity.roomId,
      roomName: entity.roomName,
      online: entity.online,
      actions,
      detailComplete,
      editable: false,
      ...(detailComplete ? {} : { unsupportedReason: "当前旋钮缺少完整配置，暂时无法编辑。" }),
    };
  }));
  return { panels: panels.filter((panel) => panel.id), knobs };
}

function normalizeKnobAction(item) {
  const source = item && typeof item === "object" && !Array.isArray(item) ? item : {};
  const rawIndex = Number(source.index);
  return {
    ...source,
    id: String(source.id || ""),
    index: Number.isInteger(rawIndex) ? rawIndex : Number.NaN,
    configType: String(source.configType || ""),
    mode: String(source.mode || ""),
    model: String(source.model || ""),
    alias: String(source.alias || ""),
    sensitivity: numberValue(source.sensitivity),
    targetType: String(source.targetType || ""),
    targetId: String(source.targetId || ""),
    targetName: String(source.targetName || ""),
    currentRow: structuredClone(source),
  };
}

function normalizePanelButton(item) {
  const events = (Array.isArray(item?.buttonEvents) ? item.buttonEvents : []).map((event) => ({
    id: String(event?.id || event?.buttonEventId || ""), name: String(event?.name || "按键事件"), alias: String(event?.alias || event?.name || "按键事件"), type: numberValue(event?.type),
    details: Array.isArray(event?.details) ? event.details : (event?.resId ? [{ resId: String(event.resId), typeId: numberValue(event.resType) }] : []),
  })).filter((event) => event.id);
  const currentRow = Object.fromEntries(Object.entries(item || {}).filter(([key]) => key !== "buttonEvents"));
  return { id: String(item?.id || item?.buttonId || ""), name: String(item?.name || "按键"), alias: String(item?.alias || item?.name || "按键"), index: numberValue(item?.index), keyValue: numberValue(item?.keyValue), buttonType: numberValue(item?.buttonType ?? item?.type), targetId: String(item?.targetId || item?.resId || ""), targetType: String(item?.targetType || (item?.resId ? "scene" : "")), currentRow, events };
}

function numberValue(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function stringList(value) { return Array.isArray(value) ? value.map(String).filter(Boolean) : []; }

function arrayAt(value, path) {
  const found = path.reduce((current, key) => current && typeof current === "object" ? current[key] : undefined, value);
  return Array.isArray(found) ? found : [];
}

function objectAt(value, path) {
  const found = path.reduce((current, key) => current && typeof current === "object" ? current[key] : undefined, value);
  return found && typeof found === "object" && !Array.isArray(found) ? found : {};
}
