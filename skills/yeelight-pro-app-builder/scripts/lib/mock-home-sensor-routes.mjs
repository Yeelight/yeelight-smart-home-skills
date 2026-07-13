const eventFilterKeys = ["deviceId", "sensorId", "eventId", "name", "status", "valid"];
const allowedEventBodyKeys = new Set(["houseId", ...eventFilterKeys]);

export function routeSensorRequest({ method, apiPath, body, fixture }) {
  if (apiPath === "/v1/device/r/sensors") {
    if (method !== "POST") return methodNotAllowed("POST");
    if (String(body?.houseId || "") !== fixture.home.id) return invalidHouse(body?.houseId);
    return ok(fixture.devices.filter((device) => device.family === "sensor").map((device) => ({
      id: device.id,
      deviceId: device.id,
      sensorId: device.id,
      name: device.name,
      houseId: fixture.home.id,
      roomId: device.roomId,
      gatewayDeviceId: device.gatewayDeviceId,
      status: device.online ? "online" : "offline",
      valid: true,
    })));
  }
  if (apiPath !== "/v1/sensor/r/events") return null;
  if (method !== "POST") return methodNotAllowed("POST");
  if (String(body?.houseId || "") !== fixture.home.id) return invalidHouse(body?.houseId);
  if (body && Object.keys(body).some((key) => !allowedEventBodyKeys.has(key))) return invalidBody("unsupported sensor event filter");
  return ok((fixture.sensorEvents || []).filter((event) => eventFilterKeys.every((key) => (
    body?.[key] === undefined || String(event[key]) === String(body[key])
  ))).map((event) => ({ ...event })));
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
