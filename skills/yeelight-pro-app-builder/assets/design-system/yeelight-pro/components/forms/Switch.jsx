export function Switch({ label, description, checked = false, disabled = false, onChange }) {
  return <button type="button" className={`yp-switch${checked ? " yp-switch--on" : ""}`} role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange?.(!checked)}><span className="yp-switch-track" aria-hidden="true"><i /></span><span className="yp-switch-copy"><strong>{label}</strong>{description ? <small>{description}</small> : null}</span><b>{checked ? "开启" : "关闭"}</b></button>;
}
