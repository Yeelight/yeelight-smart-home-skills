export function lightingControllerSource() {
  return `import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Lightbulb, LoaderCircle, Power } from "lucide-react";
import { controllerMode, deviceProperties, hasControl, terminalMessage, writeWithReadback, type ControllerDevice, type RefreshDevice } from "./shared";

const rangeCommitKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);
const colorChoices = [{ value: 16737792, label: "暖橙" }, { value: 16764006, label: "暖白" }, { value: 8454143, label: "青蓝" }, { value: 255, label: "蓝色" }];

export function LightingController({ device, refreshDevice }: { device: ControllerDevice; refreshDevice: RefreshDevice }) {
  const properties = deviceProperties(device);
  const [trusted, setTrusted] = useState(properties);
  const [draft, setDraft] = useState(properties);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const mode = controllerMode(device);
  const writable = mode === "write";
  const propertiesKey = JSON.stringify(properties);
  useEffect(() => { const next = deviceProperties(device); setTrusted(next); setDraft(next); setBusy(""); setFeedback(null); }, [device.id]);
  useEffect(() => { if (busy) return; const next = deviceProperties(device); setTrusted(next); setDraft(next); }, [propertiesKey]);

  async function commit(intent: string, property: string, value: unknown, parameters: Record<string, unknown>) {
    setBusy(property); setFeedback(null); setDraft((current) => ({ ...current, [property]: value }));
    try {
      const refreshed = await writeWithReadback({ device, intent, parameters, property, expected: value, refreshDevice });
      const next = deviceProperties(refreshed); setTrusted(next); setDraft(next); setFeedback({ kind: "success", message: "设备状态已更新并完成回读确认。" });
    } catch (error) {
      setDraft(trusted); setFeedback({ kind: "error", message: error instanceof Error ? error.message : "设备操作没有完成。" });
    } finally { setBusy(""); }
  }

  const canPower = writable && hasControl(device, "light.power.set");
  const canBrightness = writable && hasControl(device, "light.brightness.set");
  const canTemperature = writable && hasControl(device, "light.color_temperature.set");
  const canColor = writable && hasControl(device, "light.color.set");
  const power = Boolean(draft.power); const brightness = Number(draft.brightness ?? 50); const colorTemperature = Number(draft.colorTemperature ?? 4000);
  return <section className="device-controller lighting-controller" aria-labelledby="lighting-controller-title">
    <header className="controller-heading"><span className={power ? "controller-icon active" : "controller-icon"}><Lightbulb size={22} /></span><div><small>灯光控制</small><h3 id="lighting-controller-title">{power ? "灯光已开启" : "灯光已关闭"}</h3></div>{canPower && <button type="button" className="controller-power" aria-pressed={power} aria-label={power ? "关闭灯光" : "开启灯光"} disabled={Boolean(busy)} onClick={() => void commit("light.power.set", "power", !power, { power: !power })}>{busy === "power" ? <LoaderCircle className="spin" size={18} /> : <Power size={18} />}<span>{power ? "关闭" : "开启"}</span></button>}</header>
    {mode !== "write" && <p className="controller-terminal" role="status"><AlertCircle size={17} />{terminalMessage(mode)}</p>}
    {Object.hasOwn(properties, "brightness") && <label className="controller-range"><span>亮度 <strong>{brightness}%</strong></span><input type="range" min="1" max="100" value={brightness} disabled={!canBrightness || Boolean(busy)} aria-label="调整灯光亮度" onChange={(event) => setDraft((current) => ({ ...current, brightness: Number(event.target.value) }))} onPointerUp={(event) => void commit("light.brightness.set", "brightness", Number(event.currentTarget.value), { brightness: Number(event.currentTarget.value) })} onKeyUp={(event) => { if (rangeCommitKeys.has(event.key)) void commit("light.brightness.set", "brightness", Number(event.currentTarget.value), { brightness: Number(event.currentTarget.value) }); }} /></label>}
    {Object.hasOwn(properties, "colorTemperature") && <label className="controller-range"><span>色温 <strong>{colorTemperature}K</strong></span><input type="range" min="2700" max="6500" step="100" value={colorTemperature} disabled={!canTemperature || Boolean(busy)} aria-label="调整灯光色温" onChange={(event) => setDraft((current) => ({ ...current, colorTemperature: Number(event.target.value) }))} onPointerUp={(event) => void commit("light.color_temperature.set", "colorTemperature", Number(event.currentTarget.value), { colorTemperature: Number(event.currentTarget.value) })} onKeyUp={(event) => { if (rangeCommitKeys.has(event.key)) void commit("light.color_temperature.set", "colorTemperature", Number(event.currentTarget.value), { colorTemperature: Number(event.currentTarget.value) }); }} /></label>}
    {Object.hasOwn(properties, "color") && <fieldset className="controller-swatches" disabled={!canColor || Boolean(busy)}><legend>彩光颜色</legend><div>{colorChoices.map((choice) => <button key={choice.value} type="button" className={Number(draft.color) === choice.value ? "color-swatch selected" : "color-swatch"} style={{ backgroundColor: "#" + choice.value.toString(16).padStart(6, "0") }} aria-label={choice.label} aria-pressed={Number(draft.color) === choice.value} onClick={() => void commit("light.color.set", "color", choice.value, { color: choice.value })} />)}</div></fieldset>}
    <div className={feedback ? "controller-feedback " + feedback.kind : "controller-feedback"} aria-live="polite">{feedback ? <>{feedback.kind === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}<span>{feedback.message}</span></> : null}</div>
  </section>;
}
`;
}
