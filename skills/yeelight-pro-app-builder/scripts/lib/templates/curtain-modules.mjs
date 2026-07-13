export function deviceCurtainControlSource(spec) {
  const houseId = JSON.stringify(String(spec?.scope?.homeIds?.[0] || ""));
  return `import { AlertCircle, Check, ChevronsLeft, ChevronsRight, MoveHorizontal, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { CurtainDevice } from "../../runtime/use-curtain-devices";

type Props = { devices: CurtainDevice[]; loading: boolean; updatePosition: (id: string, position: number) => void };
type Feedback = { type: "success" | "error"; message: string } | null;
type RetryAction = { device: CurtainDevice; position: number } | null;
const commitKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

export function DeviceCurtainControl({ devices, loading, updatePosition }: Props) {
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [busyId, setBusyId] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [retryAction, setRetryAction] = useState<RetryAction>(null);

  useEffect(() => {
    setDrafts(Object.fromEntries(devices.map((device) => [device.id, positionOf(device)])));
  }, [devices]);

  async function setPosition(device: CurtainDevice, position: number) {
    const value = Math.max(0, Math.min(100, Math.round(position)));
    if (!device.controls.some((control) => control.intent === "device.property.set" && control.property === "targetPosition")) {
      setFeedback({ type: "error", message: "当前 Runtime 未证明此窗帘支持位置控制。" });
      return;
    }
    setBusyId(device.id);
    setFeedback(null);
    setRetryAction(null);
    try {
      const response = await fetch("/api/operations/device.property.set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale: "zh-CN",
          utterance: "设置" + (device.displayName || device.name) + "到" + value + "%",
          targets: [{ entityType: "device", id: device.id }],
          parameters: { houseId: ${houseId}, deviceId: device.id, property: "targetPosition", value },
        }),
      });
      const body = await response.json();
      if (!response.ok || body.status !== "success" || body?.result?.verified !== true) throw new Error(body.userMessage || "窗帘位置写入后验证失败。");
      const verified = Number(body.result.verifiedValue);
      const next = Number.isFinite(verified) ? verified : value;
      setDrafts((current) => ({ ...current, [device.id]: next }));
      updatePosition(device.id, next);
      setFeedback({ type: "success", message: "窗帘已调整到 " + next + "% 。" });
    } catch {
      setRetryAction({ device, position: value });
      setFeedback({ type: "error", message: "窗帘控制失败，请检查家庭连接后重新尝试。" });
    } finally {
      setBusyId("");
    }
  }

  function commitSlider(event: KeyboardEvent<HTMLInputElement>, device: CurtainDevice) {
    if (commitKeys.has(event.key)) void setPosition(device, Number(event.currentTarget.value));
  }

  return <section className="curtain-module" id="curtains" aria-labelledby="curtain-heading">
    <div className="section-heading curtain-heading"><div><small>窗帘控制</small><h2 id="curtain-heading">空间开合</h2></div><span className="result-count">{loading ? "同步中" : devices.length + " 个设备"}</span></div>
    <div className="curtain-device-list">
      {devices.map((device) => {
        const position = drafts[device.id] ?? positionOf(device);
        const offline = device.state?.online === false;
        const busy = busyId === device.id;
        const writable = device.readOnly !== true && device.capabilityStatus !== "version-mismatch" && device.controls.some((control) => control.intent === "device.property.set" && control.property === "targetPosition");
        const disabled = offline || busy || !writable;
        const visualStyle = { "--curtain-opening": position + "%" } as CSSProperties;
        return <article key={device.id} className={offline ? "curtain-card offline" : "curtain-card"}>
          <header className="curtain-card-heading"><div className="curtain-device-icon" aria-hidden="true"><MoveHorizontal size={22} /></div><div><strong>{device.displayName || device.name}</strong><small>{device.roomName} · {offline ? "离线" : busy ? "调整中" : stateLabel(device)}</small></div><output aria-label={(device.displayName || device.name) + "当前位置"}>{position}%</output></header>
          <div className="curtain-visual" style={visualStyle} aria-hidden="true"><span className="curtain-panel left"/><span className="curtain-opening"/><span className="curtain-panel right"/></div>
          <div className="curtain-quick-actions" aria-label={(device.displayName || device.name) + "快捷位置"}>
            <button type="button" disabled={disabled} onClick={() => void setPosition(device, 0)}><ChevronsRight size={18} /><span>全关</span></button>
            <button type="button" disabled={disabled} onClick={() => void setPosition(device, 50)}><MoveHorizontal size={18} /><span>一半</span></button>
            <button type="button" disabled={disabled} onClick={() => void setPosition(device, 100)}><ChevronsLeft size={18} /><span>全开</span></button>
          </div>
          <label className="curtain-position-control"><span>目标位置 <output>{position}%</output></span><input className="curtain-position-input" type="range" min="0" max="100" step="1" value={position} disabled={disabled} aria-label={(device.displayName || device.name) + "目标位置"} aria-valuetext={position + "% 开合度"} onChange={(event) => { const next = Number(event.currentTarget.value); setDrafts((current) => ({ ...current, [device.id]: next })); }} onPointerUp={(event) => void setPosition(device, Number(event.currentTarget.value))} onKeyUp={(event) => commitSlider(event, device)} /></label>
          {offline && <p className="offline-note">设备当前离线，恢复连接后可继续调整位置。</p>}
          {!offline && !writable && <p className="readonly-note"><AlertCircle size={18} />当前家庭仅支持查看此窗帘状态。</p>}
        </article>;
      })}
      {!loading && devices.length === 0 && <div className="empty-state"><strong>没有可控制的窗帘</strong><span>当前房间范围内没有通过能力预览的窗帘设备。</span></div>}
    </div>
    {feedback?.type === "success" && <div className="curtain-feedback success" aria-live="polite"><Check size={17} /><span>{feedback.message}</span></div>}
    {feedback?.type === "error" && <div className="curtain-feedback error" role="alert"><AlertCircle size={17} /><span>{feedback.message}</span>{retryAction && <button type="button" className="retry-button" disabled={Boolean(busyId)} onClick={() => void setPosition(retryAction.device, retryAction.position)}><RotateCcw size={16} /><span>重新尝试</span></button>}</div>}
    {!feedback && <div className="curtain-feedback" aria-live="polite" />}
  </section>;
}

function positionOf(device: CurtainDevice) {
  const current = Number(device.state?.position ?? device.state?.targetPosition ?? 0);
  return Number.isFinite(current) ? Math.max(0, Math.min(100, Math.round(current))) : 0;
}

function stateLabel(device: CurtainDevice) {
  const state = String(device.state?.runState || "stopped");
  if (state === "opening") return "正在打开";
  if (state === "closing") return "正在关闭";
  return "已停止";
}
`;
}
