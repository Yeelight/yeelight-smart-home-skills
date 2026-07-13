export function IconButton({ label, children, disabled = false, onClick }) {
  return <button type="button" className="yp-button yp-button--secondary yp-icon-button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>{children}</button>;
}
