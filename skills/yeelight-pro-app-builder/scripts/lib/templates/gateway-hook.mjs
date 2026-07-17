export function gatewaysHookSource(spec, operations = {}) {
  const houseId = JSON.stringify(String(spec?.scope?.homeIds?.[0] || ""));
  const intents = Object.fromEntries(Object.entries(operations).map(([name, operation]) => [name, operation.enabled ? operation.intent : ""]));
  const deleteGateway = operations.delete?.enabled ? `
  const deleteGateway = useCallback(async (gatewayId: string, gatewayName: string) => {
    setSaving(true); setFeedback(""); setErrors((current) => ({ ...current, [gatewayId + ":delete"]: "" }));
    try {
      const parameters = { houseId: ${houseId}, gatewayId, name: gatewayName, confirmed: true };
      await invoke(intents.delete, parameters, { previewOnly: true });
      await invoke(intents.delete, parameters);
      await refresh();
      const readback = rows(await invoke(intents.list, { houseId: ${houseId}, pageNo: 1, pageSize: 100 }));
      if (readback.some((gateway: any) => idOf(gateway) === gatewayId)) throw new Error("delete readback mismatch");
      setFeedback("网关已移除，并已重新读取家庭网关列表确认。"); setSaving(false); return true;
    } catch {
      setErrors((current) => ({ ...current, [gatewayId + ":delete"]: "网关移除失败，请确认家庭连接后重试。确认名称已保留。" }));
      setFeedback("网关未移除。"); setSaving(false); return false;
    }
  }, [refresh]);` : "";
  const deleteBinding = operations.delete?.enabled ? ", deleteGateway" : "";
  return `import { useCallback, useEffect, useState } from "react";
import runtimeLock from "../generated/runtime-lock.json";
import { requestAction } from "./request";

export type GatewayErrors = Record<string, string>;
type Room = { id: string; name: string };
type Gateway = { id: string; name: string; roomName?: string; roomIds?: string[]; online: boolean; model?: string; firmwareVersion?: string; configCount?: number; supportedBridgeType?: string[]; deviceCount?: number; roomCount?: number; threadInfo?: Record<string, unknown>; sceneRelations?: string[]; diagnosis?: Record<string, unknown> };
const initialGateways = (runtimeLock.gateways || []) as Gateway[];
const roomRows = Array.isArray(runtimeLock.rooms) ? runtimeLock.rooms : Object.values(runtimeLock.rooms || {});
const rooms = roomRows.map((room: any) => ({ id: String(room.id || room.roomId || ""), name: String(room.name || room.roomName || "未命名空间") })).filter((room: Room) => room.id);
const intents = ${JSON.stringify(intents)} as Record<string, string>;

async function invoke(intent: string, parameters: Record<string, unknown>, options: Record<string, unknown> = {}, includeMeta = false) {
  if (!intent) throw new Error("当前应用未启用此操作。");
  const response = await requestAction(intent, { locale: "zh-CN", utterance: "管理家庭网关", parameters, options });
  const payload = await response.json();
  if (!response.ok || !["success", "partial"].includes(payload.status)) throw new Error(payload.userMessage || "网关操作失败。");
  const data = payload?.result?.data || payload?.result || {};
  return includeMeta ? { ...data, status: payload.status, summary: payload.userMessage, unknownEvidence: Array.isArray(data.unknownEvidence) ? data.unknownEvidence : [] } : data;
}

function rows(data: any) { return Array.isArray(data?.gateways) ? data.gateways : Array.isArray(data) ? data : []; }
function idOf(item: any) { return String(item?.id || item?.gatewayId || item?.deviceId || ""); }
function message(scope: string) { return scope + "同步失败，请重试。当前已保留最近一次数据。"; }
function relations(data: any) { const value = data?.sceneIds || data?.relations || data?.sceneRelations || data; return Array.isArray(value) ? value.map((item) => String(item?.id || item?.sceneId || item)).filter(Boolean) : []; }
function diagnosis(data: any) { return data?.diagnosis || data?.diagnose || data?.detail || data || {}; }

export function useGateways() {
  const [gateways, setGateways] = useState<Gateway[]>(initialGateways);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<GatewayErrors>({}); const [feedback, setFeedback] = useState("");
  const loadGateway = useCallback(async (gatewayId: string) => {
    const nextErrors: GatewayErrors = {};
    const jobs = await Promise.allSettled([
      invoke(intents.detail, { houseId: ${houseId}, gatewayId }),
      invoke(intents.thread, { houseId: ${houseId}, gatewayId }),
      invoke(intents.relations, { houseId: ${houseId}, gatewayId }),
      invoke(intents.diagnose, { houseId: ${houseId}, gatewayId }, {}, true),
    ]);
    setGateways((current) => current.map((gateway) => {
      if (gateway.id !== gatewayId) return gateway;
      const detail = jobs[0].status === "fulfilled" ? jobs[0].value?.detail || jobs[0].value : {};
      const threadInfo = jobs[1].status === "fulfilled" ? jobs[1].value?.threadInfo || jobs[1].value : gateway.threadInfo;
      return { ...gateway, ...detail, id: gateway.id, name: String(detail.name || gateway.name), online: Boolean(detail.online ?? gateway.online), roomIds: Array.isArray(detail.roomIds) ? detail.roomIds.map(String) : gateway.roomIds, supportedBridgeType: Array.isArray(detail.supportedBridgeType) ? detail.supportedBridgeType : gateway.supportedBridgeType, threadInfo, sceneRelations: jobs[2].status === "fulfilled" ? relations(jobs[2].value) : gateway.sceneRelations, diagnosis: jobs[3].status === "fulfilled" ? diagnosis(jobs[3].value) : gateway.diagnosis };
    }));
    if (jobs[0].status === "rejected") nextErrors[gatewayId + ":detail"] = message("网关详情");
    if (jobs[1].status === "rejected") nextErrors[gatewayId + ":thread"] = message("Thread 网络");
    if (jobs[2].status === "rejected") nextErrors[gatewayId + ":relations"] = message("情景关系");
    if (jobs[3].status === "rejected") nextErrors[gatewayId + ":diagnose"] = message("运行诊断");
    setErrors((current) => ({ ...current, ...nextErrors, ...(Object.keys(nextErrors).length === 0 ? { [gatewayId + ":detail"]: "", [gatewayId + ":thread"]: "", [gatewayId + ":relations"]: "", [gatewayId + ":diagnose"]: "" } : {}) }));
  }, []);
  const refresh = useCallback(async () => {
    setLoading(true); const nextErrors: GatewayErrors = {};
    const [listResult, statsResult] = await Promise.allSettled([invoke(intents.list, { houseId: ${houseId}, pageNo: 1, pageSize: 100 }), invoke(intents.stats, { houseId: ${houseId} })]);
    const listed = listResult.status === "fulfilled" ? rows(listResult.value) : [];
    const stats = statsResult.status === "fulfilled" ? rows(statsResult.value) : [];
    if (listResult.status === "rejected") nextErrors.list = message("网关列表");
    if (statsResult.status === "rejected") nextErrors.stats = message("网关统计");
    const statsById = new Map(stats.map((item: any) => [idOf(item), item]));
    const base: Gateway[] = (listed.length ? listed : gateways.length ? gateways : initialGateways).map((item: any) => { const id = idOf(item); const known = gateways.find((gateway) => gateway.id === id) || initialGateways.find((gateway) => gateway.id === id); const stat: any = statsById.get(id) || {}; return { ...known, ...item, id, name: String(item.name || known?.name || id), online: Boolean(item.online ?? known?.online), deviceCount: Number(stat.deviceCount ?? stat.deviceNum ?? known?.deviceCount ?? 0), roomCount: Number(stat.roomCount ?? stat.roomNum ?? known?.roomCount ?? 0) } as Gateway; }).filter((item: Gateway) => item.id);
    setGateways(base); setErrors(nextErrors);
    await Promise.allSettled(base.map((gateway) => loadGateway(gateway.id)));
    setLoading(false);
  }, [gateways, loadGateway]);
  const configureGateway = useCallback(async (gatewayId: string, input: { name: string; roomIds: string[] }) => {
    setSaving(true); setFeedback(""); setErrors((current) => ({ ...current, [gatewayId + ":configure"]: "" }));
    try {
      const parameters = { houseId: ${houseId}, gatewayId, name: input.name, roomIds: input.roomIds };
      await invoke(intents.configure, parameters, { previewOnly: true });
      await invoke(intents.configure, parameters);
      await loadGateway(gatewayId);
      setFeedback("网关设置已保存并重新读取确认。"); setSaving(false); return true;
    } catch {
      setErrors((current) => ({ ...current, [gatewayId + ":configure"]: "网关设置保存失败，请检查后重试。输入内容已保留。" }));
      setFeedback("网关设置未保存。"); setSaving(false); return false;
    }
  }, [loadGateway]);
${deleteGateway}
  useEffect(() => { void refresh(); }, []);
  return { gateways, rooms, loading, saving, errors, feedback, refresh, loadGateway, configureGateway${deleteBinding} };
}
`;
}
