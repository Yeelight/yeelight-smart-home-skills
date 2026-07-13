export function deviceSwitchControlSource(spec) {
  const houseId = JSON.stringify(String(spec?.scope?.homeIds?.[0] || ""));
  return `import { AlertCircle, CheckCircle2, CircuitBoard, LoaderCircle, RotateCcw, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SwitchControl, SwitchDevice } from "../../runtime/use-switch-devices";

type Props = { devices: SwitchDevice[]; loading: boolean; updateProperty: (id: string, property: string, value: boolean) => void };
type Feedback = { deviceId: string; type: "success" | "error"; message: string } | null;
type RetryAction = { device: SwitchDevice; control: SwitchControl; value: boolean } | null;

export function DeviceSwitchControl({ devices, loading, updateProperty }: Props) {
  const [busyKey, setBusyKey] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [retryAction, setRetryAction] = useState<RetryAction>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedback?.type !== "error") return;
    requestAnimationFrame(() => feedbackRef.current?.scrollIntoView({ block: "nearest" }));
  }, [feedback]);

  async function setCircuit(device: SwitchDevice, control: SwitchControl, value: boolean) {
    if (control.intent !== "device.property.set" || control.evidence !== "preview-only") {
      setFeedback({ deviceId: device.id, type: "error", message: "当前 Runtime 未证明此回路支持控制。" });
      return;
    }
    const key = device.id + ":" + control.property;
    setBusyKey(key);
    setFeedback(null);
    setRetryAction(null);
    try {
      const response = await fetch("/api/operations/device.property.set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale: "zh-CN",
          utterance: (value ? "开启" : "关闭") + (device.displayName || device.name) + circuitLabel(control),
          targets: [{ entityType: "device", id: device.id }],
          parameters: { houseId: ${houseId}, deviceId: device.id, property: control.property, value },
        }),
      });
      const body = await response.json();
      if (!response.ok || body.status !== "success" || body?.result?.verified !== true) throw new Error(body.userMessage || "开关写入后验证失败。");
      const verified = typeof body.result.verifiedValue === "boolean" ? body.result.verifiedValue : value;
      updateProperty(device.id, control.property, verified);
      setFeedback({ deviceId: device.id, type: "success", message: circuitLabel(control) + " 已" + (verified ? "开启" : "关闭") + "。" });
    } catch {
      setRetryAction({ device, control, value });
      setFeedback({ deviceId: device.id, type: "error", message: "开关控制失败，请检查家庭连接后重新尝试。" });
    } finally {
      setBusyKey("");
    }
  }

  return <section className="switch-module" id="switches" aria-labelledby="switch-heading">
    <div className="section-heading switch-heading"><div><small>${escapeText(spec.scope.roomNames[0] || "全屋")}</small><h2 id="switch-heading">开关与回路</h2></div><span className="result-count">{devices.length} 个设备</span></div>
    <div className="switch-device-list">
      {devices.map((device) => {
        const offline = device.state?.online === false;
        const controls = device.controls.filter((control) => control.intent === "device.property.set" && control.evidence === "preview-only");
        const channelCount = controls.filter((control) => control.channel !== 0).length;
        const controlSummary = controls.length === 0 ? "只读设备" : channelCount > 0 ? channelCount + " 个回路" : "总控可用";
        const deviceFeedback = feedback?.deviceId === device.id ? feedback : null;
        return <article className={offline ? "switch-card offline" : "switch-card"} key={device.id}>
          <header className="switch-card-heading"><span className="switch-device-icon"><CircuitBoard size={22} /></span><div><strong>{device.displayName || device.name}</strong><small>{device.roomName} · {offline ? "离线" : controlSummary}</small></div></header>
          {controls.length > 0 ? <div className="circuit-list">{controls.map((control) => {
            const on = Boolean(device.state?.[control.property]);
            const key = device.id + ":" + control.property;
            const busy = busyKey === key;
            return <div className="circuit-row" key={control.property}><span><strong>{circuitLabel(control)}</strong><small>{on ? "已开启" : "已关闭"}</small></span><button type="button" className={on ? "circuit-toggle on" : "circuit-toggle"} role="switch" aria-checked={on} aria-label={(on ? "关闭" : "开启") + circuitLabel(control)} aria-busy={busy} disabled={offline || Boolean(busyKey)} onClick={() => void setCircuit(device, control, !on)}>{busy ? <LoaderCircle className="spin" size={18} /> : <span className="toggle-track" aria-hidden="true"><span /></span>}<span>{on ? "开启" : "关闭"}</span></button></div>;
          })}</div> : <div className="readonly-note"><AlertCircle size={18} /><span>当前 Runtime 未证明此设备有可写回路，已保持只读。</span></div>}
          {offline && <div className="offline-note"><WifiOff size={17} />设备当前离线，恢复连接后可继续控制。</div>}
          <div ref={deviceFeedback ? feedbackRef : undefined} className={deviceFeedback ? "switch-feedback " + deviceFeedback.type : "switch-feedback"} aria-live="polite" role={deviceFeedback?.type === "error" ? "alert" : undefined}>
            {deviceFeedback?.type === "success" ? <CheckCircle2 size={17} /> : deviceFeedback?.type === "error" ? <AlertCircle size={17} /> : null}
            {deviceFeedback?.message && <span>{deviceFeedback.message}</span>}
            {deviceFeedback?.type === "error" && retryAction?.device.id === device.id && <button type="button" className="retry-button" disabled={Boolean(busyKey)} onClick={() => void setCircuit(retryAction.device, retryAction.control, retryAction.value)}><RotateCcw size={16} />重新尝试</button>}
          </div>
        </article>;
      })}
      {!loading && devices.length === 0 && <div className="empty-state"><strong>没有可显示的开关设备</strong><span>当前范围内未发现开关或继电器。</span></div>}
    </div>
  </section>;
}

function circuitLabel(control: SwitchControl) {
  if (control.channel === 0) return "全部回路";
  if (control.property === "sp") return "电源";
  return "回路 " + control.channel;
}
`;
}

function escapeText(value) {
  return String(value || "").replace(/[<&]/g, (character) => character === "<" ? "&lt;" : "&amp;");
}
