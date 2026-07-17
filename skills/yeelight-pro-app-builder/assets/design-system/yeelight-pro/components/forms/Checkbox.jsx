export function Checkbox({ label, description, checked = false, disabled = false, indeterminate = false, onChange }) {
  const inputRef = React.useRef(null);
  React.useEffect(() => { if (inputRef.current) inputRef.current.indeterminate = indeterminate; }, [indeterminate]);
  return <label className="yp-checkbox"><input ref={inputRef} type="checkbox" checked={checked} disabled={disabled} aria-checked={indeterminate ? "mixed" : checked} onChange={(event) => onChange?.(event.target.checked)} /><span><strong>{label}</strong>{description ? <small>{description}</small> : null}</span></label>;
}
