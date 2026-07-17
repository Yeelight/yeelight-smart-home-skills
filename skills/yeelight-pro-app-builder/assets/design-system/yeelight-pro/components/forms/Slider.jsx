export function Slider({ label, value, min = 0, max = 100, step = 1, unit = "", disabled = false, onChange, onCommit }) {
  const handleKeyDown = (event) => {
    const nextValue = keyboardValue(event.key, Number(value), Number(min), Number(max), Number(step));
    if (nextValue === null) return;
    event.preventDefault();
    onChange?.(nextValue);
    onCommit?.(nextValue);
  };
  return <label className="yp-slider"><span><strong>{label}</strong><output>{value}{unit}</output></span><input type="range" value={value} min={min} max={max} step={step} disabled={disabled} aria-label={label} onChange={(event) => onChange?.(Number(event.target.value))} onPointerUp={(event) => onCommit?.(Number(event.currentTarget.value))} onKeyDown={handleKeyDown} /></label>;
}

function keyboardValue(key, value, min, max, step) {
  if (key === "Home") return min;
  if (key === "End") return max;
  if (["ArrowRight", "ArrowUp"].includes(key)) return Math.min(max, value + step);
  if (["ArrowLeft", "ArrowDown"].includes(key)) return Math.max(min, value - step);
  return null;
}
