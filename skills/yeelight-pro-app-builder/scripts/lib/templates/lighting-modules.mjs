export function homeLightingSummarySource(spec, snapshot) {
  const count = scopedDevices(spec, snapshot).length;
  return `import { Lightbulb, Radio } from "lucide-react";
import type { LightDevice } from "../../runtime/use-light-devices";

export function HomeLightingSummary({ devices, loading }: { devices: LightDevice[]; loading: boolean }) {
  const online = devices.filter((entity) => entity.state?.online !== false).length;
  return <section id="overview" className="summary-band" data-module="home-lighting-summary">
    <div className="summary-heading"><span className="summary-icon"><Lightbulb size={22} /></span><div><small>${escapeText(spec.scope.roomNames[0] || "全屋")}</small><h2>灯光总览</h2></div></div>
    <div className="summary-metrics"><span><Lightbulb size={16} /><strong>{devices.length}</strong><small>灯具</small></span><span><Radio size={16} /><strong>{loading ? "-" : online}</strong><small>在线</small></span></div>
  </section>;
}
// Compiled entity count: ${count}
`;
}

export function roomLightingControlSource(spec) {
  return `import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Lightbulb, LoaderCircle, Power, Search } from "lucide-react";
import type { LightDevice } from "../../runtime/use-light-devices";
import { requestAction } from "../../runtime/request";

const rangeCommitKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

async function invoke(intent: string, parameters: Record<string, unknown>) {
  const response = await requestAction(intent, { locale: "zh-CN", utterance: "控制客厅灯光", parameters });
  const body = await response.json();
  if (!response.ok || !["success", "partial"].includes(String(body.status || ""))) throw new Error(body.userMessage || "操作没有完成。");
  return body;
}

export function RoomLightingControl({ devices }: { devices: LightDevice[] }) {
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("q") || "");
  const filteredDevices = useMemo(() => devices.filter((device) => [device.displayName, device.name, device.roomName].join(" ").toLowerCase().includes(query.trim().toLowerCase())), [devices, query]);
  function updateQuery(value: string) {
    setQuery(value);
    const url = new URL(window.location.href);
    if (value.trim()) url.searchParams.set("q", value.trim());
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  }
  return <section id="lights" className="lighting-module" data-module="room-lighting-control">
    <div className="section-heading"><div><small>${escapeText(spec.scope.roomNames[0] || "当前房间")}</small><h2>灯光控制</h2></div><label className="search-field"><span>搜索灯具</span><div className="search-input"><Search size={17} /><input type="search" value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="名称或房间" /></div></label></div>
    {filteredDevices.length === 0 ? <div className="empty-state"><strong>没有匹配的灯具</strong><span>换一个名称继续搜索。</span></div> : <div className="device-list">{filteredDevices.map((device) => <LightCard key={device.id} device={device} />)}</div>}
  </section>;
}

function LightCard({ device }: { device: LightDevice }) {
  const controls = new Set(device.controls.map((control) => control.intent));
  const [power, setPower] = useState(Boolean(device.state?.power));
  const [brightness, setBrightness] = useState(Number(device.state?.brightness || 50));
  const [colorTemperature, setColorTemperature] = useState(Number(device.state?.colorTemperature || 4000));
  const [busyIntent, setBusyIntent] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  useEffect(() => {
    setPower(Boolean(device.state?.power));
    setBrightness(Number(device.state?.brightness || 50));
    setColorTemperature(Number(device.state?.colorTemperature || 4000));
  }, [device.state?.power, device.state?.brightness, device.state?.colorTemperature]);
  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);
  const offline = device.state?.online === false;

  async function submit(intent: string, parameters: Record<string, unknown>, rollback: () => void) {
    setBusyIntent(intent);
    setFeedback(null);
    try {
      await invoke(intent, parameters);
      setFeedback({ kind: "success", message: "已更新设备。" });
    } catch (error) {
      rollback();
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "操作没有完成。" });
    } finally {
      setBusyIntent("");
    }
  }

  return <article className={offline ? "light-card offline" : "light-card"}>
    <div className="light-card-title"><span className={power ? "lamp on" : "lamp"}><Lightbulb size={22} /></span><div><strong>{device.displayName || device.name}</strong><small>{device.roomName} · {offline ? "离线" : "在线"}</small></div>{controls.has("light.power.set") && <button className="power-button" disabled={device.state?.online === false || Boolean(busyIntent)} aria-label={power ? "关闭" + (device.displayName || device.name) : "开启" + (device.displayName || device.name)} aria-pressed={power} onClick={() => { const previous = power; const next = !power; setPower(next); void submit("light.power.set", { houseId: "${spec.scope.homeIds[0] || ""}", deviceId: device.id, power: next, confirmed: true }, () => setPower(previous)); }}>{busyIntent === "light.power.set" ? <LoaderCircle className="spin" size={18} /> : <Power size={18} />}<span>{power ? "关闭" : "开启"}</span></button>}</div>
    {offline && <p className="offline-note" role="status">设备当前离线，恢复连接后即可控制。</p>}
    {controls.has("light.brightness.set") && <label className="control-row"><span>亮度 <strong>{brightness}%</strong></span><input aria-label={"调整" + (device.displayName || device.name) + "亮度"} disabled={device.state?.online === false || Boolean(busyIntent)} type="range" min="1" max="100" value={brightness} onChange={(event) => setBrightness(Number(event.target.value))} onPointerUp={(event) => { const next = Number(event.currentTarget.value); setBrightness(next); void submit("light.brightness.set", { houseId: "${spec.scope.homeIds[0] || ""}", deviceId: device.id, brightness: next, confirmed: true }, () => setBrightness(Number(device.state?.brightness || 50))); }} onKeyUp={(event) => { if (!rangeCommitKeys.has(event.key)) return; const next = Number(event.currentTarget.value); setBrightness(next); void submit("light.brightness.set", { houseId: "${spec.scope.homeIds[0] || ""}", deviceId: device.id, brightness: next, confirmed: true }, () => setBrightness(Number(device.state?.brightness || 50))); }} /></label>}
    {controls.has("light.color_temperature.set") && <label className="control-row"><span>色温 <strong>{colorTemperature}K</strong></span><input aria-label={"调整" + (device.displayName || device.name) + "色温"} disabled={device.state?.online === false || Boolean(busyIntent)} type="range" min="2700" max="6500" step="100" value={colorTemperature} onChange={(event) => setColorTemperature(Number(event.target.value))} onPointerUp={(event) => { const next = Number(event.currentTarget.value); setColorTemperature(next); void submit("light.color_temperature.set", { houseId: "${spec.scope.homeIds[0] || ""}", deviceId: device.id, colorTemperature: next, confirmed: true }, () => setColorTemperature(Number(device.state?.colorTemperature || 4000))); }} onKeyUp={(event) => { if (!rangeCommitKeys.has(event.key)) return; const next = Number(event.currentTarget.value); setColorTemperature(next); void submit("light.color_temperature.set", { houseId: "${spec.scope.homeIds[0] || ""}", deviceId: device.id, colorTemperature: next, confirmed: true }, () => setColorTemperature(Number(device.state?.colorTemperature || 4000))); }} /></label>}
    <div className={feedback ? "control-feedback " + feedback.kind : "control-feedback"} aria-live="polite">{feedback ? <>{feedback.kind === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}<span>{feedback.message}</span></> : null}</div>
  </article>;
}
`;
}

function scopedDevices(spec, snapshot) {
  const rooms = new Set(spec.scope.roomNames || []);
  return Object.values(snapshot.entities || {}).filter((entity) => entity.family === "light" && (spec.scope.includeAllRooms || rooms.has(entity.roomName)));
}

function escapeText(value) {
  return String(value || "").replace(/[<&]/g, (character) => character === "<" ? "&lt;" : "&amp;");
}
