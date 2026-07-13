export function Button({ children, variant = "primary", disabled = false, busy = false, onClick, type = "button" }) {
  return <button type={type} className={`yp-button yp-button--${variant}`} disabled={disabled || busy} aria-busy={busy || undefined} onClick={onClick}>
    {busy ? "处理中" : children}
  </button>;
}
