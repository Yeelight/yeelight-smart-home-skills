export function Tabs({ items, value, onChange, ariaLabel = "页面视图" }) {
  const tabRefs = React.useRef(new Map());
  const enabledItems = items.filter((item) => !item.disabled);
  const selected = items.find((item) => item.value === value) || enabledItems[0];
  const moveFocus = (currentValue, offset) => {
    const currentIndex = enabledItems.findIndex((item) => item.value === currentValue);
    const nextItem = enabledItems[(currentIndex + offset + enabledItems.length) % enabledItems.length];
    if (!nextItem) return;
    onChange?.(nextItem.value);
    tabRefs.current.get(nextItem.value)?.focus();
  };
  return <div className="yp-tabs"><div className="yp-tab-list" role="tablist" aria-label={ariaLabel}>{items.map((item) => <button ref={(node) => node ? tabRefs.current.set(item.value, node) : tabRefs.current.delete(item.value)} key={item.value} type="button" role="tab" id={`yp-tab-${item.value}`} aria-controls={`yp-panel-${item.value}`} aria-selected={item.value === selected?.value} tabIndex={item.value === selected?.value ? 0 : -1} disabled={item.disabled} onClick={() => onChange?.(item.value)} onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); moveFocus(item.value, 1); } if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); moveFocus(item.value, -1); } if (event.key === "Home" && enabledItems[0]) { event.preventDefault(); onChange?.(enabledItems[0].value); tabRefs.current.get(enabledItems[0].value)?.focus(); } if (event.key === "End" && enabledItems.at(-1)) { event.preventDefault(); onChange?.(enabledItems.at(-1).value); tabRefs.current.get(enabledItems.at(-1).value)?.focus(); } }}>{item.label}{item.count === undefined ? null : <span>{item.count}</span>}</button>)}</div>{selected ? <section className="yp-tab-panel" role="tabpanel" id={`yp-panel-${selected.value}`} aria-labelledby={`yp-tab-${selected.value}`}>{selected.content}</section> : null}</div>;
}
