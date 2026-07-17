export function automationsHookSource(spec, operations = {}) {
  const houseId = JSON.stringify(String(spec?.scope?.homeIds?.[0] || ""));
  const detailEnabled = operations.detail?.enabled === true;
  const supportedEnabled = operations.supported?.enabled === true;
  const supportedV2Enabled = operations.supportedV2?.enabled === true;
  const createEnabled = operations.create?.enabled === true;
  const updateEnabled = operations.update?.enabled === true;
  const deleteEnabled = operations.delete?.enabled === true;
  const enabledIntents = [operations.enable, operations.disable].filter((item) => item?.enabled).map((item) => JSON.stringify(item.intent));
  const intentType = enabledIntents.length > 0 ? enabledIntents.join(" | ") : "string";
  const enableIntent = operations.enable?.enabled ? '"automation.enable"' : '""';
  const disableIntent = operations.disable?.enabled ? '"automation.disable"' : '""';
  const detailState = detailEnabled ? `  const [details, setDetails] = useState<Record<string, AutomationDetail>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});` : "";
  const detailSource = detailEnabled ? automationDetailSource(houseId) : "";
  const registrySource = automationRegistryLoader({ houseId, supportedEnabled, supportedV2Enabled });
  const toggleSource = enabledIntents.length > 0 ? automationToggleSource({ houseId, enableIntent, disableIntent, detailEnabled }) : automationToggleFallback();
  const mutationSource = automationMutationSource({ houseId, createEnabled, updateEnabled, deleteEnabled });
  const returnFields = [detailEnabled && "details, detailLoading, detailErrors, loadDetail", "registry", "registryLoading", "registryError", createEnabled && "previewCreate, createAutomation", updateEnabled && "previewUpdate, updateAutomation", deleteEnabled && "previewDelete, deleteAutomation"].filter(Boolean).join(", ");

  return `import { useCallback, useEffect, useState } from "react";
import runtimeLock from "../generated/runtime-lock.json";
import { requestAction } from "./request";

export type AutomationStatusAction = { intent: ${intentType}; evidence: "preview-only" };
export type AutomationItem = { id: string; name: string; enabled: boolean; actions: AutomationStatusAction[]; statusUnavailableReason?: string };
export type AutomationCondition = { conditionKind?: "alarm" | "event" | "fact" | "fact_change" | string; time?: string; targetType?: string; targetId?: string; event?: string; eventId?: string; property?: string; operation?: string; value?: unknown };
export type AutomationRuleAction = { targetType?: string; targetId?: string; targetName?: string; rank?: number; action?: string | number; set?: Record<string, unknown> };
export type AutomationTrigger = AutomationCondition | { conditionType: "and" | "or"; conditions: AutomationCondition[] };
export type AutomationDetail = AutomationItem & { activeWindow?: { start?: string; end?: string }; repeat?: string | Record<string, unknown>; version?: string | number; conditionType?: "and" | "or"; trigger?: AutomationTrigger; conditions: AutomationCondition[]; ruleActions: AutomationRuleAction[] };
export type AutomationDraft = { name: string; activeWindow: { start: string; end: string }; repeat: string | Record<string, unknown>; version?: string | number; trigger: AutomationTrigger; actions: AutomationRuleAction[]; preserved: Record<string, unknown> };
export type AutomationOperationResult = { message: string; automationId?: string; preview?: Record<string, unknown> };
export type AutomationRegistryCondition = { capabilityPid?: string | number; id?: string | number; conditionKind?: string; name?: string; description?: string; inputs?: Array<Record<string, unknown>>; supportedVersions?: string[] };
export type AutomationRegistryTarget = { id: string; name: string; roomName?: string; properties: string[]; writableProperties: string[]; events: Array<{ eventId: string; name: string }> };
export type AutomationCapabilityRegistry = { targets: Record<string, AutomationRegistryTarget>; supported: AutomationRegistryCondition[]; supportedV2: AutomationRegistryCondition[] };

const initialAutomations = (runtimeLock.automations || []) as AutomationItem[];
const capabilityById = new Map(initialAutomations.map((item) => [item.id, item]));
const conditionPropertyNames = new Set(["power", "brightness", "colorTemperature", "color", "targetPercent", "targetPosition", "position", "switchPower", "airConditionerPower", "temperature", "currentTemperature", "airConditionerTargetTemperature", "airConditionerCurrentTemperature", "humidity", "occupancy", "occupancyDetected", "motionDetected", "contact", "open", "water", "smoke", "pm25", "co2", "voc", "luminance", "batteryLevel", "battery", "online", "airConditionerOnline"]);
const actionPropertyNames = new Set(["power", "brightness", "colorTemperature", "color", "targetPercent", "switchPower", "airConditionerPower", "airConditionerTargetTemperature", "airConditionerMode", "airConditionerFanSpeed"]);
export const automationCapabilityRegistry = buildAutomationRegistry(runtimeLock as Record<string, any>);

function buildAutomationRegistry(lock: Record<string, any>): AutomationCapabilityRegistry {
  const eventsByDevice = new Map<string, Array<{ eventId: string; name: string }>>();
  for (const event of lock.sensorEvents || []) {
    const id = String(event.deviceId || event.sensorId || "");
    if (!id) continue;
    const items = eventsByDevice.get(id) || [];
    items.push({ eventId: String(event.eventId || event.id || ""), name: String(event.name || "设备事件") });
    eventsByDevice.set(id, items);
  }
  const targets = Object.fromEntries(Object.values(lock.entities || {}).map((entity: any) => {
    const controlProperties: string[] = (entity.controls || []).filter((control: any) => control.evidence === "preview-only" && control.property).map((control: any) => String(control.property));
    const writableProperties = [...new Set<string>(controlProperties.map((property) => automationProperty(property)).filter(Boolean))];
    const properties = [...new Set<string>([...Object.keys(entity.state || {}), ...writableProperties])].filter((property) => conditionPropertyNames.has(property));
    return [String(entity.id), { id: String(entity.id), name: String(entity.displayName || entity.name || entity.id), roomName: String(entity.roomName || ""), properties, writableProperties, events: eventsByDevice.get(String(entity.id)) || [] }];
  }));
  return { targets, supported: [], supportedV2: [] };
}

function automationProperty(property: string) { if (property === "targetPosition") return "targetPercent"; if (property === "sp" || /^(?:0|[1-6])-sp$/.test(property)) return "switchPower"; return actionPropertyNames.has(property) ? property : ""; }

function enabledFromStatus(status: unknown) { return ["1", "true", "enabled", "on"].includes(String(status ?? "").trim().toLowerCase()); }
function automationErrorMessage(cause: unknown, fallback: string) {
  const detail = cause instanceof Error ? cause.message : String(cause || "");
  return /invoke:|endpoint returned HTTP|fetch failed|ECONN|Runtime|Bridge/i.test(detail) ? fallback : detail || fallback;
}
async function invokeAutomation(intent: string, payload: Record<string, unknown>) {
  const response = await requestAction(intent, payload);
  const body = await response.json();
  if (!response.ok || body.status !== "success") throw new Error(automationErrorMessage(body.userMessage || body?.error?.message, "家庭服务暂时无法完成此操作，请稍后重试。"));
  return body;
}
async function loadAutomations() {
  const body = await invokeAutomation("automation.list", { locale: "zh-CN", utterance: "同步家庭自动化", parameters: { houseId: ${houseId} } });
  const candidates = [body?.result?.data?.automations, body?.result?.automations, body?.result?.data];
  return (candidates.find(Array.isArray) || []).map((item: any) => {
    const known = capabilityById.get(String(item.id || item.automationId || ""));
    return { ...known, id: String(item.id || item.automationId || ""), name: String(item.name || item.automationName || known?.name || "未命名自动化"), enabled: enabledFromStatus(item.status), actions: known?.actions || [] };
  }).filter((item: AutomationItem) => item.id);
}

export function useAutomations() {
  const [automations, setAutomations] = useState<AutomationItem[]>(initialAutomations);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
${detailState}
  const [registry, setRegistry] = useState<AutomationCapabilityRegistry>(automationCapabilityRegistry);
  const [registryLoading, setRegistryLoading] = useState(${supportedEnabled || supportedV2Enabled});
  const [registryError, setRegistryError] = useState("");
  const refresh = useCallback(async () => { setLoading(true); setError(""); try { const next = await loadAutomations(); setAutomations(next); return next; } catch (cause) { setError(automationErrorMessage(cause, "家庭服务暂时无法同步自动化列表，请稍后重试。")); return undefined; } finally { setLoading(false); } }, []);
  useEffect(() => { void refresh(); }, [refresh]);
${registrySource}
${detailSource}
${toggleSource}
${mutationSource}
  return { automations, loading, error, refresh, toggle, ${returnFields} };
}
`;
}

function automationRegistryLoader({ houseId, supportedEnabled, supportedV2Enabled }) {
  const calls = [
    supportedEnabled && `["automation.supported.list", "supported"]`,
    supportedV2Enabled && `["automation.supported.v2.list", "supportedV2"]`,
  ].filter(Boolean).join(", ");
  if (!calls) return `  useEffect(() => { setRegistryLoading(false); }, []);`;
  return `  useEffect(() => { void (async () => {
    setRegistryLoading(true); setRegistryError("");
    try {
      const next = { ...automationCapabilityRegistry };
      for (const [intent, key] of [${calls}] as Array<[string, "supported" | "supportedV2"]>) {
        const body = await invokeAutomation(intent, { locale: "zh-CN", utterance: "同步自动化条件能力", parameters: { houseId: ${houseId} } });
        const candidates = [body?.result?.data?.[key], body?.result?.[key], body?.result?.data];
        next[key] = candidates.find(Array.isArray) || [];
      }
      setRegistry(next);
    } catch (cause) { setRegistryError(automationErrorMessage(cause, "自动化条件能力暂时无法同步。")); }
    finally { setRegistryLoading(false); }
  })(); }, []);`;
}

function automationDetailSource(houseId) {
  return `  const loadDetail = useCallback(async (automationId: string, force = false) => {
    if (!automationId || (!force && details[automationId])) return details[automationId];
    setDetailLoading((items) => ({ ...items, [automationId]: true })); setDetailErrors((items) => ({ ...items, [automationId]: "" }));
    try {
      const body = await invokeAutomation("automation.detail.get", { locale: "zh-CN", utterance: "查看自动化详情", targets: [{ entityType: "automation", id: automationId }], parameters: { houseId: ${houseId}, automationId } });
      const data = body?.result?.data || body?.result || {}; const detail = data.detail || data; const payload = data.editablePayload || detail.editablePayload || detail; const known = capabilityById.get(automationId);
      const value: AutomationDetail = { ...known, id: String(detail.automationId || detail.id || automationId), name: String(payload.name || detail.name || known?.name || "未命名自动化"), enabled: known?.enabled === true, actions: known?.actions || [], activeWindow: payload.activeWindow || detail.activeWindow, repeat: payload.repeat || detail.repeat, version: payload.version || detail.version, conditionType: payload.conditionType || detail.conditionType, trigger: payload.trigger || detail.trigger, conditions: Array.isArray(payload.conditions) ? payload.conditions : Array.isArray(detail.conditions) ? detail.conditions : [], ruleActions: Array.isArray(payload.actions) ? payload.actions : Array.isArray(detail.actions) ? detail.actions : [] };
      setDetails((items) => ({ ...items, [automationId]: value })); return value;
    } catch (cause) { setDetailErrors((items) => ({ ...items, [automationId]: automationErrorMessage(cause, "家庭服务暂时无法读取此自动化，请稍后重试。") })); return undefined; }
    finally { setDetailLoading((items) => ({ ...items, [automationId]: false })); }
  }, [details]);`;
}

function automationToggleSource({ houseId, enableIntent, disableIntent, detailEnabled }) {
  return `  const toggle = useCallback(async (automation: AutomationItem) => {
    const intent = automation.enabled ? ${disableIntent} : ${enableIntent};
    if (!intent || !automation.actions.some((action) => action.intent === intent && action.evidence === "preview-only")) throw new Error(automation.statusUnavailableReason || "当前家庭暂不支持修改状态。");
    await invokeAutomation(intent, { locale: "zh-CN", utterance: (automation.enabled ? "停用" : "启用") + automation.name, targets: [{ entityType: "automation", id: automation.id }], parameters: { houseId: ${houseId}, automationId: automation.id } });
    const next = await loadAutomations(); const verified = next.find((item: AutomationItem) => item.id === automation.id);
    if (!verified || verified.enabled === automation.enabled) throw new Error("状态校验未完成，当前显示已恢复，请重试。");
    setAutomations(next);${detailEnabled ? ` setDetails((items) => items[automation.id] ? { ...items, [automation.id]: { ...items[automation.id], enabled: verified.enabled } } : items);` : ""} return verified.enabled;
  }, []);`;
}

function automationToggleFallback() {
  return `  const toggle = useCallback(async (automation: AutomationItem) => { throw new Error(automation.statusUnavailableReason || "当前家庭暂不支持修改状态。"); }, []);`;
}

function automationMutationSource({ houseId, createEnabled, updateEnabled, deleteEnabled }) {
  const blocks = [];
  const parameters = `{ ...draft.preserved, houseId: ${houseId}, name: draft.name.trim(), activeWindow: draft.activeWindow, repeat: draft.repeat, version: draft.version, trigger: draft.trigger, actions: draft.actions.map((action, rank) => ({ ...action, rank })) }`;
  if (createEnabled) blocks.push(`  const previewCreate = useCallback(async (draft: AutomationDraft) => { const body = await invokeAutomation("automation.create", { locale: "zh-CN", utterance: "预览创建自动化", options: { previewOnly: true }, parameters: ${parameters} }); return { message: body.userMessage, preview: body?.result?.preview || {} }; }, []);
  const createAutomation = useCallback(async (draft: AutomationDraft) => { const body = await invokeAutomation("automation.create", { locale: "zh-CN", utterance: "创建自动化" + draft.name, parameters: ${parameters} }); const automationId = String(body?.result?.entityId || body?.result?.automationId || ""); await refresh(); return { message: body.userMessage || "自动化已创建", automationId }; }, [refresh]);`);
  if (updateEnabled) blocks.push(`  const previewUpdate = useCallback(async (automationId: string, draft: AutomationDraft) => { const body = await invokeAutomation("automation.update", { locale: "zh-CN", utterance: "预览更新自动化", options: { previewOnly: true }, targets: [{ entityType: "automation", id: automationId }], parameters: { ...${parameters}, automationId } }); return { message: body.userMessage, automationId, preview: body?.result?.preview || {} }; }, []);
  const updateAutomation = useCallback(async (automationId: string, draft: AutomationDraft) => { const body = await invokeAutomation("automation.update", { locale: "zh-CN", utterance: "更新自动化" + draft.name, targets: [{ entityType: "automation", id: automationId }], parameters: { ...${parameters}, automationId } }); await loadDetail(automationId, true); await refresh(); return { message: body.userMessage || "自动化已更新", automationId }; }, [loadDetail, refresh]);`);
  if (deleteEnabled) blocks.push(`  const previewDelete = useCallback(async (automation: AutomationItem) => { const body = await invokeAutomation("automation.delete", { locale: "zh-CN", utterance: "预览删除自动化" + automation.name, options: { previewOnly: true }, targets: [{ entityType: "automation", id: automation.id }], parameters: { houseId: ${houseId}, automationId: automation.id } }); return { message: body.userMessage, automationId: automation.id, preview: body?.result?.preview || {} }; }, []);
  const deleteAutomation = useCallback(async (automation: AutomationItem) => { const body = await invokeAutomation("automation.delete", { locale: "zh-CN", utterance: "确认删除自动化" + automation.name, targets: [{ entityType: "automation", id: automation.id }], parameters: { houseId: ${houseId}, automationId: automation.id, confirmed: true } }); const next = await refresh(); if (!next || next.some((item: AutomationItem) => item.id === automation.id)) throw new Error("删除结果尚未完成验证，请刷新后重试。"); setDetails((items) => { const copy = { ...items }; delete copy[automation.id]; return copy; }); return body.userMessage || "自动化已删除"; }, [refresh]);`);
  return blocks.join("\n");
}
