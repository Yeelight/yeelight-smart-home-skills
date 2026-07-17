export function sensorEnvironmentSource() {
  return `import { Activity, BatteryMedium, CircleDot, Droplets, History, RotateCcw, SunMedium, Thermometer, UserRoundCheck } from "lucide-react";
import { useLayoutEffect, useRef } from "react";

type SensorEvent = { eventId?: string; sensorId?: string; deviceId?: string; name?: string; status?: string; valid?: boolean };
type SensorDevice = { id: string; name: string; displayName?: string; roomName: string; family: "sensor"; state: Record<string, unknown>; readingKeys: string[]; controls: never[] };
type Props = { devices: SensorDevice[]; events: SensorEvent[]; loading: boolean; eventError: string; retry: () => Promise<void> };
type HomeProps = { devices: SensorDevice[]; loading: boolean; error: string; retry: () => Promise<void> };

const labels: Record<string, { label: string; unit: string }> = {
  currentTemperature: { label: "温度", unit: "℃" },
  humidity: { label: "湿度", unit: "%" },
  occupancyDetected: { label: "人体状态", unit: "" },
  motionDetected: { label: "移动状态", unit: "" },
  luminance: { label: "照度", unit: " lx" },
  environmentalBrightnessLevel: { label: "环境亮度", unit: "" },
  batteryLevel: { label: "电量", unit: "%" },
};

const preferredReadings = ["currentTemperature", "humidity", "luminance", "occupancyDetected", "motionDetected"];

export function HomeEnvironmentSummary({ devices, loading, error, retry }: HomeProps) {
  const readings = preferredReadings.flatMap((property) => {
    const device = devices.find((item) => item.readingKeys.includes(property) && item.state[property] !== undefined);
    return device ? [{ property, value: device.state[property], device }] : [];
  }).slice(0, 4);
  const online = devices.filter((device) => device.state.online !== false).length;
  return <section className="home-environment-summary" aria-labelledby="home-environment-title" aria-busy={loading}>
    <div className="section-heading"><div><small>实时环境</small><h2 id="home-environment-title">家庭环境</h2></div><span className="result-count">{online}/{devices.length} 在线</span></div>
    {error ? <div className="detail-resource-state error" role="alert"><CircleDot size={18} /><span>{error}</span><button type="button" className="retry-button" onClick={() => void retry()}><RotateCcw size={16} />重新同步</button></div>
      : readings.length ? <div className="home-reading-grid">{readings.map(({ property, value, device }) => <div className="home-reading" key={property}><Reading property={property} value={value} /><small>{device.roomName} · {device.displayName || device.name}</small></div>)}</div>
        : !loading && <div className="empty-state compact"><CircleDot size={20} /><strong>暂无可用环境读数</strong><span>家庭系统未返回可识别的实时数据。</span></div>}
  </section>;
}

export function SensorEnvironment({ devices, events, loading, eventError, retry }: Props) {
  const eventErrorRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!eventError || !eventErrorRef.current) return;
    eventErrorRef.current.scrollIntoView({ block: "center", behavior: "auto" });
    eventErrorRef.current.focus({ preventScroll: true });
  }, [eventError]);
  return <section className="sensor-module" aria-labelledby="sensor-title">
    <div className="section-heading sensor-heading"><div><span className="eyebrow">实时环境</span><h2 id="sensor-title">当前读数</h2><p>读数直接来自家庭系统，页面不提供未证明的控制能力。</p></div><span className="sensor-count">{devices.length} 个传感器</span></div>
    <div className="sensor-device-list" aria-busy={loading}>
      {devices.map((device) => <SensorCard key={device.id} device={device} events={events} />)}
      {!loading && devices.length === 0 && <div className="empty-state"><CircleDot size={20} /><strong>当前范围没有传感器</strong><span>调整生成范围后重新构建应用。</span></div>}
    </div>
    <section className="sensor-events" aria-labelledby="sensor-events-title">
      <div className="section-heading"><div><span className="eyebrow">家庭事件能力</span><h2 id="sensor-events-title">事件定义</h2></div></div>
      {eventError ? <div ref={eventErrorRef} className="sensor-events-error" role="alert" tabIndex={-1}><div><strong>事件定义同步失败</strong><span>{eventError}</span></div><button type="button" className="retry-button" onClick={() => void retry()}><RotateCcw size={16} />重新尝试</button></div>
        : events.length > 0 ? <ul className="sensor-event-list">{events.map((event, index) => <li key={event.eventId || index}><Activity size={18} /><span><strong>{event.name || "未命名事件"}</strong><small>{event.status === "enabled" && event.valid !== false ? "已启用" : "未启用"}</small></span></li>)}</ul>
          : <div className="empty-state compact"><CircleDot size={20} /><strong>当前家庭系统未返回事件定义</strong><span>页面不会生成模拟事件。</span></div>}
      <div className="history-boundary"><History size={18} /><span><strong>当前家庭系统未提供时间序列历史</strong><small>仅展示当前读数与真实返回的事件定义，不生成趋势图或虚构时间点。</small></span></div>
    </section>
  </section>;
}

function SensorCard({ device, events }: { device: SensorDevice; events: SensorEvent[] }) {
  const online = device.state.online !== false;
  const relatedEvents = events.filter((event) => String(event.sensorId || event.deviceId || "") === device.id);
  return <article className={online ? "sensor-card" : "sensor-card offline"}>
    <header className="sensor-card-heading"><span className="sensor-device-icon"><CircleDot size={21} /></span><div><strong>{device.displayName || device.name}</strong><span>{device.roomName}</span></div><span className={online ? "sensor-status online" : "sensor-status"}>{online ? "在线" : "设备离线"}</span></header>
    <div className="sensor-reading-grid">{device.readingKeys.map((key) => <Reading key={key} property={key} value={device.state[key]} />)}</div>
    {device.readingKeys.length === 0 && <div className="empty-state compact"><CircleDot size={20} /><strong>暂无数据</strong><span>家庭系统未返回可识别读数。</span></div>}
    <footer><span>{relatedEvents.length > 0 ? relatedEvents.length + " 个事件定义" : "暂无事件定义"}</span><span>{online ? "刚刚同步" : "等待设备恢复连接"}</span></footer>
  </article>;
}

function Reading({ property, value }: { property: string; value: unknown }) {
  const meta = labels[property] || { label: property, unit: "" };
  const available = typeof value === "number" || typeof value === "boolean";
  const text = !available ? "暂无数据" : property === "occupancyDetected" ? (value ? "有人" : "无人") : property === "motionDetected" ? (value ? "检测到移动" : "无移动") : String(value) + meta.unit;
  return <div className="sensor-reading"><span className="sensor-reading-icon">{readingIcon(property)}</span><span><small>{meta.label}</small><strong className={available ? "" : "unavailable"}>{text}</strong></span></div>;
}

function readingIcon(property: string) {
  if (property === "currentTemperature") return <Thermometer size={19} />;
  if (property === "humidity") return <Droplets size={19} />;
  if (property === "luminance" || property === "environmentalBrightnessLevel") return <SunMedium size={19} />;
  if (property === "batteryLevel") return <BatteryMedium size={19} />;
  return <UserRoundCheck size={19} />;
}
`;
}
