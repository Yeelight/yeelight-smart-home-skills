export function installerStylesSource() {
  return `
/* INSTALLER MAINTENANCE */
.installer-page { display: grid; gap: var(--space-5); }
.installer-heading { display: grid; gap: var(--space-1); }
.installer-heading p { max-width: 70ch; color: var(--color-muted); }
.installer-priority-band { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.installer-priority-band > div { min-height: 88px; display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; gap: var(--space-3); padding: var(--space-4); border-right: 1px solid var(--color-border); }
.installer-priority-band > div:last-child { border-right: 0; }
.installer-priority-band span { display: grid; }
.installer-priority-band strong { color: var(--color-heading); font-size: 22px; font-variant-numeric: tabular-nums; }
.installer-priority-band small { overflow-wrap: anywhere; }
.installer-section { min-width: 0; border-top: 1px solid var(--color-border); }
.installer-section-title { min-height: 52px; display: flex; align-items: center; gap: var(--space-2); }
.installer-section-title h3 { margin: 0; font-size: 17px; }
.installer-issue-list, .installer-route-list, .installer-terminal-list, .installer-table { display: grid; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.installer-issue-list article { min-height: 72px; display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); padding: 10px var(--space-3); border-bottom: 1px solid var(--color-border); }
.installer-issue-list article:last-child, .installer-table > div:last-child { border-bottom: 0; }
.installer-issue-icon { width: 36px; height: 36px; display: grid; place-items: center; border-radius: var(--radius-sm); color: var(--color-error); background: var(--color-error-bg); }
.installer-issue-list article > div, .installer-route-list button > span, .installer-table [role="cell"]:first-child { display: grid; min-width: 0; }
.installer-issue-list article span { color: var(--color-error); font-size: 13px; }
.installer-issue-list article small, .installer-route-list small, .installer-table small { color: var(--color-muted); overflow-wrap: anywhere; }
.installer-issue-list button, .installer-route-list button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-1); border: 0; color: var(--color-primary); background: transparent; }
.installer-route-list button { min-height: 64px; display: grid; grid-template-columns: 24px minmax(0, 1fr) 20px; justify-content: stretch; gap: var(--space-3); padding: 8px var(--space-3); border-bottom: 1px solid var(--color-border); text-align: left; }
.installer-route-list button:last-child { border-bottom: 0; }
.installer-table > div { min-height: 64px; display: grid; grid-template-columns: minmax(180px, 1.5fr) minmax(120px, 1fr) minmax(72px, .5fr); align-items: center; gap: var(--space-3); padding: 8px var(--space-3); border-bottom: 1px solid var(--color-border); }
.installer-table .healthy { color: var(--color-primary); }
.installer-table .attention { color: var(--color-error); }
.installer-terminal-list article { min-height: 76px; display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: var(--space-3); padding: var(--space-3); border-bottom: 1px solid var(--color-border); color: var(--color-warning); }
.installer-terminal-list article:last-child { border-bottom: 0; }
.installer-terminal-list article > div { display: grid; gap: 2px; }
.installer-terminal-list span { color: var(--color-foreground); }
.installer-terminal-list small { color: var(--color-muted); }
.installer-empty { min-height: 64px; display: flex; align-items: center; gap: var(--space-2); padding: var(--space-3); border: 1px dashed var(--color-border); border-radius: var(--radius-md); color: var(--color-muted); }
@media (max-width: 720px) { .installer-priority-band { grid-template-columns: 1fr; } .installer-priority-band > div { min-height: 68px; border-right: 0; border-bottom: 1px solid var(--color-border); } .installer-priority-band > div:last-child { border-bottom: 0; } }
@media (max-width: 520px) { .installer-issue-list article { grid-template-columns: 36px minmax(0, 1fr); } .installer-issue-list button { grid-column: 1 / -1; width: 100%; border-top: 1px solid var(--color-border); } .installer-table > div { grid-template-columns: minmax(0, 1fr) auto; } .installer-table [role="cell"]:nth-child(2) { grid-column: 1; } .installer-table [role="cell"]:last-child { grid-column: 2; grid-row: 1 / span 2; } }
`;
}
