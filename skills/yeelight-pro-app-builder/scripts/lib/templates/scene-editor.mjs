export function sceneEditorSource(operations = {}) {
  return `import { AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronDown, CircleAlert, LoaderCircle, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { SceneAction, SceneDetail, SceneDraft, SceneOperationResult, SceneTargetOption } from "../../runtime/use-scenes";
import { useUnsavedNavigationGuard } from "../../runtime/use-unsaved-navigation-guard";

type Props = {
  mode: "create" | "update";
  scene?: SceneDetail;
  targets: SceneTargetOption[];
  onPreview: (draft: SceneDraft) => Promise<SceneOperationResult>;
  onSave: (draft: SceneDraft) => Promise<SceneOperationResult>;
  onCancel: () => void;
  onNavigate: (route: string) => void;
};
type Issue = { field: string; message: string };
type DraftUpdate = Dispatch<SetStateAction<SceneDraft>>;
const steps = ["基本信息", "目标与动作", "检查并保存"];
const propertyLabels: Record<string, string> = { power: "开关", brightness: "亮度", colorTemperature: "色温", color: "颜色", targetPercent: "开合度", switchPower: "回路开关" };

export function SceneEditor({ mode, scene, targets, onPreview, onSave, onCancel, onNavigate }: Props) {
  const initial = useMemo(() => sceneDraft(scene), [scene]);
  const [draft, setDraft] = useState<SceneDraft>(initial);
  const [step, setStep] = useState(0);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [busy, setBusy] = useState<"preview" | "save" | "">("");
  const [feedback, setFeedback] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const guard = useUnsavedNavigationGuard({ dirty, onCancel, onNavigate, fallbackFocusSelector: "#scene-field-name, .scene-back-button" });

  useEffect(() => { setDraft(initial); }, [initial]);
  useEffect(() => { document.querySelector<HTMLElement>(".shell-content")?.scrollTo({ top: 0 }); requestAnimationFrame(() => document.querySelector<HTMLElement>("#scene-editor-title")?.focus()); }, []);
  const next = () => {
    const nextIssues = validateStep(draft, step);
    setIssues(nextIssues);
    if (nextIssues.length) return focusIssue(nextIssues[0]);
    setStep((value) => Math.min(2, value + 1));
  };
  const save = async () => {
    const allIssues = validateDraft(draft); setIssues(allIssues);
    if (allIssues.length) { setStep(allIssues[0].field === "name" ? 0 : 1); return focusIssue(allIssues[0]); }
    setBusy("preview"); setFeedback("");
    try {
      await onPreview(draft); setBusy("save");
      const result = await onSave(draft); setFeedback(result.message || "情景已保存");
      guard.allowNavigate(result.sceneId ? "scenes/" + result.sceneId : scene ? "scenes/" + scene.id : "scenes");
    } catch (cause) { setFeedback(cause instanceof Error ? cause.message : "保存失败，当前更改已保留，请重试。"); }
    finally { setBusy(""); }
  };

  return <section className="scene-editor" data-unsaved-editor aria-labelledby="scene-editor-title" aria-busy={Boolean(busy)}>
    <header className="scene-editor-header"><button type="button" className="scene-back-button" onClick={guard.requestCancel}><ArrowLeft size={18} /><span>取消</span></button><div><span className="eyebrow">{mode === "create" ? "新建情景" : "编辑情景"}</span><h2 id="scene-editor-title" tabIndex={-1}>{draft.name || "未命名情景"}</h2></div><span className="scene-editor-progress">{step + 1} / 3</span></header>
    <nav className="scene-stepper" aria-label="情景编辑步骤">{steps.map((label, index) => <button type="button" key={label} aria-current={step === index ? "step" : undefined} disabled={index > step + 1 || Boolean(busy)} onClick={() => setStep(index)}><span>{index < step ? <Check size={15} /> : index + 1}</span><strong>{label}</strong></button>)}</nav>
    <div className="scene-step-summary" aria-live="polite"><span>步骤 {step + 1} / 3</span><strong>{steps[step]}</strong></div>
    <div className="scene-editor-body">{step === 0 ? <Basics draft={draft} issues={issues} update={setDraft} /> : step === 1 ? <Actions draft={draft} targets={targets} issues={issues} update={setDraft} /> : <Review draft={draft} />}</div>
    <footer className="scene-editor-footer"><div className={feedback ? "scene-editor-feedback visible" : "scene-editor-feedback"} role={feedback ? "alert" : undefined}>{feedback && <><CircleAlert size={17} /><span>{feedback}</span></>}</div><div><button type="button" className="secondary-button" disabled={step === 0 || Boolean(busy)} onClick={() => setStep((value) => value - 1)}><ArrowLeft size={17} />上一步</button>{step < 2 ? <button type="button" className="primary-button" disabled={Boolean(busy)} onClick={next}>下一步<ArrowRight size={17} /></button> : <button type="button" className="primary-button" disabled={Boolean(busy)} onClick={() => void save()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}{busy === "preview" ? "正在预览" : busy === "save" ? "正在保存" : "检查并保存"}</button>}</div></footer>
    {guard.open && <div className="scene-guard-backdrop"><section ref={guard.dialogRef} className="scene-guard-dialog" role="dialog" aria-modal="true" aria-labelledby="scene-guard-title" tabIndex={-1}><AlertTriangle size={22} /><div><h3 id="scene-guard-title">保留当前更改？</h3><p>尚未保存的名称和动作会在离开后丢失。</p></div><div><button type="button" className="secondary-button" data-autofocus onClick={guard.continueEditing}>继续编辑</button><button type="button" className="danger-button" onClick={guard.discard}>放弃更改</button><button type="button" className="ghost-button" onClick={guard.continueEditing}>取消离开</button></div></section></div>}
  </section>;
}

function Basics({ draft, issues, update }: { draft: SceneDraft; issues: Issue[]; update: DraftUpdate }) {
  return <section className="scene-editor-section" aria-labelledby="scene-basics-title"><div className="scene-editor-section-heading"><small>步骤 1</small><h3 id="scene-basics-title">基本信息</h3><p>名称用于快速识别，说明用于补充使用时机和控制目标。</p></div><div className="scene-form-grid"><label><span>情景名称</span><input id="scene-field-name" value={draft.name} maxLength={40} aria-invalid={hasIssue(issues, "name")} aria-describedby={hasIssue(issues, "name") ? "scene-name-error" : undefined} onChange={(event) => { const value = event.target.value; update((current) => ({ ...current, name: value })); }} />{issue(issues, "name") && <small id="scene-name-error" role="alert">{issue(issues, "name")}</small>}</label><label><span>说明</span><textarea value={draft.description} maxLength={120} rows={3} onChange={(event) => { const value = event.target.value; update((current) => ({ ...current, description: value })); }} /></label><label><span>图标语义</span><select value={draft.icon} onChange={(event) => { const value = event.target.value; update((current) => ({ ...current, icon: value })); }}><option value="sparkles">通用情景</option><option value="sunrise">晨起</option><option value="moon">夜间</option><option value="film">影音</option><option value="door-open">归家</option></select></label></div></section>;
}

function Actions({ draft, targets, issues, update }: { draft: SceneDraft; targets: SceneTargetOption[]; issues: Issue[]; update: DraftUpdate }) {
  const add = () => { const target = targets[0]; if (!target) return; const property = target.properties[0]; update((current) => ({ ...current, actions: [...current.actions, { targetType: target.type, targetId: target.id, targetName: target.name, rank: current.actions.length, set: { [property]: defaultValue(property) } }] })); };
  return <section className="scene-editor-section" aria-labelledby="scene-actions-editor-title"><div className="scene-editor-section-heading"><small>步骤 2</small><h3 id="scene-actions-editor-title">目标与动作</h3><p>只显示当前家庭与目标控制能力已经证明的属性。</p></div>{issue(issues, "actions") && <div className="field-error" role="alert">{issue(issues, "actions")}</div>}<div className="scene-action-editor-list">{draft.actions.map((action, index) => action.opaque ? <div className="scene-action-editor-row readonly" key={"opaque-" + index}><span className="scene-action-index">{index + 1}</span><div><strong>{action.targetName || "保留的厂商动作"}</strong><small>保留的厂商动作，仅查看；保存时原样回传。</small></div></div> : <ActionRow key={(action.targetId || "action") + index} action={action} index={index} targets={targets} update={(next) => update((current) => ({ ...current, actions: current.actions.map((item, itemIndex) => itemIndex === index ? next : item) }))} remove={() => update((current) => ({ ...current, actions: current.actions.filter((_, itemIndex) => itemIndex !== index).map((item, rank) => ({ ...item, rank })) }))} />)}</div><button type="button" className="add-action-button" disabled={!targets.length} onClick={add}><Plus size={17} />添加动作</button>{!targets.length && <p className="field-help">当前家庭没有已证明可写属性的目标，现有动作仍会完整保留。</p>}</section>;
}

function ActionRow({ action, index, targets, update, remove }: { action: SceneAction; index: number; targets: SceneTargetOption[]; update: (value: SceneAction) => void; remove: () => void }) {
  const selected = targets.find((item) => item.id === action.targetId && item.type === action.targetType) || targets.find((item) => item.id === action.targetId);
  const properties = selected?.properties.length ? selected.properties : Object.keys(action.set || {});
  const property = Object.keys(action.set || {})[0] || properties[0] || "power";
  const value = action.set?.[property];
  const changeTarget = (key: string) => { const target = targets.find((item) => item.type + ":" + item.id === key); if (!target) return; const nextProperty = target.properties[0]; update({ targetType: target.type, targetId: target.id, targetName: target.name, rank: action.rank ?? index, set: { [nextProperty]: defaultValue(nextProperty) } }); };
  return <div className="scene-action-editor-row"><span className="scene-action-index">{index + 1}</span><div className="scene-action-editor-fields"><label><span>目标</span><span className="select-wrap"><select value={(action.targetType || "device") + ":" + (action.targetId || "")} onChange={(event) => changeTarget(event.target.value)}>{!selected && <option value={(action.targetType || "device") + ":" + (action.targetId || "")}>{action.targetName || "当前目标"}</option>}{targets.map((target) => <option key={target.type + target.id} value={target.type + ":" + target.id}>{target.roomName ? target.roomName + " · " : ""}{target.name}</option>)}</select><ChevronDown size={16} /></span></label><label><span>属性</span><select value={property} onChange={(event) => update({ ...action, set: { [event.target.value]: defaultValue(event.target.value) } })}>{properties.map((item) => <option value={item} key={item}>{propertyLabels[item] || item}</option>)}</select></label><ActionValue property={property} value={value} update={(next) => update({ ...action, set: { [property]: next } })} /></div><button type="button" className="icon-button danger-icon" aria-label={"删除第 " + (index + 1) + " 个动作"} onClick={remove}><Trash2 size={17} /></button></div>;
}

function ActionValue({ property, value, update }: { property: string; value: unknown; update: (value: unknown) => void }) {
  if (["power", "switchPower"].includes(property)) return <label><span>状态</span><select value={String(value !== false)} onChange={(event) => update(event.target.value === "true")}><option value="true">开启</option><option value="false">关闭</option></select></label>;
  const limits = property === "colorTemperature" ? [2700, 6500, 100] : property === "color" ? [0, 16777215, 1] : [0, 100, 1];
  return <label><span>{propertyLabels[property] || "数值"}</span><input type="number" min={limits[0]} max={limits[1]} step={limits[2]} value={Number(value ?? limits[0])} onChange={(event) => update(Number(event.target.value))} /></label>;
}

function Review({ draft }: { draft: SceneDraft }) {
  return <section className="scene-editor-section" aria-labelledby="scene-review-title"><div className="scene-editor-section-heading"><small>步骤 3</small><h3 id="scene-review-title">检查并保存</h3><p>系统会先生成无写入预览，再提交并回读情景详情和列表。</p></div><dl className="scene-review-list"><div><dt>名称</dt><dd>{draft.name}</dd></div><div><dt>说明</dt><dd>{draft.description || "未填写"}</dd></div><div><dt>动作</dt><dd>{draft.actions.length} 项，其中 {draft.actions.filter((item) => item.opaque).length} 项只读保留</dd></div></dl></section>;
}

function sceneDraft(scene?: SceneDetail): SceneDraft {
  const payload = scene?.editablePayload || {};
  const { actions: _actions, name: _name, description: _description, icon: _icon, roomId: _roomId, sceneId: _sceneId, ...preserved } = payload;
  return { name: String(payload.name || scene?.name || ""), description: String(payload.description || scene?.description || ""), icon: String(payload.icon || scene?.icon || "sparkles"), roomId: payload.roomId ? String(payload.roomId) : scene?.roomId, actions: structuredClone(scene?.actions || payload.actions || []), preserved };
}
function validateStep(draft: SceneDraft, step: number) { return step === 0 ? validateBasics(draft) : step === 1 ? validateActions(draft) : validateDraft(draft); }
function validateDraft(draft: SceneDraft) { return [...validateBasics(draft), ...validateActions(draft)]; }
function validateBasics(draft: SceneDraft): Issue[] { return draft.name.trim() ? [] : [{ field: "name", message: "请输入情景名称。" }]; }
function validateActions(draft: SceneDraft): Issue[] { return draft.actions.length ? [] : [{ field: "actions", message: "至少保留或添加一个情景动作。" }]; }
function defaultValue(property: string) { if (["power", "switchPower"].includes(property)) return true; if (property === "colorTemperature") return 4000; if (property === "brightness") return 50; return 0; }
function hasIssue(issues: Issue[], field: string) { return issues.some((item) => item.field === field); }
function issue(issues: Issue[], field: string) { return issues.find((item) => item.field === field)?.message || ""; }
function focusIssue(value: Issue) { requestAnimationFrame(() => document.querySelector<HTMLElement>("#scene-field-" + value.field)?.focus()); }
`;
}
