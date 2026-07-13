export function automationStylesSource() {
  return `
/* AUTOMATION DIRECTORY */
:root { --automation-icon-bg: var(--color-neutral-100); --automation-switch-off: var(--color-neutral-200); --automation-switch-on: var(--color-primary); }
.automation-module { padding-top: var(--space-2); }
.automation-directory { min-height: min(700px, calc(100dvh - 150px)); display: grid; grid-template-columns: minmax(300px, 0.84fr) minmax(390px, 1.16fr); border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; background: var(--color-surface); box-shadow: var(--shadow-card); }
.automation-directory.no-detail { display: block; min-height: 0; }
.app-shell:has(.automation-directory) { width: min(100%, 1120px); }
.automation-master { min-width: 0; padding: var(--space-5); border-right: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-background) 74%, var(--color-surface)); }
.automation-directory.no-detail .automation-master { border-right: 0; }
.automation-heading { align-items: end; }
.automation-heading p { max-width: 54ch; color: var(--color-muted); }
.automation-count { color: var(--color-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.automation-filters { display: grid; grid-template-columns: minmax(0, 1fr) minmax(126px, 0.42fr); gap: var(--space-3); margin-top: var(--space-4); }
.automation-filters label { min-width: 0; display: grid; gap: 5px; color: var(--color-muted); font-size: 12px; }
.automation-filters .search-input { width: 100%; background: var(--color-surface); }
.automation-filters select { width: 100%; min-height: 44px; padding: 0 34px 0 12px; border: 1px solid var(--input-border); border-radius: var(--radius-md); color: var(--color-foreground); background: var(--input-bg); }
.automation-boundary { min-height: 44px; display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-3); padding: 8px 10px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-muted); background: var(--color-surface); }
.automation-list { display: grid; margin-top: var(--space-4); }
.automation-row { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 0 var(--space-3); border-bottom: 1px solid var(--color-border); }
.automation-row:first-child { border-top: 1px solid var(--color-border); }
.automation-row.selected { background: color-mix(in srgb, var(--color-primary) 7%, var(--color-surface)); }
.automation-open-button { width: 100%; min-height: 72px; display: grid; grid-template-columns: 44px minmax(0, 1fr) 20px; align-items: center; gap: var(--space-3); padding: 10px var(--space-2); border: 0; border-radius: 0; color: var(--color-heading); text-align: left; background: transparent; }
.automation-open-button:not(:disabled):hover { background: var(--color-surface); }
.automation-open-button:disabled { cursor: default; }
.automation-icon { width: 44px; height: 44px; display: grid; place-items: center; border-radius: var(--radius-md); color: var(--color-muted); background: var(--automation-icon-bg); box-shadow: inset 0 0 0 1px var(--color-neutral-200); }
.automation-icon.enabled { color: var(--color-primary); }
.automation-copy { display: grid; min-width: 0; gap: 2px; }
.automation-copy strong, .automation-copy small { overflow-wrap: anywhere; }
.automation-switch { position: relative; width: 52px; height: 44px; padding: 0; border: 0; border-radius: 8px; color: var(--color-muted); background: var(--automation-switch-off); }
.automation-switch > span { position: absolute; top: 9px; left: 5px; width: 26px; height: 26px; border-radius: 7px; background: var(--color-white); box-shadow: var(--shadow-card); transition: transform 180ms ease; }
.automation-switch.on { background: var(--automation-switch-on); }
.automation-switch.on > span { transform: translateX(16px); }
.automation-switch:disabled { cursor: wait; opacity: 0.56; }
.automation-unavailable { min-height: 44px; display: inline-flex; align-items: center; gap: var(--space-2); color: var(--color-muted); }
.automation-feedback { grid-column: 1 / -1; min-height: 24px; display: flex; align-items: center; gap: var(--space-2); padding: 0 var(--space-2) 4px 56px; color: var(--color-muted); font-size: 14px; }
.automation-feedback:empty { display: none; }
.automation-feedback.success { color: var(--color-primary); }
.automation-feedback.error { color: var(--color-error); }
.automation-detail-pane { min-width: 0; background: var(--color-surface); }
.automation-detail-empty { min-height: 100%; display: grid; place-content: center; justify-items: center; gap: var(--space-2); padding: var(--space-7); color: var(--color-muted); text-align: center; }
.automation-detail-empty strong { color: var(--color-heading); }
.automation-detail { min-height: 100%; display: flex; flex-direction: column; padding: var(--space-6); }
.automation-detail > header { display: grid; gap: var(--space-4); padding-bottom: var(--space-5); border-bottom: 1px solid var(--color-border); }
.automation-detail > header > div { display: grid; gap: 4px; }
.automation-detail > header p { max-width: 58ch; color: var(--color-muted); }
.automation-back-button { width: fit-content; min-height: 44px; display: inline-flex; align-items: center; gap: var(--space-2); padding: 0 12px; border: 1px solid var(--color-border); border-radius: var(--button-radius); color: var(--color-primary); background: var(--color-surface); }
.automation-schedule-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); padding: var(--space-5) 0; border-bottom: 1px solid var(--color-border); }
.automation-schedule-grid > span { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 2px var(--space-2); }
.automation-schedule-grid svg { grid-row: 1 / 3; color: var(--color-primary); }
.automation-schedule-grid strong { overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.automation-rule-section { padding-top: var(--space-5); }
.automation-subheading { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); }
.automation-subheading > span { width: 36px; height: 36px; display: grid; place-items: center; border-radius: var(--radius-sm); color: var(--color-primary); background: var(--automation-icon-bg); }
.automation-subheading > div { display: grid; gap: 1px; }
.automation-subheading h3 { margin: 0; font-size: 17px; }
.automation-subheading b { color: var(--color-muted); font-size: 13px; font-weight: 500; white-space: nowrap; }
.automation-rule-list { display: grid; margin-top: var(--space-3); border-top: 1px solid var(--color-border); }
.automation-rule-row { min-width: 0; display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: var(--space-3); padding: 14px 0; border-bottom: 1px solid var(--color-border); }
.automation-rule-row > span { width: 32px; height: 32px; display: grid; place-items: center; border-radius: var(--radius-sm); color: var(--color-primary); background: var(--automation-icon-bg); font-size: 13px; font-variant-numeric: tabular-nums; }
.automation-rule-row > div { min-width: 0; display: grid; gap: 2px; }
.automation-rule-row strong, .automation-rule-row small, .automation-rule-row p { overflow-wrap: anywhere; }
.automation-rule-row p { margin-top: 4px; color: var(--color-foreground); }
.automation-detail-loading { min-height: 160px; display: flex; align-items: center; justify-content: center; gap: var(--space-2); color: var(--color-muted); }
.automation-detail-error { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); margin-top: var(--space-5); padding: var(--space-3); border: 1px solid color-mix(in srgb, var(--color-error) 24%, transparent); border-radius: var(--radius-md); color: var(--color-error); background: var(--color-error-bg); }
.automation-detail-error > div { min-width: 0; display: grid; gap: 2px; }
.automation-detail-error span { color: var(--color-foreground); overflow-wrap: anywhere; }
.automation-detail-error button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 12px; border: 1px solid currentColor; border-radius: var(--button-radius); color: var(--color-error); background: var(--color-surface); }
.automation-registry-state, .automation-registry-warning { margin-top: var(--space-4); color: var(--color-muted); font-size: 14px; }
.automation-detail-actions { display: grid; gap: var(--space-2); margin-top: auto; padding-top: var(--space-6); }
.automation-status-button { min-height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 var(--space-4); border: 1px solid var(--color-primary); border-radius: var(--button-radius); color: var(--color-white); background: var(--color-primary); }
.automation-status-button.stop { border-color: var(--color-border); color: var(--color-heading); background: var(--color-surface); }
.automation-status-button:disabled { cursor: wait; opacity: 0.56; }
.automation-detail-readonly { min-height: 48px; display: inline-flex; align-items: center; gap: var(--space-2); color: var(--color-muted); }
.automation-feedback.detail { padding: 0; }
.automation-heading-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-3); flex-wrap: wrap; }
.automation-create-button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 14px; border: 1px solid var(--color-primary); border-radius: var(--button-radius); color: var(--color-white); background: var(--color-primary); }
.automation-editor { min-height: min(720px, calc(100dvh - 150px)); display: grid; grid-template-rows: auto auto 1fr auto auto; border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; background: var(--color-surface); box-shadow: var(--shadow-card); }
.app-shell:has(.automation-editor) { width: min(100%, 980px); }
.automation-editor-header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--space-4); padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--color-border); }
.automation-editor-header > div { min-width: 0; }
.automation-editor-header h2 { overflow-wrap: anywhere; }
.automation-stepper { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border-bottom: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-background) 74%, var(--color-surface)); }
.automation-stepper button { min-height: 64px; display: flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 8px; border: 0; border-right: 1px solid var(--color-border); border-radius: 0; color: var(--color-muted); background: transparent; }
.automation-stepper button:last-child { border-right: 0; }
.automation-stepper button > span { width: 28px; height: 28px; display: grid; place-items: center; border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-variant-numeric: tabular-nums; }
.automation-stepper button[aria-current="step"] { color: var(--color-heading); background: var(--color-surface); }
.automation-stepper button[aria-current="step"] > span { border-color: var(--color-primary); color: var(--color-white); background: var(--color-primary); }
.automation-step-summary { display: none; }
.automation-editor-body { min-width: 0; padding: var(--space-6); }
.automation-editor-section { display: grid; gap: var(--space-4); max-width: 760px; margin: 0 auto; }
.automation-editor-section > div:first-child { display: grid; gap: 3px; padding-bottom: var(--space-3); border-bottom: 1px solid var(--color-border); }
.automation-editor-section h3 { margin: 0; font-size: 20px; }
.automation-editor-section p { color: var(--color-muted); }
.automation-editor-section label { min-width: 0; display: grid; gap: 6px; color: var(--color-muted); font-size: 13px; }
.automation-editor-section input, .automation-editor-section select { width: 100%; min-height: 44px; padding: 0 12px; border: 1px solid var(--input-border); border-radius: var(--radius-md); color: var(--color-foreground); background: var(--input-bg); }
.automation-field-grid, .automation-condition-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
.automation-condition-edit-list { display: grid; border-top: 1px solid var(--color-border); }
.automation-condition-edit, .automation-action-edit { min-width: 0; display: grid; grid-template-columns: 32px repeat(3, minmax(0, 1fr)) 44px; align-items: end; gap: var(--space-3); padding: var(--space-3) 0; border-bottom: 1px solid var(--color-border); }
.automation-condition-edit > span, .automation-action-edit > span { width: 32px; height: 32px; align-self: center; display: grid; place-items: center; border-radius: var(--radius-sm); color: var(--color-primary); background: var(--automation-icon-bg); font-size: 13px; }
.automation-condition-edit .automation-condition-fields { grid-column: 2 / 5; }
.automation-review section { display: grid; gap: 3px; padding: var(--space-4) 0; border-bottom: 1px solid var(--color-border); }
.automation-review section > span { overflow-wrap: anywhere; }
.automation-editor-feedback { display: flex; align-items: center; gap: var(--space-2); padding: 10px var(--space-5); border-top: 1px solid var(--color-border); color: var(--color-error); background: var(--color-error-bg); }
.automation-editor-footer { position: sticky; bottom: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-5); border-top: 1px solid var(--color-border); background: var(--color-surface); }
.automation-editor-footer button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); }
.automation-danger-zone { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); margin-top: var(--space-6); padding-top: var(--space-5); border-top: 1px solid color-mix(in srgb, var(--color-error) 28%, var(--color-border)); }
.automation-danger-zone h3 { margin: 0; font-size: 17px; }
.automation-danger-zone p { color: var(--color-muted); }
.automation-guard-backdrop, .automation-delete-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: var(--space-4); background: rgb(15 23 42 / 42%); }
.automation-guard-dialog, .automation-delete-dialog { width: min(100%, 480px); max-height: calc(100dvh - 32px); overflow: auto; padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-foreground); background: var(--color-surface); box-shadow: var(--shadow-overlay); }
.automation-guard-dialog header, .automation-delete-dialog header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
.automation-guard-dialog h3, .automation-delete-dialog h3 { margin: 0; }
.automation-guard-dialog p, .automation-delete-dialog p { margin-top: var(--space-3); color: var(--color-muted); }
.automation-guard-dialog footer, .automation-delete-dialog footer { display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-5); }
@media (max-width: 900px) and (min-width: 721px) { .automation-directory { grid-template-columns: minmax(270px, 0.8fr) minmax(350px, 1.2fr); } .automation-master, .automation-detail { padding: var(--space-4); } .automation-filters { grid-template-columns: 1fr; } .automation-schedule-grid { grid-template-columns: 1fr; } }
@media (max-width: 720px) { .automation-directory { min-height: 0; display: block; border: 0; overflow: visible; box-shadow: none; background: transparent; } .automation-master, .automation-detail { padding: 0; border: 0; background: transparent; } .automation-directory[data-automation-view="list"] .automation-detail-pane, .automation-directory[data-automation-view="detail"] .automation-master { display: none; } .automation-detail-pane { background: transparent; } .automation-detail-empty { display: none; } .automation-filters { grid-template-columns: minmax(0, 1fr) minmax(112px, 0.42fr); } .automation-open-button { padding-inline: 0; } .automation-detail > header { padding-bottom: var(--space-4); } .automation-editor { height: calc(100dvh - 230px); min-height: 520px; border: 0; overflow: hidden; box-shadow: none; background: transparent; } .automation-editor-header { padding: 0 0 var(--space-4); } .automation-stepper { display: none; } .automation-step-summary { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: 10px 0; border-block: 1px solid var(--color-border); } .automation-editor-body { min-height: 0; overflow: auto; padding: var(--space-5) 0; } .automation-field-grid, .automation-condition-fields { grid-template-columns: 1fr; } .automation-condition-edit, .automation-action-edit { grid-template-columns: 32px minmax(0, 1fr) 44px; align-items: start; } .automation-condition-edit .automation-condition-fields, .automation-action-edit label { grid-column: 2 / 3; } .automation-condition-edit .icon-button, .automation-action-edit .icon-button { grid-column: 3; grid-row: 1; } .automation-editor-footer { margin-inline: calc(var(--shell-gutter) * -1); padding-inline: var(--shell-gutter); } }
@media (max-width: 520px) { .automation-heading { align-items: stretch; } .automation-heading-actions { justify-content: space-between; } .automation-create-button { width: 100%; } .automation-filters, .automation-schedule-grid { grid-template-columns: 1fr; } .automation-detail-error { grid-template-columns: auto minmax(0, 1fr); } .automation-detail-error button { grid-column: 1 / -1; width: 100%; } .automation-status-button, .automation-detail-actions .secondary-button { width: 100%; } .automation-editor-header { grid-template-columns: 1fr auto; } .automation-editor-header > button { grid-column: 1 / -1; } .automation-editor-footer button { flex: 1; } .automation-danger-zone { align-items: stretch; flex-direction: column; } .automation-guard-dialog footer { flex-direction: column; } .automation-delete-dialog footer { flex-direction: column-reverse; } }
`;
}
