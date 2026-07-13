const TARGET_TYPE_IDS = { room: 1, device: 2, group: 4, scene: 6 };
const PUBLIC_TO_CLOUD_PROPERTY = {
  power: "p",
  brightness: "l",
  colorTemperature: "ct",
  color: "c",
  switchPower: "sp",
  targetPercent: "tp",
};

export function routeSceneRequest({ method, apiPath, body, fixture }) {
  if (apiPath === "/v1/scene/r/all") return sceneList(method, body, fixture);

  const managedList = apiPath.match(/^\/v2\/thing\/manage\/house\/([^/]+)\/scene\/r\/info\/(\d+)\/(\d+)$/);
  if (managedList) return sceneManagedList(method, body, fixture, managedList);

  const detail = apiPath.match(/^\/v1\/scene\/([^/]+)\/r\/detail$/);
  if (detail) return sceneDetail(method, body, fixture, detail[1]);

  const create = apiPath.match(/^\/v2\/thing\/manage\/house\/([^/]+)\/scene\/w\/create$/);
  if (create) return sceneCreate(method, body, fixture, create[1]);

  const update = apiPath.match(/^\/v2\/thing\/manage\/house\/([^/]+)\/scene\/([^/]+)\/w\/modify$/);
  if (update) return sceneUpdate(method, body, fixture, update[1], update[2]);

  const remove = apiPath.match(/^\/v2\/thing\/manage\/house\/([^/]+)\/scene\/([^/]+)\/w\/info$/);
  if (remove) return sceneDelete(method, body, fixture, remove[1], remove[2]);

  const execution = apiPath.match(/^\/v1\/open\/control\/house\/([^/]+)\/control\/w\/scenes\/([^/]+)$/);
  if (execution) return sceneExecution(method, body, fixture, execution[1], execution[2]);
  return null;
}

function sceneList(method, body, fixture) {
  if (method !== "POST") return methodNotAllowed("POST");
  if (String(body?.houseId || "") !== fixture.home.id) return invalidHouse(body?.houseId);
  return ok({ rows: fixture.scenes.map((item) => sceneSummary(item, fixture.home.id)) });
}

function sceneManagedList(method, body, fixture, match) {
  if (method !== "POST") return methodNotAllowed("POST");
  if (match[1] !== fixture.home.id) return invalidHouse(match[1]);
  if (!isEmptyObject(body)) return invalidBody("scene list body must be an empty object");
  return ok({ rows: paginate(fixture.scenes, match[2], match[3]).map((item) => sceneSummary(item, fixture.home.id)) });
}

function sceneDetail(method, body, fixture, sceneId) {
  if (method !== "POST") return methodNotAllowed("POST");
  if (body != null && !isEmptyObject(body)) return invalidBody("scene detail body must be empty");
  const scene = findScene(fixture, sceneId);
  return scene ? ok(sceneCloudDetail(scene, fixture.home.id)) : missingScene(sceneId);
}

function sceneCreate(method, body, fixture, houseId) {
  if (method !== "PUT") return methodNotAllowed("PUT");
  if (houseId !== fixture.home.id) return invalidHouse(houseId);
  const error = validateSceneWriteBody(body, { requireId: false, houseId });
  if (error) return invalidBody(error);
  if (fixture.scenes.some((item) => item.name === body.name)) return invalidBody("scene name must be unique");
  const id = nextId(fixture.scenes, 994900);
  fixture.scenes.push(sceneFromCloudBody(id, body));
  return ok(id);
}

function sceneUpdate(method, body, fixture, houseId, sceneId) {
  if (method !== "POST") return methodNotAllowed("POST");
  if (houseId !== fixture.home.id) return invalidHouse(houseId);
  const scene = findScene(fixture, sceneId);
  if (!scene) return missingScene(sceneId);
  const error = validateSceneWriteBody(body, { requireId: true, houseId, sceneId });
  if (error) return invalidBody(error);
  Object.assign(scene, sceneFromCloudBody(sceneId, body, scene));
  return ok(true);
}

function sceneDelete(method, body, fixture, houseId, sceneId) {
  if (method !== "DELETE") return methodNotAllowed("DELETE");
  if (houseId !== fixture.home.id) return invalidHouse(houseId);
  if (body != null) return invalidBody("scene delete body must be empty");
  const index = fixture.scenes.findIndex((item) => item.id === sceneId);
  if (index < 0) return missingScene(sceneId);
  fixture.scenes.splice(index, 1);
  delete fixture.sceneExecutions[sceneId];
  return ok(true);
}

function sceneExecution(method, body, fixture, houseId, sceneId) {
  if (method !== "POST") return methodNotAllowed("POST");
  if (houseId !== fixture.home.id) return invalidHouse(houseId);
  if (!isEmptyObject(body)) return invalidBody("scene execution body must be an empty object");
  const scene = findScene(fixture, sceneId);
  if (!scene) return missingScene(sceneId);
  fixture.sceneExecutions[scene.id] = Number(fixture.sceneExecutions[scene.id] || 0) + 1;
  return ok({ sceneId: scene.id, executionCount: fixture.sceneExecutions[scene.id] });
}

function validateSceneWriteBody(body, { requireId, houseId, sceneId }) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "scene write body must be an object";
  const allowed = new Set(["desc", "details", "gatewayDeviceId", "houseId", "icon", "id", "name", "roomId", "sceneId"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return "scene write body contains unsupported fields";
  if (String(body.houseId) !== houseId || typeof body.name !== "string" || !body.name.trim() || !Array.isArray(body.details) || body.details.length === 0) return "scene write body requires houseId, name and details";
  if (requireId && (String(body.id) !== sceneId || String(body.sceneId) !== sceneId)) return "scene update ids must match path";
  if (body.details.some((item) => !validSceneDetail(item))) return "scene details must use exact cloud action rows";
  return "";
}

function validSceneDetail(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const allowed = new Set(["action", "params", "rank", "resId", "resName", "roomId", "subIndex", "typeId"]);
  if (Object.keys(item).some((key) => !allowed.has(key))) return false;
  if (item.typeId == null || item.resId == null || typeof item.params !== "string") return false;
  try { return typeof JSON.parse(item.params) === "object"; } catch { return false; }
}

function sceneFromCloudBody(id, body, previous = {}) {
  const actions = body.details.map(cloudActionToPublic);
  return {
    ...previous,
    id: String(id),
    name: body.name,
    description: body.desc ?? previous.description ?? "情景",
    icon: body.icon ?? previous.icon ?? "sparkles",
    roomId: body.roomId == null ? previous.roomId : String(body.roomId),
    status: previous.status || "enabled",
    category: previous.category || "custom",
    editablePayload: {
      sceneId: String(id),
      name: body.name,
      description: body.desc ?? previous.description ?? "情景",
      icon: body.icon ?? previous.icon ?? "sparkles",
      actions,
    },
  };
}

function sceneCloudDetail(scene, houseId) {
  return {
    id: scene.id,
    sceneId: scene.id,
    houseId,
    name: scene.name,
    desc: scene.description,
    icon: scene.icon,
    roomId: scene.roomId,
    details: scene.editablePayload.actions.map(publicActionToCloud),
  };
}

function publicActionToCloud(action) {
  const set = Object.fromEntries(Object.entries(action.set || {}).map(([key, value]) => [PUBLIC_TO_CLOUD_PROPERTY[key] || key, value]));
  const params = action.opaque ? action.raw : { set };
  return {
    typeId: TARGET_TYPE_IDS[action.targetType] || action.typeId || 2,
    resId: numericOrString(action.targetId),
    resName: action.targetName || action.targetId,
    action: action.action ?? 0,
    rank: action.rank ?? 0,
    ...(action.roomId ? { roomId: numericOrString(action.roomId) } : {}),
    ...(action.subIndex ? { subIndex: action.subIndex } : {}),
    params: JSON.stringify(params),
  };
}

function cloudActionToPublic(action) {
  const parsed = JSON.parse(action.params);
  const cloudToPublic = Object.fromEntries(Object.entries(PUBLIC_TO_CLOUD_PROPERTY).map(([key, value]) => [value, key]));
  const set = Object.fromEntries(Object.entries(parsed.set || {}).map(([key, value]) => [cloudToPublic[key] || key, value]));
  const targetType = Object.entries(TARGET_TYPE_IDS).find(([, value]) => String(value) === String(action.typeId))?.[0] || "device";
  return {
    targetType,
    targetId: String(action.resId),
    targetName: action.resName || String(action.resId),
    ...(Number(action.action || 0) === 0 ? {} : { action: action.action }),
    rank: action.rank ?? 0,
    ...(Object.keys(set).length ? { set } : { opaque: true, raw: parsed }),
  };
}

function sceneSummary(scene, houseId) {
  return { id: scene.id, sceneId: scene.id, name: scene.name, desc: scene.description, icon: scene.icon, roomId: scene.roomId, houseId, status: scene.status, actionCount: scene.editablePayload.actions.length };
}

function paginate(items, pageNo, pageSize) {
  const start = (Number(pageNo) - 1) * Number(pageSize);
  return items.slice(start, start + Number(pageSize));
}

function nextId(items, floor) {
  return String(Math.max(floor, ...items.map((item) => Number(item.id) || 0)) + 1);
}

function numericOrString(value) {
  return /^\d+$/.test(String(value)) ? Number(value) : value;
}

function findScene(fixture, id) { return fixture.scenes.find((scene) => scene.id === String(id)); }
function isEmptyObject(value) { return value != null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0; }
function ok(data) { return { status: 200, body: { success: true, code: "200", message: "success", data } }; }
function invalidHouse(houseId) { return { status: 400, body: { success: false, code: "mock_invalid_house", message: `unknown mock house: ${houseId || "missing"}` } }; }
function missingScene(id) { return { status: 404, body: { success: false, code: "mock_scene_not_found", message: `unknown mock scene: ${id}` } }; }
function invalidBody(message) { return { status: 400, body: { success: false, code: "mock_invalid_body", message } }; }
function methodNotAllowed(expected) { return { status: 405, body: { success: false, code: "mock_method_not_allowed", message: `expected ${expected}` } }; }
