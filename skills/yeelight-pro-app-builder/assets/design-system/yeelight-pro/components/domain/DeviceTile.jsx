import { StatusBadge } from "../feedback/StatusBadge.jsx";
import { Switch } from "../forms/Switch.jsx";

export function DeviceTile({ name, room, category, summary, status = "success", statusLabel = "在线", power, disabled = false, onOpen, onPowerChange }) {
  return <article className={`yp-device-tile${disabled ? " yp-device-tile--disabled" : ""}`}><header><div><span className="yp-device-category">{category}</span><h3>{name}</h3><p>{room}</p></div><StatusBadge tone={status}>{statusLabel}</StatusBadge></header><div className="yp-device-summary">{summary}</div><footer><button type="button" className="yp-button yp-button--secondary" disabled={disabled} onClick={onOpen}>查看控制</button>{typeof power === "boolean" ? <Switch label={`${name}电源`} checked={power} disabled={disabled || status === "offline"} onChange={onPowerChange} /> : null}</footer></article>;
}
