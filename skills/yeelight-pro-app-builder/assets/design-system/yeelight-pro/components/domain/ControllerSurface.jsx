import { StatusBadge } from "../feedback/StatusBadge.jsx";

export function ControllerSurface({ title, subtitle, status = "success", statusLabel = "在线", value, unit, children, actions }) {
  return <section className="yp-controller-surface"><header><div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div><StatusBadge tone={status}>{statusLabel}</StatusBadge></header>{value !== undefined ? <div className="yp-controller-reading"><strong>{value}</strong>{unit ? <span>{unit}</span> : null}</div> : null}<div className="yp-controller-controls">{children}</div>{actions ? <footer>{actions}</footer> : null}</section>;
}
