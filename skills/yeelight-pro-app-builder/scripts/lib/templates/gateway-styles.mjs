export function gatewayStylesSource() {
  return `/* GATEWAY COMPONENT TOKENS */
:root { --gateway-icon-bg: var(--color-neutral-100); --gateway-online-bg: color-mix(in srgb, var(--color-accent) 12%, var(--color-surface)); --gateway-attention-bg: var(--color-warning-bg); --gateway-scrim: rgb(8 20 24 / 0.52); }
.gateway-module, .gateway-detail { padding-top: var(--space-2); }
.gateway-heading { align-items: end; }
.gateway-heading p, .gateway-settings > p { max-width: 64ch; color: var(--color-muted); }
.gateway-count { color: var(--color-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.gateway-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); margin-top: var(--space-4); }
.gateway-summary > span { min-height: 72px; display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 0 var(--space-2); padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.gateway-summary svg { color: var(--color-primary); }
.gateway-summary strong { font-size: 20px; font-variant-numeric: tabular-nums; }
.gateway-summary small { grid-column: 1 / -1; }
.gateway-summary .attention { background: var(--gateway-attention-bg); }
.gateway-loading { min-height: 44px; display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-4); color: var(--color-muted); }
.gateway-list { display: grid; margin-top: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; background: var(--color-surface); }
.gateway-row { min-width: 0; min-height: 76px; display: grid; grid-template-columns: 44px minmax(0, 1fr) auto 24px; align-items: center; gap: var(--space-3); padding: 12px var(--space-4); border: 0; border-bottom: 1px solid var(--color-neutral-100); color: inherit; background: var(--color-surface); text-align: left; }
.gateway-row:last-child { border-bottom: 0; }
.gateway-row:hover, .gateway-row:focus-visible { background: var(--color-background); }
.gateway-row.offline { background: var(--color-neutral-100); }
.gateway-icon { width: 44px; height: 44px; display: grid; place-items: center; border-radius: var(--radius-md); color: var(--color-primary); background: var(--gateway-icon-bg); box-shadow: inset 0 0 0 1px var(--color-neutral-200); }
.gateway-row-copy { min-width: 0; display: grid; gap: 2px; }
.gateway-row-copy strong, .gateway-row-copy small, .gateway-row-copy > span { overflow-wrap: anywhere; }
.gateway-row-copy small, .gateway-row-copy > span { color: var(--color-muted); }
.gateway-row-copy > span { font-size: 13px; }
.gateway-status { min-height: 44px; display: inline-flex; align-items: center; gap: var(--space-2); padding: 0 12px; border-radius: var(--radius-sm); color: var(--color-muted); background: var(--color-neutral-100); }
.gateway-status.online { color: var(--color-primary); background: var(--gateway-online-bg); }
.gateway-detail > header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--space-4); }
.gateway-detail > header > div { min-width: 0; }
.gateway-detail > header p { color: var(--color-muted); }
.gateway-detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); margin-top: var(--space-5); }
.gateway-section { min-width: 0; padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.gateway-section-title { display: flex; align-items: center; gap: var(--space-2); padding-bottom: var(--space-3); border-bottom: 1px solid var(--color-neutral-100); }
.gateway-section-title svg { color: var(--color-primary); }
.gateway-section-title h3 { margin: 0; font-size: 17px; }
.gateway-facts { display: grid; gap: 0; margin: var(--space-3) 0 0; }
.gateway-facts div { min-width: 0; min-height: 44px; display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); border-bottom: 1px solid var(--color-neutral-100); }
.gateway-facts div:last-child { border-bottom: 0; }
.gateway-facts dt { color: var(--color-muted); }
.gateway-facts dd { min-width: 0; margin: 0; text-align: right; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.protocol-list { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-4); }
.protocol-list span { min-height: 36px; display: inline-flex; align-items: center; gap: var(--space-2); padding: 0 10px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-primary); }
.relation-summary { min-height: 84px; display: flex; align-items: baseline; gap: var(--space-2); padding-top: var(--space-4); }
.relation-summary strong { color: var(--color-primary); font-size: 32px; font-variant-numeric: tabular-nums; }
.relation-summary span, .gateway-empty-copy { color: var(--color-muted); }
.diagnosis-summary { min-height: 64px; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--space-3); margin-top: var(--space-4); padding: 12px; border-radius: var(--radius-sm); background: var(--color-neutral-100); }
.diagnosis-summary.healthy { color: var(--color-primary); }
.diagnosis-summary.attention { color: var(--color-warning); background: var(--gateway-attention-bg); }
.diagnosis-summary > div { display: grid; gap: 2px; }
.diagnosis-summary span { color: var(--color-foreground); }
.diagnosis-list { display: grid; gap: 0; margin: var(--space-3) 0 0; padding: 0; list-style: none; }
.diagnosis-list li { min-height: 48px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 2px var(--space-3); border-bottom: 1px solid var(--color-neutral-100); }
.diagnosis-list small { grid-column: 1 / -1; color: var(--color-muted); }
.gateway-settings { grid-column: 1 / -1; }
.primary-action, .secondary-action, .danger-action { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 16px; border-radius: var(--button-radius); }
.primary-action { border: 1px solid var(--button-bg); color: var(--button-fg); background: var(--button-bg); }
.secondary-action { border: 1px solid var(--color-border); color: var(--color-primary); background: var(--color-surface); }
.danger-action { border: 1px solid var(--color-error); color: var(--color-surface); background: var(--color-error); }
.danger-action:disabled { opacity: 0.48; cursor: not-allowed; }
.gateway-settings > .primary-action { margin-top: var(--space-4); }
.gateway-terminal, .gateway-feedback { min-height: 52px; display: flex; align-items: center; gap: var(--space-3); margin-top: var(--space-4); padding: 10px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-neutral-100); }
.gateway-danger-zone { min-height: 76px; display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); margin-top: var(--space-5); padding-top: var(--space-4); border-top: 1px solid color-mix(in srgb, var(--color-error) 24%, var(--color-border)); }
.gateway-danger-zone > div { display: grid; gap: 3px; }
.gateway-danger-zone strong { color: var(--color-error); }
.gateway-danger-zone span { color: var(--color-muted); }
.gateway-feedback { color: var(--color-primary); background: var(--color-surface); }
.gateway-error { min-height: 52px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--space-2); margin-top: var(--space-3); padding: 8px 10px; border: 1px solid color-mix(in srgb, var(--color-error) 24%, transparent); border-radius: var(--radius-sm); color: var(--color-error); background: var(--color-error-bg); }
.gateway-error span { overflow-wrap: anywhere; }
.gateway-error button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 12px; border: 1px solid currentColor; border-radius: var(--button-radius); color: var(--color-error); background: var(--color-surface); }
.gateway-dialog-backdrop { position: fixed; z-index: 100; inset: 0; display: grid; place-items: center; padding: var(--space-4); background: var(--gateway-scrim); }
.gateway-dialog { width: min(100%, 560px); max-height: calc(100dvh - 32px); overflow: auto; padding: var(--space-5); border-radius: var(--radius-md); background: var(--color-surface); box-shadow: 0 20px 56px rgb(15 35 40 / 0.22); }
.gateway-dialog > header, .gateway-dialog > footer { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.gateway-dialog h3 { margin: 0; font-size: 18px; }
.gateway-dialog > label, .gateway-dialog fieldset { display: grid; gap: var(--space-2); margin-top: var(--space-4); font-weight: 700; }
.gateway-dialog input[type="text"], .gateway-dialog > label input { min-height: 44px; padding: 10px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-heading); background: var(--color-surface); }
.gateway-dialog fieldset { padding: 0; border: 0; }
.gateway-dialog-error { min-height: 48px; display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-3); padding: 10px 12px; border-radius: var(--radius-sm); color: var(--color-error); background: var(--color-error-bg); }
.gateway-delete-impact { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--space-3); margin-top: var(--space-4); padding: 12px; border: 1px solid color-mix(in srgb, var(--color-error) 28%, var(--color-border)); border-radius: var(--radius-sm); color: var(--color-error); background: var(--color-error-bg); }
.gateway-delete-impact > div { display: grid; gap: 3px; }
.gateway-delete-impact span { color: var(--color-foreground); font-weight: 400; }
.gateway-delete-confirmation strong { color: var(--color-heading); font-weight: 700; overflow-wrap: anywhere; }
.gateway-room-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
.gateway-room-options label { min-height: 48px; display: grid; grid-template-columns: 20px minmax(0, 1fr); align-items: center; gap: var(--space-2); padding: 8px 10px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-weight: 400; }
.gateway-room-options input { width: 20px; height: 20px; accent-color: var(--color-primary); }
.gateway-dialog > footer { justify-content: flex-end; margin-top: var(--space-5); }
@media (max-width: 700px) { .gateway-heading, .gateway-detail > header { align-items: stretch; grid-template-columns: 1fr; } .gateway-summary { grid-template-columns: 1fr; } .gateway-row { grid-template-columns: 44px minmax(0, 1fr) 20px; } .gateway-row .gateway-status { grid-column: 2; justify-self: start; } .gateway-row > svg { grid-column: 3; grid-row: 1 / 3; } .gateway-detail-grid { grid-template-columns: 1fr; } .gateway-settings { grid-column: auto; } .gateway-danger-zone { align-items: stretch; flex-direction: column; } .gateway-danger-zone .danger-action { width: 100%; } .gateway-dialog-backdrop { align-items: end; padding: 0; } .gateway-dialog { width: 100%; max-height: 92dvh; border-bottom-left-radius: 0; border-bottom-right-radius: 0; } .gateway-room-options { grid-template-columns: 1fr; } .gateway-dialog > footer { display: grid; grid-template-columns: 1fr; } .gateway-error { grid-template-columns: auto minmax(0, 1fr); } .gateway-error button { grid-column: 1 / -1; width: 100%; } }
@media (prefers-reduced-motion: reduce) { .gateway-row, .gateway-dialog { transition: none; } }
`;
}
