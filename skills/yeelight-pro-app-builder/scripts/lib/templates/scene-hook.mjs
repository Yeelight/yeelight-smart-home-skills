export function scenesHookSource(spec, operations = {}) {
  const houseId = JSON.stringify(String(spec?.scope?.homeIds?.[0] || ""));
  const detailEnabled = operations.detail?.enabled === true;
  const createEnabled = operations.create?.enabled === true;
  const updateEnabled = operations.update?.enabled === true;
  const testEnabled = operations.test?.enabled === true;
  const deleteEnabled = operations.delete?.enabled === true;
  const executeEnabled = operations.execute?.enabled === true;
  const editorEnabled = createEnabled || updateEnabled;
  const managementTypesSource = detailEnabled || editorEnabled ? `export type SceneAction = { targetType?: string; targetId?: string; targetName?: string; rank?: number; action?: number; set?: Record<string, unknown>; custom?: Record<string, unknown>; opaque?: boolean; raw?: Record<string, unknown> };
export type SceneDetail = SceneItem & { description?: string; icon?: string; category?: string; status?: string; actions: SceneAction[];${detailEnabled ? ` editablePayload?: { name?: string; description?: string; icon?: string; roomId?: string; actions?: SceneAction[]; [key: string]: unknown };` : ""} };
export type SceneDraft = { name: string; description: string; icon: string; roomId?: string; actions: SceneAction[]; preserved: Record<string, unknown> };
export type SceneTargetOption = { id: string; name: string; type: "device" | "group" | "room" | "scene"; roomName?: string; properties: string[] };
export type SceneOperationResult = { message: string; sceneId?: string; preview?: Record<string, unknown> };` : "";
  const targetOptionsSource = editorEnabled ? sceneTargetOptionsSource() : "";
  const normalizeSource = detailEnabled ? sceneNormalizeSource() : "";
  const detailSource = detailEnabled ? sceneDetailSource(houseId) : "";
  const mutationSource = sceneMutationSource({ houseId, createEnabled, updateEnabled, testEnabled, deleteEnabled });
  const executeSource = executeEnabled ? sceneExecuteSource(houseId) : sceneExecuteFallbackSource();
  const returnFields = [detailEnabled && "details, detailLoading, detailErrors, loadDetail", createEnabled && "previewCreate, createScene", updateEnabled && "previewUpdate, updateScene", testEnabled && "testScene", deleteEnabled && "previewDelete, deleteScene"].filter(Boolean).join(", ");

  return `import { useCallback, useEffect, useState } from "react";
import runtimeLock from "../generated/runtime-lock.json";

export type SceneItem = { id: string; name: string; roomId?: string; roomName: string; executable: boolean; evidence?: string; unavailableReason?: string };
${managementTypesSource}

const initialScenes = (runtimeLock.scenes || []) as SceneItem[];
const capabilityById = new Map(initialScenes.map((scene) => [scene.id, scene]));
${targetOptionsSource}

function sceneErrorMessage(cause: unknown, fallback: string) {
  const detail = cause instanceof Error ? cause.message : String(cause || "");
  if (/write verification mismatch|write_verification_mismatch/i.test(detail)) return "保存结果未能完成验证，当前更改已保留，请重试。";
  return /invoke:|endpoint returned HTTP|fetch failed|ECONN|Runtime|Bridge/i.test(detail) ? fallback : detail || fallback;
}

async function invokeScene(intent: string, payload: Record<string, unknown>) {
  const response = await fetch("/api/operations/" + intent, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const body = await response.json();
  if (!response.ok || body.status !== "success") throw new Error(sceneErrorMessage(body.userMessage || body?.error?.message, "家庭服务暂时无法完成此操作，请保留当前更改后重试。"));
  return body;
}

function draftParameters(draft: SceneDraft) {
  return { ...draft.preserved, name: draft.name.trim(), description: draft.description.trim(), icon: draft.icon || "sparkles", ...(draft.roomId ? { roomId: draft.roomId } : {}), actions: draft.actions.map(actionParameters) };
}

function actionParameters(action: SceneAction) {
  const { opaque: _opaque, raw, custom, ...publicAction } = action;
  return action.opaque ? { ...publicAction, custom: raw || custom || {} } : publicAction;
}

${normalizeSource}

export function useScenes() {
  const [scenes, setScenes] = useState<SceneItem[]>(initialScenes);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
${detailEnabled ? `  const [details, setDetails] = useState<Record<string, SceneDetail>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});` : ""}
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const body = await invokeScene("scene.list", { locale: "zh-CN", utterance: "同步家庭情景", parameters: { houseId: ${houseId} } });
      const candidates = [body?.result?.data?.scenes, body?.result?.scenes, body?.result?.data];
      const next = (candidates.find(Array.isArray) || []).map((item: any) => {
        const known = capabilityById.get(String(item.id || item.sceneId || ""));
        return { ...known, id: String(item.id || item.sceneId || ""), name: String(item.name || known?.name || "未命名情景"), roomId: String(item.roomId || known?.roomId || ""), roomName: known?.roomName || "全屋", executable: known?.executable === true };
      }).filter((item: SceneItem) => item.id);
      setScenes(next); return next;
    } catch (cause) { setError(sceneErrorMessage(cause, "家庭服务暂时无法同步情景列表，请稍后重试。")); return scenes; }
    finally { setLoading(false); }
  }, [scenes]);
  useEffect(() => { void refresh(); }, []);
${detailSource}
${executeSource}
${mutationSource}
  return { scenes, loading, error, refresh, execute${returnFields ? `, ${returnFields}` : ""} };
}
`;
}

function sceneTargetOptionsSource() {
  return `export const sceneTargetOptions = buildTargetOptions(runtimeLock as Record<string, any>);
function buildTargetOptions(lock: Record<string, any>): SceneTargetOption[] {
  const devices: SceneTargetOption[] = Object.values(lock.entities || {}).map((entity: any) => ({ id: String(entity.id), name: String(entity.displayName || entity.name || entity.id), type: "device" as const, roomName: String(entity.roomName || ""), properties: [...new Set<string>((entity.controls || []).filter((control: any) => control.evidence === "preview-only" && control.property).map((control: any) => sceneProperty(String(control.property))).filter(Boolean))] }));
  const roomProperties = new Map<string, Set<string>>();
  for (const device of devices) { if (!device.roomName) continue; const values = roomProperties.get(device.roomName) || new Set<string>(); device.properties.forEach((property) => values.add(property)); roomProperties.set(device.roomName, values); }
  const rooms = [...roomProperties.entries()].map(([name, properties]) => ({ id: name, name, type: "room" as const, roomName: name, properties: [...properties] }));
  const groups = (lock.groups || []).map((group: any) => ({ id: String(group.id), name: String(group.name || group.id), type: "group" as const, roomName: String(group.roomName || ""), properties: groupProperties(String(group.groupCapability || "")) }));
  return [...devices, ...groups, ...rooms].filter((item) => item.id && item.properties.length > 0);
}
function groupProperties(capability: string) { if (capability === "light") return ["power", "brightness", "colorTemperature", "color"]; if (capability === "curtain") return ["targetPercent"]; if (capability === "switch") return ["switchPower"]; return []; }
function sceneProperty(property: string) { if (property === "targetPosition") return "targetPercent"; if (property === "sp" || /^(?:0|[1-6])-sp$/.test(property)) return "switchPower"; return ["power", "brightness", "colorTemperature", "color", "targetPercent", "switchPower"].includes(property) ? property : ""; }`;
}

function sceneNormalizeSource() {
  return `function normalizeSceneActions(detail: Record<string, any>, editablePayload: Record<string, any>) {
  const publicActions = Array.isArray(detail.actions) ? detail.actions : []; const editableActions = Array.isArray(editablePayload.actions) ? editablePayload.actions : []; const source = publicActions.length ? publicActions : editableActions;
  return source.map((action: SceneAction, index: number) => { const custom = editableActions[index]?.custom; return custom && typeof custom === "object" && !Array.isArray(custom) ? { ...action, set: undefined, opaque: true, raw: custom } : action; });
}`;
}

function sceneDetailSource(houseId) {
  return `  const loadDetail = useCallback(async (sceneId: string, force = false) => {
    if (!sceneId || (!force && details[sceneId])) return details[sceneId];
    setDetailLoading((items) => ({ ...items, [sceneId]: true }));
    setDetailErrors((items) => ({ ...items, [sceneId]: "" }));
    try {
      const body = await invokeScene("scene.detail.get", { locale: "zh-CN", utterance: "查看情景详情", targets: [{ entityType: "scene", id: sceneId }], parameters: { houseId: ${houseId}, sceneId } });
      const data = body?.result?.data || body?.result || {}; const detail = data.detail || data; const editablePayload = data.editablePayload || detail.editablePayload || {}; const known = capabilityById.get(sceneId);
      const next = { ...detail, id: String(detail.id || detail.sceneId || sceneId), name: String(detail.name || known?.name || "未命名情景"), roomName: known?.roomName || "全屋", description: String(detail.description || detail.desc || editablePayload.description || ""), icon: String(detail.icon || editablePayload.icon || "sparkles"), category: detail.category ? String(detail.category) : "", status: String(detail.status || "enabled"), actions: normalizeSceneActions(detail, editablePayload), editablePayload } as SceneDetail;
      setDetails((items) => ({ ...items, [sceneId]: next })); return next;
    } catch (cause) { setDetailErrors((items) => ({ ...items, [sceneId]: sceneErrorMessage(cause, "家庭服务暂时无法读取此情景，请稍后重试。") })); return undefined; }
    finally { setDetailLoading((items) => ({ ...items, [sceneId]: false })); }
  }, [details]);`;
}

function sceneExecuteSource(houseId) {
  return `  const execute = useCallback(async (scene: SceneItem) => { const body = await invokeScene("scene.execute", { locale: "zh-CN", utterance: "执行情景" + scene.name, targets: [{ entityType: "scene", id: scene.id }], parameters: { houseId: ${houseId}, sceneId: scene.id } }); return body.userMessage || "情景已执行"; }, []);`;
}

function sceneExecuteFallbackSource() {
  return `  const execute = useCallback(async (scene: SceneItem) => { throw new Error(scene.unavailableReason || "当前家庭暂不支持执行此情景。"); }, []);`;
}

function sceneMutationSource({ houseId, createEnabled, updateEnabled, testEnabled, deleteEnabled }) {
  const blocks = [];
  if (createEnabled) blocks.push(`  const previewCreate = useCallback(async (draft: SceneDraft) => { const body = await invokeScene("scene.create", { locale: "zh-CN", utterance: "预览创建情景", options: { previewOnly: true }, parameters: { houseId: ${houseId}, ...draftParameters(draft) } }); return { message: body.userMessage, preview: body?.result?.preview || {} }; }, []);
  const createScene = useCallback(async (draft: SceneDraft) => { const body = await invokeScene("scene.create", { locale: "zh-CN", utterance: "创建情景" + draft.name, parameters: { houseId: ${houseId}, ...draftParameters(draft) } }); const sceneId = String(body?.result?.entityId || body?.result?.sceneId || ""); await refresh(); return { message: body.userMessage || "情景已创建", sceneId }; }, [refresh]);`);
  if (updateEnabled) blocks.push(`  const previewUpdate = useCallback(async (sceneId: string, draft: SceneDraft) => { const body = await invokeScene("scene.update", { locale: "zh-CN", utterance: "预览更新情景", options: { previewOnly: true }, targets: [{ entityType: "scene", id: sceneId }], parameters: { houseId: ${houseId}, sceneId, ...draftParameters(draft) } }); return { message: body.userMessage, sceneId, preview: body?.result?.preview || {} }; }, []);
  const updateScene = useCallback(async (sceneId: string, draft: SceneDraft) => { const body = await invokeScene("scene.update", { locale: "zh-CN", utterance: "更新情景" + draft.name, targets: [{ entityType: "scene", id: sceneId }], parameters: { houseId: ${houseId}, sceneId, ...draftParameters(draft) } }); await loadDetail(sceneId, true); await refresh(); return { message: body.userMessage || "情景已更新", sceneId }; }, [loadDetail, refresh]);`);
  if (testEnabled) blocks.push(`  const testScene = useCallback(async (scene: SceneItem) => { const body = await invokeScene("scene.test", { locale: "zh-CN", utterance: "测试情景" + scene.name, targets: [{ entityType: "scene", id: scene.id }], parameters: { houseId: ${houseId}, sceneId: scene.id } }); return body.userMessage || "情景测试完成，未更改保存内容"; }, []);`);
  if (deleteEnabled) blocks.push(`  const previewDelete = useCallback(async (scene: SceneItem) => { const body = await invokeScene("scene.delete", { locale: "zh-CN", utterance: "预览删除情景" + scene.name, options: { previewOnly: true }, targets: [{ entityType: "scene", id: scene.id }], parameters: { houseId: ${houseId}, sceneId: scene.id } }); return { message: body.userMessage, sceneId: scene.id, preview: body?.result?.preview || {} }; }, []);
  const deleteScene = useCallback(async (scene: SceneItem) => { const body = await invokeScene("scene.delete", { locale: "zh-CN", utterance: "确认删除情景" + scene.name, targets: [{ entityType: "scene", id: scene.id }], parameters: { houseId: ${houseId}, sceneId: scene.id, confirmed: true } }); const next = await refresh(); if (next.some((item) => item.id === scene.id)) throw new Error("删除结果尚未完成验证，请刷新后重试。"); setDetails((items) => { const copy = { ...items }; delete copy[scene.id]; return copy; }); return body.userMessage || "情景已删除"; }, [refresh]);`);
  return blocks.join("\n");
}
