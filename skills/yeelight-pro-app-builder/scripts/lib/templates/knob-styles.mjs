export function knobStylesSource() {
  return `/* KNOB MANAGEMENT TOKENS */
.knob-detail { padding-top: var(--space-2); }
.knob-detail > header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: var(--space-3); }
.knob-detail > header .back-link { grid-column: 1 / -1; justify-self: start; }
.knob-detail > header p, .knob-section > header p { color: var(--color-muted); }
.knob-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); margin-top: var(--space-4); }
.knob-summary > span { min-height: 72px; display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 0 var(--space-2); padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.knob-summary svg { color: var(--color-primary); }
.knob-summary strong { font-size: 20px; font-variant-numeric: tabular-nums; }
.knob-summary small { grid-column: 1 / -1; }
.knob-section { margin-top: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.knob-section > header { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--space-3); padding: var(--space-4); border-bottom: 1px solid var(--color-border); }
.knob-section h3, .knob-section p { margin: 0; }
.knob-action-list article { min-width: 0; display: grid; grid-template-columns: 72px minmax(0, 1fr) auto; align-items: center; gap: var(--space-4); padding: var(--space-4); border-bottom: 1px solid var(--color-neutral-100); }
.knob-action-list article:last-child { border-bottom: 0; }
.knob-action-index { display: grid; justify-items: center; gap: 2px; }
.knob-action-index strong { width: 44px; height: 44px; display: grid; place-items: center; border-radius: var(--radius-md); color: var(--color-primary); background: var(--color-neutral-100); font-size: 20px; }
.knob-action-index span, .knob-action-list dt { color: var(--color-muted); font-size: 12px; }
.knob-action-list dl { min-width: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px var(--space-4); margin: 0; }
.knob-action-list dl div, .knob-terminal > div { min-width: 0; display: grid; gap: 1px; }
.knob-action-list dd { margin: 0; overflow-wrap: anywhere; }
.knob-action-buttons { display: grid; gap: var(--space-2); min-width: 136px; }
.knob-action-buttons button, .knob-readonly { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 12px; border: 1px solid var(--color-border); border-radius: var(--button-radius); color: var(--color-primary); background: var(--color-surface); }
.knob-readonly { color: var(--color-muted); background: var(--color-neutral-100); }
.knob-terminal, .knob-feedback { min-height: 52px; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--space-3); margin-top: var(--space-3); padding: 10px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-neutral-100); }
.knob-terminal > svg { flex: 0 0 auto; color: var(--color-warning); }
.knob-dialog-backdrop { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: var(--space-4); background: var(--panel-management-scrim); }
.knob-dialog { width: min(100%, 520px); max-height: min(88dvh, 720px); overflow: auto; padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); box-shadow: var(--shadow-overlay); }
.knob-dialog > header, .knob-dialog > footer { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.knob-dialog h3 { margin: 0; }
.knob-form { display: grid; gap: var(--space-3); margin-top: var(--space-4); }
.knob-form label { display: grid; gap: 6px; font-weight: 600; }
.knob-form select { width: 100%; min-height: 48px; padding: 0 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-foreground); background: var(--color-surface); }
.knob-form input[type="range"] { width: 100%; min-height: 44px; accent-color: var(--color-primary); }
.knob-form output { color: var(--color-primary); font-variant-numeric: tabular-nums; }
.knob-impact, .knob-reset-impact { min-height: 64px; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--space-3); margin-top: var(--space-4); padding: 12px; border-radius: var(--radius-sm); background: var(--color-neutral-100); }
.knob-impact > div, .knob-reset-impact > div { display: grid; gap: 2px; }
.knob-reset-impact { color: var(--color-error); background: var(--color-error-bg); }
.knob-dialog-error { min-height: 48px; margin-top: var(--space-3); padding: 10px 12px; border-radius: var(--radius-sm); color: var(--color-error); background: var(--color-error-bg); }
.knob-dialog > footer { justify-content: flex-end; margin-top: var(--space-5); }
.panel-knob-list button { width: 100%; min-height: 60px; display: grid; grid-template-columns: minmax(0, 1fr) auto 20px; align-items: center; gap: var(--space-3); padding: 8px 0; border: 0; border-bottom: 1px solid var(--color-neutral-100); color: inherit; background: transparent; text-align: left; }
.panel-knob-list button:last-child { border-bottom: 0; }
.panel-knob-list button > span:first-child { display: grid; min-width: 0; }
@media (max-width: 700px) { .knob-action-list article { grid-template-columns: 56px minmax(0, 1fr); } .knob-action-buttons { grid-column: 1 / -1; grid-template-columns: 1fr; min-width: 0; } .knob-action-list dl { grid-template-columns: 1fr; } .knob-dialog-backdrop { align-items: end; padding: 0; } .knob-dialog { width: 100%; max-height: 92dvh; border-bottom-left-radius: 0; border-bottom-right-radius: 0; } .knob-dialog > footer { display: grid; grid-template-columns: 1fr; } }
@media (max-width: 420px) { .knob-summary { grid-template-columns: 1fr; } .knob-detail > header { grid-template-columns: 1fr; } .knob-detail > header .panel-status { justify-self: start; } }
@media (prefers-reduced-motion: reduce) { .knob-dialog, .panel-knob-list button { transition: none; } }
`;
}
