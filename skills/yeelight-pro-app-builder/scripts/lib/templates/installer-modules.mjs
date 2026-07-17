export function installerMaintenanceSource(_spec, _snapshot, operations = {}) {
  const terminals = terminalRows(operations);
  const selected = new Set((_spec.modules || []).map((module) => module.id));
  const gatewayRoute = selected.has("gateway.overview") ? `<RouteButton icon={<Router size={19} />} title="网关与协议" detail={props.gateways.length + " 个网关 · " + (protocols.length + threads.length) + " 项已证实关系"} route="gateways" onNavigate={props.onNavigate} />` : "";
  const panelRoute = selected.has("panel.manager") ? `<RouteButton icon={<LayoutPanelTop size={19} />} title="面板旋钮" detail={props.panels.length + " 个面板 · " + props.knobs.length + " 个旋钮"} route="panels" onNavigate={props.onNavigate} />` : "";
  const gatewayDiagnostics = selected.has("gateway.overview") ? `<section className="installer-section"><SectionTitle icon={<Cable size={19} />} title="Matter 与 DALI 设备关系" />{protocols.length > 0 && <div className="installer-table" role="table" aria-label="网关设备协议关系">{protocols.map((row) => <div role="row" key={row.gatewayId + row.protocol + row.deviceId}><span role="cell"><strong>{row.protocol}</strong><small>{row.gateway}</small></span><span role="cell"><strong>{row.device}</strong><small>关联设备</small></span><span role="cell" className={row.online ? "healthy" : "attention"}><strong>{row.room}</strong><small>所在房间 · {row.online ? "在线" : "离线"}</small></span></div>)}</div>}{protocols.length === 0 && <Empty text="当前家庭未返回可追踪的 Matter 或 DALI 设备关系。" />}</section>
    <section className="installer-section"><SectionTitle icon={<Router size={19} />} title="Thread 网络" />{threads.length > 0 && <div className="installer-table" role="table" aria-label="Thread 网关拓扑">{threads.map((row) => <div role="row" key={row.gatewayId}><span role="cell"><strong>Thread</strong><small>{row.gateway}</small></span><span role="cell"><strong>{row.network}</strong><small>网络名称</small></span><span role="cell" className={row.online ? "healthy" : "attention"}><strong>{row.room}</strong><small>{row.online ? "在线" : "离线"} · {row.role}</small></span></div>)}</div>}{threads.length === 0 && <Empty text="当前家庭未返回 Thread 网络拓扑。" />}</section>
    <section className="installer-section"><SectionTitle icon={<Cpu size={19} />} title="固件版本" /><div className="installer-table" role="table" aria-label="网关固件版本">{props.gateways.map((gateway) => <div role="row" key={gateway.id}><span role="cell"><strong>{gateway.name}</strong><small>{gateway.roomName || "家庭网关"}</small></span><span role="cell">{gateway.firmwareVersion || "未提供"}</span><span role="cell" className={gateway.online ? "healthy" : "attention"}>{gateway.online ? "在线" : "离线"}</span></div>)}</div></section>` : "";
  return `import { AlertTriangle, Cable, ChevronRight, CircleAlert, Cpu, LayoutPanelTop, RefreshCw, Router, ShieldAlert, ShieldCheck, SlidersHorizontal, WifiOff, Wrench } from "lucide-react";

type ProtocolDevice = { id: string; name: string; roomId: string; roomName: string; online: boolean };
type ProtocolRelationship = { gatewayId: string; gatewayName: string; protocol: string; devices: ProtocolDevice[]; rooms: { id: string; name: string }[] };
type Gateway = { id: string; name: string; roomName?: string; online: boolean; firmwareVersion?: string; threadInfo?: { role?: string; networkName?: string; channel?: number; childCount?: number }; protocolRelationships?: ProtocolRelationship[]; diagnosis?: { status?: string; summary?: string } };
type Panel = { id: string; name: string; roomName: string; online: boolean };
type Knob = { id: string; name: string; roomName: string; online: boolean };
type Props = { gateways: Gateway[]; panels: Panel[]; knobs: Knob[]; gatewayErrors: Record<string, string>; panelErrors: Record<string, string>; refreshGateways: () => Promise<void>; refreshPanels: () => Promise<void>; onNavigate: (route: string) => void };
const terminalRows = ${JSON.stringify(terminals)} as { label: string; status: string; message: string }[];

export function InstallerOverview(props: Props) {
  const issues = issueRows(props); const protocols = protocolRows(props.gateways); const threads = threadRows(props.gateways);
  return <section className="installer-page" aria-labelledby="installer-overview-title">
    <PageHeading eyebrow="安装维护" title="维护总览" id="installer-overview-title" description="先处理离线、降级、版本不匹配与局部同步失败，再查看正常基础设施。" />
    <div className="installer-priority-band"><div><ShieldAlert size={22} /><span><strong>{issues.length + terminalRows.length}</strong><small>需要优先处理</small></span></div><div><WifiOff size={20} /><span><strong>{issues.filter((item) => item.kind === "offline").length}</strong><small>离线设备</small></span></div><div><Cable size={20} /><span><strong>{protocols.length + threads.length}</strong><small>协议关系</small></span></div></div>
    <section className="installer-section"><SectionTitle icon={<AlertTriangle size={19} />} title="需要优先处理" /><IssueList rows={[...issues, ...terminalRows.map((item) => ({ ...item, kind: "version" }))]} empty="当前没有已证明的基础设施异常。" onNavigate={props.onNavigate} /></section>
    <section className="installer-section"><SectionTitle icon={<Router size={19} />} title="基础设施入口" /><div className="installer-route-list">${gatewayRoute}${panelRoute}<RouteButton icon={<ShieldAlert size={19} />} title="版本与诊断" detail={terminalRows.length + " 项能力终态"} route="diagnostics" onNavigate={props.onNavigate} /></div></section>
  </section>;
}

export function InstallerIssues(props: Props) {
  const issues = issueRows(props);
  return <section className="installer-page" aria-labelledby="installer-issues-title"><PageHeading eyebrow="异常优先" title="异常设备" id="installer-issues-title" description="这里只展示家庭当前返回的离线状态和同步失败，不推断信号、健康分数或硬件故障。" /><section className="installer-section"><IssueList rows={issues} empty="当前没有离线设备或局部同步失败。" onNavigate={props.onNavigate} /></section></section>;
}

export function InstallerDiagnostics(props: Props) {
  const protocols = protocolRows(props.gateways); const threads = threadRows(props.gateways);
  return <section className="installer-page" aria-labelledby="installer-diagnostics-title"><PageHeading eyebrow="基础设施证据" title="版本与诊断" id="installer-diagnostics-title" description="固件、协议和可用状态均来自当前家庭与本地环境证据；未提供固件升级操作。" />
    ${gatewayDiagnostics}
    <section className="installer-section"><SectionTitle icon={<ShieldAlert size={19} />} title="版本不匹配" />{terminalRows.length ? <div className="installer-terminal-list">{terminalRows.map((row) => <article key={row.label}><CircleAlert size={18} /><div><strong>{row.label}</strong><span>{row.message}</span><small>恢复建议：更新本地运行环境后重新生成应用并再次验证。</small></div></article>)}</div> : <Empty text="当前环境没有版本不匹配项。" />}</section>
  </section>;
}

function issueRows(props: Props) {
  const offline = [
    ...props.gateways.filter((item) => !item.online).map((item) => ({ kind: "offline", label: item.name, status: "网关离线", message: (item.roomName || "家庭") + " · 检查供电与家庭网络后重试。", route: "gateways/" + item.id })),
    ...props.panels.filter((item) => !item.online).map((item) => ({ kind: "offline", label: item.name, status: "面板离线", message: item.roomName + " · 检查面板与网关连接。", route: "panels/" + item.id })),
    ...props.knobs.filter((item) => !item.online).map((item) => ({ kind: "offline", label: item.name, status: "旋钮离线", message: item.roomName + " · 检查旋钮与网关连接。", route: "panels/knobs/" + item.id })),
  ];
  const partial = [...Object.values(props.gatewayErrors), ...Object.values(props.panelErrors)].filter(Boolean).map((message, index) => ({ kind: "partial", label: "局部同步 " + (index + 1), status: "同步失败", message }));
  return [...offline, ...partial];
}
function protocolRows(gateways: Gateway[]) { const labels = { matter: "Matter", dali: "DALI" } as Record<string, string>; return gateways.flatMap((gateway) => (gateway.protocolRelationships || []).flatMap((relationship) => relationship.devices.map((device) => ({ gatewayId: gateway.id, gateway: relationship.gatewayName || gateway.name, protocol: labels[relationship.protocol.toLowerCase()] || relationship.protocol, deviceId: device.id, device: device.name, room: device.roomName, online: device.online })))); }
function threadRows(gateways: Gateway[]) { return gateways.filter((gateway) => gateway.threadInfo && Object.keys(gateway.threadInfo).length > 0).map((gateway) => ({ gatewayId: gateway.id, gateway: gateway.name, room: gateway.roomName || "家庭网关", online: gateway.online, network: gateway.threadInfo?.networkName || "未提供", role: gateway.threadInfo?.role || "角色未提供" })); }
function PageHeading({ eyebrow, title, id, description }: { eyebrow: string; title: string; id: string; description: string }) { return <header className="installer-heading"><span className="eyebrow">{eyebrow}</span><h2 id={id} tabIndex={-1}>{title}</h2><p>{description}</p></header>; }
function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) { return <header className="installer-section-title">{icon}<h3>{title}</h3></header>; }
function IssueList({ rows, empty, onNavigate }: { rows: any[]; empty: string; onNavigate: (route: string) => void }) { return rows.length ? <div className="installer-issue-list">{rows.map((row, index) => <article key={row.label + index}><span className="installer-issue-icon">{row.kind === "offline" ? <WifiOff size={18} /> : <CircleAlert size={18} />}</span><div><strong>{row.label}</strong><span>{row.status}</span><small>{row.message}</small></div>{row.route && <button type="button" onClick={() => onNavigate(row.route)}>查看<ChevronRight size={17} /></button>}</article>)}</div> : <Empty text={empty} />; }
function RouteButton({ icon, title, detail, route, onNavigate }: { icon: React.ReactNode; title: string; detail: string; route: string; onNavigate: (route: string) => void }) { return <button type="button" onClick={() => onNavigate(route)}>{icon}<span><strong>{title}</strong><small>{detail}</small></span><ChevronRight size={18} /></button>; }
function Empty({ text }: { text: string }) { return <div className="installer-empty"><ShieldCheck size={19} /><span>{text}</span></div>; }
`;
}

function terminalRows(operations) {
  const labels = { click: "面板测试", delete: "移除网关", configure: "网关设置", knobConfigure: "旋钮配置", knobReset: "旋钮重置" };
  return Object.values(operations || {}).flatMap((group) => Object.entries(group || {}).filter(([, operation]) => operation?.terminal === "version-mismatch").map(([name, operation]) => ({ label: labels[name] || "基础设施能力", status: "版本不匹配", message: operation.userMessage || "当前运行环境版本暂不支持此操作。" })));
}
