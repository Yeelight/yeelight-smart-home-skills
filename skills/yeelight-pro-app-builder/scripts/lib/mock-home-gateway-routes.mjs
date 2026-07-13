export function routeGatewayRequest({ method, apiPath, body, fixture }) {
  const sceneRelations = apiPath.match(/^\/v1\/scene\/r\/([^/]+)\/related\/sceneId$/);
  if (sceneRelations) {
    if (method !== "POST") return methodNotAllowed("POST");
    const gateway = findGateway(fixture, sceneRelations[1]);
    return gateway ? ok(structuredClone(fixture.gatewaySceneRelations?.[gateway.id] || [])) : missingGateway(sceneRelations[1]);
  }
  const list = apiPath.match(/^\/v2\/thing\/manage\/house\/([^/]+)\/gateway\/r\/info\/(\d+)\/(\d+)$/);
  if (list) {
    if (method !== "GET") return methodNotAllowed("GET");
    if (list[1] !== fixture.home.id) return invalidHouse(list[1]);
    return ok({ rows: gateways(fixture).map(gatewayRow) });
  }
  const detail = apiPath.match(/^\/v2\/thing\/manage\/house\/([^/]+)\/gateway\/([^/]+)\/r\/info$/);
  if (detail) {
    if (method !== "GET") return methodNotAllowed("GET");
    if (detail[1] !== fixture.home.id) return invalidHouse(detail[1]);
    const gateway = findGateway(fixture, detail[2]);
    return gateway ? ok(gatewayRow(gateway)) : missingGateway(detail[2]);
  }
  const thread = apiPath.match(/^\/v2\/thing\/manage\/house\/([^/]+)\/gateway\/([^/]+)\/r\/thread-info$/);
  if (thread) {
    if (method !== "GET") return methodNotAllowed("GET");
    if (thread[1] !== fixture.home.id) return invalidHouse(thread[1]);
    const gateway = findGateway(fixture, thread[2]);
    return gateway ? ok(gateway.threadInfo || {}) : missingGateway(thread[2]);
  }
  const modify = apiPath.match(/^\/v2\/thing\/manage\/house\/([^/]+)\/gateway\/([^/]+)\/w\/modify$/);
  if (modify) {
    if (method !== "POST") return methodNotAllowed("POST");
    if (modify[1] !== fixture.home.id) return invalidHouse(modify[1]);
    const gateway = findGateway(fixture, modify[2]);
    if (!gateway) return missingGateway(modify[2]);
    if (!validGatewayWrite(body, fixture)) return invalidBody("gateway modify body contains unsupported or invalid fields");
    if (body.name !== undefined) gateway.alias = String(body.name).trim();
    if (body.description !== undefined) gateway.description = String(body.description);
    if (body.icon !== undefined) gateway.icon = String(body.icon);
    if (body.mac !== undefined) gateway.mac = String(body.mac);
    if (body.roomIds !== undefined) gateway.associatedRoomIds = structuredClone(body.roomIds);
    return ok(true);
  }
  const remove = apiPath.match(/^\/v2\/thing\/manage\/house\/([^/]+)\/gateway\/([^/]+)\/w\/info$/);
  if (remove) {
    if (method !== "DELETE") return methodNotAllowed("DELETE");
    if (remove[1] !== fixture.home.id) return invalidHouse(remove[1]);
    const index = fixture.devices.findIndex((device) => device.family === "gateway" && device.id === remove[2]);
    if (index < 0) return missingGateway(remove[2]);
    fixture.devices.splice(index, 1);
    delete fixture.gatewaySceneRelations?.[remove[2]];
    delete fixture.gatewayDiagnostics?.[remove[2]];
    return ok(true);
  }
  if (apiPath !== "/v1/device/r/gatewayswithstats") return null;
  if (method !== "POST") return methodNotAllowed("POST");
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).join(",") !== "houseId") return invalidBody("gateway stats body must contain only houseId");
  if (String(body.houseId) !== fixture.home.id) return invalidHouse(body.houseId);
  return ok({ devices: gateways(fixture).map((gateway) => ({ deviceId: gateway.id, name: gateway.alias || gateway.name, online: gateway.online, model: gateway.model, firmwareVersion: gateway.firmwareVersion, deviceNum: gateway.gatewayStats?.deviceCount || 0, roomNum: gateway.gatewayStats?.roomCount || 0 })) });
}

function gateways(fixture) { return fixture.devices.filter((device) => device.family === "gateway"); }
function findGateway(fixture, id) { return gateways(fixture).find((gateway) => gateway.id === id); }
function gatewayRow(gateway) { return { id: gateway.id, gatewayId: gateway.id, houseId: gateway.houseId, name: gateway.alias || gateway.name, description: gateway.description, icon: gateway.icon, roomId: gateway.roomId, roomIds: gateway.associatedRoomIds, online: gateway.online, model: gateway.model, firmwareVersion: gateway.firmwareVersion, supportedBridgeType: gateway.supportedBridgeType, configs: gateway.configs || [] }; }
function validGatewayWrite(body, fixture) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const keys = Object.keys(body);
  if (keys.length === 0 || keys.some((key) => !["name", "description", "icon", "mac", "roomIds"].includes(key))) return false;
  if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) return false;
  if (body.roomIds !== undefined) {
    const rooms = new Set(fixture.rooms.map((room) => room.id));
    if (!Array.isArray(body.roomIds) || body.roomIds.some((id) => !rooms.has(String(id)))) return false;
  }
  return true;
}
function ok(data) { return { status: 200, body: { success: true, code: 0, message: "success", data } }; }
function invalidHouse(value) { return { status: 400, body: { success: false, code: "mock_invalid_house", message: `unexpected houseId: ${value || "missing"}` } }; }
function missingGateway(id) { return { status: 404, body: { success: false, code: "mock_gateway_not_found", message: `gateway not found: ${id}` } }; }
function invalidBody(message) { return { status: 400, body: { success: false, code: "mock_invalid_body", message } }; }
function methodNotAllowed(expected) { return { status: 405, body: { success: false, code: "mock_method_not_allowed", message: `expected ${expected}` } }; }
