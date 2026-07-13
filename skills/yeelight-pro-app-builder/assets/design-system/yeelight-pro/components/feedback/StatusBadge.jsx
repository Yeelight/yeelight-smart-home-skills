export function StatusBadge({ children, tone = "success" }) {
  return <span className={`yp-badge yp-badge--${tone}`}>{children}</span>;
}
