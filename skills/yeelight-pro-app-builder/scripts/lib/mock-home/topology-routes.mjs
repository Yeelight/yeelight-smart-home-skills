export function routeTopologyRequest({ method, apiPath, body, fixture }) {
  if (method === "POST" && apiPath === "/v1/house/r/list") return ok({ rows: [homeRow(fixture)] });
  if (apiPath === "/v1/house/r/all") {
    if (method !== "POST") return methodNotAllowed("POST");
    if (body != null && (typeof body !== "object" || Array.isArray(body) || Object.keys(body).length > 0)) return invalidBody("home list body must be empty");
    return ok({ list: [{
      houseId: fixture.home.id,
      name: fixture.home.name,
      roomNum: fixture.rooms.length,
      deviceNum: fixture.devices.length,
      gatewayNum: fixture.devices.filter((device) => device.family === "gateway").length,
      sceneNum: fixture.scenes.length,
      automationNum: fixture.automations.length,
      areaNum: fixture.areas.length,
    }] });
  }
  if (apiPath === "/v1/room/r/all") {
    if (method !== "POST") return methodNotAllowed("POST");
    if (String(body?.houseId || "") !== fixture.home.id) return invalidHouse(body?.houseId);
    return ok({ list: fixture.rooms.map((room) => ({ roomId: room.id, id: room.id, name: room.name, houseId: fixture.home.id, areaId: room.areaId })) });
  }
  if (apiPath === "/v1/device/r/all") {
    if (method !== "POST") return methodNotAllowed("POST");
    if (String(body?.houseId || "") !== fixture.home.id) return invalidHouse(body?.houseId);
    return ok({ devices: rowsForType(fixture, "device") });
  }
  const areaDetail = apiPath.match(/^\/v2\/thing\/manage\/house\/([^/]+)\/area\/([^/]+)\/r\/info$/);
  if (areaDetail) return readAreaDetail({ method, houseId: areaDetail[1], areaId: areaDetail[2], fixture });
  const roomDetail = apiPath.match(/^\/v1\/room\/([^/]+)\/r\/detail$/);
  if (roomDetail) return readRoomDetail({ method, roomId: roomDetail[1], fixture });
  const list = matchHouseList(apiPath);
  if (!list) return null;
  if (list.houseId !== fixture.home.id) return invalidHouse(list.houseId);
  const expectedMethod = list.type === "device" || list.type === "scene" ? "POST" : "GET";
  if (method !== expectedMethod) return methodNotAllowed(expectedMethod);
  const rows = rowsForType(fixture, list.type);
  const start = (list.page - 1) * list.pageSize;
  return ok({ rows: rows.slice(start, start + list.pageSize) });
}

function readAreaDetail({ method, houseId, areaId, fixture }) {
  if (method !== "GET") return methodNotAllowed("GET");
  if (houseId !== fixture.home.id) return invalidHouse(houseId);
  const area = fixture.areas.find((item) => item.id === areaId);
  if (!area) return missing("area", areaId);
  const rooms = fixture.rooms.filter((room) => room.areaId === area.id).map((room) => ({
    id: room.id,
    roomId: room.id,
    name: room.name,
    houseId: fixture.home.id,
    deviceNum: fixture.devices.filter((device) => device.roomId === room.id).length,
  }));
  return ok({ ...area, houseId: fixture.home.id, rooms });
}

function readRoomDetail({ method, roomId, fixture }) {
  if (method !== "POST") return methodNotAllowed("POST");
  const room = fixture.rooms.find((item) => item.id === roomId);
  if (!room) return missing("room", roomId);
  return ok({
    ...room,
    roomId: room.id,
    houseId: fixture.home.id,
    devices: rowsForType(fixture, "device").filter((device) => device.roomId === room.id),
    userscenes: fixture.scenes.filter((scene) => scene.roomId === room.id),
  });
}

function matchHouseList(apiPath) {
  const match = apiPath.match(/^\/v2\/thing\/manage\/house\/([^/]+)\/(area|room|device|group|scene)\/r\/info\/(\d+)\/(\d+)$/);
  if (!match) return null;
  const page = Number(match[3]); const pageSize = Number(match[4]);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return null;
  return { houseId: match[1], type: match[2], page, pageSize };
}

function rowsForType(fixture, type) {
  if (type === "device") return fixture.devices.map((device) => ({
    id: device.id,
    deviceId: device.id,
    name: device.name,
    alias: device.alias,
    houseId: fixture.home.id,
    roomId: device.roomId,
    gatewayDeviceId: device.gatewayDeviceId,
    capabilityPid: device.capabilityPid,
    category: device.category,
    typeName: device.typeName,
    online: device.online,
    readOnly: device.readOnly === true,
    capabilityStatus: device.capabilityStatus,
  }));
  const key = type === "area" ? "areas" : type === "room" ? "rooms" : type === "group" ? "groups" : "scenes";
  return fixture[key].map((item) => ({ ...item, houseId: fixture.home.id }));
}

function homeRow(fixture) {
  return { id: fixture.home.id, houseId: fixture.home.id, name: fixture.home.name };
}

function ok(data) {
  return { status: 200, body: { success: true, code: "200", message: "success", data } };
}

function invalidHouse(houseId) {
  return { status: 400, body: { success: false, code: "mock_invalid_house", message: `unknown mock house: ${houseId || "missing"}` } };
}

function invalidBody(message) {
  return { status: 400, body: { success: false, code: "mock_invalid_body", message } };
}

function methodNotAllowed(expected) {
  return { status: 405, body: { success: false, code: "mock_method_not_allowed", message: `expected ${expected}` } };
}

function missing(resource, id) {
  return { status: 404, body: { success: false, code: `mock_${resource}_not_found`, message: `unknown mock ${resource}: ${id}` } };
}
