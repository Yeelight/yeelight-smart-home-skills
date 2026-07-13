export function AppNavigation({ items, activeId, onNavigate }) {
  return <nav className="yp-navigation" aria-label="主导航">{items.map((item, index) => <button key={item.id} type="button" aria-current={item.id === activeId ? "page" : undefined} onClick={() => onNavigate?.(item.id)}><span className="yp-navigation-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><span className="yp-navigation-label">{item.label}</span></button>)}</nav>;
}
