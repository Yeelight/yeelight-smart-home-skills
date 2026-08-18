function normalizeDiscovery(value) {
  const rows = Array.isArray(value?.result?.entities) ? value.result.entities : Array.isArray(value?.entities) ? value.entities : [];
  const rooms = new Map(rows.filter((row) => row?.entityType === "room" && row.id).map((row) => [String(row.id), String(row.name || "Unassigned")]));
  return rows.filter((row) => row && row.entityType === "device" && row.id).map((row) => ({
    runtimeId: String(row.id),
    name: String(row.name || "Light"),
    room: String(row.room?.name || row.roomName || rooms.get(String(row.roomId)) || "Unassigned"),
    online: row.online === true,
    capabilities: {
      brightness: row.capabilities?.brightness === true,
      color: row.capabilities?.color === true,
      temperature: row.capabilities?.temperature === true,
      flow: row.capabilities?.flow === true,
    },
  }));
}

function normalizeDetail(value) {
  const detail = value?.result?.data?.detail || value?.result?.detail || value?.data?.detail || {};
  const properties = detail.properties && typeof detail.properties === "object" ? detail.properties : {};
  return {
    name: typeof detail.name === "string" ? detail.name : "",
    type: typeof detail.type === "string" ? detail.type : "",
    online: properties.online === true,
    power: typeof properties.power === "boolean" ? properties.power : undefined,
    brightness: properties.brightness,
    color: properties.color,
    colorTemperature: properties.colorTemperature,
    capabilities: {
      brightness: Object.hasOwn(properties, "brightness"),
      color: Object.hasOwn(properties, "color"),
      temperature: Object.hasOwn(properties, "colorTemperature"),
      flow: false,
    },
  };
}

function normalizeCapabilities(value) {
  const schema = value?.result?.deviceSchema || value?.deviceSchema || {};
  const components = Array.isArray(schema.components) ? schema.components : [];
  const properties = [
    ...(Array.isArray(schema.properties) ? schema.properties : []),
    ...components.flatMap((component) => Array.isArray(component?.properties) ? component.properties : []),
  ];
  const propertyMap = new Map(properties.filter((property) => property?.id).map((property) => [String(property.id), property]));
  const range = (id) => {
    const value = propertyMap.get(id)?.range;
    return value && Number.isFinite(Number(value.min)) && Number.isFinite(Number(value.max))
      ? { min: Number(value.min), max: Number(value.max) }
      : null;
  };
  const categories = [schema.category, ...components.map((component) => component?.category)].filter(Boolean).map(String);
  return {
    category: typeof schema.category === "string" ? schema.category : categories[0] || "",
    power: propertyMap.has("power"),
    brightness: propertyMap.has("brightness"),
    color: propertyMap.has("color"),
    temperature: propertyMap.has("colorTemperature"),
    flow: false,
    ranges: {
      brightness: range("brightness"),
      color: range("color"),
      temperature: range("colorTemperature"),
    },
  };
}

function normalizeLiveDevice(device, detail, capabilities, state) {
  const inferredCapabilities = capabilities || {
    category: detail.type === "4" ? "light" : "",
    power: typeof detail.power === "boolean",
    brightness: detail.capabilities?.brightness === true,
    color: detail.capabilities?.color === true,
    temperature: detail.capabilities?.temperature === true,
    flow: false,
    ranges: {},
  };
  const sourceState = state || detail;
  const preState = normalizePreState(sourceState);
  const mergedCapabilities = {
    brightness: inferredCapabilities.brightness === true,
    color: inferredCapabilities.color === true,
    temperature: inferredCapabilities.temperature === true,
    flow: inferredCapabilities.flow === true,
    power: inferredCapabilities.power === true,
  };
  return {
    ...device,
    name: detail.name || device.name,
    online: detail.online === true && sourceState.online === true,
    isLight: inferredCapabilities.category === "light",
    power: preState.power,
    brightness: preState.brightness,
    color: preState.color,
    colorTemperature: preState.colorTemperature,
    capabilities: mergedCapabilities,
    capabilityEvidence: {
      category: inferredCapabilities.category,
      ranges: inferredCapabilities.ranges,
    },
    preState,
    preStateVerified: state ? state.verified === true : true,
    preStateComplete: isCompletePreState(preState, mergedCapabilities),
  };
}

function normalizePreState(state = {}) {
  const normalized = {};
  if (typeof state.power === "boolean") normalized.power = state.power;
  if (isIntegerInRange(state.brightness, 1, 100)) normalized.brightness = state.brightness;
  if (isIntegerInRange(state.color, 0, 0xFFFFFF)) normalized.color = state.color;
  if (isIntegerInRange(state.colorTemperature, 1700, 6500)) normalized.colorTemperature = state.colorTemperature;
  return normalized;
}

function isCompletePreState(preState, capabilities) {
  if (typeof preState.power !== "boolean" || preState.brightness === undefined) return false;
  if (capabilities.color && preState.color === undefined) return false;
  if (capabilities.temperature && preState.colorTemperature === undefined) return false;
  return true;
}

function isQualifiedLiveDevice(device) {
  return device.isLight === true
    && device.online === true
    && device.preStateVerified === true
    && device.preStateComplete === true
    && device.capabilities.power === true
    && device.capabilities.brightness === true
    && typeof device.power === "boolean"
    && device.brightness !== undefined;
}

function isIntegerInRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function normalizeState(value) {
  const rows = Array.isArray(value?.result?.states) ? value.result.states : Array.isArray(value?.states) ? value.states : [];
  if (rows.length) return rows.map((row) => ({ runtimeId: String(row.entity?.id || row.id || ""), verified: row.verified === true, simulated: row.simulated === true, power: row.power, brightness: row.brightness, color: row.color, colorTemperature: row.colorTemperature, online: row.online }));
  const result = value?.result || {};
  const entity = result.entity || {};
  const properties = result.properties || {};
  const runtimeId = String(entity.id || result.nodeId || "");
  if (!runtimeId) return [];
  return [{
    runtimeId,
    verified: value?.status === "success" || result.source !== undefined,
    power: typeof result.value === "boolean" ? result.value : properties.power,
    brightness: result.value && typeof result.value === "object" ? result.value.brightness : properties.brightness,
    color: result.value && typeof result.value === "object" ? result.value.color : properties.color,
    colorTemperature: result.value && typeof result.value === "object" ? result.value.colorTemperature : properties.colorTemperature,
    online: result.value && typeof result.value === "object" ? result.value.online : properties.online,
    simulated: result.simulated === true || result.value?.simulated === true,
  }];
}

export { normalizeDiscovery, normalizeDetail, normalizeCapabilities, normalizeLiveDevice, normalizePreState, isQualifiedLiveDevice, normalizeState };
