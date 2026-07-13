export function homeSpaceSummarySource(spec) {
  const hierarchyEnabled = spec.modules?.some((module) => module.id === "room.device-management") === true;
  const areaHeading = hierarchyEnabled
    ? '<button type="button" className="home-area-heading" onClick={() => onNavigate?.("spaces/areas/" + area.id)}><span><small>区域</small><strong>{area.name}</strong></span><em>{areaDevices.filter((device) => device.online).length}/{areaDevices.length} 在线</em></button>'
    : '<div className="home-area-heading"><span><small>区域</small><strong>{area.name}</strong></span><em>{areaDevices.filter((device) => device.online).length}/{areaDevices.length} 在线</em></div>';
  const roomRow = hierarchyEnabled
    ? '<button type="button" className="home-room-row" key={room.id} onClick={() => onNavigate?.("spaces/rooms/" + room.id)}><span><strong>{room.name}</strong><small>{roomDevices.length} 台设备</small></span><em>{roomDevices.filter((device) => device.online).length} 在线</em></button>'
    : '<div className="home-room-row" key={room.id}><span><strong>{room.name}</strong><small>{roomDevices.length} 台设备</small></span><em>{roomDevices.filter((device) => device.online).length} 在线</em></div>';
  return `import { AlertTriangle, Building2, DoorOpen, Radio, Router } from "lucide-react";
	import type { ManagedArea, ManagedDevice, ManagedRoom } from "../../runtime/use-home-model";

export function HomeStatusSummary({ areas, rooms, devices, loading }: { areas: ManagedArea[]; rooms: ManagedRoom[]; devices: ManagedDevice[]; loading: boolean }) {
  const online = devices.filter((device) => device.online).length;
  return <section id="overview" className="home-status-summary" aria-busy={loading}>
    <div className="summary-band"><div className="summary-heading"><span className="summary-icon"><Building2 size={22} /></span><div><small>Yeelight PRO 家庭空间</small><h2 tabIndex={-1}>家庭总览</h2><p>{areas.length} 个区域中的设备与连接状态</p></div></div>
      <div className="summary-metrics"><span><DoorOpen size={16} /><strong>{rooms.length}</strong><small>房间</small></span><span><Router size={16} /><strong>{devices.length}</strong><small>设备</small></span><span><Radio size={16} /><strong>{loading ? "-" : online}</strong><small>在线</small></span></div>
    </div>
  </section>;
}

export function HomeRoomsSummary({ areas, rooms, devices, onNavigate }: { areas: ManagedArea[]; rooms: ManagedRoom[]; devices: ManagedDevice[]; onNavigate?: (route: string) => void }) {
  return <section className="home-rooms-summary" aria-labelledby="home-rooms-title"><div className="section-heading"><div><small>家庭空间</small><h2 id="home-rooms-title">区域与房间</h2></div><span className="result-count">{areas.length} 个区域 · {rooms.length} 个房间</span></div>
    <div className="home-area-grid">{areas.map((area) => { const areaRooms = rooms.filter((room) => room.areaId === area.id); const areaDevices = devices.filter((device) => device.areaId === area.id); return <section className="home-area" key={area.id}>${areaHeading}<div className="home-room-list">{areaRooms.map((room) => { const roomDevices = devices.filter((device) => device.roomId === room.id); return ${roomRow}; })}</div></section>; })}</div>
  </section>;
}

export function HomeIssuesSummary({ devices }: { devices: ManagedDevice[] }) {
  const offline = devices.filter((device) => !device.online).length;
  const limited = devices.filter((device) => device.access !== "write").length;
  return <section className="home-issues-summary" aria-labelledby="home-issues-title"><div className="section-heading"><div><small>家庭状态</small><h2 id="home-issues-title">需要关注</h2></div></div>
    <div className={offline || limited ? "home-issue-strip warning" : "home-issue-strip"}><AlertTriangle size={18} /><div><strong>{offline ? offline + " 台设备离线" : limited ? limited + " 台设备受限" : "家庭状态正常"}</strong><span>{offline ? "离线设备仍保留在所属房间，可在设备目录进一步查看。" : limited ? "只读或版本不匹配设备不会显示未经证明的控制。" : "当前未发现离线或能力受限设备。"}</span></div></div>
  </section>;
}
`;
}

export function roomDeviceManagementSource(spec) {
  const controllerEnabled = spec.modules?.some((module) => ["room.lighting-control", "device.curtain-control", "device.switch-control", "device.climate-control", "sensor.environment"].includes(module.id)) === true;
  const controllerImport = controllerEnabled ? 'import { DeviceControllerHost } from "./controllers/registry";\n' : "";
  const controllerRender = controllerEnabled ? "    <DeviceControllerHost device={device} refreshDevice={refreshDevice} />\n" : "";
  return `import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronRight, Edit3, LoaderCircle, MapPin, Search, SlidersHorizontal, X } from "lucide-react";
	import type { ManagedArea, ManagedAreaDetail, ManagedDevice, ManagedDeviceDetail, ManagedRoom, ManagedRoomDetail } from "../../runtime/use-home-model";
${controllerImport}

type Navigate = (route: string) => void;
type LoadDeviceDetail = (id: string, force?: boolean) => Promise<ManagedDeviceDetail | undefined>;
type RefreshDevice = (id: string) => Promise<ManagedDeviceDetail | undefined>;
const familyNames: Record<string, string> = { light: "灯光", curtain: "窗帘", "switch-relay": "开关", climate: "温控", sensor: "传感器", gateway: "网关", "panel-screen": "面板", knob: "旋钮", other: "其它" };
const accessNames = { write: "可管理", "read-only": "只读", "version-mismatch": "版本不匹配" } as const;

export function SpaceDirectory({ areas, rooms, devices, areaDetails, roomDetails, detailLoading, detailErrors, loadAreaDetail, loadRoomDetail, activeRoute, onNavigate }: { areas: ManagedArea[]; rooms: ManagedRoom[]; devices: ManagedDevice[]; areaDetails: Record<string, ManagedAreaDetail>; roomDetails: Record<string, ManagedRoomDetail>; detailLoading: Record<string, boolean>; detailErrors: Record<string, string>; loadAreaDetail: (id: string, force?: boolean) => Promise<ManagedAreaDetail | undefined>; loadRoomDetail: (id: string, force?: boolean) => Promise<ManagedRoomDetail | undefined>; activeRoute: string; onNavigate: Navigate }) {
  const segments = activeRoute.split("/");
  const requestedAreaId = segments[1] === "areas" ? segments[2] : "";
  const requestedRoomId = segments[1] === "rooms" ? segments[2] : "";
  const area = requestedAreaId ? areas.find((item) => item.id === requestedAreaId) : undefined;
  const room = requestedRoomId ? rooms.find((item) => item.id === requestedRoomId) : undefined;
  useEffect(() => { if (area) void loadAreaDetail(area.id); }, [area?.id, loadAreaDetail]);
  useEffect(() => { if (room) void loadRoomDetail(room.id); }, [room?.id, loadRoomDetail]);
  if (requestedAreaId && !area) return <section className="space-directory"><BackHeader eyebrow="区域详情" title="未找到区域" onBack={() => onNavigate("spaces")} /><div className="empty-state"><AlertCircle size={24} /><strong>区域不存在或已被移除</strong><span>返回空间目录后重新同步。</span></div></section>;
  if (requestedRoomId && !room) return <section className="space-directory"><BackHeader eyebrow="房间详情" title="未找到房间" onBack={() => onNavigate("spaces")} /><div className="empty-state"><AlertCircle size={24} /><strong>房间不存在或已被移除</strong><span>返回空间目录后重新同步。</span></div></section>;
  if (area) {
    const areaRooms = rooms.filter((item) => item.areaId === area.id);
    const areaDevices = devices.filter((item) => item.areaId === area.id);
    return <section className="space-directory"><BackHeader eyebrow="区域详情" title={area.name} onBack={() => onNavigate("spaces")} />
      <ResourceState loading={detailLoading["area:" + area.id] === true} error={detailErrors["area:" + area.id] || ""} retry={() => void loadAreaDetail(area.id, true)} label="区域详情" />
      <div className="space-metrics"><span><strong>{areaRooms.length}</strong> 房间</span><span><strong>{areaDevices.length}</strong> 设备</span><span><strong>{areaDevices.filter((item) => item.online).length}</strong> 在线</span></div>
      {areaDetails[area.id]?.rooms.length ? <p className="resource-caption">已从家庭 Runtime 读取 {areaDetails[area.id].rooms.length} 个房间。</p> : null}
      <ObjectGrid items={areaRooms} devices={devices} onOpen={(id) => onNavigate("spaces/rooms/" + id)} />
    </section>;
  }
  if (room) {
    const roomDevices = devices.filter((item) => item.roomId === room.id);
    return <section className="space-directory"><BackHeader eyebrow={room.areaName} title={room.name} onBack={() => onNavigate("spaces/areas/" + room.areaId)} />
      <ResourceState loading={detailLoading["room:" + room.id] === true} error={detailErrors["room:" + room.id] || ""} retry={() => void loadRoomDetail(room.id, true)} label="房间详情" />
      <div className="space-metrics"><span><strong>{roomDevices.length}</strong> 设备</span><span><strong>{roomDevices.filter((item) => item.online).length}</strong> 在线</span><span><strong>{new Set(roomDevices.map((item) => item.family)).size}</strong> 类型</span></div>
      {roomDetails[room.id]?.scenes.length ? <p className="resource-caption">房间包含 {roomDetails[room.id].scenes.length} 个可用情景。</p> : null}
      <div className="managed-device-list">{roomDevices.map((device) => <DeviceRow key={device.id} device={device} onOpen={() => onNavigate("devices/" + device.id)} />)}</div>
    </section>;
  }
  return <section className="space-directory"><div className="section-heading"><div><small>家庭层级</small><h2 tabIndex={-1}>区域与房间</h2></div><span className="result-count">{areas.length} 个区域 · {rooms.length} 个房间</span></div>
    <div className="area-list">{areas.map((item) => { const areaRooms = rooms.filter((roomItem) => roomItem.areaId === item.id); const count = devices.filter((device) => device.areaId === item.id).length; return <section className="area-section" key={item.id}><button type="button" className="area-heading" onClick={() => onNavigate("spaces/areas/" + item.id)}><span><strong>{item.name}</strong><small>{areaRooms.length} 房间 · {count} 设备</small></span><ChevronRight size={18} /></button><ObjectGrid items={areaRooms} devices={devices} onOpen={(id) => onNavigate("spaces/rooms/" + id)} /></section>; })}</div>
  </section>;
}

function ResourceState({ loading, error, retry, label }: { loading: boolean; error: string; retry: () => void; label: string }) {
  if (loading) return <div className="detail-resource-state" role="status"><LoaderCircle className="spin" size={18} /><span>正在读取{label}</span></div>;
  if (error) return <div className="detail-resource-state error" role="alert"><AlertCircle size={18} /><span>{error}</span><button type="button" className="retry-button" onClick={retry}>重新读取</button></div>;
  return null;
}

function ObjectGrid({ items, devices, onOpen }: { items: ManagedRoom[]; devices: ManagedDevice[]; onOpen: (id: string) => void }) {
  return <div className="room-grid">{items.map((room) => { const roomDevices = devices.filter((device) => device.roomId === room.id); return <button type="button" className="room-tile" key={room.id} onClick={() => onOpen(room.id)}><span><strong>{room.name}</strong><small>{roomDevices.length} 设备 · {roomDevices.filter((device) => device.online).length} 在线</small></span><ChevronRight size={18} /></button>; })}</div>;
}

function BackHeader({ eyebrow, title, onBack }: { eyebrow: string; title: string; onBack: () => void }) {
  return <div className="detail-heading"><button type="button" className="icon-button" onClick={onBack} aria-label="返回上一级"><ArrowLeft size={20} /></button><div><small>{eyebrow}</small><h2 tabIndex={-1}>{title}</h2></div></div>;
}

export function RoomDeviceManagement({ areas, rooms, devices, details, detailLoading, detailErrors, loadDeviceDetail, refreshDevice, activeRoute, onNavigate }: { areas: ManagedArea[]; rooms: ManagedRoom[]; devices: ManagedDevice[]; details: Record<string, ManagedDeviceDetail>; detailLoading: Record<string, boolean>; detailErrors: Record<string, string>; loadDeviceDetail: LoadDeviceDetail; refreshDevice: RefreshDevice; activeRoute: string; onNavigate: Navigate }) {
  const activePath = activeRoute.split("?")[0];
  const deviceId = activePath.startsWith("devices/") ? activePath.split("/")[1] : "";
  const summary = devices.find((device) => device.id === deviceId);
  useEffect(() => { if (deviceId) void loadDeviceDetail(deviceId); }, [deviceId, loadDeviceDetail]);
  const backToDirectory = () => onNavigate("devices" + (window.location.hash.includes("?") ? "?" + window.location.hash.split("?")[1] : ""));
  return deviceId ? <DeviceDetail device={details[deviceId] || summary} rooms={rooms} loading={detailLoading[deviceId] === true} error={detailErrors[deviceId] || ""} retry={() => void loadDeviceDetail(deviceId, true)} onBack={backToDirectory} refreshDevice={refreshDevice} /> : <DeviceDirectory areas={areas} rooms={rooms} devices={devices} onNavigate={onNavigate} />;
}

function DeviceDirectory({ areas, rooms, devices, onNavigate }: { areas: ManagedArea[]; rooms: ManagedRoom[]; devices: ManagedDevice[]; onNavigate: Navigate }) {
  const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
  const [query, setQuery] = useState(params.get("q") || "");
  const [areaId, setAreaId] = useState(params.get("area") || "all");
  const [roomId, setRoomId] = useState(params.get("room") || "all");
  const [family, setFamily] = useState(params.get("family") || "all");
  const [protocol, setProtocol] = useState(params.get("protocol") || "all");
  const [status, setStatus] = useState(params.get("status") || "all");
  const [visibleCount, setVisibleCount] = useState(Math.max(24, Number(params.get("window")) || 24));
  const initialized = useRef(false);
  useEffect(() => {
    const syncFromLocation = () => {
      const next = new URLSearchParams(window.location.hash.split("?")[1] || "");
      setQuery(next.get("q") || ""); setAreaId(next.get("area") || "all"); setRoomId(next.get("room") || "all");
      setFamily(next.get("family") || "all"); setProtocol(next.get("protocol") || "all"); setStatus(next.get("status") || "all");
      setVisibleCount(Math.max(24, Number(next.get("window")) || 24));
    };
    window.addEventListener("hashchange", syncFromLocation); window.addEventListener("popstate", syncFromLocation);
    return () => { window.removeEventListener("hashchange", syncFromLocation); window.removeEventListener("popstate", syncFromLocation); };
  }, []);
  const families = useMemo(() => [...new Set(devices.map((device) => device.family))], [devices]);
  const protocols = useMemo(() => [...new Set(devices.flatMap((device) => device.protocols))], [devices]);
  const availableRooms = areaId === "all" ? rooms : rooms.filter((room) => room.areaId === areaId);
  const filtered = useMemo(() => devices.filter((device) => {
    const matchesQuery = [device.displayName, device.name, device.roomName, device.areaName, device.modelName, familyNames[device.family], ...device.protocols].join(" ").toLowerCase().includes(query.trim().toLowerCase());
    const matchesStatus = status === "all" || (status === "online" ? device.online : status === "offline" ? !device.online : device.access === status);
    return matchesQuery && (areaId === "all" || device.areaId === areaId) && (roomId === "all" || device.roomId === roomId) && (family === "all" || device.family === family) && (protocol === "all" || device.protocols.includes(protocol)) && matchesStatus;
  }), [devices, query, areaId, roomId, family, protocol, status]);
  useEffect(() => { if (initialized.current) setVisibleCount(24); else initialized.current = true; }, [query, areaId, roomId, family, protocol, status]);
  useEffect(() => {
    const queryParams = new URLSearchParams();
    for (const [key, value] of [["q", query.trim()], ["area", areaId], ["room", roomId], ["family", family], ["protocol", protocol], ["status", status], ["window", String(visibleCount)]]) if (value && value !== "all" && !(key === "window" && value === "24")) queryParams.set(key, value);
    const suffix = queryParams.toString();
    window.history.replaceState(window.history.state, "", "#devices" + (suffix ? "?" + suffix : ""));
  }, [query, areaId, roomId, family, protocol, status, visibleCount]);
  useEffect(() => { const saved = window.history.state?.spaceDirectory; if (!saved) return; requestAnimationFrame(() => { window.scrollTo({ top: Number(saved.scrollY || 0) }); if (saved.triggerId) document.getElementById(String(saved.triggerId))?.focus(); }); }, []);
  const openDevice = (device: ManagedDevice) => { const triggerId = "device-row-" + device.id; window.history.replaceState({ ...(window.history.state || {}), spaceDirectory: { scrollY: window.scrollY, triggerId, visibleCount } }, "", window.location.href); const queryString = window.location.hash.includes("?") ? "?" + window.location.hash.split("?")[1] : ""; onNavigate("devices/" + device.id + queryString); };
  const clearFilters = () => { setQuery(""); setAreaId("all"); setRoomId("all"); setFamily("all"); setProtocol("all"); setStatus("all"); };
  return <section id="devices" className="device-management" data-module="room-device-management">
    <div className="section-heading"><div><small>全屋目录</small><h2 tabIndex={-1}>设备</h2></div><span className="result-count">{filtered.length} 台设备</span></div>
    <div className="filter-bar"><label className="search-field"><span>搜索设备</span><div className="search-input"><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名称、房间、区域、型号或协议" /></div></label><Filter label="区域" value={areaId} onChange={(value) => { setAreaId(value); setRoomId("all"); }} options={areas.map((area) => [area.id, area.name])} /><Filter label="房间" value={roomId} onChange={setRoomId} options={availableRooms.map((room) => [room.id, room.name])} /><Filter label="类型" value={family} onChange={setFamily} options={families.map((value) => [value, familyNames[value] || value])} /><Filter label="协议" value={protocol} onChange={setProtocol} options={protocols.map((value) => [value, value.toUpperCase()])} /><Filter label="状态" value={status} onChange={setStatus} options={[["online", "在线"], ["offline", "离线"], ["read-only", "只读"], ["version-mismatch", "版本不匹配"]]} /></div>
    {filtered.length === 0 ? <div className="empty-state"><SlidersHorizontal size={24} /><strong>没有匹配的设备</strong><span>调整搜索词或筛选条件后重试。</span><button type="button" className="secondary-button" onClick={clearFilters}>清除筛选</button></div> : <div className="managed-device-list">{filtered.slice(0, visibleCount).map((device) => <DeviceRow key={device.id} device={device} onOpen={() => openDevice(device)} />)}</div>}
    {visibleCount < filtered.length && <button type="button" className="load-more" onClick={() => setVisibleCount((count) => count + 24)}>加载更多</button>}
  </section>;
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="all">全部{label}</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
}

function DeviceRow({ device, onOpen }: { device: ManagedDevice; onOpen: () => void }) {
  const state = device.online ? accessNames[device.access] : "离线";
  return <button id={"device-row-" + device.id} type="button" className="managed-device-row" onClick={onOpen}><span className={device.online ? "device-status" : "device-status offline"} aria-hidden="true" /><span><strong>{device.displayName || device.name}</strong><small>{device.roomName} · {familyNames[device.family] || device.family} · {state}</small></span><ChevronRight size={18} /></button>;
}

function DeviceDetail({ device, rooms, loading, error, retry, onBack, refreshDevice }: { device?: ManagedDeviceDetail | ManagedDevice; rooms: ManagedRoom[]; loading: boolean; error: string; retry: () => void; onBack: () => void; refreshDevice: RefreshDevice }) {
  const [editor, setEditor] = useState<"rename" | "move" | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  if (!device) return <section className="device-detail"><BackHeader eyebrow="设备详情" title="未找到设备" onBack={onBack} /><div className="empty-state"><AlertCircle size={24} /><strong>设备不存在或已被移除</strong><span>返回设备目录后重新同步。</span></div></section>;
  const openEditor = (event: React.MouseEvent<HTMLButtonElement>, next: "rename" | "move") => { triggerRef.current = event.currentTarget; setEditor(next); };
  const closeEditor = () => { setEditor(null); requestAnimationFrame(() => triggerRef.current?.focus()); };
  return <section className="device-detail"><BackHeader eyebrow={device.areaName + " · " + device.roomName} title={device.displayName || device.name} onBack={onBack} />
      {loading && <div className="detail-resource-state" role="status"><LoaderCircle className="spin" size={18} /><span>正在读取设备详情</span></div>}
      {error && <div className="detail-resource-state error" role="alert"><AlertCircle size={18} /><span>{error}</span><button type="button" className="retry-button" onClick={retry}>重新加载设备详情</button></div>}
${controllerRender}    <dl className="device-facts"><div><dt>设备类型</dt><dd>{familyNames[device.family] || device.family}</dd></div><div><dt>连接状态</dt><dd>{device.online ? "在线" : "离线"}</dd></div><div><dt>管理能力</dt><dd>{accessNames[device.access]}</dd></div><div><dt>协议</dt><dd>{device.protocols.length ? device.protocols.map((value) => value.toUpperCase()).join(" · ") : "未标注"}</dd></div><div><dt>型号</dt><dd>{device.modelName || "未提供"}</dd></div><div><dt>设备 ID</dt><dd>{device.id}</dd></div></dl>
    <div className="dialog-actions">{device.controls.some((control) => control.intent === "device.rename") && <button type="button" className="secondary-button" onClick={(event) => openEditor(event, "rename")}><Edit3 size={17} />重命名</button>}{device.controls.some((control) => control.intent === "device.move") && <button type="button" className="secondary-button" onClick={(event) => openEditor(event, "move")}><MapPin size={17} />移动房间</button>}</div>
    {editor && <DeviceManagementDialog device={device} rooms={rooms} editor={editor} refreshDevice={refreshDevice} onClose={closeEditor} />}
  </section>;
}

async function invoke(intent: string, parameters: Record<string, unknown>) {
  const response = await fetch("/api/operations/" + encodeURIComponent(intent), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: "zh-CN", utterance: "管理家庭设备", parameters }) });
  const body = await response.json();
  if (!response.ok || !["success", "partial"].includes(String(body.status || ""))) throw new Error(safeOperationMessage(body.userMessage));
}

function safeOperationMessage(value: unknown) {
  const message = String(value || "");
  if (/write verification mismatch/i.test(message)) return "设备操作未通过回读确认，原有状态未改变。请重新同步后再试。";
  return /invoke|endpoint|http|bridge|cli|token|operation/i.test(message) ? "设备操作没有完成，原有状态未改变。请稍后重试。" : message || "设备操作没有完成，原有状态未改变。";
}

function DeviceManagementDialog({ device, rooms, editor, refreshDevice, onClose }: { device: ManagedDevice; rooms: ManagedRoom[]; editor: "rename" | "move"; refreshDevice: RefreshDevice; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement | null>(null); const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [name, setName] = useState(device.displayName || device.name); const [targetRoomId, setTargetRoomId] = useState(device.roomId);
  const [busy, setBusy] = useState(false); const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  useEffect(() => { const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; closeButtonRef.current?.focus(); return () => { document.body.style.overflow = previousOverflow; }; }, []);
  useEffect(() => { const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); if (event.key !== "Tab") return; const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])') || [])]; if (!focusable.length) return; if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus(); } }; window.addEventListener("keydown", handleKey); return () => window.removeEventListener("keydown", handleKey); }, [busy, onClose]);
  async function save() { setBusy(true); setFeedback(null); try { if (editor === "rename") await invoke("device.rename", { houseId: "${spec.scope.homeIds[0] || ""}", deviceId: device.id, name: name.trim(), confirmed: true }); else await invoke("device.move", { houseId: "${spec.scope.homeIds[0] || ""}", deviceId: device.id, roomId: targetRoomId, confirmed: true }); const readback = await refreshDevice(device.id); if (!readback) throw new Error("写入已提交，但未能读取最新设备信息。请重新同步后确认。"); if (editor === "rename" && readback.displayName !== name.trim()) throw new Error("设备名称回读不一致，已保留最近一次可信状态。"); if (editor === "move" && readback.roomId !== targetRoomId) throw new Error("设备房间回读不一致，已保留最近一次可信状态。"); setFeedback({ kind: "success", message: "设备信息已更新并完成回读确认。" }); } catch (error) { setFeedback({ kind: "error", message: error instanceof Error ? error.message : "操作没有完成。" }); } finally { setBusy(false); } }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section ref={dialogRef} className="device-dialog" role="dialog" aria-modal="true" aria-labelledby="device-dialog-title"><header><div><small>设备管理</small><h2 id="device-dialog-title">{editor === "rename" ? "重命名设备" : "移动设备"}</h2></div><button ref={closeButtonRef} type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="关闭设备管理"><X size={20} /></button></header>
    <div className="dialog-editor">{editor === "rename" ? <label><span>设备名称</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} autoFocus /></label> : <label><span>目标房间</span><select value={targetRoomId} onChange={(event) => setTargetRoomId(event.target.value)} autoFocus>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>}<div className="dialog-footer"><button type="button" className="ghost-button" onClick={onClose} disabled={busy}>取消</button><button type="button" className="primary-button" onClick={() => void save()} disabled={busy || (editor === "rename" ? !name.trim() || name.trim() === (device.displayName || device.name) : targetRoomId === device.roomId)}>{busy ? <LoaderCircle className="spin" size={17} /> : <CheckCircle2 size={17} />}保存</button></div></div>
    <div className={feedback ? "dialog-feedback " + feedback.kind : "dialog-feedback"} aria-live="polite">{feedback ? <>{feedback.kind === "error" ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}<span>{feedback.message}</span></> : null}</div></section></div>;
}
`;
}
