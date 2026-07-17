export function groupsHookSource(spec, operations = {}) {
  const houseId = JSON.stringify(String(spec?.scope?.homeIds?.[0] || ""));
  const detailEnabled = operations.detail?.enabled === true;
  const createEnabled = operations.create?.enabled === true;
  const updateEnabled = operations.update?.enabled === true;
  const membersEnabled = operations.members?.enabled === true;
  const deleteEnabled = operations.delete?.enabled === true;
  const detailSource = detailEnabled ? groupDetailSource(houseId) : "";
  const mutationSource = groupMutationSource({ houseId, createEnabled, updateEnabled, membersEnabled, deleteEnabled });
  const returnFields = [detailEnabled && "details, detailLoading, detailErrors, loadDetail", createEnabled && "previewCreate, createGroup", updateEnabled && "previewUpdate, updateGroup", membersEnabled && "updateMembers", deleteEnabled && "previewDelete, deleteGroup"].filter(Boolean).join(", ");
  return `import { useCallback, useEffect, useState } from "react";
import runtimeLock from "../generated/runtime-lock.json";
import { requestAction } from "./request";

export type GroupDevice = { id: string; name: string; displayName?: string; roomId?: string; roomName: string; family: string };
export type GroupRoom = { id: string; name: string };
export type GroupItem = { id: string; name: string; description?: string; icon?: string; roomId?: string; roomName: string; groupCapability?: string; groupCategory?: string; componentId?: number; deviceIds: string[]; eligibleDeviceIds: string[]; editable: boolean; evidence?: string; membersUnavailableReason?: string };
export type GroupDetail = GroupItem & { devices: GroupDevice[] };
export type GroupDraft = { name: string; description: string; icon: string; roomId: string; groupCapability: string; groupCategory: string; deviceIds: string[] };
export type GroupOperationResult = { message: string; groupId?: string; preview?: Record<string, unknown> };

export const groupDevices = Object.values(runtimeLock.entities || {}) as GroupDevice[];
export const groupRooms = Object.values(runtimeLock.rooms || {}) as GroupRoom[];
const initialGroups = (runtimeLock.groups || []) as GroupItem[];
const capabilityById = new Map(initialGroups.map((group) => [group.id, group]));

function groupError(cause: unknown, fallback: string) { const detail = cause instanceof Error ? cause.message : String(cause || ""); if (/mismatch|verification/i.test(detail)) return "保存结果未能完成验证，当前更改已保留，请重试。"; return /invoke:|endpoint returned HTTP|fetch failed|ECONN|Runtime|Bridge|家庭连接不可用/i.test(detail) ? fallback : detail || fallback; }
async function invokeGroup(intent: string, payload: Record<string, unknown>) { const response = await requestAction(intent, payload); const body = await response.json(); if (!response.ok || body.status !== "success") throw new Error(groupError(body.userMessage || body?.error?.message, "家庭服务暂时无法完成设备组操作，请保留当前更改后重试。")); return body; }
function listRows(body: any) { const candidates = [body?.result?.data?.groups, body?.result?.groups, body?.result?.data]; return candidates.find(Array.isArray) || []; }
function normalizeGroup(item: any): GroupItem { const id = String(item.id || item.groupId || ""); const known = capabilityById.get(id); const componentId = Number(item.componentId || item.cid || known?.componentId || 0); const groupCapability = String(item.groupCapability || known?.groupCapability || capabilityFromComponent(componentId)); return { ...known, ...item, id, name: String(item.name || known?.name || id), description: String(item.description || item.desc || known?.description || ""), icon: String(item.icon || known?.icon || "layers"), roomId: String(item.roomId || known?.roomId || ""), roomName: known?.roomName || groupRooms.find((room) => room.id === String(item.roomId || known?.roomId || ""))?.name || "全屋", groupCapability, groupCategory: String(item.groupCategory || known?.groupCategory || (groupCapability === "light" ? "lighting" : groupCapability === "curtain" ? "shading" : groupCapability === "sensor" ? "environment" : "infrastructure")), componentId, deviceIds: (item.deviceIds || known?.deviceIds || []).map(String), eligibleDeviceIds: known?.eligibleDeviceIds || groupDevices.filter((device) => device.family === groupCapability || (groupCapability === "infrastructure" && device.family === "gateway")).map((device) => device.id), editable: known?.editable !== false }; }
function capabilityFromComponent(value: number) { return value === 5 ? "light" : value === 12 ? "curtain" : value === 20 || value === 21 ? "sensor" : value === 30 ? "infrastructure" : "custom"; }

export function useGroups() {
  const [groups, setGroups] = useState<GroupItem[]>(initialGroups); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
${detailEnabled ? `  const [details, setDetails] = useState<Record<string, GroupDetail>>({}); const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({}); const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});` : ""}
  const refresh = useCallback(async () => { setLoading(true); setError(""); try { const body = await invokeGroup("group.list", { locale: "zh-CN", utterance: "同步家庭设备组", parameters: { houseId: ${houseId}, pageNo: 1, pageSize: 100 } }); const next = listRows(body).map(normalizeGroup).filter((item: GroupItem) => item.id); setGroups(next); return next; } catch (cause) { setError(groupError(cause, "家庭服务暂时无法同步设备组，请稍后重试。")); return groups; } finally { setLoading(false); } }, [groups]);
  useEffect(() => { void refresh(); }, []);
${detailSource}
${mutationSource}
  return { groups, devices: groupDevices, rooms: groupRooms, loading, error, refresh${returnFields ? `, ${returnFields}` : ""} };
}
`;
}

function groupDetailSource(houseId) {
  return `  const loadDetail = useCallback(async (groupId: string, force = false) => { if (!groupId || (!force && details[groupId])) return details[groupId]; setDetailLoading((items) => ({ ...items, [groupId]: true })); setDetailErrors((items) => ({ ...items, [groupId]: "" })); try { const body = await invokeGroup("group.detail.get", { locale: "zh-CN", utterance: "查看设备组详情", targets: [{ entityType: "group", id: groupId }], parameters: { houseId: ${houseId}, groupId } }); const data = body?.result?.data || body?.result || {}; const raw = data.detail || data; const devices = (raw.devices || []).map((device: any) => groupDevices.find((item) => item.id === String(device.id || device.deviceId)) || { id: String(device.id || device.deviceId), name: String(device.name || device.id), roomName: "", family: String(device.family || "unknown") }); const base = normalizeGroup(raw); const inferred = base.groupCapability === "custom" ? String(devices[0]?.family || "custom") : base.groupCapability; const next = { ...base, groupCapability: inferred, eligibleDeviceIds: base.eligibleDeviceIds.length ? base.eligibleDeviceIds : groupDevices.filter((device) => device.family === inferred || (inferred === "infrastructure" && device.family === "gateway")).map((device) => device.id), deviceIds: devices.map((device: GroupDevice) => device.id), devices } as GroupDetail; setDetails((items) => ({ ...items, [groupId]: next })); return next; } catch (cause) { setDetailErrors((items) => ({ ...items, [groupId]: groupError(cause, "暂时无法读取此设备组，请稍后重试。") })); return undefined; } finally { setDetailLoading((items) => ({ ...items, [groupId]: false })); } }, [details]);`;
}

function groupMutationSource({ houseId, createEnabled, updateEnabled, membersEnabled, deleteEnabled }) {
  const blocks = [];
  if (createEnabled) blocks.push(`  const previewCreate = useCallback(async (draft: GroupDraft) => { const body = await invokeGroup("group.create", { locale: "zh-CN", utterance: "预览创建设备组", options: { previewOnly: true }, parameters: { houseId: ${houseId}, ...draft } }); return { message: body.userMessage, preview: body?.result?.preview || {} }; }, []);
  const createGroup = useCallback(async (draft: GroupDraft) => { const body = await invokeGroup("group.create", { locale: "zh-CN", utterance: "创建设备组" + draft.name, parameters: { houseId: ${houseId}, ...draft } }); const next = await refresh(); const groupId = String(body?.result?.entityId || body?.result?.groupId || next.find((item) => item.name === draft.name)?.id || ""); if (!groupId || !next.some((item) => item.id === groupId)) throw new Error("create verification mismatch"); return { message: body.userMessage || "设备组已创建", groupId }; }, [refresh]);`);
  if (updateEnabled) blocks.push(`  const previewUpdate = useCallback(async (groupId: string, draft: GroupDraft) => { const body = await invokeGroup("group.update", { locale: "zh-CN", utterance: "预览更新设备组", options: { previewOnly: true }, targets: [{ entityType: "group", id: groupId }], parameters: { houseId: ${houseId}, groupId, name: draft.name, description: draft.description, icon: draft.icon, roomId: draft.roomId } }); return { message: body.userMessage, groupId, preview: body?.result?.preview || {} }; }, []);
  const updateGroup = useCallback(async (groupId: string, draft: GroupDraft) => { const body = await invokeGroup("group.update", { locale: "zh-CN", utterance: "更新设备组" + draft.name, targets: [{ entityType: "group", id: groupId }], parameters: { houseId: ${houseId}, groupId, name: draft.name, description: draft.description, icon: draft.icon, roomId: draft.roomId } }); const detail = await loadDetail(groupId, true); if (!detail || detail.name !== draft.name || detail.roomId !== draft.roomId) throw new Error("update verification mismatch"); await refresh(); return { message: body.userMessage || "设备组信息已更新", groupId }; }, [loadDetail, refresh]);`);
  if (membersEnabled) blocks.push(`  const updateMembers = useCallback(async (group: GroupItem, deviceIds: string[]) => { try { const request = { locale: "zh-CN", utterance: "更新" + group.name + "成员", targets: [{ entityType: "group", id: group.id }], parameters: { houseId: ${houseId}, groupId: group.id, deviceIds } }; await invokeGroup("group.members.update", { ...request, options: { previewOnly: true } }); await invokeGroup("group.members.update", request); const detail = await loadDetail(group.id, true); const verified = (detail?.deviceIds || []).map(String).sort(); if (verified.join(",") !== [...deviceIds].sort().join(",")) throw new Error("member verification mismatch"); setGroups((items) => items.map((item) => item.id === group.id ? { ...item, deviceIds: verified } : item)); } catch (cause) { throw new Error(groupError(cause, "设备组成员保存失败，当前选择已保留，请重试。")); } }, [loadDetail]);`);
  if (deleteEnabled) blocks.push(`  const previewDelete = useCallback(async (group: GroupItem) => { const body = await invokeGroup("group.delete", { locale: "zh-CN", utterance: "预览删除设备组" + group.name, options: { previewOnly: true }, targets: [{ entityType: "group", id: group.id }], parameters: { houseId: ${houseId}, groupId: group.id, confirmed: true } }); return { message: body.userMessage, groupId: group.id, preview: body?.result?.preview || {} }; }, []);
  const deleteGroup = useCallback(async (group: GroupItem) => { const body = await invokeGroup("group.delete", { locale: "zh-CN", utterance: "确认删除设备组" + group.name, targets: [{ entityType: "group", id: group.id }], parameters: { houseId: ${houseId}, groupId: group.id, confirmed: true } }); const next = await refresh(); if (next.some((item) => item.id === group.id)) throw new Error("delete verification mismatch"); setDetails((items) => { const copy = { ...items }; delete copy[group.id]; return copy; }); return body.userMessage || "设备组已删除"; }, [refresh]);`);
  return blocks.join("\n");
}
