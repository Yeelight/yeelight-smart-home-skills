export function shellStylesSource() {
  return `
/* UNIFIED APPLICATION SHELL */
.management-shell { width: min(100%, 1600px); height: 100dvh; min-height: 620px; margin: 0 auto; padding: 0; overflow: hidden; background: var(--color-background); }
.shell-navigation { min-width: 0; border-right: 1px solid var(--color-border); background: var(--color-surface); }
.shell-brand { display: grid; gap: 2px; padding: var(--space-6) var(--space-4) var(--space-5); }
.shell-brand strong { color: var(--color-heading); font-size: 18px; overflow-wrap: anywhere; }
.desktop-navigation { display: grid; gap: var(--space-1); padding: 0 var(--space-2); }
.desktop-navigation a { min-height: var(--control-min-height); display: grid; grid-template-columns: 24px minmax(0, 1fr); align-items: center; gap: var(--space-2); padding: 0 var(--space-3); border-radius: var(--radius-sm); color: var(--color-muted); text-decoration: none; }
.desktop-navigation a:hover { color: var(--color-heading); background: var(--color-background); }
.desktop-navigation a[aria-current="page"] { color: var(--color-heading); background: var(--color-neutral-100); }
.shell-content { min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; }
.shell-topbar { position: sticky; z-index: 10; top: 0; margin: 0; padding: var(--space-4) var(--shell-gutter); border-bottom: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-background) 92%, transparent); backdrop-filter: blur(14px); }
.shell-topbar > div { display: grid; grid-template-columns: auto 1fr; align-items: baseline; gap: 2px var(--space-3); }
.shell-topbar small { grid-column: 1 / -1; }
.shell-topbar h1 { min-width: 0; overflow-wrap: anywhere; }
.page-context { color: var(--color-muted); font-size: 14px; }
.shell-notice { margin: var(--space-4) var(--shell-gutter) 0; }
.shell-main { width: min(100%, 1240px); min-height: 0; margin: 0 auto; padding: var(--space-5) var(--shell-gutter) var(--space-7); outline: 0; }
.page-stack { display: grid; gap: var(--space-6); }
.module-section { min-width: 0; }
.mobile-navigation { display: none; }
.more-sheet-backdrop { position: fixed; z-index: 100; inset: 0; display: grid; place-items: center; padding: var(--space-4); background: rgb(10 25 29 / 0.54); }
.more-sheet { width: min(100%, 480px); max-height: calc(100dvh - 32px); overflow: auto; padding: var(--space-5); border-radius: var(--radius-md); color: var(--color-foreground); background: var(--color-surface); box-shadow: 0 24px 64px rgb(10 25 29 / 0.24); }
.more-sheet > header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
.more-sheet h2 { margin-top: 2px; }
.more-sheet-list { display: grid; gap: var(--space-2); margin-top: var(--space-4); }
.more-sheet-list button { min-height: 52px; display: grid; grid-template-columns: 24px minmax(0, 1fr) 20px; align-items: center; gap: var(--space-3); width: 100%; padding: 0 var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-heading); text-align: left; background: var(--color-surface); }
.more-sheet-list button[aria-current="page"] { color: var(--color-heading); border-color: var(--color-primary); background: var(--color-neutral-100); }
.more-sheet-list button svg:last-child { color: var(--color-muted); }
.management-shell[data-navigation="sidebar"], .management-shell[data-navigation="adaptive-rail"], .management-shell[data-navigation="touch-rail"] { display: grid; grid-template-rows: minmax(0, 1fr); }
.management-shell[data-navigation="sidebar"] { grid-template-columns: 232px minmax(0, 1fr); }
.management-shell[data-navigation="adaptive-rail"] { grid-template-columns: 84px minmax(0, 1fr); }
.management-shell[data-navigation="touch-rail"] { grid-template-columns: 116px minmax(0, 1fr); }
.management-shell[data-navigation="adaptive-rail"] .shell-brand strong, .management-shell[data-navigation="adaptive-rail"] .shell-brand small { display: none; }
.management-shell[data-navigation="adaptive-rail"] .shell-brand { min-height: var(--space-8); padding: var(--space-4); }
.management-shell[data-navigation="adaptive-rail"] .desktop-navigation a { grid-template-columns: 1fr; justify-items: center; min-height: 56px; padding: var(--space-2); font-size: 12px; text-align: center; }
.management-shell[data-navigation="adaptive-rail"] .desktop-navigation a span { overflow-wrap: anywhere; }
.management-shell[data-navigation="touch-rail"] .desktop-navigation a { grid-template-columns: 1fr; justify-items: center; min-height: 64px; padding: var(--space-2); text-align: center; }
.management-shell[data-navigation="bottom-tabs"] { display: block; padding-bottom: calc(74px + env(safe-area-inset-bottom)); }
.management-shell[data-navigation="bottom-tabs"] .shell-content { height: 100%; }
.management-shell[data-navigation="bottom-tabs"] .shell-navigation { position: fixed; z-index: 20; right: auto; bottom: max(10px, env(safe-area-inset-bottom)); left: 50%; width: min(calc(100% - 24px), 560px); transform: translateX(-50%); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--nav-bg); box-shadow: var(--shadow-card); }
.management-shell[data-navigation="bottom-tabs"] .shell-brand, .management-shell[data-navigation="bottom-tabs"] .desktop-navigation { display: none; }
.management-shell[data-navigation="bottom-tabs"] .mobile-navigation { position: static; left: auto; bottom: auto; transform: none; display: grid; grid-template-columns: repeat(var(--mobile-tab-count, 5), minmax(0, 1fr)); width: 100%; padding: 6px; border: 0; box-shadow: none; }
.management-shell[data-navigation="bottom-tabs"] .mobile-navigation[data-tabs="2"] { --mobile-tab-count: 2; }
.management-shell[data-navigation="bottom-tabs"] .mobile-navigation[data-tabs="3"] { --mobile-tab-count: 3; }
.management-shell[data-navigation="bottom-tabs"] .mobile-navigation[data-tabs="4"] { --mobile-tab-count: 4; }
.management-shell[data-navigation="bottom-tabs"] .mobile-navigation a, .management-shell[data-navigation="bottom-tabs"] .mobile-navigation button { min-width: 0; min-height: 52px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 4px; border: 0; border-radius: var(--radius-sm); color: var(--color-muted); text-decoration: none; background: transparent; font-size: 12px; }
.management-shell[data-navigation="bottom-tabs"] .mobile-navigation a[aria-current="page"], .management-shell[data-navigation="bottom-tabs"] .mobile-navigation button[aria-current="page"] { color: var(--color-on-primary); background: var(--color-primary); }
@media (max-width: 900px) and (min-width: 721px) {
  .management-shell[data-navigation="sidebar"] { grid-template-columns: 84px minmax(0, 1fr); }
  .management-shell[data-navigation="sidebar"] .shell-brand { min-height: var(--space-8); padding: var(--space-4); }
  .management-shell[data-navigation="sidebar"] .shell-brand strong,
  .management-shell[data-navigation="sidebar"] .shell-brand small { display: none; }
  .management-shell[data-navigation="sidebar"] .desktop-navigation a { grid-template-columns: 1fr; justify-items: center; min-height: 56px; padding: var(--space-2); font-size: 12px; text-align: center; }
  .management-shell[data-navigation="sidebar"] .desktop-navigation a span { overflow-wrap: anywhere; }
}
@media (max-width: 720px) {
  .management-shell:is([data-navigation="sidebar"], [data-navigation="adaptive-rail"], [data-navigation="touch-rail"]) { display: block; padding-bottom: calc(74px + env(safe-area-inset-bottom)); }
  .management-shell:is([data-navigation="sidebar"], [data-navigation="adaptive-rail"], [data-navigation="touch-rail"]) .shell-content { height: 100%; }
  .management-shell:is([data-navigation="sidebar"], [data-navigation="adaptive-rail"], [data-navigation="touch-rail"]) .shell-navigation { position: fixed; z-index: 20; right: auto; bottom: max(10px, env(safe-area-inset-bottom)); left: 50%; width: min(calc(100% - 24px), 560px); transform: translateX(-50%); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--nav-bg); box-shadow: var(--shadow-card); }
  .management-shell:is([data-navigation="sidebar"], [data-navigation="adaptive-rail"], [data-navigation="touch-rail"]) .shell-brand,
  .management-shell:is([data-navigation="sidebar"], [data-navigation="adaptive-rail"], [data-navigation="touch-rail"]) .desktop-navigation { display: none; }
  .management-shell:is([data-navigation="sidebar"], [data-navigation="adaptive-rail"], [data-navigation="touch-rail"]) .mobile-navigation { display: grid; grid-template-columns: repeat(var(--mobile-tab-count, 5), minmax(0, 1fr)); width: 100%; padding: 6px; }
  .management-shell:is([data-navigation="sidebar"], [data-navigation="adaptive-rail"], [data-navigation="touch-rail"]) .mobile-navigation[data-tabs="2"] { --mobile-tab-count: 2; }
  .management-shell:is([data-navigation="sidebar"], [data-navigation="adaptive-rail"], [data-navigation="touch-rail"]) .mobile-navigation[data-tabs="3"] { --mobile-tab-count: 3; }
  .management-shell:is([data-navigation="sidebar"], [data-navigation="adaptive-rail"], [data-navigation="touch-rail"]) .mobile-navigation[data-tabs="4"] { --mobile-tab-count: 4; }
  .management-shell:is([data-navigation="sidebar"], [data-navigation="adaptive-rail"], [data-navigation="touch-rail"]) .mobile-navigation a,
  .management-shell:is([data-navigation="sidebar"], [data-navigation="adaptive-rail"], [data-navigation="touch-rail"]) .mobile-navigation button { min-width: 0; min-height: 52px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 4px; border: 0; border-radius: var(--radius-sm); color: var(--color-muted); text-decoration: none; background: transparent; font-size: 12px; }
  .management-shell:is([data-navigation="sidebar"], [data-navigation="adaptive-rail"], [data-navigation="touch-rail"]) .mobile-navigation :is(a, button)[aria-current="page"] { color: var(--color-on-primary); background: var(--color-primary); }
  .shell-main { padding-bottom: calc(104px + env(safe-area-inset-bottom)); }
}
@media (max-width: 520px) { .shell-topbar { align-items: flex-start; padding-inline: 14px; } .shell-topbar > div { grid-template-columns: 1fr; } .shell-topbar h1 { overflow-wrap: normal; } .page-context { display: none; } .shell-main { padding-inline: 14px; } .shell-notice { margin-inline: 14px; } .more-sheet-backdrop { align-items: end; padding: 0; } .more-sheet { width: 100%; max-height: calc(100dvh - max(20px, env(safe-area-inset-top))); padding-bottom: max(var(--space-5), env(safe-area-inset-bottom)); border-radius: var(--radius-md) var(--radius-md) 0 0; } }
`;
}
