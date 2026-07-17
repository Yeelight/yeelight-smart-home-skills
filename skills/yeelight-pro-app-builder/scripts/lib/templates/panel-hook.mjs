export function panelsHookSource(spec, operations = {}) {
  const houseId = JSON.stringify(String(spec?.scope?.homeIds?.[0] || ""));
  const intents = Object.fromEntries(Object.entries(operations).map(([name, operation]) => [name, operation.enabled ? operation.intent : ""]));
  const availability = Object.fromEntries(Object.entries(operations).map(([name, operation]) => [name, { enabled: operation.enabled, message: operation.userMessage }]));
  return `import { useCallback, useEffect, useState } from "react";
import runtimeLock from "../generated/runtime-lock.json";
import { requestAction } from "./request";

export type PanelEvent = { id: string; name: string; alias: string; type: number; details: { resId: string; typeId: number }[] };
export type PanelButton = { id: string; name: string; alias: string; index: number; keyValue: number; buttonType: number; targetId: string; targetType: string; currentRow: Record<string, unknown>; events: PanelEvent[] };
export type PanelItem = { id: string; name: string; roomName: string; online: boolean; typeName?: string; gatewayDeviceId?: string; buttons: PanelButton[] };
export type KnobItem = { id: string; name: string; roomName: string; online: boolean; editable: false; unsupportedReason: string; actions: { targetId: string }[] };
export type TargetOption = { id: string; name: string; type: "scene" | "group" };
type Errors = Record<string, string>;
const initialPanels = (runtimeLock.panels || []) as PanelItem[];
const initialKnobs = (runtimeLock.knobs || []) as KnobItem[];
const intents = ${JSON.stringify(intents)} as Record<string, string>;
export const panelAvailability = ${JSON.stringify(availability)} as Record<string, { enabled: boolean; message: string }>;
const targets: TargetOption[] = [
  ...((runtimeLock.scenes || []) as any[]).map((item) => ({ id: String(item.id || item.sceneId || ""), name: String(item.name || item.title || "情景"), type: "scene" as const })),
  ...((runtimeLock.groups || []) as any[]).map((item) => ({ id: String(item.id || item.groupId || ""), name: String(item.name || item.title || "设备组"), type: "group" as const })),
].filter((item) => item.id);

async function invoke(intent: string, parameters: Record<string, unknown>, options: Record<string, unknown> = {}) {
  if (!intent) throw new Error("当前应用未启用此操作。");
  const response = await requestAction(intent, { locale: "zh-CN", utterance: "管理墙面面板", parameters, options });
  const payload = await response.json();
  if (!response.ok || payload.status !== "success") throw new Error(payload.userMessage || "墙面面板操作失败。");
  return payload?.result?.data || payload?.result || {};
}

function eventRows(item: any): PanelEvent[] { return (Array.isArray(item?.buttonEvents) ? item.buttonEvents : []).map((event: any) => ({ id: String(event.id || event.buttonEventId || ""), name: String(event.name || "按键事件"), alias: String(event.alias || event.name || "按键事件"), type: Number(event.type || 0), details: Array.isArray(event.details) ? event.details.map((detail: any) => ({ resId: String(detail.resId || ""), typeId: Number(detail.typeId || detail.resType || 0) })).filter((detail: any) => detail.resId) : (event.resId ? [{ resId: String(event.resId), typeId: Number(event.resType || 0) }] : []) })).filter((event: PanelEvent) => event.id); }
function buttonRows(payload: any): PanelButton[] { const groups = payload?.buttons || payload?.result?.data?.buttons || {}; return Object.values(groups).flatMap((rows) => Array.isArray(rows) ? rows : []).map((item: any) => { const currentRow = Object.fromEntries(Object.entries(item || {}).filter(([key]) => key !== "buttonEvents")); return { id: String(item.id || item.buttonId || ""), name: String(item.name || "按键"), alias: String(item.alias || item.name || "按键"), index: Number(item.index || 0), keyValue: Number(item.keyValue || 0), buttonType: Number(item.buttonType ?? item.type ?? 0), targetId: String(item.targetId || item.resId || ""), targetType: String(item.targetType || (item.resId ? "scene" : "")), currentRow, events: eventRows(item) }; }).filter((button: PanelButton) => button.id); }
function detailOf(payload: any) { return payload?.detail || payload?.result?.data?.detail || {}; }
function errorText(scope: string) { return scope + "同步失败，请重试。当前已保留最近一次数据。"; }

export function usePanels() {
  const [panels, setPanels] = useState<PanelItem[]>(initialPanels); const [knobs] = useState<KnobItem[]>(initialKnobs);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [errors, setErrors] = useState<Errors>({}); const [feedback, setFeedback] = useState("");
  const readPanel = useCallback(async (panelId: string) => {
    const payload = await invoke(intents.detail, { houseId: ${houseId}, deviceId: panelId }); const detail = detailOf(payload); const buttons = buttonRows(payload);
    const known = panels.find((panel) => panel.id === panelId) || initialPanels.find((panel) => panel.id === panelId);
    const next: PanelItem = { ...known, id: panelId, name: String(detail.name || detail.alias || known?.name || panelId), roomName: known?.roomName || "未分配", online: Boolean(detail.online ?? known?.online), typeName: String(detail.typeName || known?.typeName || "面板"), gatewayDeviceId: String(detail.gatewayDeviceId || known?.gatewayDeviceId || ""), buttons };
    setPanels((items) => items.some((item) => item.id === panelId) ? items.map((item) => item.id === panelId ? next : item) : [...items, next]); return next;
  }, [panels]);
  const loadPanel = useCallback(async (panelId: string) => {
    try {
      const panel = await readPanel(panelId); const types = [...new Set(panel.buttons.map((button) => button.buttonType))];
      const results = await Promise.allSettled(types.map((buttonType) => invoke(intents.buttonType, { houseId: ${houseId}, deviceId: panelId, buttonType })));
      setErrors((current) => ({ ...current, [panelId + ":detail"]: "", [panelId + ":type"]: results.some((result) => result.status === "rejected") ? errorText("按键类型") : "" })); return panel;
    } catch { setErrors((current) => ({ ...current, [panelId + ":detail"]: errorText("面板详情") })); throw new Error(errorText("面板详情")); }
  }, [readPanel]);
  const refresh = useCallback(async () => {
    setLoading(true); const nextErrors: Errors = {};
    try { const list = await invoke(intents.list, { houseId: ${houseId} }); const rows = Array.isArray(list?.panels) ? list.panels : []; const ids = rows.map((item: any) => String(item.id || item.did || "")).filter(Boolean); const details = await Promise.allSettled(ids.map(loadPanel)); if (details.some((result) => result.status === "rejected")) nextErrors.detail = errorText("部分面板详情"); }
    catch { nextErrors.list = errorText("面板列表"); }
    setErrors((current) => ({ ...current, ...nextErrors, ...(nextErrors.list ? {} : { list: "" }) })); setLoading(false);
  }, [loadPanel]);
  useEffect(() => { void refresh(); }, []);
  const write = useCallback(async (intent: string, panelId: string, parameters: Record<string, unknown>) => { setSaving(true); setFeedback(""); try { await invoke(intent, parameters, { previewOnly: true }); await invoke(intent, parameters); const panel = await readPanel(panelId); setFeedback("面板设置已保存并重新读取确认。"); return panel; } catch (cause) { setFeedback("面板设置未保存，输入内容已保留。"); throw cause; } finally { setSaving(false); } }, [readPanel]);
  const updateAlias = useCallback(async (panelId: string, buttonId: string, alias: string) => { const panel = panels.find((item) => item.id === panelId); const button = panel?.buttons.find((item) => item.id === buttonId); if (!button) throw new Error("未找到要修改的面板按键。"); const nextRow = { ...button.currentRow, id: button.id, alias }; const next = await write(intents.configure, panelId, { houseId: ${houseId}, deviceId: panelId, buttons: [nextRow] }); if (next.buttons.find((item) => item.id === buttonId)?.alias !== alias) throw new Error("写入后别名校验失败。"); }, [panels, write]);
  const updateEvent = useCallback(async (panelId: string, event: PanelEvent) => { await write(intents.eventUpdate, panelId, { houseId: ${houseId}, deviceId: panelId, buttonEventId: event.id, alias: event.alias, actions: event.details.map((detail) => ({ targetId: detail.resId, targetType: detail.typeId === 6 ? "scene" : "group" })) }); }, [write]);
  const updateEvents = useCallback(async (panelId: string, events: PanelEvent[]) => { await write(intents.eventBatch, panelId, { houseId: ${houseId}, deviceId: panelId, buttonEvents: events.map((event) => ({ buttonEventId: event.id, alias: event.alias, actions: event.details.map((detail) => ({ targetId: detail.resId, targetType: detail.typeId === 6 ? "scene" : "group" })) })) }); }, [write]);
  const resetEvent = useCallback(async (panelId: string, eventId: string) => { await write(intents.eventReset, panelId, { houseId: ${houseId}, deviceId: panelId, buttonEventId: eventId }); }, [write]);
  return { panels, knobs, targets, loading, saving, errors, feedback, refresh, loadPanel, updateAlias, updateEvent, updateEvents, resetEvent, availability: panelAvailability };
}
`;
}
