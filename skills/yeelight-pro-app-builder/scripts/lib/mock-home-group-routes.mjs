const CAPABILITY_BY_COMPONENT = { 5: "light", 12: "curtain", 20: "sensor", 21: "sensor", 30: "infrastructure" };
const CATEGORY_BY_COMPONENT = { 5: "lighting", 12: "shading", 20: "environment", 21: "security", 30: "infrastructure" };

export function routeGroupRequest({ method, apiPath, body, fixture }) {
  const list = apiPath.match(/^\/v2\/thing\/manage\/house\/([^/]+)\/group\/r\/info\/(\d+)\/(\d+)$/);
  if (list) return groupList(method, body, fixture, list);

  const detail = apiPath.match(/^\/v2\/thing\/manage\/house\/([^/]+)\/group\/([^/]+)\/r\/info$/);
  if (detail) return groupDetailRoute(method, body, fixture, detail[1], detail[2]);

  const create = apiPath.match(/^\/v2\/thing\/manage\/house\/([^/]+)\/group\/w\/create$/);
  if (create) return groupCreate(method, body, fixture, create[1]);

  const update = apiPath.match(/^\/v2\/thing\/manage\/house\/([^/]+)\/group\/([^/]+)\/w\/modify$/);
  if (update) return groupUpdate(method, body, fixture, update[1], update[2]);

  const members = apiPath.match(/^\/v2\/thing\/manage\/house\/([^/]+)\/group\/([^/]+)\/w\/devices$/);
  if (members) return groupMembers(method, body, fixture, members[1], members[2]);

  const remove = apiPath.match(/^\/v2\/thing\/manage\/house\/([^/]+)\/group\/([^/]+)\/w\/info$/);
  if (remove) return groupDelete(method, body, fixture, remove[1], remove[2]);
  return null;
}

function groupList(method, body, fixture, match) {
  if (method !== "GET") return methodNotAllowed("GET");
  if (match[1] !== fixture.home.id) return invalidHouse(match[1]);
  if (body != null) return invalidBody("group list body must be empty");
  const start = (Number(match[2]) - 1) * Number(match[3]);
  return ok({ rows: fixture.groups.slice(start, start + Number(match[3])).map((group) => groupSummary(fixture, group)) });
}

function groupDetailRoute(method, body, fixture, houseId, groupId) {
  if (method !== "GET") return methodNotAllowed("GET");
  if (houseId !== fixture.home.id) return invalidHouse(houseId);
  if (body != null) return invalidBody("group detail body must be empty");
  const group = findGroup(fixture, groupId);
  return group ? ok(groupDetail(fixture, group)) : missingGroup(groupId);
}

function groupCreate(method, body, fixture, houseId) {
  if (method !== "PUT") return methodNotAllowed("PUT");
  if (houseId !== fixture.home.id) return invalidHouse(houseId);
  const error = validateCreateBody(body, fixture, houseId);
  if (error) return invalidBody(error);
  if (fixture.groups.some((group) => group.name === body.name)) return invalidBody("group name must be unique");
  const id = nextId(fixture.groups, 993900);
  fixture.groups.push({
    id,
    name: body.name,
    description: body.desc || "设备组",
    icon: body.icon || "layers",
    roomId: String(body.roomId),
    groupCapability: CAPABILITY_BY_COMPONENT[Number(body.cid)] || "custom",
    groupCategory: CATEGORY_BY_COMPONENT[Number(body.cid)] || "custom",
    componentId: Number(body.cid),
    deviceIds: (body.deviceIds || []).map(String),
  });
  return ok(id);
}

function groupUpdate(method, body, fixture, houseId, groupId) {
  if (method !== "POST") return methodNotAllowed("POST");
  if (houseId !== fixture.home.id) return invalidHouse(houseId);
  const group = findGroup(fixture, groupId);
  if (!group) return missingGroup(groupId);
  const error = validateUpdateBody(body, fixture, houseId, groupId);
  if (error) return invalidBody(error);
  if (body.name != null) group.name = body.name;
  if (body.desc != null) group.description = body.desc;
  if (body.icon != null) group.icon = body.icon;
  if (body.roomId != null) group.roomId = String(body.roomId);
  return ok(true);
}

function groupMembers(method, body, fixture, houseId, groupId) {
  if (method !== "POST") return methodNotAllowed("POST");
  if (houseId !== fixture.home.id) return invalidHouse(houseId);
  const group = findGroup(fixture, groupId);
  if (!group) return missingGroup(groupId);
  const expectedKeys = ["addDeviceList", "groupId", "houseId", "removeDeviceList"];
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).sort().join(",") !== expectedKeys.join(",")) return invalidBody("group member body must contain only houseId, groupId, addDeviceList and removeDeviceList");
  if (String(body.houseId) !== fixture.home.id || String(body.groupId) !== group.id || !Array.isArray(body.addDeviceList) || !Array.isArray(body.removeDeviceList)) return invalidBody("invalid group member references");
  const add = body.addDeviceList.map(String);
  const remove = body.removeDeviceList.map(String);
  if ([...add, ...remove].some((id) => !fixture.devices.some((device) => device.id === id)) || add.some((id) => remove.includes(id))) return invalidBody("invalid group member delta");
  if (add.some((id) => !compatibleDevice(fixture, group, id))) return invalidBody("group member is incompatible with group capability");
  const next = new Set(group.deviceIds);
  for (const id of remove) next.delete(id);
  for (const id of add) next.add(id);
  group.deviceIds = [...next];
  return ok(true);
}

function groupDelete(method, body, fixture, houseId, groupId) {
  if (method !== "DELETE") return methodNotAllowed("DELETE");
  if (houseId !== fixture.home.id) return invalidHouse(houseId);
  if (body != null) return invalidBody("group delete body must be empty");
  const index = fixture.groups.findIndex((group) => group.id === groupId);
  if (index < 0) return missingGroup(groupId);
  fixture.groups.splice(index, 1);
  return ok(true);
}

function validateCreateBody(body, fixture, houseId) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "group create body must be an object";
  const allowed = new Set(["cid", "desc", "deviceIds", "houseId", "icon", "name", "roomId"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return "group create body contains unsupported fields";
  if (String(body.houseId) !== houseId || typeof body.name !== "string" || !body.name.trim() || !Number.isInteger(Number(body.cid)) || !fixture.rooms.some((room) => room.id === String(body.roomId))) return "group create body requires houseId, name, roomId and cid";
  if (!Array.isArray(body.deviceIds) || body.deviceIds.length === 0 || body.deviceIds.some((id) => !fixture.devices.some((device) => device.id === String(id)))) return "group create deviceIds are invalid";
  const capability = CAPABILITY_BY_COMPONENT[Number(body.cid)] || "custom";
  if (body.deviceIds.some((id) => !deviceMatchesCapability(fixture.devices.find((device) => device.id === String(id)), capability))) return "group create members are incompatible";
  return "";
}

function validateUpdateBody(body, fixture, houseId, groupId) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "group update body must be an object";
  const allowed = new Set(["desc", "houseId", "icon", "id", "name", "roomId"]);
  if (Object.keys(body).some((key) => !allowed.has(key)) || String(body.houseId) !== houseId) return "group update body contains unsupported fields or houseId";
  if (String(body.id) !== groupId) return "group update id must match path";
  if (body.name != null && (typeof body.name !== "string" || !body.name.trim())) return "group name must be non-blank";
  if (body.roomId != null && !fixture.rooms.some((room) => room.id === String(body.roomId))) return "group roomId is invalid";
  if (["name", "desc", "icon", "roomId"].every((key) => body[key] == null)) return "group update requires one metadata change";
  return "";
}

function compatibleDevice(fixture, group, deviceId) {
  return deviceMatchesCapability(fixture.devices.find((device) => device.id === deviceId), group.groupCapability);
}

function deviceMatchesCapability(device, capability) {
  if (!device) return false;
  if (capability === "light") return device.family === "light";
  if (capability === "curtain") return device.family === "curtain";
  if (capability === "sensor") return device.family === "sensor" || device.category === "sensor";
  if (capability === "infrastructure") return ["gateway", "bridge"].includes(device.family) || device.category === "gateway";
  return true;
}

function groupSummary(fixture, group) {
  return { id: group.id, groupId: group.id, name: group.name, desc: group.description, icon: group.icon, roomId: group.roomId, houseId: fixture.home.id, cid: group.componentId, groupCapability: group.groupCapability, groupCategory: group.groupCategory, deviceCount: group.deviceIds.length };
}

function groupDetail(fixture, group) {
  return {
    ...groupSummary(fixture, group),
    devices: group.deviceIds.map((id) => {
      const device = fixture.devices.find((item) => item.id === id);
      return { id, deviceId: id, name: device?.name || id, family: device?.family, category: device?.category };
    }),
  };
}

function nextId(items, floor) { return String(Math.max(floor, ...items.map((item) => Number(item.id) || 0)) + 1); }
function findGroup(fixture, id) { return fixture.groups.find((group) => group.id === String(id)); }
function ok(data) { return { status: 200, body: { success: true, code: 0, message: "success", data } }; }
function invalidHouse(value) { return { status: 400, body: { success: false, code: "mock_invalid_house", message: `unexpected houseId: ${value || "missing"}` } }; }
function missingGroup(id) { return { status: 404, body: { success: false, code: "mock_group_not_found", message: `group not found: ${id}` } }; }
function invalidBody(message) { return { status: 400, body: { success: false, code: "mock_invalid_body", message } }; }
function methodNotAllowed(expected) { return { status: 405, body: { success: false, code: "mock_method_not_allowed", message: `expected ${expected}` } }; }
