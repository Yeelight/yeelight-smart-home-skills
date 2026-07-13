const DEFAULT_WINDOW = 24;
const DEFAULT_FILTER = "all";

export function parseSpaceLocation(location) {
  const [rawPath, rawQuery = ""] = String(location || "").replace(/^#/, "").split("?", 2);
  const segments = rawPath.split("/").filter(Boolean);
  const page = ["overview", "spaces", "devices"].includes(segments[0]) ? segments[0] : "overview";
  const resource = page === "devices" && segments[1]
    ? "device"
    : page === "spaces" && segments[1] === "areas" && segments[2]
      ? "area"
      : page === "spaces" && segments[1] === "rooms" && segments[2]
        ? "room"
        : null;
  const entityId = resource === "device" ? segments[1] : resource ? segments[2] : null;
  const query = new URLSearchParams(rawQuery);
  return {
    page,
    resource,
    entityId,
    query: query.get("q") || "",
    areaId: query.get("area") || DEFAULT_FILTER,
    roomId: query.get("room") || DEFAULT_FILTER,
    family: query.get("family") || DEFAULT_FILTER,
    protocol: query.get("protocol") || DEFAULT_FILTER,
    status: query.get("status") || DEFAULT_FILTER,
    window: positiveWindow(query.get("window")),
  };
}

export function serializeSpaceLocation(route) {
  const path = route.resource === "device" && route.entityId
    ? `devices/${route.entityId}`
    : route.resource === "area" && route.entityId
      ? `spaces/areas/${route.entityId}`
      : route.resource === "room" && route.entityId
        ? `spaces/rooms/${route.entityId}`
        : route.page || "overview";
  const query = new URLSearchParams();
  appendQuery(query, "q", route.query, "");
  appendQuery(query, "area", route.areaId, DEFAULT_FILTER);
  appendQuery(query, "room", route.roomId, DEFAULT_FILTER);
  appendQuery(query, "family", route.family, DEFAULT_FILTER);
  appendQuery(query, "protocol", route.protocol, DEFAULT_FILTER);
  appendQuery(query, "status", route.status, DEFAULT_FILTER);
  if (Number(route.window) !== DEFAULT_WINDOW) query.set("window", String(positiveWindow(route.window)));
  const suffix = query.toString();
  return `#${path}${suffix ? `?${suffix}` : ""}`;
}

export function normalizeManagedDirectory(runtimeLock = {}) {
  const areas = values(runtimeLock.areas).map((area) => ({ id: String(area.id), name: String(area.name || area.id) }));
  const areaNames = new Map(areas.map((area) => [area.id, area.name]));
  const rooms = values(runtimeLock.rooms).map((room) => ({
    id: String(room.id),
    name: String(room.name || room.id),
    areaId: String(room.areaId || ""),
    areaName: areaNames.get(String(room.areaId || "")) || "未分区",
  }));
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const devices = values(runtimeLock.entities)
    .filter((entity) => (entity.entityType || entity.type) === "device")
    .map((device) => {
      const room = roomById.get(String(device.roomId || ""));
      const controls = Array.isArray(device.controls) ? device.controls : [];
      return {
        ...device,
        id: String(device.id),
        name: String(device.name || device.id),
        displayName: String(device.displayName || device.name || device.id),
        roomId: String(device.roomId || ""),
        roomName: room?.name || String(device.roomName || "未分配"),
        areaId: room?.areaId || "",
        areaName: room?.areaName || "未分区",
        family: String(device.family || "other"),
        modelName: String(device.modelName || device.typeName || ""),
        protocols: explicitProtocols(device.protocols),
        online: device.online !== false && device.state?.online !== false,
        access: device.capabilityStatus === "version-mismatch" ? "version-mismatch" : device.readOnly === true ? "read-only" : controls.length ? "write" : "read-only",
        controls,
      };
    });
  return { areas, rooms, devices };
}

export function filterManagedDevices(devices, filters = {}) {
  const query = String(filters.query || "").trim().toLocaleLowerCase("zh-CN");
  return devices.filter((device) => {
    const searchable = [device.displayName, device.name, device.roomName, device.areaName, device.family, device.modelName, ...(device.protocols || [])]
      .join(" ")
      .toLocaleLowerCase("zh-CN");
    return (!query || searchable.includes(query))
      && matches(filters.areaId, device.areaId)
      && matches(filters.roomId, device.roomId)
      && matches(filters.family, device.family)
      && matchesProtocol(filters.protocol, device.protocols)
      && matchesStatus(filters.status, device);
  });
}

export function visibleDeviceWindow(devices, requestedWindow) {
  return devices.slice(0, Math.min(devices.length, positiveWindow(requestedWindow)));
}

function appendQuery(query, key, value, defaultValue) {
  if (value !== undefined && value !== null && String(value) !== defaultValue && String(value) !== "") query.set(key, String(value));
}

function positiveWindow(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(DEFAULT_WINDOW, parsed) : DEFAULT_WINDOW;
}

function values(value) {
  return Array.isArray(value) ? value : Object.values(value || {});
}

function explicitProtocols(protocols) {
  if (!Array.isArray(protocols)) return [];
  return [...new Set(protocols.map((protocol) => typeof protocol === "string" ? protocol : protocol?.id).filter(Boolean).map((protocol) => String(protocol).toLowerCase()))];
}

function matches(filter, value) {
  return !filter || filter === DEFAULT_FILTER || filter === value;
}

function matchesProtocol(filter, protocols = []) {
  return !filter || filter === DEFAULT_FILTER || protocols.includes(filter);
}

function matchesStatus(filter, device) {
  if (!filter || filter === DEFAULT_FILTER) return true;
  if (filter === "online") return device.online;
  if (filter === "offline") return !device.online;
  return device.access === filter;
}
