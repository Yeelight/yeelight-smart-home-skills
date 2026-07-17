export function sceneLauncherSource(_spec, _snapshot, operations = {}) {
  return operations.detail?.enabled
    ? sceneManagementSource(operations)
    : sceneExecutionOnlySource();
}

function sceneExecutionOnlySource() {
  return `import { CheckCircle2, CircleSlash2, LoaderCircle, Play, Sparkles, XCircle } from "lucide-react";
import { useState } from "react";

type Scene = { id: string; name: string; roomName: string; executable: boolean; evidence?: string; unavailableReason?: string };
type Feedback = { type: "success" | "error"; message: string };
type Props = { scenes: Scene[]; loading: boolean; execute: (scene: Scene) => Promise<string> };

function useSceneExecution(execute: Props["execute"]) {
  const [busyId, setBusyId] = useState("");
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const run = async (scene: Scene) => {
    setBusyId(scene.id);
    setFeedback((items) => ({ ...items, [scene.id]: { type: "success", message: "正在执行情景..." } }));
    try {
      const message = await execute(scene);
      setFeedback((items) => ({ ...items, [scene.id]: { type: "success", message } }));
    } catch (cause) {
      setFeedback((items) => ({ ...items, [scene.id]: { type: "error", message: cause instanceof Error ? cause.message : "情景执行失败，请重试。" } }));
    } finally {
      setBusyId("");
    }
  };
  return { busyId, feedback, run };
}

export function HomeSceneSummary({ scenes, loading, execute }: Props) {
  const { busyId, feedback, run } = useSceneExecution(execute);
  const visibleScenes = scenes.slice(0, 4);
  return <section className="home-scene-summary" aria-labelledby="home-scene-title" aria-busy={loading}>
    <div className="section-heading"><div><small>常用情景</small><h2 id="home-scene-title">快捷执行</h2></div><span className="result-count">{scenes.length} 个情景</span></div>
    {visibleScenes.length ? <div className="home-scene-list">{visibleScenes.map((scene) => { const busy = busyId === scene.id; const itemFeedback = feedback[scene.id]; return <div className="home-scene-row" key={scene.id}><span><strong>{scene.name}</strong><small>{itemFeedback?.message || scene.roomName || "全屋"}</small></span>{scene.executable ? <button type="button" disabled={Boolean(busyId)} onClick={() => void run(scene)} aria-label={"执行情景 " + scene.name}>{busy ? <LoaderCircle className="spin" size={18} /> : <Play size={18} />}<span>{busy ? "执行中" : "执行"}</span></button> : <span className="scene-unavailable"><CircleSlash2 size={17} />不可执行</span>}</div>; })}</div>
      : !loading && <div className="empty-state compact"><Sparkles size={20} /><strong>当前家庭没有情景</strong><span>页面不会生成模拟情景。</span></div>}
  </section>;
}

export function SceneLauncher({ scenes, loading, execute }: Props) {
  const { busyId, feedback, run } = useSceneExecution(execute);
  return <section className="scene-module" aria-labelledby="scene-title">
    <div className="section-heading scene-heading"><div><span className="eyebrow">快捷执行</span><h2 id="scene-title">一键情景</h2><p>执行家庭系统中已经配置好的情景，不在此页面修改情景内容。</p></div><span className="scene-count">{scenes.length} 个情景</span></div>
    <div className="scene-grid" aria-busy={loading}>
      {scenes.map((scene) => {
        const itemFeedback = feedback[scene.id];
        const busy = busyId === scene.id;
        return <article className="scene-card" key={scene.id}>
          <div className="scene-card-heading"><span className="scene-icon"><Sparkles size={21} /></span><div><strong>{scene.name}</strong><span>{scene.roomName || "全屋"}</span></div></div>
          {scene.executable ? <button type="button" className="scene-run-button" disabled={Boolean(busyId)} onClick={() => void run(scene)}>{busy ? <LoaderCircle className="spin" size={18} /> : <Play size={18} />}<span>{busy ? "正在执行" : "执行情景"}</span></button>
            : <div className="scene-unavailable"><CircleSlash2 size={17} /><span>{scene.unavailableReason || "当前家庭暂不支持执行此情景。"}</span></div>}
          <div className={itemFeedback ? "scene-feedback " + itemFeedback.type : "scene-feedback"} aria-live="polite">{itemFeedback ? <>{itemFeedback.type === "success" ? <CheckCircle2 size={16} /> : <XCircle size={16} />}<span>{itemFeedback.message}</span></> : <span>准备就绪</span>}</div>
        </article>;
      })}
      {!loading && scenes.length === 0 && <div className="empty-state"><Sparkles size={20} /><strong>当前家庭没有情景</strong><span>请先在家庭系统中创建情景，再重新生成或同步。</span></div>}
    </div>
  </section>;
}
`;
}

function sceneManagementSource(operations) {
  const canCreate = operations.create?.enabled === true;
  const canUpdate = operations.update?.enabled === true;
  const canTest = operations.test?.enabled === true;
  const canDelete = operations.delete?.enabled === true;
  const hasEditor = canCreate || canUpdate;
  const editorImport = hasEditor ? `import { SceneEditor } from "./scene-editor";\n` : "";
  const createButton = canCreate ? `<button type="button" className="scene-create-button" onClick={() => onNavigate("scenes/new")}><Plus size={17} />新建情景</button>` : `<span className="scene-operation-boundary"><CircleSlash2 size={16} />${escapeTemplate(operations.create?.userMessage || "当前家庭暂不支持新建情景。")}</span>`;
  const editButton = canUpdate ? `<button type="button" className="secondary-button" disabled={!detail} onClick={() => onNavigate("scenes/" + scene.id + "/edit")}><Pencil size={17} />编辑情景</button>` : "";
  const testButton = canTest ? `<button type="button" className="secondary-button" disabled={Boolean(operationBusy)} onClick={() => void runTest()}>{operationBusy === "test" ? <LoaderCircle className="spin" size={17} /> : <FlaskConical size={17} />}测试情景</button>` : "";
  const deleteButton = canDelete ? `<button type="button" className="danger-link" onClick={() => setDeleteOpen(true)}><Trash2 size={17} />删除情景</button>` : "";
  const editorRoute = hasEditor ? `isEditor ? <SceneEditor mode={isCreate ? "create" : "update"} scene={isCreate ? undefined : detail} targets={sceneTargetOptions} onPreview={isCreate ? props.previewCreate! : (draft) => props.previewUpdate!(activeId, draft)} onSave={isCreate ? props.createScene! : (draft) => props.updateScene!(activeId, draft)} onCancel={() => onNavigate(isCreate ? "scenes" : "scenes/" + activeId)} onNavigate={onNavigate} /> : ` : "";
  const editorRouteClose = "";
  const deleteDialog = canDelete ? `<GuardedSceneDelete scene={scene} busy={operationBusy === "delete"} feedback={operationFeedback} close={() => setDeleteOpen(false)} confirm={runDelete} />` : "";
  return `${editorImport}import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, CircleSlash2, FlaskConical, Layers3, LoaderCircle, MapPin, Pencil, Play, Plus, RefreshCw, Search, Sparkles, Trash2, X, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { sceneTargetOptions } from "../../runtime/use-scenes";
import type { SceneDetail, SceneDraft, SceneItem, SceneOperationResult } from "../../runtime/use-scenes";

type Feedback = { type: "success" | "error"; message: string };
type Props = { scenes: SceneItem[]; loading: boolean; execute: (scene: SceneItem) => Promise<string>; details: Record<string, SceneDetail>; detailLoading: Record<string, boolean>; detailErrors: Record<string, string>; loadDetail: (sceneId: string, force?: boolean) => Promise<SceneDetail | undefined>; activeRoute: string; onNavigate: (route: string) => void; previewCreate?: (draft: SceneDraft) => Promise<SceneOperationResult>; createScene?: (draft: SceneDraft) => Promise<SceneOperationResult>; previewUpdate?: (sceneId: string, draft: SceneDraft) => Promise<SceneOperationResult>; updateScene?: (sceneId: string, draft: SceneDraft) => Promise<SceneOperationResult>; testScene?: (scene: SceneItem) => Promise<string>; previewDelete?: (scene: SceneItem) => Promise<SceneOperationResult>; deleteScene?: (scene: SceneItem) => Promise<string> };

const categoryLabels: Record<string, string> = { arrival: "归家", entertainment: "影音", sleep: "睡眠", wake: "晨起", social: "会客", dining: "用餐", focus: "专注", away: "离家", cleaning: "清洁", night: "夜间", outdoor: "户外", custom: "自定义" };
const propertyLabels: Record<string, string> = { power: "开关", brightness: "亮度", colorTemperature: "色温", color: "颜色", targetPercent: "开合度", switchPower: "回路开关" };

function useSceneExecution(execute: Props["execute"]) {
  const [busyId, setBusyId] = useState("");
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const run = async (scene: SceneItem) => {
    setBusyId(scene.id);
    setFeedback((items) => ({ ...items, [scene.id]: { type: "success", message: "正在执行情景..." } }));
    try {
      const message = await execute(scene);
      setFeedback((items) => ({ ...items, [scene.id]: { type: "success", message } }));
    } catch (cause) {
      setFeedback((items) => ({ ...items, [scene.id]: { type: "error", message: cause instanceof Error ? cause.message : "情景执行失败，请重试。" } }));
    } finally {
      setBusyId("");
    }
  };
  return { busyId, feedback, run };
}

export function HomeSceneSummary({ scenes, loading, execute }: Pick<Props, "scenes" | "loading" | "execute">) {
  const { busyId, feedback, run } = useSceneExecution(execute);
  const visibleScenes = scenes.slice(0, 4);
  return <section className="home-scene-summary" aria-labelledby="home-scene-title" aria-busy={loading}><div className="section-heading"><div><small>常用情景</small><h2 id="home-scene-title">快捷执行</h2></div><span className="result-count">{scenes.length} 个情景</span></div>{visibleScenes.length ? <div className="home-scene-list">{visibleScenes.map((scene) => { const busy = busyId === scene.id; const itemFeedback = feedback[scene.id]; return <div className="home-scene-row" key={scene.id}><span><strong>{scene.name}</strong><small>{itemFeedback?.message || scene.roomName || "全屋"}</small></span>{scene.executable ? <button type="button" disabled={Boolean(busyId)} onClick={() => void run(scene)} aria-label={"执行情景 " + scene.name}>{busy ? <LoaderCircle className="spin" size={18} /> : <Play size={18} />}<span>{busy ? "执行中" : "执行"}</span></button> : <span className="scene-unavailable"><CircleSlash2 size={17} />不可执行</span>}</div>; })}</div> : !loading && <div className="empty-state compact"><Sparkles size={20} /><strong>当前家庭没有情景</strong><span>页面不会生成模拟情景。</span></div>}</section>;
}

export function SceneLauncher(props: Props) {
  const { scenes, loading, details, detailLoading, detailErrors, loadDetail, activeRoute, onNavigate } = props;
  const [query, setQuery] = useState("");
  const [room, setRoom] = useState("all");
  const openerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const previousActiveIdRef = useRef("");
  const routeParts = activeRoute.split("/");
  const isCreate = routeParts[1] === "new";
  const isEditor = isCreate || routeParts[2] === "edit";
  const activeId = isCreate ? "" : routeParts[1] || "";
  const selected = scenes.find((scene) => scene.id === activeId);
  const detail = activeId ? details[activeId] : undefined;
  const rooms = useMemo(() => [...new Set(scenes.map((scene) => scene.roomName || "全屋"))].sort((a, b) => a.localeCompare(b, "zh-CN")), [scenes]);
  const filtered = useMemo(() => scenes.filter((scene) => (room === "all" || (scene.roomName || "全屋") === room) && (!query.trim() || (scene.name + " " + scene.roomName).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))), [scenes, room, query]);

  useEffect(() => { if (activeId) void loadDetail(activeId); }, [activeId]);
  useEffect(() => { if (activeId && detail) requestAnimationFrame(() => document.querySelector<HTMLElement>("#scene-detail-title")?.focus()); }, [activeId, detail]);
  useEffect(() => {
    const previous = previousActiveIdRef.current;
    previousActiveIdRef.current = activeId;
    if (!activeId && previous) requestAnimationFrame(() => openerRefs.current[previous]?.focus());
  }, [activeId]);

  const openDetail = (scene: SceneItem, trigger: HTMLButtonElement) => {
    openerRefs.current[scene.id] = trigger;
    onNavigate("scenes/" + scene.id);
  };
  const closeDetail = () => onNavigate("scenes");

  return ${editorRoute}<section className="scene-module scene-directory" aria-labelledby="scene-title" data-scene-view={activeId ? "detail" : "list"}>
    <div className="scene-master">
      <div className="section-heading scene-heading"><div><span className="eyebrow">照明情景</span><h2 id="scene-title" tabIndex={-1}>家庭情景</h2><p>按房间查找、检查并管理真实动作范围。</p></div><div className="scene-heading-actions"><span className="scene-count">{filtered.length} / {scenes.length}</span>${createButton}</div></div>
      <div className="scene-filters"><label className="search-field"><span>搜索情景</span><span className="search-input"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名称或房间" /></span></label><label><span>房间</span><select value={room} onChange={(event) => setRoom(event.target.value)}><option value="all">全部房间</option>{rooms.map((name) => <option key={name} value={name}>{name}</option>)}</select></label></div>
      <div className="scene-list" aria-busy={loading}>{filtered.map((scene) => <article className={scene.id === activeId ? "scene-list-row selected" : "scene-list-row"} key={scene.id}><button ref={(node) => { openerRefs.current[scene.id] = node; }} type="button" className="scene-open-button" onClick={(event) => openDetail(scene, event.currentTarget)} aria-current={scene.id === activeId ? "page" : undefined}><span className="scene-icon"><Sparkles size={20} /></span><span><strong>{scene.name}</strong><small><MapPin size={14} />{scene.roomName || "全屋"}</small></span><ChevronRight size={18} /></button></article>)}{!loading && filtered.length === 0 && <div className="empty-state"><Search size={20} /><strong>没有符合条件的情景</strong><span>调整搜索词或房间筛选。</span></div>}</div>
    </div>
    <div className="scene-detail-pane">{activeId ? <SceneDetailView scene={selected} detail={detail} loading={detailLoading[activeId] === true} error={detailErrors[activeId]} retry={() => loadDetail(activeId, true)} back={closeDetail} execute={props.execute} onNavigate={onNavigate} testScene={props.testScene} previewDelete={props.previewDelete} deleteScene={props.deleteScene} /> : <div className="scene-detail-empty"><Layers3 size={24} /><strong>选择一个情景查看详情</strong><span>动作对象、目标状态和执行能力会显示在这里。</span></div>}</div>
  </section>;
  ${editorRouteClose}
}

function SceneDetailView({ scene, detail, loading, error, retry, back, execute, onNavigate, testScene, previewDelete, deleteScene }: { scene?: SceneItem; detail?: SceneDetail; loading: boolean; error?: string; retry: () => Promise<SceneDetail | undefined>; back: () => void; execute: Props["execute"]; onNavigate: Props["onNavigate"]; testScene?: Props["testScene"]; previewDelete?: Props["previewDelete"]; deleteScene?: Props["deleteScene"] }) {
  const { busyId, feedback, run } = useSceneExecution(execute);
  const [operationBusy, setOperationBusy] = useState<"test" | "delete" | "">("");
  const [operationFeedback, setOperationFeedback] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const resolved = detail || scene;
  const actions = detail?.actions || detail?.editablePayload?.actions || [];
  const itemFeedback = scene ? feedback[scene.id] : undefined;
  const runTest = async () => { if (!scene || !testScene) return; setOperationBusy("test"); setOperationFeedback(""); try { setOperationFeedback(await testScene(scene)); } catch (cause) { setOperationFeedback(cause instanceof Error ? cause.message : "测试失败，请重试。"); } finally { setOperationBusy(""); } };
  const runDelete = async () => { if (!scene || !previewDelete || !deleteScene) return; setOperationBusy("delete"); setOperationFeedback(""); try { await previewDelete(scene); const message = await deleteScene(scene); setOperationFeedback(message); setDeleteOpen(false); onNavigate("scenes"); } catch (cause) { setOperationFeedback(cause instanceof Error ? cause.message : "删除失败，情景仍然保留。"); } finally { setOperationBusy(""); } };

  return <section className="scene-detail" aria-busy={loading}>
    <header><button type="button" className="scene-back-button" onClick={back}><ArrowLeft size={18} /><span>返回情景</span></button><div><span className="eyebrow">{categoryLabels[detail?.category || ""] || "情景详情"}</span><h2 id="scene-detail-title" tabIndex={-1}>{resolved?.name || "情景详情"}</h2><p>{detail?.description || "正在读取情景说明与动作范围。"}</p></div></header>
    {error ? <div className="scene-detail-error" role="alert"><XCircle size={20} /><div><strong>此情景详情暂时不可用</strong><span>{error} 列表和其它情景仍可使用。</span></div><button type="button" onClick={() => void retry()}><RefreshCw size={17} />重试</button></div> : loading && !detail ? <div className="scene-detail-loading"><LoaderCircle className="spin" size={22} /><span>正在同步情景详情</span></div> : detail ? <><div className="scene-detail-meta"><span><MapPin size={16} /><small>归属房间</small><strong>{detail.roomName || "全屋"}</strong></span><span><Layers3 size={16} /><small>动作数量</small><strong>{actions.length}</strong></span></div><section className="scene-action-section" aria-labelledby="scene-actions-title"><div className="scene-subheading"><div><small>执行范围</small><h3 id="scene-actions-title">动作摘要</h3></div><span>{actions.length} 项</span></div><div className="scene-action-list">{actions.map((action, index) => <div className="scene-action-row" key={(action.targetId || "action") + index}><span className="scene-action-index">{index + 1}</span><div><strong>{action.targetName || (action.opaque ? "未知动作" : "未命名目标")}</strong><small>{action.opaque ? "保留的厂商动作，仅查看" : targetTypeLabel(action.targetType)}</small><div className="scene-action-values">{action.opaque ? <span>未知动作</span> : Object.entries(action.set || {}).map(([key, value]) => <span key={key}>{propertyLabels[key] || key}：{formatValue(key, value)}</span>)}</div></div></div>)}</div></section></> : null}
    {scene && <><footer className="scene-detail-actions"><div className="scene-detail-command-row">{scene.executable ? <button type="button" className="scene-run-button" disabled={Boolean(busyId) || Boolean(operationBusy)} onClick={() => void run(scene)}>{busyId ? <LoaderCircle className="spin" size={18} /> : <Play size={18} />}<span>{busyId ? "正在执行" : "执行情景"}</span></button> : <div className="scene-unavailable"><CircleSlash2 size={17} /><span>{scene.unavailableReason || "当前家庭暂不支持执行此情景。"}</span></div>}${testButton}${editButton}</div><div className={(itemFeedback || operationFeedback) ? "scene-feedback visible " + (itemFeedback?.type || "success") : "scene-feedback"} aria-live="polite">{operationFeedback ? <><CheckCircle2 size={16} /><span>{operationFeedback}</span></> : itemFeedback ? <>{itemFeedback.type === "success" ? <CheckCircle2 size={16} /> : <XCircle size={16} />}<span>{itemFeedback.message}</span></> : null}</div></footer>${deleteButton ? `<section className="scene-danger-zone" aria-labelledby="scene-danger-title"><div><small>危险操作</small><h3 id="scene-danger-title">删除情景</h3><p>删除后，依赖此情景的快捷入口或自动化可能失效，且无法撤销。</p></div>${deleteButton}</section>` : ""}{deleteOpen && ${deleteDialog}}</>}
  </section>;
}

${canDelete ? `function GuardedSceneDelete({ scene, busy, feedback, close, confirm }: { scene: SceneItem; busy: boolean; feedback: string; close: () => void; confirm: () => Promise<void> }) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => { const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; dialogRef.current?.focus(); const key = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) close(); }; document.addEventListener("keydown", key); return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", key); }; }, [busy, close]);
  return <div className="scene-delete-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) close(); }}><section ref={dialogRef} className="scene-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="scene-delete-title" tabIndex={-1}><header><AlertTriangle size={22} /><div><small>不可恢复</small><h3 id="scene-delete-title">删除“{scene.name}”</h3></div><button type="button" className="icon-button" disabled={busy} onClick={close} aria-label="关闭删除确认"><X size={18} /></button></header><p>系统会先预览影响，再执行删除，并通过情景列表确认该资源已经不存在。</p>{feedback && <div className="field-error" role="alert">{feedback}</div>}<footer><button type="button" className="secondary-button" disabled={busy} onClick={close}>取消</button><button type="button" className="danger-button" disabled={busy} onClick={() => void confirm()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Trash2 size={17} />}{busy ? "正在验证删除" : "确认删除"}</button></footer></section></div>;
}` : ""}

function targetTypeLabel(value?: string) { return ({ device: "设备", group: "设备组", room: "房间", scene: "情景" } as Record<string, string>)[value || ""] || "家庭对象"; }
function formatValue(key: string, value: unknown) { if (typeof value === "boolean") return value ? "开启" : "关闭"; if (key === "color") return formatColor(value); if (key === "brightness" || key === "targetPercent") return String(value) + "%"; if (key === "colorTemperature") return String(value) + " K"; return String(value); }
function formatColor(value: unknown) { const number = Number(value); return Number.isFinite(number) ? "#" + Math.min(0xFFFFFF, Math.max(0, Math.round(number))).toString(16).padStart(6, "0").toUpperCase() : "-"; }
`;
}

function escapeTemplate(value) {
  return String(value || "").replace(/[\\`$]/g, "");
}
