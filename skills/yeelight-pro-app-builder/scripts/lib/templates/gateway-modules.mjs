export function gatewayOverviewSource(_spec, _snapshot, operations = {}) {
  const configureEnabled = Boolean(operations.configure?.enabled);
  const configureReason = JSON.stringify(operations.configure?.userMessage || "当前家庭仅支持查看，暂不能修改。");
  const deleteEnabled = Boolean(operations.delete?.enabled);
  const deleteProp = deleteEnabled ? "; deleteGateway: (id: string, name: string) => Promise<boolean>" : "";
  const deleteState = deleteEnabled ? "  const [deleting, setDeleting] = useState(false);\n  const closeDelete = () => { setDeleting(false); window.setTimeout(() => document.querySelector<HTMLButtonElement>('[data-focus-key=\"gateway-delete-trigger\"]')?.focus(), 0); };" : "";
  const deleteZone = deleteEnabled ? `<div className="gateway-danger-zone"><div><strong>危险操作</strong><span>移除网关会中断其承载的设备、情景与协议连接。</span></div><button data-focus-key="gateway-delete-trigger" type="button" className="danger-action" onClick={() => setDeleting(true)}><Trash2 size={17} />移除网关</button></div>` : "";
  const deleteDialog = deleteEnabled ? `{deleting && <GatewayDeleteDialog gateway={gateway} saving={props.saving} error={errors[gatewayId + ":delete"]} onClose={closeDelete} onDelete={async () => { if (await props.deleteGateway(gateway.id, gateway.name)) { closeDelete(); onNavigate("gateways"); } }} />}` : "";
  const deleteComponent = deleteEnabled ? `
function GatewayDeleteDialog({ gateway, saving, error, onClose, onDelete }: { gateway: Gateway; saving: boolean; error?: string; onClose: () => void; onDelete: () => Promise<void> }) {
  const [confirmation, setConfirmation] = useState("");
  const dialogRef = useRef<HTMLElement>(null); const inputRef = useRef<HTMLInputElement>(null);
  const close = () => { if (!saving) onClose(); };
  useEffect(() => { const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; inputRef.current?.focus(); const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); if (event.key !== "Tab" || !dialogRef.current) return; const controls = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")]; const first = controls[0]; const last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }; document.addEventListener("keydown", onKey); return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", onKey); }; }, [saving]);
  return <div className="gateway-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section ref={dialogRef} className="gateway-dialog gateway-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="gateway-delete-title"><header><div><small>危险操作</small><h3 id="gateway-delete-title">移除 {gateway.name}</h3></div><button type="button" className="icon-button" onClick={close} disabled={saving} aria-label="关闭网关移除确认"><X size={18} /></button></header><div className="gateway-delete-impact"><AlertTriangle size={20} /><div><strong>此操作会改变当前家庭的基础设施</strong><span>网关承载的设备、情景和协议连接可能立即中断。移除后将重新读取网关列表确认结果。</span></div></div><label className="gateway-delete-confirmation">输入网关名称以确认<strong>{gateway.name}</strong><input ref={inputRef} value={confirmation} autoComplete="off" onChange={(event) => setConfirmation(event.target.value)} /></label>{error && <div className="gateway-dialog-error" role="alert"><CircleAlert size={18} />{error}</div>}<footer><button type="button" className="secondary-action" onClick={close} disabled={saving}>取消</button><button type="button" className="danger-action" disabled={saving || confirmation !== gateway.name} onClick={() => void onDelete()}>{saving ? <RefreshCw className="spin" size={17} /> : <Trash2 size={17} />}{saving ? "正在移除" : "确认移除网关"}</button></footer></section></div>;
}
` : "";
  return `import { AlertTriangle, ArrowLeft, Boxes, Building2, Cable, CheckCircle2, ChevronRight, CircleAlert, Cpu, Network, Pencil, RadioTower, RefreshCw, Router, Settings2, ShieldCheck, Trash2, Wifi, WifiOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Room = { id: string; name: string };
type Diagnosis = { status?: string; summary?: string; unknownEvidence?: string[] };
type ThreadInfo = { role?: string; networkName?: string; channel?: number; childCount?: number };
type Gateway = { id: string; name: string; roomName?: string; roomIds?: string[]; online: boolean; model?: string; firmwareVersion?: string; configCount?: number; supportedBridgeType?: string[]; deviceCount?: number; roomCount?: number; threadInfo?: ThreadInfo; sceneRelations?: string[]; diagnosis?: Diagnosis };
type Props = { gateways: Gateway[]; rooms: Room[]; loading: boolean; saving: boolean; errors: Record<string, string>; feedback?: string; activeRoute: string; onNavigate: (route: string) => void; refresh: () => Promise<void>; loadGateway: (id: string) => Promise<void>; configureGateway: (id: string, input: { name: string; roomIds: string[] }) => Promise<boolean>${deleteProp} };

const configureEnabled = ${configureEnabled};
const configureReason = ${configureReason};

export function GatewayOverview(props: Props) {
  const gatewayId = props.activeRoute.split("/")[1];
  const gateway = props.gateways.find((item) => item.id === gatewayId);
  useEffect(() => { if (gatewayId) void props.loadGateway(gatewayId); }, [gatewayId]);
  if (gatewayId) return <GatewayDetail {...props} gateway={gateway} gatewayId={gatewayId} />;
  return <GatewayDirectory {...props} />;
}

function GatewayDirectory({ gateways, loading, errors, refresh, onNavigate }: Props) {
  const offline = gateways.filter((item) => !item.online).length;
  return <section className="gateway-module" aria-labelledby="gateway-title">
    <div className="section-heading gateway-heading"><div><span className="eyebrow">家庭基础设施</span><h2 id="gateway-title" tabIndex={-1}>网关与协议</h2><p>集中查看家庭中枢、覆盖范围、Thread 与桥接协议状态。</p></div><span className="gateway-count">{gateways.length} 个网关</span></div>
    <div className="gateway-summary" aria-label="网关状态摘要"><span><Router size={19} /><strong>{gateways.length}</strong><small>全部网关</small></span><span className={offline ? "attention" : "healthy"}>{offline ? <WifiOff size={19} /> : <ShieldCheck size={19} />}<strong>{offline}</strong><small>离线</small></span><span><Network size={19} /><strong>{new Set(gateways.flatMap((item) => item.supportedBridgeType || [])).size}</strong><small>协议类型</small></span></div>
    {loading && <div className="gateway-loading" role="status"><RefreshCw className="spin" size={18} />正在同步网关信息</div>}
    <ErrorNotice message={errors.list || errors.stats} retry={refresh} />
    <div className="gateway-list" aria-busy={loading}>{gateways.map((gateway) => <button type="button" className={gateway.online ? "gateway-row" : "gateway-row offline"} key={gateway.id} onClick={() => onNavigate("gateways/" + gateway.id)}>
      <span className="gateway-icon"><Router size={21} /></span><span className="gateway-row-copy"><strong>{gateway.name}</strong><small>{gateway.roomName || "家庭网关"} · {gateway.model || "型号未提供"}</small><span>{gateway.deviceCount || 0} 个设备 · {gateway.roomCount || 0} 个房间</span></span><span className={gateway.online ? "gateway-status online" : "gateway-status offline"}>{gateway.online ? <Wifi size={15} /> : <WifiOff size={15} />}{gateway.online ? "在线" : "离线"}</span><ChevronRight size={19} />
    </button>)}</div>
    {!loading && gateways.length === 0 && <div className="empty-state"><Router size={24} /><strong>暂无网关</strong><span>当前家庭未返回可展示的网关设备。</span></div>}
  </section>;
}

function GatewayDetail(props: Props & { gateway?: Gateway; gatewayId: string }) {
  const { gateway, gatewayId, errors, refresh, onNavigate } = props;
  const [editing, setEditing] = useState(false);
  const closeEditor = () => { setEditing(false); window.setTimeout(() => document.querySelector<HTMLButtonElement>('[data-focus-key="gateway-edit-trigger"]')?.focus(), 0); };
${deleteState}
  if (!gateway) return <section className="gateway-detail"><button className="back-link" type="button" onClick={() => onNavigate("gateways")}><ArrowLeft size={18} />返回网关</button><ErrorNotice message={errors[gatewayId + ":detail"] || "暂时无法读取此网关。"} retry={() => props.loadGateway(gatewayId)} /></section>;
  const diagnosis = gateway.diagnosis;
  return <section className="gateway-detail" aria-labelledby="gateway-detail-title">
    <header><button className="back-link" type="button" onClick={() => onNavigate("gateways")}><ArrowLeft size={18} />返回网关</button><div><span className="eyebrow">网关详情</span><h2 id="gateway-detail-title" tabIndex={-1}>{gateway.name}</h2><p>{gateway.roomName || "家庭网关"}</p></div><span className={gateway.online ? "gateway-status online" : "gateway-status offline"}>{gateway.online ? <Wifi size={15} /> : <WifiOff size={15} />}{gateway.online ? "在线" : "离线"}</span></header>
    <ErrorNotice message={errors[gatewayId + ":detail"]} retry={() => props.loadGateway(gatewayId)} />
    <div className="gateway-detail-grid">
      <section className="gateway-section" aria-labelledby="gateway-identity"><SectionTitle icon={<Cpu size={19} />} id="gateway-identity" title="身份与覆盖" /><dl className="gateway-facts"><Fact label="型号" value={gateway.model} /><Fact label="固件版本" value={gateway.firmwareVersion} /><Fact label="接入设备" value={gateway.deviceCount} /><Fact label="覆盖房间" value={gateway.roomCount} /><Fact label="配置项" value={gateway.configCount} /><Fact label="所在空间" value={gateway.roomName} /></dl></section>
      <section className="gateway-section" aria-labelledby="gateway-thread"><SectionTitle icon={<Network size={19} />} id="gateway-thread" title="Thread 与协议" /><ErrorNotice message={errors[gatewayId + ":thread"]} retry={() => props.loadGateway(gatewayId)} /><dl className="gateway-facts"><Fact label="网络名称" value={gateway.threadInfo?.networkName} /><Fact label="角色" value={roleLabel(gateway.threadInfo?.role)} /><Fact label="信道" value={gateway.threadInfo?.channel} /><Fact label="子设备" value={gateway.threadInfo?.childCount} /></dl><div className="protocol-list">{(gateway.supportedBridgeType || []).map((protocol) => <span key={protocol}><Cable size={16} />{protocolLabel(protocol)}</span>)}</div></section>
      <section className="gateway-section" aria-labelledby="gateway-scenes"><SectionTitle icon={<Boxes size={19} />} id="gateway-scenes" title="情景关系" /><ErrorNotice message={errors[gatewayId + ":relations"]} retry={() => props.loadGateway(gatewayId)} /><div className="relation-summary"><strong>{gateway.sceneRelations?.length || 0}</strong><span>个情景由此网关承载</span></div>{!gateway.sceneRelations?.length && <p className="gateway-empty-copy">当前网关没有返回情景关联。</p>}</section>
      <section className="gateway-section" aria-labelledby="gateway-diagnosis"><SectionTitle icon={<ShieldCheck size={19} />} id="gateway-diagnosis" title="运行诊断" /><ErrorNotice message={errors[gatewayId + ":diagnose"]} retry={() => props.loadGateway(gatewayId)} />{diagnosis ? <><div className={diagnosis.status === "success" ? "diagnosis-summary healthy" : "diagnosis-summary attention"}>{diagnosis.status === "success" ? <CheckCircle2 size={19} /> : <AlertTriangle size={19} />}<div><strong>{diagnosis.status === "success" ? "诊断通过" : "只读诊断 · 证据有限"}</strong><span>{diagnosis.summary || "已读取当前可用的网关基础信息。"}</span></div></div>{Boolean(diagnosis.unknownEvidence?.length) && <ul className="diagnosis-list">{diagnosis.unknownEvidence?.map((item) => <li key={item}><span>{evidenceLabel(item)}</span><strong>暂无证据</strong></li>)}</ul>}</> : <p className="gateway-empty-copy">当前未返回诊断结果。</p>}</section>
      <section className="gateway-section gateway-settings" aria-labelledby="gateway-settings"><SectionTitle icon={<Settings2 size={19} />} id="gateway-settings" title="网关设置" /><p>修改网关名称和覆盖空间。保存前会先检查变更，再写入并重新读取结果。</p>{configureEnabled ? <button data-focus-key="gateway-edit-trigger" type="button" className="primary-action" onClick={() => setEditing(true)}><Pencil size={17} />编辑网关</button> : <div className="gateway-terminal"><CircleAlert size={18} /><span>{configureReason}</span></div>}${deleteZone}</section>
    </div>
    {props.feedback && <div className="gateway-feedback" aria-live="polite">{props.feedback}</div>}
    {editing && <GatewayEditor gateway={gateway} rooms={props.rooms} saving={props.saving} error={errors[gatewayId + ":configure"]} onClose={closeEditor} onSave={async (input) => { if (await props.configureGateway(gateway.id, input)) closeEditor(); }} />}
    ${deleteDialog}
  </section>;
}

function GatewayEditor({ gateway, rooms, saving, error, onClose, onSave }: { gateway: Gateway; rooms: Room[]; saving: boolean; error?: string; onClose: () => void; onSave: (input: { name: string; roomIds: string[] }) => Promise<void> }) {
  const [name, setName] = useState(gateway.name);
  const [roomIds, setRoomIds] = useState<string[]>(gateway.roomIds || []);
  const [discardOpen, setDiscardOpen] = useState(false);
  const dialogRef = useRef<HTMLElement>(null); const nameRef = useRef<HTMLInputElement>(null); const discardRef = useRef<HTMLButtonElement>(null);
  const dirty = name !== gateway.name || JSON.stringify([...roomIds].sort()) !== JSON.stringify([...(gateway.roomIds || [])].sort());
  const close = () => { if (saving) return; if (dirty) { setDiscardOpen(true); return; } onClose(); };
  useEffect(() => { const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; const timer = window.setTimeout(() => { if (discardOpen) discardRef.current?.focus(); else nameRef.current?.focus(); }, 0); const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { if (discardOpen) setDiscardOpen(false); else close(); return; } if (event.key !== "Tab" || !dialogRef.current) return; const controls = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")]; const first = controls[0]; const last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }; document.addEventListener("keydown", onKey); return () => { window.clearTimeout(timer); document.body.style.overflow = previous; document.removeEventListener("keydown", onKey); }; }, [dirty, saving, discardOpen]);
  return <div className="gateway-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) discardOpen ? setDiscardOpen(false) : close(); }}><section ref={dialogRef} className="gateway-dialog" role="dialog" aria-modal="true" aria-labelledby="gateway-dialog-title">{discardOpen ? <><header><div><small>尚未保存</small><h3 id="gateway-dialog-title">放弃当前修改？</h3></div><button type="button" className="icon-button" onClick={() => setDiscardOpen(false)} aria-label="继续编辑网关设置"><X size={18} /></button></header><div className="gateway-delete-impact"><AlertTriangle size={20} /><div><strong>修改尚未保存</strong><span>放弃后，本次网关设置将恢复为打开弹框前的状态。</span></div></div><footer><button ref={discardRef} type="button" className="secondary-action" onClick={() => setDiscardOpen(false)}>继续编辑</button><button type="button" className="danger-action" onClick={onClose}><Trash2 size={17} />放弃修改</button></footer></> : <><header><div><small>网关设置</small><h3 id="gateway-dialog-title">编辑 {gateway.name}</h3></div><button type="button" className="icon-button" onClick={close} aria-label="关闭网关编辑"><X size={18} /></button></header><label>网关名称<input ref={nameRef} value={name} maxLength={40} onChange={(event) => setName(event.target.value)} /></label><fieldset><legend>覆盖空间</legend><div className="gateway-room-options">{rooms.map((room) => <label key={room.id}><input type="checkbox" checked={roomIds.includes(room.id)} onChange={() => setRoomIds((current) => current.includes(room.id) ? current.filter((id) => id !== room.id) : [...current, room.id])} /><span>{room.name}</span></label>)}</div></fieldset>{error && <div className="gateway-dialog-error" role="alert"><CircleAlert size={18} />{error}</div>}<footer><button type="button" className="secondary-action" onClick={close}>取消</button><button type="button" className="primary-action" disabled={saving || !dirty || !name.trim()} onClick={() => void onSave({ name: name.trim(), roomIds })}>{saving ? <RefreshCw className="spin" size={17} /> : <CheckCircle2 size={17} />}{saving ? "正在保存" : "检查并保存"}</button></footer></>}</section></div>;
}
${deleteComponent}

function ErrorNotice({ message, retry }: { message?: string; retry: () => Promise<void> }) { return message ? <div className="gateway-error" role="alert"><CircleAlert size={18} /><span>{message}</span><button type="button" onClick={() => void retry()}><RefreshCw size={16} />重试</button></div> : null; }
function SectionTitle({ icon, id, title }: { icon: React.ReactNode; id: string; title: string }) { return <header className="gateway-section-title">{icon}<h3 id={id}>{title}</h3></header>; }
function Fact({ label, value }: { label: string; value: unknown }) { return <div><dt>{label}</dt><dd>{value === undefined || value === null || value === "" ? "未提供" : String(value)}</dd></div>; }
function roleLabel(value?: string) { return ({ "border-router": "边界路由器", router: "路由器", leader: "主节点" } as Record<string, string>)[value || ""] || value || "未提供"; }
function protocolLabel(value: string) { return ({ thread: "Thread", matter: "Matter", dali: "DALI", "ble-mesh": "蓝牙 Mesh" } as Record<string, string>)[value.toLowerCase()] || value; }
function evidenceLabel(value: string) { return ({ gateway_child_device_health_unavailable: "子设备健康状态", gateway_network_quality_unavailable: "网络质量", gateway_sync_log_unavailable: "同步记录", gateway_entity_projection_unavailable: "家庭实体投影", gateway_entity_type_projection_unavailable: "网关类型投影" } as Record<string, string>)[value] || "专项诊断证据"; }
`;
}
