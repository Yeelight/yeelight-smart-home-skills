export function deviceClimateControlSource(spec) {
  const houseId = JSON.stringify(String(spec?.scope?.homeIds?.[0] || ""));
  return `import { AlertCircle, CheckCircle2, Fan, LoaderCircle, Minus, Plus, Power, RotateCcw, Thermometer, WifiOff } from "lucide-react";
	import { useEffect, useRef, useState } from "react";
	import type { ReactNode } from "react";
import type { ClimateControl, ClimateDevice } from "../../runtime/use-climate-devices";
import { requestAction } from "../../runtime/request";

type Props = { devices: ClimateDevice[]; loading: boolean; updateProperty: (id: string, property: string, value: boolean | number) => void };
type Retry = { device: ClimateDevice; control: ClimateControl; value: boolean | number } | null;
const modes = [{ value: 1, label: "制冷" }, { value: 4, label: "送风" }, { value: 8, label: "制热" }];
const fanSpeeds = [{ value: 1, label: "高风" }, { value: 2, label: "中风" }, { value: 4, label: "低风" }];

export function DeviceClimateControl({ devices, loading, updateProperty }: Props) {
  const [busyKey, setBusyKey] = useState("");
  const [feedback, setFeedback] = useState<{ deviceId: string; type: "success" | "error"; message: string } | null>(null);
  const [retry, setRetry] = useState<Retry>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedback?.type !== "error") return;
    requestAnimationFrame(() => feedbackRef.current?.scrollIntoView({ block: "nearest" }));
  }, [feedback]);

  async function setProperty(device: ClimateDevice, control: ClimateControl, value: boolean | number) {
    const key = device.id + ":" + control.property;
    setBusyKey(key); setFeedback(null); setRetry(null);
    try {
      const response = await requestAction("device.property.set", {
        locale: "zh-CN", utterance: "调整" + (device.displayName || device.name), targets: [{ entityType: "device", id: device.id }],
        parameters: { houseId: ${houseId}, deviceId: device.id, property: control.property, value },
      });
      const body = await response.json();
      if (!response.ok || body.status !== "success" || body?.result?.verified !== true) throw new Error();
      const verified = body.result.verifiedValue ?? value;
      updateProperty(device.id, control.property, verified);
      setFeedback({ deviceId: device.id, type: "success", message: feedbackMessage(control.property, verified) });
    } catch {
      setRetry({ device, control, value });
      setFeedback({ deviceId: device.id, type: "error", message: "温控调整失败，请检查家庭连接后重新尝试。" });
    } finally { setBusyKey(""); }
  }

  return <section className="climate-module" aria-labelledby="climate-heading">
    <div className="section-heading climate-heading"><div><small>${escapeText(spec.scope.roomNames[0] || "全屋")}</small><h2 id="climate-heading">温控</h2></div><span className="result-count">{devices.length} 个设备</span></div>
    <div className="climate-device-list">{devices.map((device) => {
      const control = (property: string) => device.controls.find((item) => item.property === property && item.evidence === "preview-only");
      const power = control("airConditionerPower");
      const target = control("airConditionerTargetTemperature");
      const mode = control("airConditionerMode");
      const fan = control("airConditionerFanSpeed");
      const offline = device.state.airConditionerOnline === false;
      const isOn = Boolean(device.state.airConditionerPower);
      const targetValue = Number(device.state.airConditionerTargetTemperature || 24);
      const deviceFeedback = feedback?.deviceId === device.id ? feedback : null;
      return <article className={offline ? "climate-card offline" : "climate-card"} key={device.id}>
        <header className="climate-card-heading"><span className="climate-device-icon"><Thermometer size={22} /></span><div><strong>{device.displayName || device.name}</strong><small>{device.roomName} · {offline ? "离线" : isOn ? "运行中" : "已关闭"}</small></div>{power && <button type="button" className={isOn ? "climate-power on" : "climate-power"} aria-label={isOn ? "关闭温控" : "开启温控"} aria-pressed={isOn} disabled={offline || Boolean(busyKey)} onClick={() => void setProperty(device, power, !isOn)}>{busyKey.endsWith(power.property) ? <LoaderCircle className="spin" size={18} /> : <Power size={18} />}</button>}</header>
        <div className="temperature-status"><span><small>当前温度</small><strong>{Number(device.state.airConditionerCurrentTemperature)}<sup>℃</sup></strong></span><span><small>目标温度</small><output>{targetValue}<sup>℃</sup></output></span></div>
        {target ? <div className="temperature-stepper" aria-label="目标温度"><button type="button" aria-label="降低目标温度" disabled={offline || !isOn || targetValue <= 16 || Boolean(busyKey)} onClick={() => void setProperty(device, target, targetValue - 1)}><Minus size={20} /></button><input aria-label="目标温度范围" type="range" min="16" max="32" step="1" value={targetValue} disabled={offline || !isOn || Boolean(busyKey)} onChange={(event) => updateProperty(device.id, target.property, Number(event.target.value))} onPointerUp={(event) => void setProperty(device, target, Number(event.currentTarget.value))} /><button type="button" aria-label="提高目标温度" disabled={offline || !isOn || targetValue >= 32 || Boolean(busyKey)} onClick={() => void setProperty(device, target, targetValue + 1)}><Plus size={20} /></button></div> : <div className="readonly-note"><AlertCircle size={18} />当前家庭系统未证明目标温度可写。</div>}
        {mode && <ControlGroup label="运行模式" icon={<Thermometer size={17} />} values={modes} current={Number(device.state.airConditionerMode)} disabled={offline || !isOn || Boolean(busyKey)} onSelect={(value) => void setProperty(device, mode, value)} />}
        {fan && <ControlGroup label="风速" icon={<Fan size={17} />} values={fanSpeeds} current={Number(device.state.airConditionerFanSpeed)} disabled={offline || !isOn || Boolean(busyKey)} onSelect={(value) => void setProperty(device, fan, value)} />}
        {offline && <div className="offline-note"><WifiOff size={17} />设备当前离线，恢复连接后可继续控制。</div>}
        <div ref={deviceFeedback ? feedbackRef : undefined} className={deviceFeedback ? "climate-feedback " + deviceFeedback.type : "climate-feedback"} aria-live="polite" role={deviceFeedback?.type === "error" ? "alert" : undefined}>{deviceFeedback?.type === "success" ? <CheckCircle2 size={17} /> : deviceFeedback?.type === "error" ? <AlertCircle size={17} /> : null}{deviceFeedback?.message && <span>{deviceFeedback.message}</span>}{deviceFeedback?.type === "error" && retry?.device.id === device.id && <button type="button" className="retry-button" disabled={Boolean(busyKey)} onClick={() => void setProperty(retry.device, retry.control, retry.value)}><RotateCcw size={16} />重新尝试</button>}</div>
      </article>;
    })}{!loading && devices.length === 0 && <div className="empty-state"><strong>没有可显示的温控设备</strong><span>当前范围内未发现温控设备。</span></div>}</div>
  </section>;
}

function ControlGroup({ label, icon, values, current, disabled, onSelect }: { label: string; icon: ReactNode; values: Array<{ value: number; label: string }>; current: number; disabled: boolean; onSelect: (value: number) => void }) {
  return <fieldset className="climate-control-group"><legend>{icon}<span>{label}</span></legend><div className="segmented-control" role="radiogroup" aria-label={label}>{values.map((item) => <button type="button" role="radio" aria-checked={current === item.value} className={current === item.value ? "active" : ""} disabled={disabled} key={item.value} onClick={() => onSelect(item.value)}>{item.label}</button>)}</div></fieldset>;
}

function feedbackMessage(property: string, value: boolean | number) {
  if (property === "airConditionerPower") return value ? "温控已开启。" : "温控已关闭。";
  if (property === "airConditionerTargetTemperature") return "目标温度已设为 " + value + "℃。";
  return "温控设置已更新。";
}
`;
}

function escapeText(value) {
  return String(value || "").replace(/[<&]/g, (character) => character === "<" ? "&lt;" : "&amp;");
}
