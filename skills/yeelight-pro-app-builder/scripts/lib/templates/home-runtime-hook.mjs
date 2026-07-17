export function homeModelHookSource(spec, options = {}) {
  const houseId = JSON.stringify(String(spec?.scope?.homeIds?.[0] || ""));
  const deviceDirectory = options.deviceDirectory === true;
  const reactImports = deviceDirectory ? "useCallback, useEffect, useRef, useState" : "useCallback, useEffect, useState";
  const detailTypeSource = deviceDirectory ? `
export type ManagedAreaDetail = ManagedArea & { rooms: ManagedRoom[] };
export type ManagedRoomDetail = ManagedRoom & { deviceIds: string[]; scenes: Array<{ id: string; name: string }> };
export type ManagedDeviceDetail = ManagedDevice & { properties: Record<string, unknown> };` : "";
  const detailStateSource = deviceDirectory ? `
  const [areaDetails, setAreaDetails] = useState<Record<string, ManagedAreaDetail>>({});
  const [roomDetails, setRoomDetails] = useState<Record<string, ManagedRoomDetail>>({});
  const [spaceDetailLoading, setSpaceDetailLoading] = useState<Record<string, boolean>>({});
  const [spaceDetailErrors, setSpaceDetailErrors] = useState<Record<string, string>>({});
  const [deviceDetails, setDeviceDetails] = useState<Record<string, ManagedDeviceDetail>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const areaDetailCache = useRef<Record<string, ManagedAreaDetail>>({});
  const roomDetailCache = useRef<Record<string, ManagedRoomDetail>>({});
  const detailCache = useRef<Record<string, ManagedDeviceDetail>>({});` : "";
  const detailMethodsSource = deviceDirectory ? `
  const loadAreaDetail = useCallback(async (id: string, force = false) => {
    const key = "area:" + id;
    if (!force && areaDetailCache.current[id]) return areaDetailCache.current[id];
    setSpaceDetailLoading((current) => ({ ...current, [key]: true })); setSpaceDetailErrors((current) => ({ ...current, [key]: "" }));
    try {
      const response = await requestAction("area.detail.get", { locale: "zh-CN", utterance: "读取区域详情", targets: [{ entityType: "area", id }], parameters: { houseId: ${houseId}, areaId: id } });
      const body = await response.json();
      if (!response.ok || body.status !== "success") throw new Error(body.userMessage || "区域详情读取失败。");
      const raw = body?.result?.data?.detail; const summary = areas.find((item) => item.id === id);
      if (!raw || !summary) throw new Error("区域不存在或已被移除。");
      const detail = { ...summary, rooms: (Array.isArray(raw.rooms) ? raw.rooms : []).map((item: any) => rooms.find((room) => room.id === String(item.id || item.roomId))).filter(Boolean) } as ManagedAreaDetail;
      areaDetailCache.current[id] = detail; setAreaDetails((current) => ({ ...current, [id]: detail })); return detail;
    } catch { setSpaceDetailErrors((current) => ({ ...current, [key]: "暂时无法读取区域详情。已保留区域目录，请稍后重试。" })); return undefined; }
    finally { setSpaceDetailLoading((current) => ({ ...current, [key]: false })); }
  }, [areas, rooms]);
  const loadRoomDetail = useCallback(async (id: string, force = false) => {
    const key = "room:" + id;
    if (!force && roomDetailCache.current[id]) return roomDetailCache.current[id];
    setSpaceDetailLoading((current) => ({ ...current, [key]: true })); setSpaceDetailErrors((current) => ({ ...current, [key]: "" }));
    try {
      const response = await requestAction("room.detail.get", { locale: "zh-CN", utterance: "读取房间详情", targets: [{ entityType: "room", id }], parameters: { houseId: ${houseId}, roomId: id } });
      const body = await response.json();
      if (!response.ok || body.status !== "success") throw new Error(body.userMessage || "房间详情读取失败。");
      const raw = body?.result?.data?.detail; const summary = rooms.find((item) => item.id === id);
      if (!raw || !summary) throw new Error("房间不存在或已被移除。");
      const detail = { ...summary, deviceIds: (Array.isArray(raw.devices) ? raw.devices : []).map((item: any) => String(item.id || item.deviceId)), scenes: (Array.isArray(raw.scenes) ? raw.scenes : []).map((item: any) => ({ id: String(item.id), name: String(item.name || item.id) })) } as ManagedRoomDetail;
      roomDetailCache.current[id] = detail; setRoomDetails((current) => ({ ...current, [id]: detail })); return detail;
    } catch { setSpaceDetailErrors((current) => ({ ...current, [key]: "暂时无法读取房间详情。已保留房间设备，请稍后重试。" })); return undefined; }
    finally { setSpaceDetailLoading((current) => ({ ...current, [key]: false })); }
  }, [rooms]);
  const loadDeviceDetail = useCallback(async (id: string, force = false, summaryOverride?: ManagedDevice) => {
    if (!force && detailCache.current[id]) return detailCache.current[id];
    setDetailLoading((current) => ({ ...current, [id]: true }));
    setDetailErrors((current) => ({ ...current, [id]: "" }));
    try {
      const summary = summaryOverride || devices.find((device) => device.id === id);
      if (!summary) throw new Error("设备不存在或已被移除。");
      const response = await requestAction("device.detail.get", { locale: "zh-CN", utterance: "读取设备详情", targets: [{ entityType: "device", id }], parameters: { houseId: ${houseId}, deviceId: id } });
      const body = await response.json();
      if (!response.ok || body.status !== "success") throw new Error(body.userMessage || "设备详情读取失败。");
      const raw = body?.result?.data?.detail;
      if (!raw || typeof raw !== "object") throw new Error("设备详情返回不完整。");
      const detailProperties = raw.properties && typeof raw.properties === "object" ? raw.properties as Record<string, unknown> : {};
      let liveProperties: Record<string, unknown> = {};
      try {
        const stateResponse = await requestAction("state.query", { locale: "zh-CN", utterance: "读取设备实时状态", targets: [{ entityType: "device", id }], parameters: { houseId: ${houseId}, deviceId: id } });
        const stateBody = await stateResponse.json();
        if (stateResponse.ok && ["success", "partial"].includes(String(stateBody.status || "")) && stateBody?.result?.properties && typeof stateBody.result.properties === "object") liveProperties = stateBody.result.properties as Record<string, unknown>;
      } catch { /* 保留摘要和详情中的最近可信状态。 */ }
      const properties = { ...(summary.state || {}), ...detailProperties, ...liveProperties };
      const protocols = [...new Set([...(summary.protocols || []), ...(properties.matterLinked === true ? ["matter"] : []), ...((properties.daliVersion || properties.daliDeviceType !== undefined || properties.daliSwitchType !== undefined) ? ["dali"] : [])])];
      const rawRoomId = String(raw.roomId || summary.roomId); const resolvedRoom = rooms.find((room) => room.id === rawRoomId);
      const rawName = String(raw.name || summary.name); const displayName = rawName.replace(/^(light|curtain|sensor|panel|gateway|knob|climate|switch|matter|dali|other)-/i, "").replace(/-\\d{6,}-\\d{2}$/i, "");
      const detail = { ...summary, name: rawName, displayName, roomId: rawRoomId, roomName: resolvedRoom?.name || summary.roomName, areaId: resolvedRoom?.areaId || summary.areaId, areaName: resolvedRoom?.areaName || summary.areaName, protocols, online: typeof properties.online === "boolean" ? properties.online : summary.online, properties };
      detailCache.current[id] = detail;
      setDeviceDetails((current) => ({ ...current, [id]: detail }));
      return detail;
    } catch {
      setDetailErrors((current) => ({ ...current, [id]: "暂时无法读取设备详情。已保留设备摘要，请稍后重试。" }));
      return undefined;
    } finally {
      setDetailLoading((current) => ({ ...current, [id]: false }));
    }
  }, [devices, rooms]);
  const refreshDevice = useCallback(async (id: string, statePatch: Record<string, unknown> = {}) => {
    const summary = devices.find((device) => device.id === id);
    const detail = await loadDeviceDetail(id, true, summary);
    if (!detail) return undefined;
    const patched = { ...detail, state: { ...(detail.state || {}), ...statePatch }, properties: { ...detail.properties, ...statePatch } };
    detailCache.current[id] = patched;
    setDeviceDetails((current) => ({ ...current, [id]: patched }));
    setDevices((current) => current.map((device) => device.id === id ? { ...device, ...patched } : device));
    return patched;
  }, [devices, loadDeviceDetail]);` : "";
  const detailReturnSource = deviceDirectory ? ", areaDetails, roomDetails, spaceDetailLoading, spaceDetailErrors, loadAreaDetail, loadRoomDetail, deviceDetails, detailLoading, detailErrors, loadDeviceDetail, refreshDevice" : "";
  return `import { ${reactImports} } from "react";
import runtimeLock from "../generated/runtime-lock.json";
import { requestAction } from "./request";

export type ManagedArea = { id: string; name: string };
export type ManagedRoom = { id: string; name: string; areaId: string; areaName: string };
export type ManagedDevice = { id: string; name: string; displayName?: string; roomId: string; roomName: string; areaId: string; areaName: string; family: string; modelName: string; protocols: string[]; online: boolean; access: "write" | "read-only" | "version-mismatch"; readOnly?: boolean; capabilityStatus?: string; state?: Record<string, unknown>; controls: Array<{ id: string; intent: string; property?: string; evidence: string }> };${detailTypeSource}
const lock = runtimeLock as any;
const initialAreas = Object.values(lock.areas || {}) as ManagedArea[];
const initialAreaNames = new Map<string, string>(initialAreas.map((area) => [area.id, area.name]));
const initialRooms = (Object.values(lock.rooms || {}) as any[]).map((room) => ({ id: String(room.id), name: String(room.name || room.id), areaId: String(room.areaId || ""), areaName: initialAreaNames.get(String(room.areaId || "")) || "未分区" })) as ManagedRoom[];
const initialRoomById = new Map<string, ManagedRoom>(initialRooms.map((room) => [room.id, room]));
const initialDevices = (Object.values(lock.entities || {}) as any[]).map((entity) => {
  const metadata = entity as Record<string, unknown>;
  const state = entity.state as Record<string, unknown> | undefined;
  const online = typeof state?.online === "boolean" ? state.online : typeof state?.airConditionerOnline === "boolean" ? state.airConditionerOnline : metadata.online;
  const room = initialRoomById.get(String(entity.roomId || ""));
  const controls = Array.isArray(entity.controls) ? entity.controls : [];
  const protocols = Array.isArray(entity.protocols) ? entity.protocols.map((value: any) => typeof value === "string" ? value : value?.id).filter(Boolean) : [];
  return { ...entity, id: String(entity.id), name: String(entity.name || entity.id), displayName: String(entity.displayName || entity.name || entity.id), roomId: String(entity.roomId || ""), roomName: room?.name || String(entity.roomName || "未分配"), areaId: room?.areaId || "", areaName: room?.areaName || "未分区", family: String(entity.family || "other"), modelName: String(entity.modelName || entity.typeName || ""), protocols, online: online !== false, access: entity.capabilityStatus === "version-mismatch" ? "version-mismatch" : entity.readOnly === true ? "read-only" : controls.length ? "write" : "read-only", controls };
}) as ManagedDevice[];

export function useHomeModel() {
  const [areas, setAreas] = useState(initialAreas);
  const [rooms, setRooms] = useState(initialRooms);
  const [devices, setDevices] = useState(initialDevices);${detailStateSource}
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await requestAction("entity.list", { locale: "zh-CN", utterance: "同步家庭空间和设备", parameters: { houseId: ${houseId} } });
      const body = await response.json();
      if (!response.ok || !["success", "partial"].includes(String(body.status || ""))) throw new Error(body.userMessage || "家庭空间同步失败。");
      const entities = Array.isArray(body?.result?.entities) ? body.result.entities : [];
      const nextAreas = entities.filter((item: any) => (item.entityType || item.type) === "area").map((item: any) => ({ id: String(item.id), name: String(item.name || item.id) }));
      const resolvedAreas = nextAreas.length ? nextAreas : areas;
      const areaNames = new Map<string, string>(resolvedAreas.map((area: ManagedArea) => [area.id, area.name]));
      const nextRooms = entities.filter((item: any) => (item.entityType || item.type) === "room").map((item: any) => { const known = initialRooms.find((room) => room.id === String(item.id)); const areaId = String(item.areaId || known?.areaId || ""); return { id: String(item.id), name: String(item.name || known?.name || item.id), areaId, areaName: areaNames.get(areaId) || known?.areaName || "未分区" }; });
      const roomNames = new Map<string, ManagedRoom>(nextRooms.map((room: ManagedRoom) => [room.id, room]));
      const previous = new Map<string, ManagedDevice>(initialDevices.map((device) => [device.id, device]));
      const nextDevices = entities.filter((item: any) => (item.entityType || item.type) === "device").map((item: any) => { const known = previous.get(String(item.id)); const room = roomNames.get(String(item.roomId || known?.roomId || "")); return { ...known, id: String(item.id), name: String(item.name || known?.name || item.id), displayName: String(item.name || known?.displayName || known?.name || item.id).replace(/^(light|curtain|sensor|panel|gateway|knob|climate|switch|matter|dali|other)-/i, "").replace(/-\\d{6,}-\\d{2}$/i, ""), roomId: String(item.roomId || known?.roomId || ""), roomName: room?.name || known?.roomName || "未分配", areaId: room?.areaId || known?.areaId || "", areaName: room?.areaName || known?.areaName || "未分区", family: String(item.family || known?.family || "other"), modelName: String(item.modelName || item.typeName || known?.modelName || ""), protocols: Array.isArray(item.protocols) ? item.protocols.map((value: any) => typeof value === "string" ? value : value?.id).filter(Boolean) : known?.protocols || [], online: item.online !== false, access: known?.access || "read-only", controls: known?.controls || [] }; });
      setAreas(resolvedAreas); setRooms(nextRooms); setDevices(nextDevices); return nextDevices;
    } catch { setError("暂时无法同步部分家庭数据。已保留最近一次可信状态，请稍后重试。"); return undefined; } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);${detailMethodsSource}
  return { areas, rooms, devices, loading, error, refresh${detailReturnSource} };
}
`;
}
