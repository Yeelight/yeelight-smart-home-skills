export function responsiveStylesSource(selected) {
  const rules = [
    ".app-shell { padding-inline: 14px; }",
    ".section-heading { align-items: stretch; flex-direction: column; }",
    ".search-input { width: 100%; }",
    ".summary-band { align-items: flex-start; flex-direction: column; }",
    ".summary-metrics { width: 100%; justify-content: space-between; }",
    ".filter-bar { grid-template-columns: 1fr; }",
    ".filter-bar .search-field { grid-column: auto; }",
    ".modal-backdrop { align-items: end; padding: 0; }",
    ".device-dialog { width: 100%; max-height: calc(100dvh - max(20px, env(safe-area-inset-top))); padding: var(--space-4); padding-bottom: max(var(--space-4), env(safe-area-inset-bottom)); border-radius: var(--radius-md) var(--radius-md) 0 0; }",
    ".dialog-actions, .dialog-footer { display: grid; grid-template-columns: 1fr; }",
  ];
  if (selected.has("device.curtain-control")) rules.push(
    ".curtain-card { padding: var(--space-4); }", ".curtain-card-heading { grid-template-columns: 44px minmax(0, 1fr); }",
    ".curtain-card-heading output { grid-column: 1 / -1; width: 100%; text-align: left; }", ".curtain-quick-actions button { flex-direction: column; gap: 2px; padding-block: 6px; }",
    ".curtain-feedback { align-items: flex-start; flex-wrap: wrap; }", ".retry-button { width: 100%; margin-left: 0; justify-content: center; }",
  );
  if (selected.has("device.switch-control")) rules.push(
    ".switch-card { padding: var(--space-4); }", ".switch-feedback { align-items: flex-start; flex-wrap: wrap; }",
    ".circuit-row { grid-template-columns: 1fr; gap: var(--space-2); padding-block: 12px; }", ".circuit-toggle { width: 100%; }",
  );
  if (selected.has("device.climate-control")) rules.push(
    ".climate-card { padding: var(--space-4); }", ".climate-feedback { align-items: flex-start; flex-wrap: wrap; }", ".temperature-status { grid-template-columns: 1fr; }",
  );
  if (selected.has("sensor.environment")) rules.push(
    ".sensor-card { padding: var(--space-4); }", ".sensor-reading-grid { grid-template-columns: 1fr; }", ".sensor-card-heading { grid-template-columns: 44px minmax(0, 1fr); }",
    ".sensor-status { grid-column: 2; justify-self: start; }", ".sensor-card footer, .sensor-events-error { align-items: flex-start; flex-direction: column; }",
  );
  if (selected.has("gateway.overview")) rules.push(
    ".gateway-card { padding: var(--space-4); }", ".gateway-facts, .gateway-stats, .thread-panel dl { grid-template-columns: 1fr; }",
    ".gateway-card-heading { grid-template-columns: 44px minmax(0, 1fr); }", ".gateway-status { justify-self: start; }",
    ".gateway-error { grid-template-columns: auto minmax(0, 1fr); }", ".gateway-error button { grid-column: 1 / -1; width: 100%; }",
  );
  if (selected.has("panel.manager")) rules.push(
    ".panel-card, .knob-card { padding: var(--space-4); }", ".panel-card > header, .knob-card > header { grid-template-columns: 44px minmax(0, 1fr); }",
    ".panel-status { justify-self: start; }", ".panel-error { grid-template-columns: auto minmax(0, 1fr); }", ".panel-error button { grid-column: 1 / -1; width: 100%; }",
    ".panel-button-row { grid-template-columns: 1fr; }", ".panel-button-row > button, .panel-readonly { width: 100%; justify-content: center; }",
    ".panel-dialog-backdrop { align-items: end; padding: 0; }",
    ".panel-dialog { width: 100%; max-height: calc(100dvh - max(20px, env(safe-area-inset-top))); padding: var(--space-4); padding-bottom: max(var(--space-4), env(safe-area-inset-bottom)); border-radius: var(--radius-md) var(--radius-md) 0 0; }",
    ".panel-dialog footer { display: grid; grid-template-columns: 1fr; }",
  );
  return `@media (max-width: 520px) { ${rules.join(" ")} }`;
}
