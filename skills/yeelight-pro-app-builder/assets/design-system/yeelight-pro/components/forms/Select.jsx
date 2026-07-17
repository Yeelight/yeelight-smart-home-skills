export function Select({ label, value, options, helper, error, disabled = false, onChange }) {
  const id = React.useId();
  const messageId = `${id}-message`;
  return <label className={`yp-field${error ? " yp-field--error" : ""}`} htmlFor={id}><span>{label}</span><select id={id} value={value} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={helper || error ? messageId : undefined} onChange={(event) => onChange?.(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select>{helper || error ? <small id={messageId}>{error || helper}</small> : null}</label>;
}
