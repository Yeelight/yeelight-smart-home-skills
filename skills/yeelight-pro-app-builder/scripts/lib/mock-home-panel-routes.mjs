export function routePanelRequest({ method, apiPath, body, fixture }) {
  const list = apiPath.match(/^\/v1\/panel\/r\/list\/([^/]+)$/);
  if (list) {
    if (method !== "GET") return methodNotAllowed("GET");
    if (list[1] !== fixture.home.id) return invalidHouse(list[1]);
    return ok(panels(fixture).map((device) => structuredClone(device.panelDetail)));
  }

  const detail = apiPath.match(/^\/v1\/panel\/r\/detail\/([^/]+)$/);
  if (detail) {
    if (method !== "POST") return methodNotAllowed("POST");
    const device = findPanel(fixture, detail[1]);
    return device ? ok(structuredClone(device.panelDetail)) : missingDevice(detail[1]);
  }

  const buttons = apiPath.match(/^\/v1\/panel\/r\/button\/info\/([^/]+)$/);
  if (buttons) {
    if (method !== "POST") return methodNotAllowed("POST");
    const device = findPanel(fixture, buttons[1]);
    return device ? ok(structuredClone(device.panelButtons)) : missingDevice(buttons[1]);
  }

  const buttonType = apiPath.match(/^\/v1\/panel\/r\/button\/info\/([^/]+)\/([^/]+)$/);
  if (buttonType) {
    if (method !== "POST") return methodNotAllowed("POST");
    const device = findPanel(fixture, buttonType[1]);
    if (!device) return missingDevice(buttonType[1]);
    const rows = panelRows(device.panelButtons).filter((row) => String(row.type) === String(buttonType[2]));
    return ok(structuredClone(rows));
  }

  const panelWrite = apiPath.match(/^\/v1\/panel\/w\/button\/update\/([^/]+)$/);
  if (panelWrite) {
    if (method !== "POST") return methodNotAllowed("POST");
    const device = findPanel(fixture, panelWrite[1]);
    if (!device) return missingDevice(panelWrite[1]);
    if (!Array.isArray(body) || body.length === 0) return invalidBody("panel button update requires a non-empty array");
    const current = panelRows(device.panelButtons);
    if (body.some((row) => !validPanelButton(row, device.id, current))) return invalidBody("panel button rows must preserve a known id, deviceId and type");
    for (const next of body) replacePanelRow(device.panelButtons, next);
    return ok(true);
  }

  if (apiPath === "/v1/panel/w/button/event/update") {
    if (method !== "POST") return methodNotAllowed("POST");
    return updatePanelEvent(fixture, body);
  }

  if (apiPath === "/v1/panel/w/button/event/update/batch") {
    if (method !== "POST") return methodNotAllowed("POST");
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).join(",") !== "buttonEvents" || !Array.isArray(body.buttonEvents) || body.buttonEvents.length === 0) return invalidBody("panel event batch body must contain only a non-empty buttonEvents array");
    const targets = body.buttonEvents.map((event) => findPanelEvent(fixture, event));
    if (targets.some((target) => !target) || body.buttonEvents.some((event) => !validPanelEvent(event))) return invalidBody("panel event batch contains an invalid event");
    body.buttonEvents.forEach((event, index) => applyPanelEvent(targets[index], event));
    return ok(true);
  }

  const resetEvent = apiPath.match(/^\/v1\/panel\/w\/button\/event\/([^/]+)\/reset$/);
  if (resetEvent) {
    if (method !== "POST") return methodNotAllowed("POST");
    const target = findPanelEventById(fixture, resetEvent[1]);
    if (!target) return missingEvent(resetEvent[1]);
    Object.assign(target, { alias: target.name || "未绑定", resId: "", resType: 0, details: [] });
    return ok(true);
  }

  const single = apiPath.match(/^\/v1\/knobs\/([^/]+)\/detail$/);
  if (single) {
    if (method !== "GET") return methodNotAllowed("GET");
    const device = findKnob(fixture, single[1]);
    return device ? ok(structuredClone(device.knobSingle)) : missingDevice(single[1]);
  }

  const multi = apiPath.match(/^\/v1\/multi-knob\/([^/]+)\/detail$/);
  if (multi) {
    if (method !== "GET") return methodNotAllowed("GET");
    const device = findKnob(fixture, multi[1]);
    return device ? ok(structuredClone(device.knobMulti)) : missingDevice(multi[1]);
  }

  const resetKnob = apiPath.match(/^\/v1\/multi-knob\/([^/]+)\/([^/]+)\/reset$/);
  if (resetKnob) {
    if (method !== "POST") return methodNotAllowed("POST");
    const device = findKnob(fixture, resetKnob[1]);
    if (!device) return missingDevice(resetKnob[1]);
    const unavailable = knobWriteUnavailable(device);
    if (unavailable) return unavailable;
    const detail = device.knobMulti.details.find((item) => String(item.index) === String(resetKnob[2]));
    if (!detail) return invalidBody("knob reset index is unknown");
    Object.assign(detail, { configType: "none", mode: "unbound", alias: "未绑定", resId: "", typeId: 0 });
    return ok(true);
  }

  const panelClick = apiPath.match(/^\/v2\/thing\/control\/panel\/([^/]+)$/);
  if (panelClick) {
    if (method !== "POST") return methodNotAllowed("POST");
    const device = findPanel(fixture, panelClick[1]);
    if (!device) return missingDevice(panelClick[1]);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length === 0) return invalidBody("panel click payload is required");
    fixture.panelClickCounts[device.id] = Number(fixture.panelClickCounts[device.id] || 0) + 1;
    return ok({ accepted: true });
  }

  if (apiPath !== "/v1/multi-knob/update") return null;
  if (method !== "POST") return methodNotAllowed("POST");
  const keys = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body).sort() : [];
  if (keys.join(",") !== "details,id") return invalidBody("knob update body must contain only id and details");
  const device = findKnob(fixture, String(body.id || ""));
  if (!device) return missingDevice(body.id);
  const unavailable = knobWriteUnavailable(device);
  if (unavailable) return unavailable;
  if (!validKnobDetails(body.details, device.knobMulti.details)) return invalidBody("knob details must preserve every known id and index");
  device.knobMulti.details = structuredClone(body.details);
  return ok(true);
}

function panels(fixture) { return fixture.devices.filter((device) => device.family === "panel-screen" && device.panelDetail); }
function findPanel(fixture, id) { return panels(fixture).find((device) => device.id === id); }
function findKnob(fixture, id) { return fixture.devices.find((device) => device.family === "knob" && device.id === id && device.knobMulti); }
function panelRows(groups) { return Object.values(groups || {}).flatMap((rows) => Array.isArray(rows) ? rows : []); }
function validPanelButton(row, deviceId, current) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const base = current.find((item) => String(item.id) === String(row.id));
  return Boolean(base) && String(row.deviceId) === deviceId && Number(row.type) === Number(base.type);
}
function replacePanelRow(groups, next) {
  for (const rows of Object.values(groups)) {
    const index = rows.findIndex((row) => String(row.id) === String(next.id));
    if (index >= 0) { rows[index] = structuredClone(next); return; }
  }
}
function updatePanelEvent(fixture, event) {
  if (!validPanelEvent(event)) return invalidBody("panel event update requires deviceId, buttonEventId and details");
  const target = findPanelEvent(fixture, event);
  if (!target) return missingEvent(event.buttonEventId);
  applyPanelEvent(target, event);
  return ok(true);
}
function validPanelEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return false;
  const keys = Object.keys(event);
  return keys.length > 0 && keys.every((key) => ["deviceId", "buttonEventId", "alias", "details"].includes(key)) && Boolean(String(event.deviceId || "")) && Boolean(String(event.buttonEventId || "")) && Array.isArray(event.details);
}
function findPanelEvent(fixture, event) {
  const device = findPanel(fixture, String(event?.deviceId || ""));
  if (!device) return null;
  return findEvent(panelRows(device.panelButtons), String(event.buttonEventId || ""));
}
function findPanelEventById(fixture, eventId) {
  for (const device of panels(fixture)) {
    const event = findEvent(panelRows(device.panelButtons), String(eventId));
    if (event) return event;
  }
  return null;
}
function findEvent(rows, eventId) {
  for (const button of rows) {
    const event = (button.buttonEvents || []).find((item) => String(item.buttonEventId || item.id) === eventId);
    if (event) return event;
  }
  return null;
}
function applyPanelEvent(target, event) { Object.assign(target, { buttonEventId: String(event.buttonEventId), alias: event.alias === undefined ? target.alias : String(event.alias), details: structuredClone(event.details) }); }
function validKnobDetails(next, current) {
  if (!Array.isArray(next) || next.length !== current.length) return false;
  const known = new Map(current.map((item) => [String(item.id), Number(item.index)]));
  return next.every((item) => item && typeof item === "object" && known.get(String(item.id)) === Number(item.index));
}
function knobWriteUnavailable(device) {
  if (device.readOnly === true || device.editable !== true || device.capabilityStatus !== "write-proven") {
    return { status: 403, body: { success: false, code: "mock_device_read_only", message: `knob is read-only: ${device.id}` } };
  }
  if (device.online === false) {
    return { status: 403, body: { success: false, code: "mock_device_offline", message: `knob is offline: ${device.id}` } };
  }
  return null;
}
function ok(data) { return { status: 200, body: { success: true, code: 0, message: "success", data } }; }
function invalidHouse(value) { return { status: 400, body: { success: false, code: "mock_invalid_house", message: `unexpected houseId: ${value || "missing"}` } }; }
function missingDevice(id) { return { status: 404, body: { success: false, code: "mock_panel_device_not_found", message: `panel or knob not found: ${id}` } }; }
function missingEvent(id) { return { status: 404, body: { success: false, code: "mock_panel_event_not_found", message: `panel event not found: ${id}` } }; }
function invalidBody(message) { return { status: 400, body: { success: false, code: "mock_invalid_body", message } }; }
function methodNotAllowed(expected) { return { status: 405, body: { success: false, code: "mock_method_not_allowed", message: `expected ${expected}` } }; }
