export function ModalSurface({ open, title, children, footer, onClose, closeLabel = "关闭" }) {
  const surfaceRef = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    surfaceRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
      if (event.key !== "Tab" || !surfaceRef.current) return;
      const focusable = [...surfaceRef.current.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((node) => !node.disabled);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="yp-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}><section ref={surfaceRef} className="yp-modal" role="dialog" aria-modal="true" aria-labelledby="yp-modal-title" tabIndex={-1}><header><h2 id="yp-modal-title">{title}</h2><button type="button" className="yp-button yp-button--ghost" onClick={onClose}>{closeLabel}</button></header><div>{children}</div>{footer ? <footer>{footer}</footer> : null}</section></div>;
}
