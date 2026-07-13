export function knobsHookSource(spec, operations = {}) {
  const houseId = JSON.stringify(String(spec?.scope?.homeIds?.[0] || ""));
  const intents = Object.fromEntries(Object.entries(operations).map(([name, operation]) => [name, operation.enabled ? operation.intent : ""]));
  const availability = Object.fromEntries(Object.entries(operations).map(([name, operation]) => [name, { enabled: operation.enabled, message: operation.userMessage }]));
  return `import { useCallback, useState } from "react";
import runtimeLock from "../generated/runtime-lock.json";

export type KnobAction = { id: string; index: number; configType: string; mode: string; model: string; alias: string; sensitivity: number; targetType: string; targetId: string; targetName: string; resettable: boolean; currentRow: Record<string, unknown> };
export type KnobItem = { id: string; name: string; roomName: string; online: boolean; editable: boolean; unsupportedReason?: string; actions: KnobAction[] };
export type KnobTarget = { id: string; name: string; type: "device" | "scene" | "group"; modes: string[] };
const initialKnobs = ((runtimeLock.knobs || []) as any[]).map((item) => ({
  ...item,
  actions: (Array.isArray(item.actions) ? item.actions : []).filter((action: any) => Number.isInteger(action?.index)).map(normalizeAction),
})) as KnobItem[];
const intents = ${JSON.stringify(intents)} as Record<string, string>;
export const knobAvailability = ${JSON.stringify(availability)} as Record<string, { enabled: boolean; message: string }>;
export const knobTargets: KnobTarget[] = [
  ...Object.values((runtimeLock.entities || {}) as Record<string, any>).filter((item: any) => item.readOnly !== true && item.capabilityStatus !== "version-mismatch").map((item: any) => ({ id: String(item.id), name: String(item.displayName || item.name || item.id), type: "device" as const, modes: deviceTargetModes(item) })),
  ...((runtimeLock.scenes || []) as any[]).map((item) => ({ id: String(item.id), name: String(item.name || item.id), type: "scene" as const, modes: ["scene"] })),
  ...((runtimeLock.groups || []) as any[]).map((item) => ({ id: String(item.id), name: String(item.name || item.id), type: "group" as const, modes: item.groupCapability === "light" ? ["brightness", "power", "colorTemperature"] : [] })),
].filter((item) => item.id && item.modes.length > 0);

async function invoke(intent: string, parameters: Record<string, unknown>, options: Record<string, unknown> = {}) {
  if (!intent) throw new Error("当前应用未启用此操作。");
  const response = await fetch("/api/operations/" + intent, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: "zh-CN", utterance: "管理智能旋钮", parameters, options }) });
  const payload = await response.json();
  if (!response.ok || payload.status !== "success") throw new Error(payload.userMessage || "智能旋钮操作失败。");
  return payload?.result?.data || payload?.result || {};
}

function normalizeAction(item: any): KnobAction { const currentRow = item?.currentRow && typeof item.currentRow === "object" ? item.currentRow : { ...item }; return { ...item, id: String(item?.id || ""), index: Number(item?.index), configType: String(item?.configType || ""), mode: String(item?.mode || ""), model: String(item?.model || ""), alias: String(item?.alias || ""), sensitivity: Number(item?.sensitivity || 0), targetType: String(item?.targetType || ""), targetId: String(item?.targetId || ""), targetName: String(item?.targetName || ""), resettable: Boolean(item?.resettable), currentRow }; }
function deviceTargetModes(item: any) { const state = item?.state && typeof item.state === "object" ? item.state : {}; return [state.brightness !== undefined ? "brightness" : "", state.power !== undefined || state.switchPower !== undefined || state.airConditionerPower !== undefined ? "power" : "", state.colorTemperature !== undefined ? "colorTemperature" : ""].filter(Boolean); }
function mergeKnobActions(items: any[], previousActions: KnobAction[]) { return items.map((item) => { const action = normalizeAction(item); const previous = previousActions.find((candidate) => candidate.id === action.id || candidate.index === action.index); const target = knobTargets.find((candidate) => candidate.id === action.targetId && candidate.type === action.targetType); return { ...action, targetName: action.targetName || target?.name || previous?.targetName || "", resettable: previous?.resettable ?? action.resettable }; }); }
function detailOf(payload: any) { return payload?.multi || payload?.result?.data?.multi || payload?.data?.multi || {}; }

export function useKnobs() {
  const [knobs, setKnobs] = useState<KnobItem[]>(initialKnobs); const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false); const [errors, setErrors] = useState<Record<string, string>>({}); const [feedback, setFeedback] = useState("");
  const readKnob = useCallback(async (knobId: string) => { const payload = await invoke(intents.knobDetail, { houseId: ${houseId}, deviceId: knobId }); const detail = detailOf(payload); const known = knobs.find((item) => item.id === knobId) || initialKnobs.find((item) => item.id === knobId); const rows = Array.isArray(detail.actions) ? detail.actions : known?.actions || []; const next: KnobItem = { ...known, id: knobId, name: String(detail.name || known?.name || knobId), roomName: known?.roomName || "未分配", online: known?.online !== false, editable: known?.editable === true, unsupportedReason: known?.unsupportedReason, actions: mergeKnobActions(rows, known?.actions || []) }; setKnobs((items) => items.map((item) => item.id === knobId ? next : item)); return next; }, [knobs]);
  const loadKnob = useCallback(async (knobId: string) => { setLoading(true); try { const knob = await readKnob(knobId); setErrors((items) => ({ ...items, [knobId]: "" })); return knob; } catch { const message = "旋钮详情同步失败，请重试。当前已保留最近一次数据。"; setErrors((items) => ({ ...items, [knobId]: message })); throw new Error(message); } finally { setLoading(false); } }, [readKnob]);
  const save = useCallback(async (intent: string, knobId: string, parameters: Record<string, unknown>) => { setSaving(true); setFeedback(""); try { await invoke(intent, parameters, { previewOnly: true }); await invoke(intent, parameters); const next = await readKnob(knobId); setFeedback("旋钮设置已保存并重新读取确认。"); return next; } catch { setFeedback("旋钮设置未保存，输入内容已保留。"); throw new Error("保存失败，请检查家庭连接后重试。输入内容已保留。"); } finally { setSaving(false); } }, [readKnob]);
  const configureKnob = useCallback(async (knobId: string, actions: KnobAction[]) => { const rows = actions.map((action) => ({ ...action.currentRow, id: action.id, index: action.index, configType: action.configType, mode: action.mode, model: action.model || undefined, alias: action.alias, sensitivity: action.sensitivity, targetType: action.targetType, targetId: action.targetId })); const next = await save(intents.knobConfigure, knobId, { houseId: ${houseId}, deviceId: knobId, actions: rows }); if (next.actions.length !== actions.length) throw new Error("写入后配置数量校验失败。"); }, [save]);
  const resetKnob = useCallback(async (knobId: string, index: number) => { await save(intents.knobReset, knobId, { houseId: ${houseId}, deviceId: knobId, index }); }, [save]);
  return { knobs, targets: knobTargets, availability: knobAvailability, loading, saving, errors, feedback, loadKnob, configureKnob, resetKnob };
}
`;
}
