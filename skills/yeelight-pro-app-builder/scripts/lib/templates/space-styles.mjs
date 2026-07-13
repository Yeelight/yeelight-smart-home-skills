export function spaceStylesSource() {
  return `.home-slot-host { display: grid; gap: var(--space-6); }
.home-slot { min-width: 0; }
.home-status-summary, .home-rooms-summary, .home-issues-summary, .home-environment-summary, .home-scene-summary { display: grid; gap: var(--space-3); }
.home-reading-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-2); }
.home-reading { display: grid; gap: var(--space-2); min-width: 0; padding: 12px; border: 1px solid var(--card-border); border-radius: var(--card-radius); background: var(--card-bg); }
.home-reading .sensor-reading { padding: 0; border: 0; border-radius: 0; background: transparent; }
.home-reading > small { color: var(--color-muted); overflow-wrap: anywhere; }
.home-scene-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
.home-scene-row { min-height: 68px; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: 10px 12px; border: 1px solid var(--card-border); border-radius: var(--card-radius); background: var(--card-bg); }
.home-scene-row > span:first-child { display: grid; min-width: 0; }
.home-scene-row strong, .home-scene-row small { overflow-wrap: anywhere; }
.home-scene-row button { min-width: 88px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); border: 0; border-radius: var(--button-radius); color: var(--button-fg); background: var(--button-bg); }
.home-scene-row button:disabled { cursor: not-allowed; opacity: 0.55; }
.device-management { padding-top: 26px; }
.result-count { color: var(--color-muted); font-size: 14px; }
.filter-bar { display: grid; grid-template-columns: minmax(220px, 1fr) 150px 150px; gap: var(--space-3); margin-top: 14px; }
.filter-bar label { display: grid; gap: 5px; color: var(--color-muted); font-size: 12px; }
.filter-bar .search-input { width: 100%; }
select, .dialog-editor input { min-height: 44px; width: 100%; padding: 0 12px; border: 1px solid var(--input-border); border-radius: var(--radius-md); color: var(--color-foreground); background: var(--input-bg); }
select:focus-visible, .dialog-editor input:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px; }
.managed-device-list { display: grid; gap: var(--space-2); margin-top: 14px; }
.managed-device-row { min-height: 64px; display: grid; grid-template-columns: 10px 1fr auto; align-items: center; gap: var(--space-3); width: 100%; padding: 10px 12px; border: 1px solid var(--card-border); border-radius: var(--card-radius); text-align: left; color: var(--color-foreground); background: var(--card-bg); box-shadow: var(--shadow-card); }
.managed-device-row:hover { border-color: var(--color-primary); }
.managed-device-row > span:nth-child(2) { display: grid; min-width: 0; }
.managed-device-row strong, .managed-device-row small { overflow-wrap: anywhere; }
.device-status { width: 9px; height: 9px; border-radius: 50%; background: var(--color-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 15%, transparent); }
.device-status.offline { background: var(--color-muted); box-shadow: none; }
.load-more { min-height: 44px; width: 100%; margin-top: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--button-radius); color: var(--color-primary); background: var(--color-surface); }
.space-directory, .device-detail { display: grid; gap: var(--space-4); padding-top: var(--space-2); }
.device-detail { width: min(100%, 960px); }
.resource-caption { margin: calc(-1 * var(--space-2)) 0 0; color: var(--color-muted); font-size: 13px; }
.detail-heading { min-height: 52px; display: flex; align-items: center; gap: var(--space-3); }
.detail-heading > div { min-width: 0; }
.detail-heading h2, .detail-heading small { overflow-wrap: anywhere; }
.space-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); }
.space-metrics span { min-height: 64px; display: grid; place-items: center; padding: var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); text-align: center; }
.space-metrics strong { color: var(--color-primary); font-size: 21px; font-variant-numeric: tabular-nums; }
.area-list { display: grid; gap: var(--space-4); }
.area-section { border-top: 1px solid var(--color-border); padding-top: var(--space-3); }
.area-heading { min-height: 52px; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); width: 100%; padding: 0; border: 0; color: var(--color-foreground); background: transparent; text-align: left; }
.area-heading > span { display: grid; min-width: 0; }
.room-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
.room-tile { min-height: 64px; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); width: 100%; padding: 10px 12px; border: 1px solid var(--card-border); border-radius: var(--card-radius); color: var(--color-foreground); background: var(--card-bg); text-align: left; }
.room-tile:hover { border-color: var(--color-primary); }
.room-tile > span { display: grid; min-width: 0; }
.room-tile strong, .room-tile small { overflow-wrap: anywhere; }
.device-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; border-top: 1px solid var(--color-border); }
.device-facts div { display: grid; grid-template-columns: minmax(88px, auto) minmax(0, 1fr); gap: var(--space-3); padding: 12px 0; border-bottom: 1px solid var(--color-border); }
.device-facts div:nth-child(odd) { padding-right: var(--space-4); }
.device-facts div:nth-child(even) { padding-left: var(--space-4); border-left: 1px solid var(--color-border); }
.device-facts dt { color: var(--color-muted); }
.device-facts dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
.detail-resource-state { min-height: 48px; display: flex; align-items: center; gap: var(--space-2); padding: 10px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-primary); background: var(--color-surface); }
.detail-resource-state.error { color: var(--color-error); background: var(--color-error-bg); }
.detail-resource-state .retry-button { margin-left: auto; }
.modal-backdrop { position: fixed; z-index: 100; inset: 0; display: grid; place-items: center; padding: var(--space-4); background: rgb(10 25 29 / 0.5); }
.device-dialog { width: min(100%, 480px); max-height: calc(100dvh - 32px); overflow: auto; padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--card-radius); background: var(--color-surface); box-shadow: 0 20px 60px rgb(10 25 29 / 0.22); }
.device-dialog header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); }
.icon-button { width: 44px; height: 44px; display: grid; flex: 0 0 auto; place-items: center; border: 1px solid var(--color-border); border-radius: var(--button-radius); color: var(--color-foreground); background: var(--color-surface); }
.device-dialog dl { display: grid; gap: var(--space-2); margin: var(--space-5) 0; }
.device-dialog dl div { display: flex; justify-content: space-between; gap: var(--space-4); padding: 10px 0; border-bottom: 1px solid var(--color-neutral-100); }
.device-dialog dt { color: var(--color-muted); }
.device-dialog dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
.dialog-actions, .dialog-footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: var(--space-2); }
.secondary-button, .ghost-button, .primary-button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 14px; border-radius: var(--button-radius); }
.secondary-button, .ghost-button { border: 1px solid var(--color-border); color: var(--color-primary); background: var(--color-surface); }
.primary-button { border: 0; color: var(--button-fg); background: var(--button-bg); }
.primary-button:disabled, .secondary-button:disabled, .ghost-button:disabled, .icon-button:disabled { cursor: not-allowed; opacity: 0.45; }
.dialog-editor { display: grid; gap: var(--space-4); padding-top: var(--space-2); }
.dialog-editor label { display: grid; gap: var(--space-2); }
.dialog-feedback { min-height: 24px; display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-3); font-size: 14px; }
.dialog-feedback.success { color: var(--color-primary); }
.dialog-feedback.error { color: var(--color-error); }
.device-controller { display: grid; gap: var(--space-4); padding: var(--space-4) 0; border-top: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); }
.controller-heading { display: flex; align-items: center; gap: var(--space-3); }
.controller-heading > div { min-width: 0; flex: 1; }
.controller-heading h3 { margin: 2px 0 0; font-size: 18px; }
.controller-icon { width: 44px; height: 44px; display: grid; place-items: center; flex: 0 0 auto; border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-muted); background: var(--color-surface); }
.controller-icon.active { color: var(--color-primary); border-color: color-mix(in srgb, var(--color-primary) 32%, var(--color-border)); background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface)); }
.controller-power { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 14px; border: 1px solid var(--color-border); border-radius: var(--button-radius); color: var(--color-primary); background: var(--color-surface); }
.controller-power[aria-pressed="true"] { color: var(--button-fg); border-color: var(--button-bg); background: var(--button-bg); }
.controller-power:disabled { cursor: not-allowed; opacity: 0.5; }
.controller-terminal { min-height: 44px; display: flex; align-items: center; gap: var(--space-2); margin: 0; padding: 8px 10px; border-left: 3px solid var(--color-warning); color: var(--color-muted); background: var(--color-surface-muted); }
.controller-range { display: grid; gap: var(--space-2); }
.controller-range > span { display: flex; justify-content: space-between; gap: var(--space-3); }
.controller-range strong { color: var(--color-primary); font-variant-numeric: tabular-nums; }
.controller-range input { min-height: 44px; width: 100%; accent-color: var(--color-primary); touch-action: manipulation; }
.controller-range input:disabled { cursor: not-allowed; opacity: 0.45; }
.controller-swatches { display: grid; gap: var(--space-2); margin: 0; padding: 0; border: 0; }
.controller-swatches > div { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.color-swatch { width: 44px; height: 44px; border: 2px solid var(--color-surface); border-radius: 50%; box-shadow: 0 0 0 1px var(--color-border); }
.color-swatch.selected { box-shadow: 0 0 0 3px var(--focus-ring); }
.color-swatch:disabled { cursor: not-allowed; opacity: 0.4; }
.controller-feedback { min-height: 24px; display: flex; align-items: center; gap: var(--space-2); font-size: 14px; }
.controller-feedback.success { color: var(--color-primary); }
.controller-feedback.error { color: var(--color-error); }
.controller-quick-actions, .controller-segments > div { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); }
.controller-quick-actions button, .controller-segments button { min-height: 44px; border: 1px solid var(--color-border); border-radius: var(--button-radius); color: var(--color-foreground); background: var(--color-surface); }
.controller-quick-actions button[aria-pressed="true"], .controller-segments button[aria-pressed="true"] { color: var(--button-fg); border-color: var(--button-bg); background: var(--button-bg); }
.controller-quick-actions button:disabled, .controller-segments:disabled button { cursor: not-allowed; opacity: 0.45; }
.controller-reading { display: flex; justify-content: space-between; gap: var(--space-3); margin: 0; color: var(--color-muted); }
.controller-reading strong { color: var(--color-foreground); }
.switch-controller .circuit-list { display: grid; border-top: 1px solid var(--color-border); }
.switch-controller .circuit-row { min-height: 60px; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); border-bottom: 1px solid var(--color-border); }
.switch-controller .circuit-row > span { display: grid; }
.switch-controller .circuit-row button[role="switch"] { width: 52px; height: 32px; padding: 3px; border: 0; border-radius: 16px; background: var(--color-neutral-300); }
.switch-controller .circuit-row button[role="switch"] > span { width: 26px; height: 26px; display: block; border-radius: 50%; background: var(--color-surface); transition: transform 180ms ease; }
.switch-controller .circuit-row button[role="switch"][aria-checked="true"] { background: var(--color-primary); }
.switch-controller .circuit-row button[role="switch"][aria-checked="true"] > span { transform: translateX(20px); }
.switch-controller .circuit-row button[role="switch"]:disabled { cursor: not-allowed; opacity: 0.45; }
.climate-controller .temperature-stepper { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3); }
.climate-controller .temperature-stepper > span { min-width: 4em; flex: 1 1 8em; }
.climate-controller .temperature-stepper > div { display: flex; flex: 0 0 auto; align-items: center; gap: var(--space-2); }
.climate-controller .temperature-stepper button { width: 44px; height: 44px; display: grid; place-items: center; border: 1px solid var(--color-border); border-radius: var(--button-radius); color: var(--color-primary); background: var(--color-surface); }
.climate-controller .temperature-stepper strong { min-width: 72px; text-align: center; font-size: 21px; font-variant-numeric: tabular-nums; }
.controller-segments { display: grid; gap: var(--space-2); margin: 0; padding: 0; border: 0; }
.sensor-reading-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
.sensor-reading { min-height: 82px; display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 4px var(--space-2); padding: 10px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.sensor-reading svg { color: var(--color-primary); }
.sensor-reading strong { grid-column: 1 / -1; font-size: 18px; font-variant-numeric: tabular-nums; }
.sensor-reading.alert { color: var(--color-error); border-color: var(--color-error); background: var(--color-error-bg); }
@media (max-width: 760px) { .home-reading-grid, .home-scene-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 520px) { .home-scene-list { grid-template-columns: 1fr; } .home-scene-row { align-items: flex-start; flex-direction: column; } .home-scene-row button, .home-scene-row .scene-unavailable { width: 100%; justify-content: center; } }
`;
}
