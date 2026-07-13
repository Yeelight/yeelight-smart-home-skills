export function routeDeviceRequest({ method, apiPath, body, fixture }) {
  const schema = apiPath.match(/^\/v2\/thing\/schema\/house\/([^/]+)\/device\/r\/info\/1\/100$/);
  if (schema) {
    if (schema[1] !== fixture.home.id) return invalidHouse(schema[1]);
    return ok({ devices: fixture.devices.map((device) => schemaDevice(fixture, device)).filter(Boolean) });
  }
  const detail = apiPath.match(/^\/v1\/device\/([^/]+)\/r\/detail$/);
  if (detail) {
    if (method !== "POST") return methodNotAllowed("POST");
    const device = findDevice(fixture, detail[1]);
    return device ? ok(detailDevice(fixture, device)) : missingDevice(detail[1]);
  }
  const rename = apiPath.match(/^\/v1\/ai\/([^/]+)\/name\/w\/modify$/);
  if (rename) return renameDevices({ method, houseId: rename[1], body, fixture });
  const deviceUpdate = apiPath.match(/^\/v1\/device\/([^/]+)\/w\/update$/);
  if (deviceUpdate) return updateDevice({ method, deviceId: deviceUpdate[1], body, fixture });
  const move = apiPath.match(/^\/v2\/thing\/manage\/house\/([^/]+)\/device\/room\/w\/batch-modify$/);
  if (move) return moveDevices({ method, houseId: move[1], body, fixture });
  const state = apiPath.match(/^\/v1\/controll\/device\/([^/]+)\/r\/properties(?:\/([^/]+))?$/);
  if (state) return readDeviceState({ method, deviceId: state[1], property: state[2], fixture });
  const write = apiPath.match(/^\/v1\/(?:open\/control\/house\/([^/]+)\/control\/([^/]+)\/([^/]+)|controll\/device\/([^/]+)\/([^/]+))\/w\/properties\/([^/]+)$/);
  if (write) return writeDeviceState({ method, houseId: write[1] || fixture.home.id, deviceId: write[3] || write[5], property: write[6], body, fixture });
  return null;
}

function renameDevices({ method, houseId, body, fixture }) {
  if (method !== "PUT") return methodNotAllowed("PUT");
  if (houseId !== fixture.home.id) return invalidHouse(houseId);
  if (!Array.isArray(body) || body.length === 0) return invalidBody("rename body must be a non-empty array");
  for (const item of body) {
    const device = findDevice(fixture, String(item?.id || ""));
    if (!device || Number(item?.actionTargetType) !== 2 || !String(item?.name || "").trim()) return invalidBody("invalid device rename item");
    device.name = String(item.name).trim();
    device.alias = device.name;
  }
  return ok({ itemCount: body.length });
}

function updateDevice({ method, deviceId, body, fixture }) {
  if (method !== "POST") return methodNotAllowed("POST");
  const device = findDevice(fixture, deviceId);
  if (!device || String(body?.houseId || "") !== fixture.home.id || String(body?.id || "") !== device.id || !String(body?.name || "").trim()) return invalidBody("invalid device update body");
  device.name = String(body.name).trim();
  device.alias = device.name;
  return ok({ id: device.id, name: device.name });
}

function moveDevices({ method, houseId, body, fixture }) {
  if (method !== "POST") return methodNotAllowed("POST");
  if (houseId !== fixture.home.id || String(body?.houseId || "") !== fixture.home.id) return invalidHouse(houseId);
  const items = body?.items;
  if (!items || typeof items !== "object" || Array.isArray(items) || Object.keys(items).length === 0) return invalidBody("move items are required");
  for (const [deviceId, roomId] of Object.entries(items)) {
    const device = findDevice(fixture, deviceId);
    if (!device || !fixture.rooms.some((room) => room.id === String(roomId))) return invalidBody("invalid device or room reference");
    device.roomId = String(roomId);
  }
  return ok({ itemCount: Object.keys(items).length });
}

function readDeviceState({ method, deviceId, property, fixture }) {
  if (method !== "POST") return methodNotAllowed("POST");
  const device = findDevice(fixture, deviceId);
  if (!device) return missingDevice(deviceId);
  const requested = property ? decodeURIComponent(property) : "";
  if (!requested) return ok({ properties: structuredClone(device.properties) });
  const fixtureProperty = device.family === "curtain" && requested === "tp" ? "targetPosition" : requested;
  if (!(fixtureProperty in device.properties)) return { status: 200, body: { success: false, code: "601", message: "invalid property", data: null } };
  return ok(device.properties[fixtureProperty]);
}

function writeDeviceState({ method, houseId, deviceId, property, body, fixture }) {
  if (method !== "POST") return methodNotAllowed("POST");
  if (houseId !== fixture.home.id) return invalidHouse(houseId);
  const device = findDevice(fixture, deviceId);
  if (!device) return missingDevice(deviceId);
  const requested = decodeURIComponent(property);
  const value = body?.value ?? body?.propertyValue ?? body?.data;
  if (value === undefined) return { status: 400, body: { success: false, code: "mock_missing_value", message: "property write requires value" } };
  const rejected = validateAndApplyProperty({ device, property: requested, value, body });
  return rejected || ok(value);
}

function validateAndApplyProperty({ device, property, value, body }) {
  const bodyKeys = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : [];
  if (device.family === "curtain" && property === "tp") {
    if (bodyKeys.length !== 1 || bodyKeys[0] !== "value" || !Number.isInteger(value) || value < 0 || value > 100) return invalidProperty("mock_invalid_curtain_position", "curtain targetPosition requires only an integer value from 0 to 100");
    Object.assign(device.properties, { targetPosition: value, position: value, runState: "stopped" });
  } else if (device.family === "switch-relay" && (property === "sp" || /^(?:0|[1-6])-sp$/.test(property))) {
    if (bodyKeys.length !== 1 || bodyKeys[0] !== "value" || typeof value !== "boolean" || !(property in device.properties)) return invalidProperty("mock_invalid_switch_state", "switch relay circuit requires only a boolean value for an existing channel");
    if (property === "sp" || property === "0-sp") for (const key of Object.keys(device.properties)) { if (/^[1-6]-sp$/.test(key)) device.properties[key] = value; }
    else device.properties[property] = value;
    device.properties["0-sp"] = Object.entries(device.properties).some(([key, state]) => /^[1-6]-sp$/.test(key) && state === true);
    device.properties.sp = device.properties["0-sp"];
  } else if (device.family === "climate") {
    if (property === "acct" || property === "aco") return invalidProperty("mock_readonly_climate_property", `${property} is read-only`);
    const valid = bodyKeys.length === 1 && bodyKeys[0] === "value" && ((property === "acp" && typeof value === "boolean") || (property === "actt" && Number.isInteger(value) && value >= 16 && value <= 32) || (property === "acm" && [1, 4, 8].includes(value)) || (property === "acf" && [1, 2, 4].includes(value)));
    if (!valid || !(property in device.properties)) return invalidProperty("mock_invalid_climate_property", "climate writes require only a valid value for acp, actt, acm or acf");
    device.properties[property] = value;
  } else device.properties[property] = value;
  return null;
}

function schemaDevice(fixture, device) {
  if (device.capabilityStatus === "version-mismatch") return null;
  const access = device.readOnly === true ? "read" : "read,write";
  const properties = device.schemaProperties.map((propId) => ({ propId, access }));
  const componentIds = [...new Set(fixture.groups.filter((group) => group.deviceIds.includes(device.id)).map((group) => group.componentId))];
  const subDevices = componentIds.map((componentId) => ({ componentId, category: device.category, properties: structuredClone(properties) }));
  return { id: device.id, deviceId: device.id, name: device.name, roomId: device.roomId, gatewayDeviceId: device.gatewayDeviceId, capabilityPid: device.capabilityPid, category: device.category, typeName: device.typeName, properties, ...(subDevices.length ? { subDevices } : {}) };
}

function detailDevice(fixture, device) {
  return { id: device.id, deviceId: device.id, alias: device.alias, name: device.name, houseId: fixture.home.id, roomId: device.roomId, gatewayDeviceId: device.gatewayDeviceId, capabilityPid: device.capabilityPid, category: device.category, typeName: device.typeName, online: device.online, attr: structuredClone(device.properties), shadow: { properties: structuredClone(device.properties) } };
}

function findDevice(fixture, id) { return fixture.devices.find((device) => device.id === id); }
function ok(data) { return { status: 200, body: { success: true, code: "200", message: "success", data } }; }
function invalidHouse(houseId) { return { status: 400, body: { success: false, code: "mock_invalid_house", message: `unknown mock house: ${houseId || "missing"}` } }; }
function missingDevice(deviceId) { return { status: 404, body: { success: false, code: "mock_device_not_found", message: `unknown mock device: ${deviceId}` } }; }
function invalidBody(message) { return { status: 400, body: { success: false, code: "mock_invalid_body", message } }; }
function invalidProperty(code, message) { return { status: 400, body: { success: false, code, message } }; }
function methodNotAllowed(expected) { return { status: 405, body: { success: false, code: "mock_method_not_allowed", message: `expected ${expected}` } }; }
