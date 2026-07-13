export function panelStylesSource() {
  return `/* PANEL MANAGEMENT TOKENS */
:root { --panel-management-icon-bg: var(--color-neutral-100); --panel-management-online-bg: color-mix(in srgb, var(--color-accent) 12%, var(--color-surface)); --panel-management-scrim: rgb(8 20 24 / 0.52); }
.panel-module, .panel-directory, .panel-detail { padding-top: var(--space-2); }
.panel-heading p { max-width: 64ch; color: var(--color-muted); }
.panel-count { color: var(--color-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.panel-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); margin-top: var(--space-4); }
.panel-summary > span { min-height: 72px; display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 0 var(--space-2); padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.panel-summary svg { color: var(--color-primary); }
.panel-summary strong { font-size: 20px; font-variant-numeric: tabular-nums; }
.panel-summary small { grid-column: 1 / -1; }
.panel-summary .attention { background: var(--color-warning-bg); }
.panel-list { display: grid; margin-top: var(--space-4); overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.panel-row { min-width: 0; min-height: 76px; display: grid; grid-template-columns: 44px minmax(0, 1fr) auto 24px; align-items: center; gap: var(--space-3); padding: 12px var(--space-4); border: 0; border-bottom: 1px solid var(--color-neutral-100); color: inherit; background: var(--color-surface); text-align: left; }
.panel-row:last-child { border-bottom: 0; }
.panel-row:hover, .panel-row:focus-visible { background: var(--color-background); }
.panel-row.offline { background: var(--color-neutral-100); }
.panel-row-copy { min-width: 0; display: grid; gap: 2px; }
.panel-row-copy strong, .panel-row-copy small, .panel-row-copy span { overflow-wrap: anywhere; }
.panel-row-copy small, .panel-row-copy span { color: var(--color-muted); }
.panel-row-copy span { font-size: 13px; }
.panel-icon { width: 44px; height: 44px; display: grid; place-items: center; border-radius: var(--radius-md); color: var(--color-primary); background: var(--panel-management-icon-bg); box-shadow: inset 0 0 0 1px var(--color-neutral-200); }
.panel-status { min-height: 44px; display: inline-flex; align-items: center; padding: 0 12px; border-radius: var(--radius-sm); color: var(--color-muted); background: var(--color-neutral-100); }
.panel-status.online { color: var(--color-primary); background: var(--panel-management-online-bg); }
.panel-knob-terminal { margin-top: var(--space-6); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.panel-knob-terminal > div:first-child { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: var(--space-3); }
.panel-knob-terminal h3, .panel-knob-terminal p { margin: 0; }
.panel-knob-terminal p { color: var(--color-muted); }
.panel-knob-list { display: grid; margin-top: var(--space-3); }
.panel-knob-list > span { min-height: 48px; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); border-top: 1px solid var(--color-neutral-100); }
.panel-knob-list small { text-align: right; }
.panel-detail > header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--space-4); }
.panel-detail > header p { color: var(--color-muted); }
.panel-detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); margin-top: var(--space-5); }
.panel-section { min-width: 0; padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.panel-section-title { display: flex; align-items: center; gap: var(--space-2); padding-bottom: var(--space-3); border-bottom: 1px solid var(--color-neutral-100); }
.panel-section-title svg { color: var(--color-primary); }
.panel-section-title h3 { margin: 0; font-size: 17px; }
.panel-section-actions { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.panel-section-actions .panel-section-title { flex: 1; }
.panel-facts { display: grid; margin: var(--space-3) 0 0; }
.panel-facts div { min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); border-bottom: 1px solid var(--color-neutral-100); }
.panel-facts div:last-child { border-bottom: 0; }
.panel-facts dt { color: var(--color-muted); }
.panel-facts dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
.panel-type-list, .panel-event-list, .panel-button-list { display: grid; margin-top: var(--space-3); }
.panel-type-list > span { min-height: 52px; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); border-bottom: 1px solid var(--color-neutral-100); }
.panel-events-section, .panel-settings { grid-column: 1 / -1; }
.panel-event-list article, .panel-button-list article { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); padding: 12px 0; border-bottom: 1px solid var(--color-neutral-100); }
.panel-event-list article > div:first-child, .panel-button-list article > div:first-child { min-width: 0; display: grid; gap: 2px; }
.panel-event-list span, .panel-event-list small, .panel-button-list span { color: var(--color-muted); overflow-wrap: anywhere; }
.panel-event-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--space-2); }
.panel-event-actions button, .panel-button-list button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 12px; border: 1px solid var(--color-border); border-radius: var(--button-radius); color: var(--color-primary); background: var(--color-surface); }
.panel-event-actions .danger-action { color: var(--color-error); }
.panel-readonly { min-height: 44px; display: inline-flex; align-items: center; gap: var(--space-2); padding: 8px 12px; border-radius: var(--radius-sm); color: var(--color-muted); background: var(--color-neutral-100); }
.panel-terminal, .panel-feedback { min-height: 52px; display: flex; align-items: center; gap: var(--space-3); margin-top: var(--space-4); padding: 10px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-neutral-100); }
.panel-terminal > svg { flex: 0 0 auto; align-self: flex-start; margin-top: 6px; }
.panel-terminal > div { display: grid; gap: 2px; }
.panel-feedback { color: var(--color-primary); background: var(--color-surface); }
.panel-loading { min-height: 44px; display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-4); color: var(--color-muted); }
.panel-error { min-height: 52px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--space-2); margin-top: var(--space-3); padding: 8px 10px; border: 1px solid color-mix(in srgb, var(--color-error) 24%, transparent); border-radius: var(--radius-sm); color: var(--color-error); background: var(--color-error-bg); }
.panel-error button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 12px; border: 1px solid currentColor; border-radius: var(--button-radius); color: var(--color-error); background: var(--color-surface); }
.panel-dialog-backdrop { position: fixed; z-index: 100; inset: 0; display: grid; place-items: center; padding: var(--space-4); background: var(--panel-management-scrim); }
.panel-dialog { width: min(100%, 560px); max-height: calc(100dvh - 32px); overflow: auto; padding: var(--space-5); border-radius: var(--radius-md); background: var(--color-surface); box-shadow: var(--shadow-card); }
.panel-dialog > header, .panel-dialog > footer { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.panel-dialog h3 { margin: 0; font-size: 18px; }
.panel-dialog > label, .panel-dialog fieldset { display: grid; gap: var(--space-2); margin-top: var(--space-4); font-weight: 700; }
.panel-dialog input[type="text"], .panel-dialog > label input, .panel-dialog select { min-height: 44px; padding: 9px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-heading); background: var(--color-surface); }
.panel-dialog fieldset { padding: 0; border: 0; }
.panel-event-options { display: grid; gap: var(--space-2); }
.panel-event-options label { min-height: 48px; display: grid; grid-template-columns: 20px minmax(0, 1fr); align-items: center; gap: var(--space-2); padding: 8px 10px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-weight: 400; }
.panel-event-options input { width: 20px; height: 20px; accent-color: var(--color-primary); }
.panel-impact { min-height: 64px; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--space-3); margin-top: var(--space-4); padding: 12px; border-radius: var(--radius-sm); background: var(--color-neutral-100); }
.panel-impact > div { display: grid; gap: 2px; }
.panel-dialog-error { min-height: 48px; margin-top: var(--space-3); padding: 10px 12px; border-radius: var(--radius-sm); color: var(--color-error); background: var(--color-error-bg); }
.panel-dialog > footer { justify-content: flex-end; margin-top: var(--space-5); }
.danger-primary { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 16px; border: 1px solid var(--color-error); border-radius: var(--button-radius); color: var(--color-white); background: var(--color-error); }
@media (max-width: 700px) { .panel-heading, .panel-detail > header { align-items: stretch; grid-template-columns: 1fr; } .panel-summary { grid-template-columns: 1fr; } .panel-row { grid-template-columns: 44px minmax(0, 1fr) 20px; } .panel-row .panel-status { grid-column: 2; justify-self: start; } .panel-row > svg { grid-column: 3; grid-row: 1 / 3; } .panel-detail-grid { grid-template-columns: 1fr; } .panel-events-section, .panel-settings { grid-column: auto; } .panel-section-actions { align-items: stretch; flex-direction: column; } .panel-event-list article, .panel-button-list article { grid-template-columns: 1fr; } .panel-event-actions { justify-content: stretch; } .panel-event-actions button, .panel-button-list button, .panel-readonly { width: 100%; } .panel-dialog-backdrop { align-items: end; padding: 0; } .panel-dialog { width: 100%; max-height: 92dvh; border-bottom-left-radius: 0; border-bottom-right-radius: 0; } .panel-dialog > footer { display: grid; grid-template-columns: 1fr; } .panel-error { grid-template-columns: auto minmax(0, 1fr); } .panel-error button { grid-column: 1 / -1; width: 100%; } }
@media (max-width: 420px) { .panel-facts div { align-items: flex-start; flex-direction: column; justify-content: center; gap: 2px; padding: 8px 0; } .panel-facts dd { text-align: left; } }
@media (prefers-reduced-motion: reduce) { .panel-row, .panel-dialog { transition: none; } }
`;
}
