import { resolvePageContributions } from "./page-contributions.mjs";

export function appSource(spec, selected, moduleTemplates, managementOperations = {}) {
  const contributions = resolvePageContributions(selected, moduleTemplates, managementOperations);
  const models = uniqueBy(contributions.map((item) => item.model), (item) => item.hook);
  const pages = groupPages(contributions);
  const imports = [
    ...moduleImports(contributions),
    ...models.map((item) => `import { ${item.hook} } from "./runtime/${item.file}";`),
  ].join("\n");
  const icons = [...new Set(["ChevronRight", "Menu", "RefreshCw", "RotateCcw", "Wifi", "WifiOff", "X", ...pages.map((page) => page.icon)])].join(", ");
  const pageData = pages.map((page) => `{ route: "${page.route}", label: "${page.label}", shortLabel: "${page.shortLabel}", icon: ${page.icon} }`).join(",\n  ");
  const bindings = models.map((item) => `  ${item.binding}`).join("\n");
  const loading = models.map((item) => item.loading).join(" || ") || "false";
  const errors = models.map((item) => item.error).join(", ");
  const refreshes = models.map((item) => `${item.refresh}()`).join(", ");
  const content = pages.map((page) => `      {activeRoute.split("/")[0] === "${page.route}" && <div className="${page.route === "overview" ? "page-stack home-slot-host" : "page-stack"}" data-page="${page.route}">\n${page.items.map((item) => `        <section className="${item.homeSlot ? `module-section home-slot home-slot-${item.homeSlot}` : "module-section"}" data-module="${item.moduleId}"${item.homeSlot ? ` data-home-slot="${item.homeSlot}"` : ""}>${item.render}</section>`).join("\n")}\n      </div>}`).join("\n");
  const navigation = pages.length > 1 ? navigationSource(pages.length, escapeText(spec.product.title)) : "";
  const shellClass = pages.length > 1 ? "app-shell management-shell" : "app-shell";
  return `${imports}
import { ${icons} } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "./styles.css";

const pages = [
  ${pageData}
] as const;
type PageRoute = string;

function routeFromLocation(): PageRoute {
  const route = window.location.hash.slice(1).split("?")[0] || pages[0].route;
  const baseRoute = route.split("/")[0];
  return pages.some((page) => page.route === baseRoute) ? route : pages[0].route;
}

function firstObjectError(errors: Record<string, string> | undefined) {
  return errors ? Object.values(errors).find(Boolean) : undefined;
}

export function App() {
${bindings}
  const [activeRoute, setActiveRoute] = useState<PageRoute>(routeFromLocation);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const shellContentRef = useRef<HTMLDivElement>(null);
  const routeScrollRef = useRef<Record<string, number>>({});
  const loading = ${loading};
  const syncErrors = [${errors}].filter((item): item is string => Boolean(item));
  const activeBaseRoute = activeRoute.split("/")[0];
  const activePage = pages.find((page) => page.route === activeBaseRoute) || pages[0];
  const refreshAll = async () => { await Promise.allSettled([${refreshes}]); };
  const requestNavigation = (route: PageRoute) => window.dispatchEvent(new CustomEvent("app:navigate-request", { cancelable: true, detail: { route } }));
  const navigate = (route: PageRoute) => {
    setMoreOpen(false);
    if (!requestNavigation(route)) return;
    routeScrollRef.current[activeBaseRoute] = shellContentRef.current?.scrollTop || 0;
    if (route !== activeRoute) window.history.pushState(null, "", "#" + route);
    setActiveRoute(route);
  };
  const navigatePath = (route: string) => navigate(route);
  useEffect(() => {
    const syncRoute = () => {
      const next = routeFromLocation();
      if (!requestNavigation(next)) { window.history.replaceState(null, "", "#" + activeRoute); return; }
      routeScrollRef.current[activeBaseRoute] = shellContentRef.current?.scrollTop || 0;
      setActiveRoute(next);
    };
    window.addEventListener("popstate", syncRoute);
    window.addEventListener("hashchange", syncRoute);
    return () => { window.removeEventListener("popstate", syncRoute); window.removeEventListener("hashchange", syncRoute); };
  }, [activeRoute]);
  useEffect(() => {
    if (shellContentRef.current) shellContentRef.current.scrollTop = routeScrollRef.current[activeBaseRoute] || 0;
    if (activeBaseRoute === "devices" && window.history.state?.spaceDirectory) return;
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-page="' + activeBaseRoute + '"] h2[tabindex="-1"]')?.focus({ preventScroll: true }));
  }, [activeBaseRoute]);
  return <div className="${shellClass}" ${shellAttributes(spec)}>
${navigation}
    <div className="shell-content" ref={shellContentRef}>
      <header className="topbar shell-topbar">
        <div><small>Yeelight PRO</small><h1>${escapeText(spec.product.title)}</h1><span className="page-context">{activePage.label}</span></div>
        <button type="button" className={syncErrors.length ? "connection-state error" : "connection-state"} disabled={loading} onClick={() => void refreshAll()} aria-label="重新同步家庭状态">
          {syncErrors.length ? <WifiOff size={17} /> : loading ? <RefreshCw className="spin" size={17} /> : <Wifi size={17} />}
          <span>{syncErrors.length ? "部分失败" : loading ? "正在同步" : "家庭在线"}</span>
        </button>
      </header>
      {syncErrors.length > 0 && <div className="sync-error shell-notice" role="alert"><WifiOff size={18} /><div><strong>部分家庭数据同步失败</strong><span>{syncErrors[0]} 已保留最近一次数据，其它页面仍可使用。</span></div><button type="button" className="retry-button" onClick={() => void refreshAll()}><RotateCcw size={16} />重新同步</button></div>}
      <main className="shell-main" id="main-content" tabIndex={-1}>
${content}
      </main>
    </div>
    {moreOpen && <MoreSheet activeRoute={activeRoute} onNavigate={navigate} onClose={() => setMoreOpen(false)} restoreFocus={() => moreTriggerRef.current?.focus()} />}
  </div>;
}

function MoreSheet({ activeRoute, onNavigate, onClose, restoreFocus }: { activeRoute: PageRoute; onNavigate: (route: PageRoute) => void; onClose: () => void; restoreFocus: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const overflowPages = pages.slice(4);
  const selectPage = (route: PageRoute) => {
    onClose();
    window.setTimeout(() => onNavigate(route), 0);
  };
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      if (!controls.length) return;
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", handleKey); restoreFocus(); };
  }, [onClose, restoreFocus]);
  return <div className="more-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className="more-sheet" role="dialog" aria-modal="true" aria-labelledby="more-sheet-title" tabIndex={-1}><header><div><small>全部页面</small><h2 id="more-sheet-title">更多</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="关闭更多页面"><X size={18} /></button></header><div className="more-sheet-list">{overflowPages.map((page) => { const Icon = page.icon; return <button type="button" key={page.route} aria-current={activeRoute === page.route ? "page" : undefined} onClick={() => selectPage(page.route)}><Icon size={20} /><span>{page.label}</span><ChevronRight size={18} /></button>; })}</div></section></div>;
}
`;
}

function navigationSource(pageCount, productTitle) {
  return `    <aside className="shell-navigation">
      <div className="shell-brand"><small>Yeelight PRO</small><strong>${productTitle}</strong></div>
      <nav className="desktop-navigation" aria-label="主导航">{pages.map((page) => { const Icon = page.icon; return <a key={page.route} href={"#" + page.route} aria-current={activeRoute.split("/")[0] === page.route ? "page" : undefined} onClick={(event) => { event.preventDefault(); navigate(page.route); }}><Icon size={19} /><span>{page.label}</span></a>; })}</nav>
      <nav className="bottom-nav mobile-navigation" data-tabs="${Math.min(pageCount, 5)}" aria-label="主导航">{pages.slice(0, 4).map((page) => { const Icon = page.icon; return <a key={page.route} href={"#" + page.route} aria-current={activeRoute.split("/")[0] === page.route ? "page" : undefined} onClick={(event) => { event.preventDefault(); navigate(page.route); }}><Icon size={19} /><span>{page.shortLabel}</span></a>; })}{pages.length > 4 && <button ref={moreTriggerRef} type="button" aria-current={pages.slice(4).some((page) => page.route === activeRoute.split("/")[0]) ? "page" : undefined} onClick={() => setMoreOpen(true)}><Menu size={19} /><span>更多</span></button>}</nav>
    </aside>`;
}

function groupPages(contributions) {
  const pages = new Map();
  for (const item of contributions) {
    const existing = pages.get(item.route);
    if (existing) existing.items.push(item);
    else pages.set(item.route, { route: item.route, label: item.label, shortLabel: item.shortLabel, icon: item.icon, priority: item.priority, items: [item] });
  }
  return [...pages.values()].sort((left, right) => left.priority - right.priority || left.route.localeCompare(right.route));
}

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => { const value = key(item); if (seen.has(value)) return false; seen.add(value); return true; });
}

function moduleImports(contributions) {
  const modules = new Map();
  for (const item of contributions) {
    const components = modules.get(item.directory) || new Set();
    components.add(item.component);
    modules.set(item.directory, components);
  }
  return [...modules.entries()].map(([directory, components]) => `import { ${[...components].join(", ")} } from "./modules/${directory}";`);
}

function escapeText(value) {
  return String(value || "").replace(/[<&]/g, (character) => character === "<" ? "&lt;" : "&amp;");
}

function shellAttributes(spec) {
  return `data-form-factor="${spec.target.formFactor}" data-navigation="${spec.target.navigation}" data-density="${spec.target.density}" data-theme-pack="${spec.theme.pack}" data-theme-mode="${spec.theme.mode}"`;
}
