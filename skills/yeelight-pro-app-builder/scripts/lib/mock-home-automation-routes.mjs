const TARGET_TYPE_IDS = { room: 1, device: 2, group: 4, scene: 6 };
const PROPERTY_ALIASES = { power: "p", brightness: "l", colorTemperature: "ct", color: "c", switchPower: "sp", targetPercent: "tp" };

export function routeAutomationRequest({ method, apiPath, body, fixture }) {
  if (apiPath === "/v1/automations/r/list") return automationList(method, body, fixture);
  if (apiPath === "/v1/automations/r/supported") return supported(method, body, fixture.automationSupported);
  if (apiPath === "/v1/automations/r/supported/v2") return supported(method, body, fixture.automationSupportedV2);

  const detail = apiPath.match(/^\/v2\/thing\/manage\/house\/([^/]+)\/automation\/([^/]+)\/r\/info$/);
  if (detail) return automationDetail(method, body, fixture, detail[1], detail[2]);

  const create = apiPath.match(/^\/v2\/thing\/manage\/house\/([^/]+)\/automation\/w\/create$/);
  if (create) return automationCreate(method, body, fixture, create[1]);

  const update = apiPath.match(/^\/v1\/automations\/([^/]+)\/w\/update$/);
  if (update) return automationUpdate(method, body, fixture, update[1]);

  const status = apiPath.match(/^\/v1\/automations\/w\/(enable|disable)\/([^/]+)$/);
  if (status) return automationStatus(method, body, fixture, status[1], status[2]);

  const remove = apiPath.match(/^\/v2\/thing\/manage\/house\/([^/]+)\/automation\/([^/]+)\/w\/info$/);
  if (remove) return automationDelete(method, body, fixture, remove[1], remove[2]);
  return null;
}

function automationList(method, body, fixture) {
  if (method !== "POST") return methodNotAllowed("POST");
  if (String(body?.houseId || "") !== fixture.home.id) return invalidHouse(body?.houseId);
  if (Object.keys(body).some((key) => key !== "houseId")) return invalidBody("automation list body must contain only houseId");
  return ok({ rows: fixture.automations.map((item) => automationSummary(item, fixture.home.id)) });
}

function supported(method, body, rows) {
  if (method !== "POST") return methodNotAllowed("POST");
  if (!isEmptyObject(body)) return invalidBody("automation supported body must be an empty object");
  return ok(structuredClone(rows || []));
}

function automationDetail(method, body, fixture, houseId, automationId) {
  if (method !== "GET") return methodNotAllowed("GET");
  if (houseId !== fixture.home.id) return invalidHouse(houseId);
  if (body != null) return invalidBody("automation detail body must be empty");
  const automation = findAutomation(fixture, automationId);
  return automation ? ok(automationCloudDetail(automation, houseId)) : missingAutomation(automationId);
}

function automationCreate(method, body, fixture, houseId) {
  if (method !== "PUT") return methodNotAllowed("PUT");
  if (houseId !== fixture.home.id) return invalidHouse(houseId);
  const error = validateAutomationWriteBody(body, { requireId: false, houseId });
  if (error) return invalidBody(error);
  if (fixture.automations.some((item) => item.name === body.name)) return invalidBody("automation name must be unique");
  const id = nextId(fixture.automations, 995900);
  fixture.automations.push(automationFromCloudBody(id, body));
  return ok(id);
}

function automationUpdate(method, body, fixture, automationId) {
  if (method !== "PUT") return methodNotAllowed("PUT");
  const automation = findAutomation(fixture, automationId);
  if (!automation) return missingAutomation(automationId);
  const error = validateAutomationWriteBody(body, { requireId: true, houseId: fixture.home.id, automationId });
  if (error) return invalidBody(error);
  Object.assign(automation, automationFromCloudBody(automationId, body, automation));
  return ok(true);
}

function automationStatus(method, body, fixture, action, automationId) {
  if (method !== "POST") return methodNotAllowed("POST");
  if (body != null && !isEmptyObject(body)) return invalidBody("automation status body must be empty");
  const automation = findAutomation(fixture, automationId);
  if (!automation) return missingAutomation(automationId);
  automation.status = action === "enable" ? "enabled" : "disabled";
  return ok(true);
}

function automationDelete(method, body, fixture, houseId, automationId) {
  if (method !== "DELETE") return methodNotAllowed("DELETE");
  if (houseId !== fixture.home.id) return invalidHouse(houseId);
  if (body != null) return invalidBody("automation delete body must be empty");
  const index = fixture.automations.findIndex((item) => item.id === automationId);
  if (index < 0) return missingAutomation(automationId);
  fixture.automations.splice(index, 1);
  return ok(true);
}

function validateAutomationWriteBody(body, { requireId, houseId, automationId }) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "automation write body must be an object";
  const allowed = new Set(["actions", "endTime", "houseId", "id", "name", "params", "repeatType", "repeatValue", "startTime", "status", "version"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return "automation write body contains unsupported fields";
  if (String(body.houseId) !== houseId || typeof body.name !== "string" || !body.name.trim() || typeof body.params !== "string" || !Array.isArray(body.actions) || body.actions.length === 0) return "automation write body requires houseId, name, params and actions";
  if (typeof body.startTime !== "string" || typeof body.endTime !== "string" || !Number.isInteger(Number(body.repeatType))) return "automation schedule is invalid";
  if (requireId && String(body.id) !== automationId) return "automation update id must match path";
  try { if (typeof JSON.parse(body.params) !== "object") return "automation params must contain JSON object"; } catch { return "automation params must contain valid JSON"; }
  if (body.actions.some((item) => !validAction(item))) return "automation actions must use exact cloud action rows";
  return "";
}

function validAction(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const allowed = new Set(["action", "params", "rank", "resId", "resName", "roomId", "subIndex", "typeId"]);
  if (Object.keys(item).some((key) => !allowed.has(key)) || item.typeId == null || item.resId == null || typeof item.params !== "string") return false;
  try { return typeof JSON.parse(item.params) === "object"; } catch { return false; }
}

function automationFromCloudBody(id, body, previous = {}) {
  const trigger = cloudTriggerToPublic(JSON.parse(body.params));
  const actions = body.actions.map(cloudActionToPublic);
  return {
    ...previous,
    id: String(id),
    name: body.name,
    status: body.status == null ? previous.status || "enabled" : Number(body.status) === 1 ? "enabled" : "disabled",
    equivalenceClass: previous.equivalenceClass || trigger.conditionType || trigger.conditionKind || "timer",
    editablePayload: {
      automationId: String(id),
      name: body.name,
      activeWindow: { start: body.startTime, end: body.endTime },
      repeat: repeatTypeToPublic(body.repeatType, body.repeatValue),
      version: body.version ?? previous.editablePayload?.version ?? 3,
      trigger,
      actions,
    },
  };
}

function automationCloudDetail(automation, houseId) {
  const payload = automation.editablePayload;
  const repeat = publicRepeatToCloud(payload.repeat);
  return {
    id: automation.id,
    automationId: automation.id,
    houseId,
    name: automation.name,
    status: automation.status === "enabled" ? 1 : 0,
    startTime: payload.activeWindow.start,
    endTime: payload.activeWindow.end,
    repeatType: repeat.repeatType,
    repeatValue: repeat.repeatValue,
    version: payload.version,
    params: JSON.stringify(publicTriggerToCloud(payload.trigger)),
    actions: payload.actions.map(publicActionToCloud),
  };
}

function publicTriggerToCloud(trigger) {
  if (trigger.conditionType) return { type: trigger.conditionType, conditions: trigger.conditions.map(publicConditionToCloud) };
  return { type: "and", conditions: [publicConditionToCloud(trigger)] };
}

function publicConditionToCloud(condition) {
  if (condition.conditionKind === "alarm") return { type: "alarm", clock: condition.time };
  return {
    type: condition.conditionKind,
    typeId: TARGET_TYPE_IDS[condition.targetType] || 2,
    resId: numericOrString(condition.targetId),
    ...(condition.event ? { event: condition.event } : {}),
    ...(condition.property ? { property: PROPERTY_ALIASES[condition.property] || condition.property } : {}),
    ...(condition.operation ? { operation: condition.operation } : {}),
    ...(condition.value !== undefined ? { value: condition.value } : {}),
  };
}

function cloudTriggerToPublic(params) {
  const conditions = Array.isArray(params.conditions) ? params.conditions.map(cloudConditionToPublic) : [];
  if (params.type === "and" && conditions.length === 1) return conditions[0];
  return { conditionType: params.type || "and", conditions };
}

function cloudConditionToPublic(condition) {
  if (condition.type === "alarm") return { conditionKind: "alarm", time: condition.clock };
  const cloudToPublic = Object.fromEntries(Object.entries(PROPERTY_ALIASES).map(([key, value]) => [value, key]));
  return {
    conditionKind: condition.type,
    targetType: Object.entries(TARGET_TYPE_IDS).find(([, value]) => String(value) === String(condition.typeId))?.[0] || "device",
    targetId: String(condition.resId),
    ...(condition.event ? { event: condition.event } : {}),
    ...(condition.property ? { property: cloudToPublic[condition.property] || condition.property } : {}),
    ...(condition.operation ? { operation: condition.operation } : {}),
    ...(condition.value !== undefined ? { value: condition.value } : {}),
  };
}

function publicActionToCloud(action) {
  const set = Object.fromEntries(Object.entries(action.set || {}).map(([key, value]) => [PROPERTY_ALIASES[key] || key, value]));
  return { typeId: TARGET_TYPE_IDS[action.targetType] || 2, resId: numericOrString(action.targetId), resName: action.targetName || action.targetId, action: action.action ?? 0, rank: action.rank ?? 0, params: JSON.stringify({ set }) };
}

function cloudActionToPublic(action) {
  const parsed = JSON.parse(action.params);
  const cloudToPublic = Object.fromEntries(Object.entries(PROPERTY_ALIASES).map(([key, value]) => [value, key]));
  const set = Object.fromEntries(Object.entries(parsed.set || {}).map(([key, value]) => [cloudToPublic[key] || key, value]));
  return { targetType: Object.entries(TARGET_TYPE_IDS).find(([, value]) => String(value) === String(action.typeId))?.[0] || "device", targetId: String(action.resId), targetName: action.resName || String(action.resId), ...(Number(action.action || 0) === 0 ? {} : { action: action.action }), rank: action.rank ?? 0, set };
}

function automationSummary(item, houseId) {
  return { id: item.id, automationId: item.id, name: item.name, houseId, status: item.status === "enabled" ? 1 : 0, startTime: item.editablePayload.activeWindow.start, endTime: item.editablePayload.activeWindow.end, repeat: item.editablePayload.repeat, triggerKind: item.equivalenceClass, actionCount: item.editablePayload.actions.length };
}

function publicRepeatToCloud(repeat) {
  if (repeat === "once") return { repeatType: 1, repeatValue: "" };
  if (repeat === "weekdays") return { repeatType: 2, repeatValue: "0x1f" };
  if (repeat === "weekends") return { repeatType: 2, repeatValue: "0x60" };
  return { repeatType: 2, repeatValue: "0x7f" };
}

function repeatTypeToPublic(repeatType, repeatValue) {
  if (Number(repeatType) === 1) return "once";
  if (repeatValue === "0x1f") return "weekdays";
  if (repeatValue === "0x60") return "weekends";
  return "daily";
}

function nextId(items, floor) { return String(Math.max(floor, ...items.map((item) => Number(item.id) || 0)) + 1); }
function numericOrString(value) { return /^\d+$/.test(String(value)) ? Number(value) : value; }
function findAutomation(fixture, id) { return fixture.automations.find((item) => item.id === String(id)); }
function isEmptyObject(value) { return value != null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0; }
function ok(data) { return { status: 200, body: { success: true, code: 0, message: "success", data } }; }
function methodNotAllowed(expected) { return { status: 405, body: { success: false, code: "mock_method_not_allowed", message: `expected ${expected}` } }; }
function invalidHouse(value) { return { status: 400, body: { success: false, code: "mock_invalid_house", message: `unexpected houseId: ${value || "missing"}` } }; }
function missingAutomation(id) { return { status: 404, body: { success: false, code: "mock_automation_not_found", message: `automation not found: ${id}` } }; }
function invalidBody(message) { return { status: 400, body: { success: false, code: "mock_invalid_body", message } }; }
