export function Menu({ label, items, align = "start" }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const triggerRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const menuId = React.useId();
  React.useEffect(() => {
    if (!isOpen) return undefined;
    const firstItem = menuRef.current?.querySelector("button:not(:disabled)");
    firstItem?.focus();
    const dismiss = (event) => {
      if (event.type === "keydown" && event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      } else if (event.type === "pointerdown" && !menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", dismiss);
    document.addEventListener("pointerdown", dismiss);
    return () => { document.removeEventListener("keydown", dismiss); document.removeEventListener("pointerdown", dismiss); };
  }, [isOpen]);
  const move = (event, offset) => {
    const enabled = [...menuRef.current.querySelectorAll("button:not(:disabled)")];
    const index = enabled.indexOf(document.activeElement);
    enabled[(index + offset + enabled.length) % enabled.length]?.focus();
    event.preventDefault();
  };
  return <div className={`yp-menu yp-menu--${align}`}><button ref={triggerRef} type="button" className="yp-button yp-button--secondary" aria-haspopup="menu" aria-controls={menuId} aria-expanded={isOpen} onClick={() => setIsOpen((current) => !current)} onKeyDown={(event) => { if (["ArrowDown", "Enter", " "].includes(event.key)) { event.preventDefault(); setIsOpen(true); } }}>{label}<span aria-hidden="true">...</span></button>{isOpen ? <div ref={menuRef} id={menuId} className="yp-menu-popover" role="menu" aria-label={label} onKeyDown={(event) => { if (event.key === "ArrowDown") move(event, 1); if (event.key === "ArrowUp") move(event, -1); }} >{items.map((item) => <button key={item.id} type="button" role="menuitem" className={item.destructive ? "yp-menu-item--destructive" : undefined} disabled={item.disabled} onClick={() => { setIsOpen(false); item.onSelect?.(); triggerRef.current?.focus(); }}><span>{item.label}</span>{item.description ? <small>{item.description}</small> : null}</button>)}</div> : null}</div>;
}
