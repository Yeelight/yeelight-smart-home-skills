export function sceneStylesSource() {
  return `
/* SCENE DIRECTORY */
:root { --scene-icon-bg: var(--color-neutral-100); --scene-action-bg: var(--color-primary); --scene-action-fg: var(--color-white); }
.scene-module { padding-top: var(--space-2); }
.scene-heading { align-items: end; }
.scene-heading p { max-width: 54ch; color: var(--color-muted); }
.scene-count { color: var(--color-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.scene-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: var(--space-3); margin-top: var(--space-4); }
.scene-card { min-width: 0; display: grid; gap: var(--space-4); padding: var(--space-4); border: 1px solid var(--card-border); border-radius: var(--card-radius); background: var(--card-bg); box-shadow: var(--shadow-card); }
.scene-card-heading { display: grid; grid-template-columns: 44px minmax(0, 1fr); align-items: center; gap: var(--space-3); }
.scene-card-heading > div { display: grid; min-width: 0; gap: 2px; }
.scene-card-heading strong { overflow-wrap: anywhere; }
.scene-icon { width: 44px; height: 44px; display: grid; flex: 0 0 auto; place-items: center; border-radius: var(--radius-md); color: var(--color-primary); background: var(--scene-icon-bg); box-shadow: inset 0 0 0 1px var(--color-neutral-200); }
.scene-run-button { min-height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 var(--space-4); border: 0; border-radius: var(--button-radius); color: var(--scene-action-fg); background: var(--scene-action-bg); }
.scene-run-button:not(:disabled):active { transform: scale(0.97); }
.scene-run-button:disabled { cursor: wait; opacity: 0.56; }
.scene-unavailable { min-height: 48px; display: flex; align-items: center; gap: var(--space-2); padding: 0 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-muted); background: var(--color-neutral-100); }
.scene-feedback { min-height: 24px; display: flex; align-items: center; gap: var(--space-2); color: var(--color-muted); font-size: 14px; }
.scene-feedback.success { color: var(--color-primary); }
.scene-feedback.error { color: var(--color-error); }
.scene-directory { min-height: min(700px, calc(100dvh - 150px)); display: grid; grid-template-columns: minmax(280px, 0.82fr) minmax(360px, 1.18fr); border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; background: var(--color-surface); box-shadow: var(--shadow-card); }
.app-shell:has(.scene-directory) { width: min(100%, 1100px); }
.app-shell:has(.scene-editor) { width: min(100%, 1180px); }
.scene-master { min-width: 0; padding: var(--space-5); border-right: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-background) 74%, var(--color-surface)); }
.scene-filters { display: grid; grid-template-columns: minmax(0, 1fr) minmax(132px, 0.46fr); gap: var(--space-3); margin-top: var(--space-4); }
.scene-filters label { min-width: 0; display: grid; gap: 5px; color: var(--color-muted); font-size: 12px; }
.scene-filters .search-input { width: 100%; background: var(--color-surface); }
.scene-filters select { width: 100%; min-height: 44px; padding: 0 34px 0 12px; border: 1px solid var(--input-border); border-radius: var(--radius-md); color: var(--color-foreground); background: var(--input-bg); }
.scene-filters select:focus-visible { border-color: var(--color-primary); outline: 3px solid var(--focus-ring); outline-offset: 1px; }
.scene-list { display: grid; margin-top: var(--space-4); }
.scene-list-row { min-width: 0; border-bottom: 1px solid var(--color-border); }
.scene-list-row:first-child { border-top: 1px solid var(--color-border); }
.scene-open-button { width: 100%; min-height: 72px; display: grid; grid-template-columns: 44px minmax(0, 1fr) 20px; align-items: center; gap: var(--space-3); padding: 10px var(--space-2); border: 0; border-radius: 0; color: var(--color-heading); text-align: left; background: transparent; }
.scene-open-button:hover { background: var(--color-surface); }
.scene-list-row.selected .scene-open-button { color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface)); }
.scene-open-button > span:nth-child(2) { min-width: 0; display: grid; gap: 2px; }
.scene-open-button strong { overflow-wrap: anywhere; }
.scene-open-button small { display: flex; align-items: center; gap: 4px; overflow-wrap: anywhere; }
.scene-open-button > svg { color: var(--color-muted); }
.scene-detail-pane { min-width: 0; background: var(--color-surface); }
.scene-detail-empty { min-height: 100%; display: grid; place-content: center; justify-items: center; gap: var(--space-2); padding: var(--space-7); color: var(--color-muted); text-align: center; }
.scene-detail-empty strong { color: var(--color-heading); }
.scene-detail { min-height: 100%; display: flex; flex-direction: column; padding: var(--space-6); }
.scene-detail > header { display: grid; gap: var(--space-4); padding-bottom: var(--space-5); border-bottom: 1px solid var(--color-border); }
.scene-detail > header > div { display: grid; gap: 4px; }
.scene-detail > header p { max-width: 58ch; color: var(--color-muted); }
.scene-back-button { width: fit-content; min-height: 44px; display: inline-flex; align-items: center; gap: var(--space-2); padding: 0 12px; border: 1px solid var(--color-border); border-radius: var(--button-radius); color: var(--color-primary); background: var(--color-surface); }
.scene-detail-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); padding: var(--space-5) 0; border-bottom: 1px solid var(--color-border); }
.scene-detail-meta > span { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 2px var(--space-2); }
.scene-detail-meta svg { grid-row: 1 / 3; color: var(--color-primary); }
.scene-detail-meta strong { overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.scene-action-section { padding-top: var(--space-5); }
.scene-subheading { display: flex; align-items: end; justify-content: space-between; gap: var(--space-3); }
.scene-subheading h3 { margin: 0; font-size: 17px; }
.scene-subheading > span { color: var(--color-muted); font-size: 14px; font-variant-numeric: tabular-nums; }
.scene-action-list { display: grid; margin-top: var(--space-3); }
.scene-action-row { min-width: 0; display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: var(--space-3); padding: 14px 0; border-bottom: 1px solid var(--color-neutral-100); }
.scene-action-index { width: 32px; height: 32px; display: grid; place-items: center; border-radius: var(--radius-sm); color: var(--color-primary); background: var(--scene-icon-bg); font-size: 13px; font-variant-numeric: tabular-nums; }
.scene-action-row > div { min-width: 0; display: grid; gap: 2px; }
.scene-action-row strong, .scene-action-row small { overflow-wrap: anywhere; }
.scene-action-row small { color: var(--color-foreground); }
.scene-action-values { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }
.scene-action-values span { min-height: 28px; display: inline-flex; align-items: center; padding: 2px 8px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-muted); background: var(--color-background); font-size: 13px; }
.scene-detail-loading { min-height: 160px; display: flex; align-items: center; justify-content: center; gap: var(--space-2); color: var(--color-muted); }
.scene-detail-error { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); margin-top: var(--space-5); padding: var(--space-3); border: 1px solid color-mix(in srgb, var(--color-error) 24%, transparent); border-radius: var(--radius-md); color: var(--color-error); background: var(--color-error-bg); }
.scene-detail-error > div { min-width: 0; display: grid; gap: 2px; }
.scene-detail-error span { color: var(--color-foreground); overflow-wrap: anywhere; }
.scene-detail-error button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 12px; border: 1px solid currentColor; border-radius: var(--button-radius); color: var(--color-error); background: var(--color-surface); }
.scene-detail-actions { display: grid; gap: var(--space-2); margin-top: auto; padding-top: var(--space-6); }
.scene-heading-actions, .scene-detail-command-row, .scene-editor-footer > div:last-child { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); }
.scene-create-button, .primary-button, .secondary-button, .danger-button, .ghost-button, .add-action-button, .danger-link { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 14px; border-radius: var(--button-radius); font-weight: 650; }
.scene-create-button, .primary-button { border: 1px solid var(--color-primary); color: var(--color-white); background: var(--color-primary); }
.secondary-button, .add-action-button { border: 1px solid var(--color-border); color: var(--color-heading); background: var(--color-surface); }
.ghost-button { border: 1px solid transparent; color: var(--color-muted); background: transparent; }
.danger-button { border: 1px solid var(--color-error); color: var(--color-white); background: var(--color-error); }
.danger-link { border: 1px solid color-mix(in srgb, var(--color-error) 32%, var(--color-border)); color: var(--color-error); background: var(--color-surface); }
.scene-operation-boundary { min-height: 44px; display: inline-flex; align-items: center; gap: var(--space-2); color: var(--color-muted); font-size: 13px; }
.scene-feedback.visible { min-height: 44px; padding: 8px 10px; border-radius: var(--radius-sm); background: var(--color-neutral-100); }
.scene-danger-zone { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); margin-top: var(--space-6); padding-top: var(--space-5); border-top: 1px solid color-mix(in srgb, var(--color-error) 28%, var(--color-border)); }
.scene-danger-zone > div { display: grid; gap: 2px; }
.scene-danger-zone h3 { margin: 0; font-size: 16px; }
.scene-danger-zone p { max-width: 52ch; color: var(--color-muted); font-size: 14px; }
.scene-editor { min-height: min(760px, calc(100dvh - 150px)); display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; background: var(--color-surface); box-shadow: var(--shadow-card); }
.scene-editor-header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--space-4); padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--color-border); }
.scene-editor-header > div { min-width: 0; display: grid; gap: 2px; }
.scene-editor-header h2 { margin: 0; overflow-wrap: anywhere; font-size: 20px; }
.scene-editor-progress { color: var(--color-muted); font-variant-numeric: tabular-nums; }
.scene-step-summary { display: none; }
.scene-stepper { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-bottom: 1px solid var(--color-border); background: var(--color-background); }
.scene-stepper button { min-height: 56px; display: flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 8px; border: 0; border-right: 1px solid var(--color-border); border-radius: 0; color: var(--color-muted); background: transparent; }
.scene-stepper button:last-child { border-right: 0; }
.scene-stepper button > span { width: 26px; height: 26px; display: grid; place-items: center; border: 1px solid var(--color-border); border-radius: 50%; font-size: 12px; }
.scene-stepper button[aria-current="step"] { color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 7%, var(--color-surface)); }
.scene-stepper button[aria-current="step"] > span { border-color: var(--color-primary); color: var(--color-white); background: var(--color-primary); }
.scene-editor-body { min-height: 0; overflow: auto; padding: var(--space-6); }
.scene-editor-section { max-width: 760px; display: grid; gap: var(--space-5); margin: 0 auto; }
.scene-editor-section-heading { display: grid; gap: 4px; }
.scene-editor-section-heading h3 { margin: 0; font-size: 20px; }
.scene-editor-section-heading p { color: var(--color-muted); }
.scene-form-grid { display: grid; gap: var(--space-4); }
.scene-form-grid label, .scene-action-editor-fields label { min-width: 0; display: grid; gap: 6px; color: var(--color-muted); font-size: 13px; }
.scene-form-grid input, .scene-form-grid textarea, .scene-form-grid select, .scene-action-editor-fields input, .scene-action-editor-fields select { width: 100%; min-height: 44px; padding: 9px 12px; border: 1px solid var(--input-border); border-radius: var(--radius-md); color: var(--color-foreground); background: var(--input-bg); font: inherit; }
.scene-form-grid textarea { resize: vertical; line-height: 1.6; }
.scene-form-grid [aria-invalid="true"] { border-color: var(--color-error); }
.scene-form-grid label > small { color: var(--color-error); }
.scene-action-editor-list { display: grid; border-top: 1px solid var(--color-border); }
.scene-action-editor-row { min-width: 0; display: grid; grid-template-columns: 32px minmax(0, 1fr) 44px; align-items: start; gap: var(--space-3); padding: var(--space-4) 0; border-bottom: 1px solid var(--color-border); }
.scene-action-editor-row.readonly { grid-template-columns: 32px minmax(0, 1fr); }
.scene-action-editor-row.readonly > div { display: grid; gap: 3px; }
.scene-action-editor-row.readonly small { color: var(--color-muted); }
.scene-action-editor-fields { display: grid; grid-template-columns: minmax(180px, 1.4fr) minmax(130px, 0.8fr) minmax(130px, 0.8fr); gap: var(--space-3); }
.select-wrap { position: relative; }
.select-wrap select { padding-right: 36px; appearance: none; }
.select-wrap svg { position: absolute; top: 50%; right: 12px; transform: translateY(-50%); pointer-events: none; }
.danger-icon { color: var(--color-error); }
.field-error { padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--color-error) 30%, transparent); border-radius: var(--radius-sm); color: var(--color-error); background: var(--color-error-bg); }
.field-help { color: var(--color-muted); font-size: 14px; }
.scene-review-list { display: grid; margin: 0; border-top: 1px solid var(--color-border); }
.scene-review-list > div { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: var(--space-3); padding: 14px 0; border-bottom: 1px solid var(--color-border); }
.scene-review-list dt { color: var(--color-muted); }
.scene-review-list dd { margin: 0; overflow-wrap: anywhere; }
.scene-editor-footer { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding: var(--space-3) var(--space-5); border-top: 1px solid var(--color-border); background: var(--color-surface); }
.scene-editor-feedback { min-width: 0; display: flex; align-items: center; gap: var(--space-2); color: var(--color-error); }
.scene-editor-feedback:empty { display: none; }
.scene-guard-backdrop, .scene-delete-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: var(--space-4); background: rgb(15 23 42 / 52%); }
.scene-guard-dialog, .scene-delete-dialog { width: min(100%, 480px); display: grid; gap: var(--space-4); padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-foreground); background: var(--color-surface); box-shadow: var(--shadow-overlay); }
.scene-guard-dialog > div:last-child, .scene-delete-dialog footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: var(--space-2); }
.scene-guard-dialog h3, .scene-delete-dialog h3 { margin: 0; }
.scene-guard-dialog p, .scene-delete-dialog p { color: var(--color-muted); }
.scene-delete-dialog header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: var(--space-3); }
.scene-delete-dialog header > div { display: grid; gap: 2px; }
@media (max-width: 900px) and (min-width: 721px) { .scene-directory { grid-template-columns: minmax(250px, 0.76fr) minmax(330px, 1.24fr); } .scene-master, .scene-detail { padding: var(--space-4); } .scene-filters { grid-template-columns: 1fr; } }
@media (min-width: 1024px) {
  .scene-editor { min-height: min(720px, calc(100dvh - 150px)); grid-template-columns: 224px minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr) auto; }
  .scene-editor-header { grid-column: 1 / -1; padding: var(--space-4) var(--space-6); }
  .scene-stepper { grid-column: 1; grid-row: 2 / 4; display: flex; flex-direction: column; align-items: stretch; padding: var(--space-5) var(--space-3); border-right: 1px solid var(--color-border); border-bottom: 0; background: color-mix(in srgb, var(--color-background) 70%, var(--color-surface)); }
  .scene-stepper button { position: relative; min-height: 56px; justify-content: flex-start; padding: 8px 12px; border-right: 0; border-radius: var(--radius-sm); }
  .scene-stepper button:not(:last-child)::after { position: absolute; top: 42px; left: 25px; width: 1px; height: 28px; content: ""; background: var(--color-border); }
  .scene-stepper button[aria-current="step"] { background: var(--color-surface); box-shadow: inset 0 0 0 1px var(--color-border); }
  .scene-editor-body { grid-column: 2; grid-row: 2; padding: var(--space-7) clamp(var(--space-6), 5vw, 72px); }
  .scene-editor-section { max-width: 720px; margin: 0; }
  .scene-editor-footer { grid-column: 2; grid-row: 3; padding-inline: clamp(var(--space-6), 5vw, 72px); }
}
@media (max-width: 720px) { .scene-directory { min-height: 0; display: block; border: 0; overflow: visible; box-shadow: none; background: transparent; } .scene-master, .scene-detail { padding: 0; border: 0; background: transparent; } .scene-directory[data-scene-view="list"] .scene-detail-pane, .scene-directory[data-scene-view="detail"] .scene-master { display: none; } .scene-detail-pane { background: transparent; } .scene-detail > header { padding-bottom: var(--space-4); } .scene-filters { grid-template-columns: minmax(0, 1fr) minmax(112px, 0.44fr); } .scene-open-button { padding-inline: 0; } .scene-detail-empty { display: none; } .scene-editor { height: calc(100dvh - 230px); min-height: 520px; border: 0; border-radius: 0; box-shadow: none; } .scene-editor-header, .scene-editor-footer { padding-inline: var(--space-3); } .scene-editor-body { padding: var(--space-4) var(--space-3); } .scene-stepper button { min-height: 52px; } .scene-stepper strong { font-size: 12px; } .scene-action-editor-fields { grid-template-columns: 1fr; } .scene-editor-footer { align-items: stretch; flex-direction: column; } .scene-editor-footer > div:last-child { display: grid; grid-template-columns: 1fr 1fr; } }
@media (max-width: 520px) { .scene-card { padding: var(--space-4); } .scene-filters, .scene-detail-meta { grid-template-columns: 1fr; } .scene-detail-error { grid-template-columns: auto minmax(0, 1fr); } .scene-detail-error button { grid-column: 1 / -1; width: 100%; } .scene-detail-command-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr)); } .scene-detail-command-row .scene-run-button, .scene-detail-command-row .scene-unavailable { grid-column: 1 / -1; width: 100%; } .scene-detail-command-row > button:not(.scene-run-button) { width: 100%; } .scene-heading { align-items: stretch; } .scene-heading-actions { justify-content: space-between; } .scene-danger-zone { align-items: stretch; flex-direction: column; } .scene-danger-zone button { width: 100%; } .scene-editor-header { grid-template-columns: auto minmax(0, 1fr); gap: var(--space-3); } .scene-editor-progress { display: none; } .scene-stepper { position: relative; gap: 0; padding: 10px 28px; border-bottom: 0; background: transparent; } .scene-stepper::before { position: absolute; top: 50%; right: 44px; left: 44px; height: 1px; content: ""; background: var(--color-border); } .scene-stepper button { position: relative; min-height: 36px; padding: 0; border-right: 0; background: transparent; } .scene-stepper button[aria-current="step"] { background: transparent; } .scene-stepper button > span { width: 28px; height: 28px; background: var(--color-surface); } .scene-stepper strong { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; } .scene-step-summary { display: flex; align-items: baseline; gap: var(--space-3); padding: 0 var(--space-3) var(--space-3); border-bottom: 1px solid var(--color-border); } .scene-step-summary span { color: var(--color-muted); font-size: 13px; } .scene-step-summary strong, .scene-editor-section-heading > small { display: none; } .scene-action-editor-row { grid-template-columns: 28px minmax(0, 1fr) 44px; gap: var(--space-2); } .scene-review-list > div { grid-template-columns: 1fr; gap: 4px; } .scene-guard-dialog > div:last-child, .scene-delete-dialog footer { display: grid; grid-template-columns: 1fr; } }
`;
}
