export function propertyValueControlSource() {
  return `import type { CSSProperties } from "react";

type Props = {
  property: string;
  value: unknown;
  label: string;
  onChange: (value: boolean | number | string) => void;
};

const booleanStateLabels: Record<string, { on: string; off: string }> = {
  power: { on: "开启", off: "关闭" },
  switchPower: { on: "开启", off: "关闭" },
  airConditionerPower: { on: "开启", off: "关闭" },
  occupancy: { on: "有人", off: "无人" },
  occupancyDetected: { on: "有人", off: "无人" },
  motionDetected: { on: "检测到移动", off: "无移动" },
  contact: { on: "打开", off: "关闭" },
  open: { on: "打开", off: "关闭" },
  water: { on: "检测到水浸", off: "正常" },
  smoke: { on: "检测到烟雾", off: "正常" },
  online: { on: "在线", off: "离线" },
  airConditionerOnline: { on: "在线", off: "离线" },
};
const colorPresetTokens = Array.from({ length: 8 }, (_, index) => "--yp-component-color-swatch-" + (index + 1));
const enumOptions: Record<string, Array<{ value: number; label: string }>> = {
  airConditionerMode: [{ value: 1, label: "制冷" }, { value: 4, label: "送风" }, { value: 8, label: "制热" }],
  airConditionerFanSpeed: [{ value: 1, label: "高风" }, { value: 2, label: "中风" }, { value: 4, label: "低风" }],
};

export function PropertyValueControl({ property, value, label, onChange }: Props) {
  if (isBooleanProperty(property)) {
    const enabled = value !== false;
    const stateLabel = booleanStateLabels[property];
    return <div className="property-value-control"><span>{label}</span><button type="button" className={enabled ? "property-toggle on" : "property-toggle"} role="switch" aria-checked={enabled} aria-label={label + "，当前" + (enabled ? stateLabel.on : stateLabel.off)} onClick={() => onChange(!enabled)}><span aria-hidden="true" /><strong>{enabled ? stateLabel.on : stateLabel.off}</strong></button></div>;
  }

  if (property === "color") {
    const color = rgbIntegerToHex(value);
    return <div className="property-value-control property-color-control"><span>{label}</span><div className="property-color-picker"><input type="color" value={color} aria-label="自定义颜色" onChange={(event) => onChange(hexToRgbInteger(event.target.value))} /><output>{color.toUpperCase()}</output></div><div className="color-presets" role="group" aria-label="常用颜色">{colorPresetTokens.map((token) => { const preset = themeColorValue(token); return <button type="button" key={token} className={preset === color.toUpperCase() ? "selected" : ""} style={{ "--preset-color": "var(" + token + ")" } as CSSProperties} aria-label={"选择颜色 " + preset} aria-pressed={preset === color.toUpperCase()} onClick={() => onChange(hexToRgbInteger(preset))} />; })}</div></div>;
  }

  if (enumOptions[property]) return <EnumControl label={label} value={value} options={enumOptions[property]} onChange={onChange} />;
  if (property === "colorTemperature") return <RangeControl label={label} value={value} min={2700} max={6500} step={100} unit="K" tone="temperature" onChange={onChange} />;
  if (property === "brightness") return <RangeControl label={label} value={value} min={1} max={100} step={1} unit="%" tone="percent" onChange={onChange} />;
  if (["targetPercent", "targetPosition", "position", "humidity", "batteryLevel", "battery"].includes(property)) return <RangeControl label={label} value={value} min={0} max={100} step={1} unit="%" tone="percent" onChange={onChange} />;
  if (property === "airConditionerTargetTemperature") return <NumberControl label={label} value={value} min={16} max={32} step={1} unit="°C" onChange={onChange} />;
  if (["temperature", "currentTemperature", "airConditionerCurrentTemperature"].includes(property)) return <NumberControl label={label} value={value} min={-40} max={80} step={0.5} unit="°C" onChange={onChange} />;
  if (property === "pm25") return <NumberControl label={label} value={value} min={0} max={1000} step={1} unit="μg/m³" onChange={onChange} />;
  if (property === "co2") return <NumberControl label={label} value={value} min={0} max={10000} step={10} unit="ppm" onChange={onChange} />;
  if (property === "luminance") return <NumberControl label={label} value={value} min={0} max={200000} step={1} unit="lx" onChange={onChange} />;
  if (property === "voc") return <NumberControl label={label} value={value} min={0} max={10} step={0.01} unit="mg/m³" onChange={onChange} />;

  return <div className="property-value-control property-unsupported"><span>{label}</span><strong>当前属性暂无可用的编辑控件</strong></div>;
}

function EnumControl({ label, value, options, onChange }: { label: string; value: unknown; options: Array<{ value: number; label: string }>; onChange: Props["onChange"] }) {
  const current = numericValue(value, options[0]?.value || 0);
  return <div className="property-value-control property-enum-control"><span>{label}</span><div className="property-option-grid" role="radiogroup" aria-label={label}>{options.map((option) => <button type="button" role="radio" aria-checked={current === option.value} className={current === option.value ? "selected" : ""} key={option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div></div>;
}

function NumberControl({ label, value, min, max, step, unit, onChange }: { label: string; value: unknown; min: number; max: number; step: number; unit: string; onChange: Props["onChange"] }) {
  const current = clamp(numericValue(value, min), min, max);
  return <label className="property-value-control property-number-control"><span>{label}</span><span className="property-number-field"><input type="number" min={min} max={max} step={step} value={current} aria-label={label} onChange={(event) => onChange(clamp(Number(event.target.value), min, max))} /><b>{unit}</b></span></label>;
}

function RangeControl({ label, value, min, max, step, unit, tone, onChange }: { label: string; value: unknown; min: number; max: number; step: number; unit: string; tone: string; onChange: Props["onChange"] }) {
  const current = clamp(numericValue(value, min), min, max);
  return <label className={"property-value-control property-range-control " + tone}><span>{label}<output>{current}{unit}</output></span><input type="range" min={min} max={max} step={step} value={current} aria-label={label} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function numericValue(value: unknown, fallback: number) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function rgbIntegerToHex(value: unknown) { return "#" + clamp(Math.round(numericValue(value, 0)), 0, 0xFFFFFF).toString(16).padStart(6, "0").toUpperCase(); }
function hexToRgbInteger(value: string) { const parsed = Number.parseInt(value.replace("#", ""), 16); return Number.isFinite(parsed) ? parsed : 0; }
function themeColorValue(token: string) { const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim().toUpperCase(); return /^#[0-9A-F]{6}$/.test(value) ? value : rgbIntegerToHex(0); }

export function isBooleanProperty(property: string) { return Object.hasOwn(booleanStateLabels, property); }
export function defaultPropertyValue(property: string) { if (isBooleanProperty(property)) return true; if (enumOptions[property]) return enumOptions[property][0].value; if (property === "colorTemperature") return 4000; if (["brightness", "targetPercent", "targetPosition", "position", "humidity", "batteryLevel", "battery"].includes(property)) return 50; if (property === "color") return hexToRgbInteger(themeColorValue(colorPresetTokens[1])); if (["temperature", "currentTemperature", "airConditionerTargetTemperature", "airConditionerCurrentTemperature"].includes(property)) return 24; if (property === "pm25") return 35; if (property === "co2") return 800; if (property === "luminance") return 300; if (property === "voc") return 0.3; return 0; }
export function formatPropertyValue(property: string, value: unknown) { if (isBooleanProperty(property)) { const labels = booleanStateLabels[property]; return value === false ? labels.off : labels.on; } if (enumOptions[property]) return enumOptions[property].find((option) => option.value === Number(value))?.label || "未知状态"; if (property === "color") return rgbIntegerToHex(value); if (["brightness", "targetPercent", "targetPosition", "position", "humidity", "batteryLevel", "battery"].includes(property)) return String(value) + "%"; if (property === "colorTemperature") return String(value) + " K"; if (["temperature", "currentTemperature", "airConditionerTargetTemperature", "airConditionerCurrentTemperature"].includes(property)) return String(value) + "°C"; if (property === "pm25") return String(value) + " μg/m³"; if (property === "co2") return String(value) + " ppm"; if (property === "luminance") return String(value) + " lx"; if (property === "voc") return String(value) + " mg/m³"; return String(value ?? "-"); }
`;
}

export function propertyValueControlStylesSource() {
  return `
/* PROPERTY VALUE CONTROL */
.property-value-control { min-width: 0; display: grid; align-content: start; gap: 7px; color: var(--color-muted); font-size: 13px; }
.property-value-control > span { min-height: 20px; display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.property-value-control output { color: var(--color-heading); font-variant-numeric: tabular-nums; font-weight: 650; }
.property-toggle { width: 100%; min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: 5px 12px 5px 5px; border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-muted); background: var(--color-neutral-100); }
.property-toggle > span { position: relative; width: 50px; height: 32px; flex: 0 0 auto; border-radius: var(--radius-md); background: var(--color-neutral-200); transition: background-color var(--duration-fast); }
.property-toggle > span::after { position: absolute; top: 4px; left: 4px; width: 24px; height: 24px; border-radius: 6px; content: ""; background: var(--color-white); box-shadow: var(--yp-component-shadow-toggle-thumb); transition: transform var(--duration-fast); }
.property-toggle.on { color: var(--color-heading); border-color: color-mix(in srgb, var(--color-primary) 36%, var(--color-border)); background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface)); }
.property-toggle.on > span { background: var(--color-primary); }
.property-toggle.on > span::after { transform: translateX(18px); }
.property-color-picker { min-height: 52px; display: grid; grid-template-columns: 44px minmax(0, 1fr); align-items: center; gap: var(--space-2); padding: 4px 10px 4px 4px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.property-color-picker input[type="color"] { width: 44px; height: 44px; min-height: 44px; padding: 5px; overflow: hidden; border: 0; border-radius: 8px; background: transparent; cursor: pointer; }
.property-color-picker input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
.property-color-picker input[type="color"]::-webkit-color-swatch { border: 1px solid var(--color-border); border-radius: 6px; }
.color-presets { max-width: 100%; display: grid; grid-template-columns: repeat(auto-fit, 44px); gap: 4px; }
.color-presets button { position: relative; width: 44px; height: 44px; min-height: 44px; padding: 0; border: 0; border-radius: 50%; background: transparent; box-shadow: none; }
.color-presets button::before { position: absolute; inset: 8px; content: ""; border: 2px solid var(--color-surface); border-radius: 50%; background: var(--preset-color); box-shadow: var(--shadow-inset-border); transition: transform var(--duration-fast), box-shadow var(--duration-fast); }
.color-presets button[aria-pressed="true"]::before { box-shadow: var(--shadow-focus); transform: scale(0.86); }
.property-range-control input[type="range"] { width: 100%; min-height: 32px; padding: 0; border: 0; background: transparent; accent-color: var(--color-primary); }
.property-range-control.temperature input[type="range"] { accent-color: var(--color-warning); }
.property-option-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(64px, 1fr)); gap: var(--space-2); }
.property-option-grid button { min-width: 0; min-height: 44px; padding: 0 10px; border: 1px solid var(--color-border); border-radius: var(--button-radius); color: var(--color-muted); background: var(--color-surface); }
.property-option-grid button[aria-checked="true"] { border-color: var(--color-primary); color: var(--color-on-primary); background: var(--color-primary); }
.property-unsupported strong { min-height: 44px; display: flex; align-items: center; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-muted); background: var(--color-neutral-100); font-weight: 500; }
.property-number-field { min-height: 44px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); overflow: hidden; }
.property-number-field input { min-width: 0; border: 0; background: transparent; }
.property-number-field b { padding: 0 12px; color: var(--color-muted); font-size: 12px; font-weight: 650; white-space: nowrap; }
@media (max-width: 720px) { .automation-action-edit > .property-value-control { grid-column: 2 / 3; } }
`;
}
