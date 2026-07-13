export function curtainControllerSource() {
  return `import { useEffect, useState } from "react";
import { AlertCircle, Blinds, CheckCircle2, LoaderCircle } from "lucide-react";
import { controllerMode, deviceProperties, hasControl, terminalMessage, writeWithReadback, type ControllerDevice, type RefreshDevice } from "./shared";

const commitKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

export function CurtainController({ device, refreshDevice }: { device: ControllerDevice; refreshDevice: RefreshDevice }) {
  const properties = deviceProperties(device); const initial = Number(properties.targetPosition ?? properties.position ?? 0);
  const [trusted, setTrusted] = useState(initial); const [position, setPosition] = useState(initial); const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const mode = controllerMode(device); const writable = mode === "write" && hasControl(device, "device.property.set", "targetPosition");
  const propertiesKey = JSON.stringify(properties);
  useEffect(() => { const next = Number(deviceProperties(device).targetPosition ?? deviceProperties(device).position ?? 0); setTrusted(next); setPosition(next); setBusy(false); setFeedback(null); }, [device.id]);
  useEffect(() => { if (busy) return; const next = Number(deviceProperties(device).targetPosition ?? deviceProperties(device).position ?? 0); setTrusted(next); setPosition(next); }, [propertiesKey]);
  async function commit(value: number) { setBusy(true); setFeedback(null); setPosition(value); try { const refreshed = await writeWithReadback({ device, intent: "device.property.set", parameters: { property: "targetPosition", value }, property: "targetPosition", expected: value, refreshDevice }); const next = Number(deviceProperties(refreshed).targetPosition ?? value); setTrusted(next); setPosition(next); setFeedback({ kind: "success", message: "窗帘位置已更新并完成回读确认。" }); } catch (error) { setPosition(trusted); setFeedback({ kind: "error", message: error instanceof Error ? error.message : "窗帘操作没有完成。" }); } finally { setBusy(false); } }
  return <section className="device-controller curtain-controller" aria-labelledby="curtain-controller-title"><header className="controller-heading"><span className="controller-icon active"><Blinds size={22} /></span><div><small>窗帘控制</small><h3 id="curtain-controller-title">当前开启 {position}%</h3></div>{busy && <LoaderCircle className="spin" size={19} aria-label="正在更新窗帘" />}</header>
    {mode !== "write" && <p className="controller-terminal" role="status"><AlertCircle size={17} />{terminalMessage(mode)}</p>}
    <div className="controller-quick-actions" aria-label="常用窗帘位置">{[[0, "关闭"], [50, "一半"], [100, "打开"]].map(([value, label]) => <button key={value} type="button" disabled={!writable || busy} aria-pressed={position === value} onClick={() => void commit(Number(value))}>{label}</button>)}</div>
    <label className="controller-range"><span>开启位置 <strong>{position}%</strong></span><input type="range" min="0" max="100" value={position} disabled={!writable || busy} aria-label="调整窗帘开启位置" onChange={(event) => setPosition(Number(event.target.value))} onPointerUp={(event) => void commit(Number(event.currentTarget.value))} onKeyUp={(event) => { if (commitKeys.has(event.key)) void commit(Number(event.currentTarget.value)); }} /></label>
    {Object.hasOwn(properties, "runState") && <p className="controller-reading">运行状态 <strong>{String(properties.runState)}</strong></p>}<div className={feedback ? "controller-feedback " + feedback.kind : "controller-feedback"} aria-live="polite">{feedback ? <>{feedback.kind === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}<span>{feedback.message}</span></> : null}</div></section>;
}
`;
}
