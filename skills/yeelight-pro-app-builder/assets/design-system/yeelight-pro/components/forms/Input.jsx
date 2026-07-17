export function Input({ label, value = "", type = "text", placeholder, helper, error, disabled = false, readOnly = false, onChange }) {
  const id = React.useId();
  const messageId = `${id}-message`;
  return <label className={`yp-field${error ? " yp-field--error" : ""}`} htmlFor={id}><span>{label}</span><input id={id} type={type} value={value} placeholder={placeholder} disabled={disabled} readOnly={readOnly} aria-invalid={Boolean(error)} aria-describedby={helper || error ? messageId : undefined} onChange={(event) => onChange?.(event.target.value)} />{helper || error ? <small id={messageId}>{error || helper}</small> : null}</label>;
}
