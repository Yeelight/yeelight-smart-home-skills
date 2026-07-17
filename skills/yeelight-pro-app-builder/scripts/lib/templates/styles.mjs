import { themeCssSource } from "../theme-resolver.mjs";
import { automationStylesSource } from "./automation-styles.mjs";
import { sceneStylesSource } from "./scene-styles.mjs";
import { propertyValueControlStylesSource } from "./property-value-control.mjs";
import { shellStylesSource } from "./shell-styles.mjs";
import { spaceStylesSource } from "./space-styles.mjs";
import { gatewayStylesSource } from "./gateway-styles.mjs";
import { panelStylesSource } from "./panel-styles.mjs";
import { knobStylesSource } from "./knob-styles.mjs";
import { installerStylesSource } from "./installer-styles.mjs";
import { familyRecipeStylesSource } from "./family-recipe-styles.mjs";
import { responsiveStylesSource } from "./responsive-styles.mjs";

export function stylesSource(spec, options = {}) {
  const selected = new Set((spec.modules || []).map((module) => module.id));
  const hasAny = (moduleIds) => moduleIds.some((moduleId) => selected.has(moduleId));
  return `${options.themeCss || themeCssSource(spec)}
* { box-sizing: border-box; }
html { background: var(--color-background); }
body { margin: 0; min-width: 320px; min-height: 100dvh; background: var(--color-background); color: var(--color-foreground); font-family: -apple-system, "SF Pro Text", "PingFang SC", "Noto Sans SC", sans-serif; line-height: 1.65; }
button, input, select { font: inherit; }
button, a, input, select { touch-action: manipulation; }
button { cursor: pointer; transition: color var(--duration-fast), background-color var(--duration-fast), border-color var(--duration-fast), opacity var(--duration-fast), transform var(--duration-fast); }
.app-shell { width: min(100%, 760px); min-height: 100dvh; margin: 0 auto; padding: var(--shell-gutter) var(--shell-gutter) 92px; }
.topbar, .section-heading, .light-card-title, .summary-band, .summary-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
.topbar { padding: 8px 2px 24px; }
.topbar > div { min-width: 0; }
h1, h2, p { margin: 0; }
h1 { font-size: 24px; line-height: 1.35; }
h2 { font-size: 20px; line-height: 1.4; }
h2[tabindex="-1"]:focus { outline: none; }
small { color: var(--color-muted); }
.connection-state { min-height: 44px; display: inline-flex; flex: 0 0 auto; align-items: center; gap: var(--space-2); padding: 0 12px; border: 1px solid var(--color-border); border-radius: var(--button-radius); color: var(--color-primary); background: var(--color-surface); white-space: nowrap; }
.connection-state:hover { border-color: var(--color-primary); }
.connection-state.error { color: var(--color-error); }
.connection-state:disabled { cursor: wait; opacity: 0.72; }
.sync-error { display: flex; align-items: flex-start; gap: var(--space-3); margin: 0 2px var(--space-4); padding: 12px; border: 1px solid color-mix(in srgb, var(--color-error) 24%, transparent); border-radius: var(--radius-md); color: var(--color-error); background: var(--color-error-bg); }
.sync-error > div { display: grid; gap: var(--space-1); }
.sync-error span { color: var(--color-foreground); font-size: 14px; }
.summary-band { padding: 18px; border: 1px solid var(--yp-component-summary-border); border-radius: var(--card-radius); background: var(--color-primary); color: var(--color-on-primary); box-shadow: var(--yp-component-shadow-summary); }
.summary-band small { color: var(--yp-component-summary-muted); }
.summary-icon { width: 44px; height: 44px; display: grid; place-items: center; border-radius: var(--radius-md); color: var(--color-primary); background: var(--color-white); }
.summary-metrics { display: flex; gap: var(--space-3); }
.summary-metrics span { display: grid; grid-template-columns: auto auto; align-items: center; justify-content: center; gap: 0 var(--space-2); min-width: 72px; text-align: center; }
.summary-metrics small { grid-column: 1 / -1; }
.summary-metrics strong { font-size: 24px; }
.summary-heading > div:last-child { min-width: 0; }
.summary-heading p { margin-top: 2px; color: var(--yp-component-summary-muted); font-size: 14px; }
.home-overview { display: grid; gap: var(--space-4); }
.home-issue-strip { min-height: 58px; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--space-3); padding: 10px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.home-issue-strip > div { display: grid; }
.home-issue-strip span { color: var(--color-muted); font-size: 14px; }
.home-issue-strip.warning { border-color: color-mix(in srgb, var(--color-warning) 28%, var(--color-border)); color: var(--color-warning); background: var(--color-warning-bg); }
.home-issue-strip.warning span { color: var(--color-foreground); }
.home-area-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
.home-area { padding: var(--space-4); border: 1px solid var(--card-border); border-radius: var(--card-radius); background: var(--card-bg); box-shadow: var(--shadow-card); }
.home-area-heading { width: 100%; min-height: 52px; display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); padding: 0 0 var(--space-3); border: 0; border-bottom: 1px solid var(--color-border); border-radius: 0; color: inherit; text-align: left; background: transparent; }
.home-area-heading > span { display: grid; gap: 2px; }
.home-area-heading strong { font-size: 17px; }
.home-area-heading em { color: var(--color-primary); font-size: 13px; font-style: normal; font-weight: 600; white-space: nowrap; }
.home-room-list { display: grid; }
.home-room-row { width: 100%; min-height: 52px; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: 0; border: 0; border-bottom: 1px solid var(--color-neutral-100); border-radius: 0; color: inherit; text-align: left; background: transparent; }
.home-room-row:last-child { border-bottom: 0; }
.home-room-row > span { display: grid; min-width: 0; }
.home-room-row strong, .home-room-row small { overflow-wrap: anywhere; }
.home-room-row em { color: var(--color-muted); font-size: 13px; font-style: normal; white-space: nowrap; }
.search-field { display: grid; gap: 5px; color: var(--color-muted); font-size: 12px; }
.search-input { display: flex; align-items: center; gap: var(--space-2); min-height: 44px; width: 190px; padding: 0 12px; border: 1px solid var(--input-border); border-radius: var(--radius-md); background: var(--input-bg); }
.search-input:focus-within { border-color: var(--color-primary); box-shadow: var(--shadow-focus); }
.search-input input { width: 100%; min-width: 0; min-height: 44px; border: 0; outline: 0; background: transparent; color: var(--color-foreground); }
${hasAny(["home.lighting-summary", "room.lighting-control"]) ? `.lighting-module { padding-top: 26px; }
.section-heading { align-items: end; }
.device-list { display: grid; gap: var(--space-3); margin-top: 14px; }
.light-card { padding: var(--space-4); border: 1px solid var(--card-border); border-radius: var(--card-radius); background: var(--card-bg); box-shadow: var(--shadow-card); }
.light-card.offline { border-style: dashed; box-shadow: none; }
.light-card-title { justify-content: flex-start; }
.light-card-title > div { display: grid; gap: var(--space-1); flex: 1; min-width: 0; }
.light-card-title strong { overflow-wrap: anywhere; }
.lamp { width: 44px; height: 44px; display: grid; flex: 0 0 auto; place-items: center; border-radius: var(--radius-md); color: var(--color-muted); background: var(--color-neutral-100); box-shadow: var(--shadow-inset-border); }
.lamp.on { color: var(--color-warning); background: var(--color-amber-100); box-shadow: var(--yp-component-shadow-light-glow); }
.power-button { min-width: 84px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); border: 0; border-radius: var(--button-radius); color: var(--button-fg); background: var(--button-bg); }
.power-button:not(:disabled):active { transform: scale(0.97); }
.control-row { display: grid; gap: var(--space-2); margin-top: var(--space-4); }
.control-row span { display: flex; justify-content: space-between; }
.control-row input { width: 100%; min-height: 44px; accent-color: var(--color-primary); }
.control-row input:disabled, .power-button:disabled { cursor: not-allowed; opacity: 0.45; }
.offline-note { margin-top: 14px; padding: 10px 12px; border-radius: var(--radius-sm); color: var(--color-warning); background: var(--color-warning-bg); font-size: 14px; }
.control-feedback { min-height: 24px; display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-2); font-size: 14px; }
.control-feedback.success { color: var(--color-primary); }
.control-feedback.error { color: var(--color-error); }` : ""}
.empty-state { display: grid; gap: 5px; margin-top: 14px; padding: 28px; border: 1px dashed var(--color-border); border-radius: var(--card-radius); text-align: center; color: var(--color-muted); background: var(--color-surface); }
.retry-button { min-height: 44px; display: inline-flex; align-items: center; gap: var(--space-2); margin-left: auto; padding: 0 12px; border: 1px solid currentColor; border-radius: var(--button-radius); color: var(--color-error); background: var(--color-surface); }
.retry-button:disabled { cursor: not-allowed; opacity: 0.45; }
.icon-button { width: 44px; height: 44px; display: grid; flex: 0 0 auto; place-items: center; border: 1px solid var(--color-border); border-radius: var(--button-radius); color: var(--color-foreground); background: var(--color-surface); }
.back-link { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 12px; border: 1px solid var(--color-border); border-radius: var(--button-radius); color: var(--color-primary); background: var(--color-surface); }
.primary-button, .secondary-button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 16px; border-radius: var(--button-radius); font-weight: 650; }
.primary-button { border: 0; color: var(--button-fg); background: var(--button-bg); }
.secondary-button { border: 1px solid var(--color-border); color: var(--color-heading); background: var(--color-surface); }
.danger-button, .danger-link { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 16px; border: 1px solid var(--color-error); border-radius: var(--button-radius); color: var(--color-error); background: var(--color-surface); font-weight: 650; }
.primary-button:disabled, .secondary-button:disabled, .danger-button:disabled, .danger-link:disabled, .icon-button:disabled { cursor: not-allowed; opacity: 0.5; }
.primary-action, .secondary-action, .danger-action { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 16px; border-radius: var(--button-radius); }
.primary-action { border: 1px solid var(--button-bg); color: var(--button-fg); background: var(--button-bg); }
.secondary-action { border: 1px solid var(--color-border); color: var(--color-primary); background: var(--color-surface); }
.danger-action { border: 1px solid var(--color-error); color: var(--color-surface); background: var(--color-error); }
.primary-action:disabled, .secondary-action:disabled, .danger-action:disabled { cursor: not-allowed; opacity: 0.48; }
${hasAny(["home.space-summary", "room.device-management"]) ? spaceStylesSource() : ""}
${selected.has("device.curtain-control") ? `/* CURTAIN COMPONENT TOKENS */
:root { --curtain-track-bg: var(--color-neutral-100); --curtain-panel-bg: var(--color-surface); --curtain-panel-border: var(--color-border); --curtain-control-bg: var(--color-surface); --curtain-control-active: var(--color-primary); }
.curtain-module { padding-top: var(--space-2); }
.curtain-heading { align-items: end; }
.curtain-device-list { display: grid; gap: var(--space-4); margin-top: var(--space-4); }
.curtain-card { padding: var(--space-5); border: 1px solid var(--card-border); border-radius: var(--card-radius); background: var(--card-bg); box-shadow: var(--shadow-card); }
.curtain-card.offline { border-style: dashed; box-shadow: none; }
.curtain-card-heading { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); }
.curtain-card-heading > div:nth-child(2) { display: grid; min-width: 0; gap: var(--space-1); }
.curtain-card-heading strong { overflow-wrap: anywhere; }
.curtain-card-heading output { min-width: 56px; color: var(--color-primary); font-size: 24px; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
.curtain-device-icon { width: 44px; height: 44px; display: grid; place-items: center; border-radius: var(--radius-md); color: var(--color-primary); background: var(--color-neutral-100); box-shadow: var(--shadow-inset-border); }
.curtain-visual { display: grid; grid-template-columns: minmax(0, calc((100% - var(--curtain-opening)) / 2)) minmax(0, var(--curtain-opening)) minmax(0, calc((100% - var(--curtain-opening)) / 2)); min-height: 126px; margin-top: var(--space-5); overflow: hidden; border: 1px solid var(--curtain-panel-border); border-radius: var(--radius-md); background: var(--curtain-track-bg); }
.curtain-panel { min-width: 0; background: var(--curtain-panel-bg); }
.curtain-panel.left { border-right: 1px solid var(--curtain-panel-border); box-shadow: var(--yp-component-shadow-curtain-left); }
.curtain-panel.right { border-left: 1px solid var(--curtain-panel-border); box-shadow: var(--yp-component-shadow-curtain-right); }
.curtain-opening { background: var(--color-background); box-shadow: var(--yp-component-shadow-curtain-opening); }
.curtain-quick-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); margin-top: var(--space-4); }
.curtain-quick-actions button { min-height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 var(--space-2); border: 1px solid var(--color-border); border-radius: var(--button-radius); color: var(--color-primary); background: var(--curtain-control-bg); }
.curtain-quick-actions button:not(:disabled):hover { border-color: var(--color-primary); background: var(--color-background); }
.curtain-quick-actions button:not(:disabled):active { color: var(--button-fg); background: var(--curtain-control-active); }
.curtain-quick-actions button:disabled, .curtain-position-input:disabled { cursor: not-allowed; opacity: 0.45; }
.curtain-position-control { display: grid; gap: var(--space-2); margin-top: var(--space-4); }
.curtain-position-control > span { display: flex; justify-content: space-between; gap: var(--space-3); }
.curtain-position-control output { color: var(--color-primary); font-weight: 600; font-variant-numeric: tabular-nums; }
.curtain-position-input { width: 100%; min-height: 44px; accent-color: var(--color-primary); }
.curtain-feedback { min-height: 48px; display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-3); color: var(--color-muted); }
.curtain-feedback.success { color: var(--color-primary); }
.curtain-feedback.error { color: var(--color-error); }` : ""}
${selected.has("device.switch-control") ? `/* SWITCH COMPONENT TOKENS */
:root { --switch-track-off: var(--color-neutral-200); --switch-track-on: var(--color-primary); --switch-thumb: var(--color-white); --switch-row-border: var(--color-neutral-100); }
.switch-module { padding-top: var(--space-2); }
.switch-heading { align-items: end; }
.switch-device-list { display: grid; gap: var(--space-4); margin-top: var(--space-4); }
.switch-card { padding: var(--space-5); border: 1px solid var(--card-border); border-radius: var(--card-radius); background: var(--card-bg); box-shadow: var(--shadow-card); }
.switch-card.offline { border-style: dashed; box-shadow: none; }
.switch-card-heading { display: grid; grid-template-columns: 44px minmax(0, 1fr); align-items: center; gap: var(--space-3); }
.switch-card-heading > div { display: grid; min-width: 0; gap: var(--space-1); }
.switch-card-heading strong { overflow-wrap: anywhere; }
.switch-device-icon { width: 44px; height: 44px; display: grid; place-items: center; border-radius: var(--radius-md); color: var(--color-primary); background: var(--color-neutral-100); box-shadow: var(--shadow-inset-border); }
.circuit-list { margin-top: var(--space-4); border-top: 1px solid var(--switch-row-border); }
.circuit-row { min-height: 72px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--space-4); border-bottom: 1px solid var(--switch-row-border); }
.circuit-row > span { display: grid; min-width: 0; gap: 2px; }
.circuit-toggle { min-width: 124px; min-height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 12px; border: 1px solid var(--color-border); border-radius: var(--button-radius); color: var(--color-muted); background: var(--color-surface); }
.circuit-toggle.on { border-color: color-mix(in srgb, var(--color-primary) 42%, var(--color-border)); color: var(--color-primary); background: var(--color-background); }
.circuit-toggle:disabled { cursor: not-allowed; opacity: 0.45; }
.toggle-track { position: relative; width: 38px; height: 22px; flex: 0 0 auto; border-radius: 999px; background: var(--switch-track-off); transition: background-color var(--duration-fast); }
.toggle-track > span { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--switch-thumb); box-shadow: var(--yp-component-shadow-toggle-thumb); transition: transform var(--duration-fast); }
.circuit-toggle.on .toggle-track { background: var(--switch-track-on); }
.circuit-toggle.on .toggle-track > span { transform: translateX(16px); }
.readonly-note { min-height: 48px; display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-4); padding: 10px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-muted); background: var(--color-neutral-100); }
.switch-feedback { min-height: 48px; display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-2); color: var(--color-muted); }
.switch-feedback.success { color: var(--color-primary); }
.switch-feedback.error { color: var(--color-error); }` : ""}
${selected.has("device.climate-control") ? `/* CLIMATE COMPONENT TOKENS */
:root { --climate-control-bg: var(--color-neutral-100); --climate-control-active: var(--color-primary); --climate-temperature-fg: var(--color-primary); }
.climate-module { padding-top: var(--space-2); }
.climate-heading { align-items: end; }
.climate-device-list { display: grid; gap: var(--space-4); margin-top: var(--space-4); }
.climate-card { padding: var(--space-5); border: 1px solid var(--card-border); border-radius: var(--card-radius); background: var(--card-bg); box-shadow: var(--shadow-card); }
.climate-card.offline { border-style: dashed; box-shadow: none; }
.climate-card-heading { display: grid; grid-template-columns: 44px minmax(0, 1fr) 48px; align-items: center; gap: var(--space-3); }
.climate-card-heading > div { display: grid; min-width: 0; gap: var(--space-1); }
.climate-card-heading strong { overflow-wrap: anywhere; }
.climate-device-icon, .climate-power { width: 44px; height: 44px; display: grid; place-items: center; border-radius: var(--radius-md); }
.climate-device-icon { color: var(--color-primary); background: var(--color-neutral-100); box-shadow: var(--shadow-inset-border); }
.climate-power { border: 1px solid var(--color-border); color: var(--color-muted); background: var(--color-surface); }
.climate-power.on { border-color: var(--color-primary); color: var(--button-fg); background: var(--button-bg); }
.temperature-status { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-top: var(--space-5); }
.temperature-status > span { display: grid; gap: var(--space-1); padding: var(--space-4); border-radius: var(--radius-md); background: var(--climate-control-bg); }
.temperature-status strong, .temperature-status output { color: var(--climate-temperature-fg); font-size: 32px; font-weight: 700; font-variant-numeric: tabular-nums; }
.temperature-status sup { margin-left: 2px; font-size: 14px; }
.temperature-stepper { display: grid; grid-template-columns: 48px minmax(0, 1fr) 48px; align-items: center; gap: var(--space-3); margin-top: var(--space-4); }
.temperature-stepper button { width: 48px; height: 48px; display: grid; place-items: center; border: 1px solid var(--color-border); border-radius: var(--button-radius); color: var(--color-primary); background: var(--color-surface); }
.temperature-stepper input { width: 100%; min-height: 44px; accent-color: var(--color-primary); }
.climate-control-group { min-width: 0; margin: var(--space-5) 0 0; padding: 0; border: 0; }
.climate-control-group legend { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); color: var(--color-muted); }
.segmented-control { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); padding: var(--space-1); border-radius: var(--radius-md); background: var(--climate-control-bg); }
.segmented-control button { min-height: 44px; border: 0; border-radius: var(--radius-sm); color: var(--color-muted); background: transparent; }
.segmented-control button.active { color: var(--button-fg); background: var(--climate-control-active); }
.climate-power:disabled, .temperature-stepper button:disabled, .temperature-stepper input:disabled, .segmented-control button:disabled { cursor: not-allowed; opacity: 0.45; }
.climate-feedback { min-height: 48px; display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-3); color: var(--color-muted); }
.climate-feedback.success { color: var(--color-primary); }
.climate-feedback.error { color: var(--color-error); }` : ""}
${selected.has("sensor.environment") ? `/* SENSOR COMPONENT TOKENS */
:root { --sensor-reading-bg: var(--color-neutral-100); --sensor-reading-fg: var(--color-primary); --sensor-status-online: var(--color-primary); }
.sensor-module { padding-top: var(--space-2); }
.sensor-heading { align-items: end; }
.sensor-count { color: var(--color-muted); font-variant-numeric: tabular-nums; }
.sensor-device-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: var(--space-4); margin-top: var(--space-4); }
.sensor-card { min-width: 0; padding: var(--space-5); border: 1px solid var(--card-border); border-radius: var(--card-radius); background: var(--card-bg); box-shadow: var(--shadow-card); }
.sensor-card.offline { border-style: dashed; box-shadow: none; }
.sensor-card-heading { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); }
.sensor-card-heading > div { display: grid; min-width: 0; gap: var(--space-1); }
.sensor-card-heading strong { overflow-wrap: anywhere; }
.sensor-device-icon { width: 44px; height: 44px; display: grid; place-items: center; border-radius: var(--radius-md); color: var(--sensor-reading-fg); background: var(--sensor-reading-bg); box-shadow: var(--shadow-inset-border); }
.sensor-status { display: inline-flex; align-items: center; min-height: 28px; padding: 2px 8px; border-radius: var(--radius-sm); color: var(--color-muted); background: var(--color-neutral-100); }
.sensor-status.online { color: var(--sensor-status-online); }
.sensor-reading-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); margin-top: var(--space-4); }
.sensor-reading { min-width: 0; display: grid; grid-template-columns: 32px minmax(0, 1fr); align-items: center; gap: var(--space-2); padding: 12px; border-radius: var(--radius-md); background: var(--sensor-reading-bg); }
.sensor-reading-icon { color: var(--sensor-reading-fg); }
.sensor-reading > span:last-child { display: grid; gap: 2px; }
.sensor-reading strong { overflow-wrap: anywhere; color: var(--color-heading); font-size: 20px; font-variant-numeric: tabular-nums; }
.sensor-reading strong.unavailable { color: var(--color-muted); font-size: 14px; }
.sensor-card footer { display: flex; justify-content: space-between; gap: var(--space-2); margin-top: var(--space-4); color: var(--color-muted); font-size: 13px; }
.sensor-events { margin-top: var(--space-6); padding-top: var(--space-5); border-top: 1px solid var(--color-border); }
.sensor-event-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: var(--space-2); margin: var(--space-4) 0 0; padding: 0; list-style: none; }
.sensor-event-list li { display: grid; grid-template-columns: 32px minmax(0, 1fr); align-items: center; gap: var(--space-2); min-height: 56px; padding: 10px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.sensor-event-list li > span, .history-boundary > span { display: grid; gap: 2px; }
.sensor-events-error, .history-boundary { min-height: 56px; display: flex; align-items: center; gap: var(--space-3); margin-top: var(--space-3); padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-neutral-100); }
.sensor-events-error { justify-content: space-between; color: var(--color-error); }
.sensor-events-error > div { display: grid; gap: 2px; }
.history-boundary { color: var(--color-muted); }
.history-boundary strong { color: var(--color-heading); }` : ""}
${selected.has("group.manager") ? `/* GROUP COMPONENT TOKENS */
:root { --group-icon-bg: var(--color-neutral-100); --group-dialog-scrim: var(--yp-semantic-overlay); }
.group-module { padding-top: var(--space-2); }
.group-heading { align-items: end; }
.group-count { color: var(--color-muted); font-variant-numeric: tabular-nums; }
.group-list { display: grid; gap: var(--space-3); margin-top: var(--space-4); }
.group-row { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--card-border); border-radius: var(--card-radius); background: var(--card-bg); box-shadow: var(--shadow-card); }
.group-row-main { min-width: 0; min-height: 52px; display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); padding: 0; border: 0; color: inherit; background: transparent; text-align: left; }
.group-icon { width: 44px; height: 44px; display: grid; place-items: center; border-radius: var(--radius-md); color: var(--color-primary); background: var(--group-icon-bg); box-shadow: var(--shadow-inset-border); }
.group-copy { display: grid; min-width: 0; gap: 2px; }
.group-copy strong { overflow-wrap: anywhere; }
.group-copy span { color: var(--color-muted); }
.group-manage-button, .group-unavailable { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 12px; border-radius: var(--button-radius); }
.group-manage-button { border: 1px solid var(--color-border); color: var(--color-primary); background: var(--color-surface); }
.group-unavailable { color: var(--color-muted); background: var(--color-neutral-100); }
.group-feedback { grid-column: 2 / -1; min-height: 24px; display: flex; align-items: center; gap: var(--space-2); color: var(--color-muted); font-size: 14px; }
.group-feedback.success { color: var(--color-primary); }
.group-feedback.error, .dialog-error { color: var(--color-error); }
.group-module > .page-error, .group-detail .page-error { min-height: 64px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); margin-top: var(--space-4); padding: 10px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-error); background: var(--color-surface); }
.group-module > .page-error button, .group-detail .page-error button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; padding: 0 14px; border: 1px solid currentColor; border-radius: var(--button-radius); color: var(--color-error); background: var(--color-surface); }
.group-dialog-backdrop { position: fixed; z-index: 100; inset: 0; display: grid; place-items: center; padding: var(--space-4); background: var(--group-dialog-scrim); }
.group-dialog { width: min(100%, 520px); max-height: min(720px, calc(100dvh - 32px)); overflow: auto; padding: var(--space-5); border-radius: var(--radius-md); background: var(--color-surface); box-shadow: var(--shadow-overlay); }
.group-members-dialog { display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto auto; overflow: hidden; }
.group-dialog header, .group-dialog footer { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.group-dialog header h3 { margin: 2px 0 0; font-size: 20px; }
.group-dialog > p { color: var(--color-muted); }
.group-dialog fieldset { margin: var(--space-4) 0; padding: 0; border: 0; }
.group-members-dialog fieldset { min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); overflow: hidden; }
.group-dialog legend { margin-bottom: var(--space-2); font-weight: 700; }
.group-candidates { min-height: 0; display: grid; align-content: start; gap: var(--space-2); overflow-y: auto; overscroll-behavior: contain; padding-right: 2px; }
.group-candidates label { min-height: 56px; display: grid; grid-template-columns: 24px minmax(0, 1fr); align-items: center; gap: var(--space-3); padding: 8px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); cursor: pointer; }
.group-candidates input { width: 20px; height: 20px; accent-color: var(--color-primary); }
.group-candidates label > span { display: grid; gap: 2px; }
.group-candidates small { color: var(--color-muted); }
.dialog-error { display: flex; align-items: flex-start; gap: var(--space-2); margin-bottom: var(--space-3); }
.group-dialog footer { justify-content: flex-end; padding-top: var(--space-3); border-top: 1px solid var(--color-border); }
.group-heading { gap: var(--space-4); }
.group-heading p { max-width: 64ch; color: var(--color-muted); }
.group-operation-boundary { min-height: 44px; display: inline-flex; align-items: center; gap: var(--space-2); color: var(--color-muted); }
.group-workspace { display: grid; grid-template-columns: minmax(300px, 0.82fr) minmax(360px, 1.18fr); gap: var(--space-4); margin-top: var(--space-4); align-items: start; }
.group-workspace .group-list { margin-top: 0; }
.group-row { grid-template-columns: minmax(0, 1fr) auto; }
.group-row.active { border-color: var(--color-primary); box-shadow: var(--yp-component-shadow-selection); }
.group-row-main { min-width: 0; min-height: 56px; display: grid; grid-template-columns: 44px minmax(0, 1fr) 20px; align-items: center; gap: var(--space-3); padding: 0; border: 0; color: inherit; text-align: left; background: transparent; }
.group-row-main .group-copy small { color: var(--color-muted); }
.group-detail-pane { min-width: 0; position: sticky; top: calc(var(--space-5) + 56px); }
.group-detail, .group-detail-empty { min-height: 360px; padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.group-detail-empty { display: grid; place-content: center; justify-items: center; gap: var(--space-2); color: var(--color-muted); text-align: center; }
.group-detail > header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); margin-top: var(--space-3); }
.group-detail h3 { margin: 2px 0; font-size: 22px; }
.group-detail header p { margin: 0; color: var(--color-muted); }
.group-detail dl, .group-review dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); margin: var(--space-5) 0; }
.group-detail dl div, .group-review dl div { min-width: 0; padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
.group-detail dt, .group-review dt { color: var(--color-muted); font-size: 13px; }
.group-detail dd, .group-review dd { margin: 4px 0 0; color: var(--color-heading); font-weight: 700; overflow-wrap: anywhere; }
.group-member-summary { display: grid; gap: var(--space-2); }
.group-member-summary > span { min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: 0 var(--space-3); border-bottom: 1px solid var(--color-border); }
.group-member-summary small { color: var(--color-muted); }
.group-danger-zone { margin-top: var(--space-6); padding-top: var(--space-5); border-top: 1px solid var(--color-border); }
.group-danger-zone h4 { margin: 4px 0; font-size: 17px; }
.group-danger-zone p { color: var(--color-muted); }
.group-dialog label, .group-form label { display: grid; gap: var(--space-2); font-weight: 700; }
.group-dialog input, .group-form input, .group-form select, .group-form textarea { width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-heading); background: var(--color-surface); }
.group-form textarea { min-height: 96px; resize: vertical; }
.group-editor { max-width: 920px; margin: 0 auto; }
.group-editor > header, .group-editor > footer { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
.group-editor > header h2 { margin: 2px 0; }
.group-stepper { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); margin: var(--space-5) 0; }
.group-stepper button { min-height: 52px; display: flex; align-items: center; justify-content: center; gap: var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-muted); background: var(--color-surface); }
.group-stepper button[aria-current="step"] { border-color: var(--color-primary); color: var(--color-primary); }
.group-stepper button > span { width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; background: var(--color-neutral-100); }
.group-editor-body { min-height: 360px; padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.group-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); }
.group-form label:nth-child(2) { grid-column: 1 / -1; }
.group-editor-members { display: grid; gap: var(--space-2); margin: 0; padding: 0; border: 0; }
.group-editor-members label { min-height: 56px; display: grid; grid-template-columns: 24px minmax(0, 1fr); align-items: center; gap: var(--space-3); padding: 8px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
.group-editor-members input { width: 20px; height: 20px; accent-color: var(--color-primary); }
.group-editor-members label > span { display: grid; gap: 2px; }
.group-editor-members small { color: var(--color-muted); }
.group-editor > footer { justify-content: flex-end; margin-top: var(--space-4); }
@media (min-width: 901px) { .group-workspace .group-row { grid-template-columns: 1fr; } .group-workspace .group-row-main, .group-workspace .group-manage-button, .group-workspace .group-unavailable, .group-workspace .group-feedback { grid-column: 1; width: 100%; } }
@media (max-width: 900px) { .group-workspace { grid-template-columns: 1fr; } .group-detail-pane { position: static; } .group-detail-empty { display: none; } .group-detail-pane:has(.group-detail) { position: fixed; z-index: 30; inset: 0; overflow: auto; padding: var(--space-4); background: var(--color-background); } }
@media (max-width: 600px) { .group-heading, .group-detail > header { align-items: stretch; flex-direction: column; } .group-editor { height: calc(100dvh - 230px); min-height: 520px; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; } .group-editor > header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; } .group-editor > header .back-link { width: auto; } .group-create-button { width: 100%; } .group-row { grid-template-columns: 1fr; } .group-row-main, .group-manage-button, .group-unavailable, .group-feedback { grid-column: 1; width: 100%; } .group-module > .page-error, .group-detail .page-error { grid-template-columns: auto minmax(0, 1fr); } .group-module > .page-error button, .group-detail .page-error button { grid-column: 1 / -1; width: 100%; } .group-detail dl, .group-review dl, .group-form { grid-template-columns: 1fr; } .group-form label:nth-child(2) { grid-column: auto; } .group-stepper { margin: var(--space-3) 0; } .group-stepper button { padding: 6px; font-size: 13px; } .group-editor-body { min-height: 0; overflow: auto; padding: var(--space-4); } .group-editor > footer { margin-top: var(--space-3); } .group-dialog-backdrop { align-items: end; padding: 0; } .group-dialog { width: 100%; max-height: calc(100dvh - max(20px, env(safe-area-inset-top))); padding-bottom: max(var(--space-4), env(safe-area-inset-bottom)); border-bottom-left-radius: 0; border-bottom-right-radius: 0; } .group-members-dialog footer, .group-unsaved-dialog footer { display: grid; grid-template-columns: 1fr; } }` : ""}
${selected.has("gateway.overview") ? gatewayStylesSource() : ""}
${selected.has("panel.manager") ? `/* PANEL COMPONENT TOKENS */
:root { --panel-icon-bg: color-mix(in srgb, var(--color-primary) 9%, var(--color-surface)); --panel-readonly-bg: color-mix(in srgb, var(--color-muted) 8%, var(--color-surface)); --panel-scrim: var(--yp-semantic-overlay); }
.panel-module { padding-top: var(--space-2); }
.panel-heading { align-items: end; }
.panel-heading p { max-width: 64ch; color: var(--color-muted); }
.panel-count { color: var(--color-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.panel-loading { min-height: 44px; display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-4); color: var(--color-muted); }
.panel-error { min-height: 44px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--space-2); margin-top: var(--space-3); padding: 8px 10px; border: 1px solid color-mix(in srgb, var(--color-error) 24%, transparent); border-radius: var(--radius-sm); color: var(--color-error); background: var(--color-error-bg); }
.panel-error span { overflow-wrap: anywhere; }
.panel-error button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 12px; border: 1px solid currentColor; border-radius: var(--button-radius); color: var(--color-error); background: var(--color-surface); }
.panel-grid, .knob-grid { display: grid; gap: var(--space-4); margin-top: var(--space-4); }
.panel-card, .knob-card { min-width: 0; padding: var(--space-5); border: 1px solid var(--card-border); border-radius: var(--card-radius); background: var(--card-bg); box-shadow: var(--shadow-card); }
.panel-card > header, .knob-card > header { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); }
.panel-card > header > div, .knob-card > header > div { display: grid; min-width: 0; gap: 2px; }
.panel-card header strong, .panel-card header span, .knob-card header strong, .knob-card header span { overflow-wrap: anywhere; }
.panel-icon { width: 44px; height: 44px; display: grid; place-items: center; border-radius: var(--radius-md); color: var(--color-primary); background: var(--panel-icon-bg); box-shadow: var(--shadow-inset-border); }
.panel-status { min-height: 44px; display: inline-flex; align-items: center; padding: 0 12px; border-radius: var(--radius-sm); color: var(--color-muted); background: var(--color-neutral-100); }
.panel-status.online { color: var(--color-primary); background: color-mix(in srgb, var(--color-accent) 12%, var(--color-surface)); }
.panel-subheading { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-top: var(--space-5); padding-bottom: var(--space-2); border-bottom: 1px solid var(--color-border); }
.panel-subheading span { color: var(--color-muted); }
.panel-buttons { display: grid; }
.panel-button-row { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--space-2) var(--space-3); padding: 12px 0; border-bottom: 1px solid var(--color-neutral-100); }
.panel-button-row > div:first-child { display: grid; min-width: 0; gap: 2px; }
.panel-button-row > div:first-child span { color: var(--color-muted); }
.panel-button-row > button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 14px; border: 1px solid var(--color-border); border-radius: var(--button-radius); color: var(--color-primary); background: var(--color-surface); }
.panel-readonly { min-height: 44px; display: inline-flex; align-items: center; gap: var(--space-2); padding: 0 12px; border-radius: var(--radius-sm); color: var(--color-muted); background: var(--panel-readonly-bg); }
.panel-feedback { grid-column: 1 / -1; min-height: 20px; color: var(--color-muted); font-size: 14px; }
.knob-heading { margin-top: var(--space-7); }
.knob-targets { display: grid; gap: var(--space-2); margin-top: var(--space-4); }
.knob-targets span { min-height: 44px; display: flex; align-items: center; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); overflow-wrap: anywhere; }
.knob-unsupported { display: flex; align-items: flex-start; gap: var(--space-3); margin-top: var(--space-4); padding: var(--space-3); border-radius: var(--radius-md); color: var(--color-muted); background: var(--panel-readonly-bg); }
.knob-unsupported > div { display: grid; gap: 2px; }
.knob-unsupported strong { color: var(--color-heading); }
.panel-dialog-backdrop { position: fixed; z-index: 100; inset: 0; display: grid; place-items: center; padding: var(--space-4); background: var(--panel-scrim); }
.panel-dialog { width: min(100%, 440px); max-height: min(680px, calc(100dvh - 32px)); overflow: auto; padding: var(--space-5); border-radius: var(--radius-md); background: var(--color-surface); box-shadow: var(--shadow-overlay); }
.panel-dialog header, .panel-dialog footer { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.panel-dialog header h3 { margin: 2px 0 0; font-size: 20px; }
.panel-dialog label { display: block; margin-top: var(--space-5); font-weight: 700; }
.panel-dialog input { width: 100%; min-height: 48px; margin-top: var(--space-2); padding: 0 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-heading); background: var(--color-surface); }
.panel-dialog > small { display: block; margin-top: var(--space-2); color: var(--color-muted); }
.panel-dialog footer { justify-content: flex-end; margin-top: var(--space-5); padding-top: var(--space-3); border-top: 1px solid var(--color-border); }` : ""}
.bottom-nav { position: fixed; z-index: 20; left: 50%; bottom: max(12px, env(safe-area-inset-bottom)); transform: translateX(-50%); display: grid; grid-template-columns: repeat(2, 1fr); width: min(calc(100% - 24px), 430px); padding: 7px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--nav-bg); box-shadow: var(--shadow-card); }
.bottom-nav[data-tabs="3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.bottom-nav a { min-height: var(--control-min-height); display: flex; align-items: center; justify-content: center; gap: var(--space-2); border-radius: var(--radius-sm); color: var(--color-primary); text-decoration: none; }
.bottom-nav a:hover { background: var(--color-background); }
.bottom-nav a[aria-current="page"] { color: var(--color-on-primary); background: var(--color-primary); }
a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px; }
[data-theme-mode="dark"] { color-scheme: dark; }
[data-navigation="sidebar"], [data-navigation="adaptive-rail"], [data-navigation="bottom-tabs"], [data-navigation="touch-rail"] { --navigation-contract: active; }
.spin { animation: spin 900ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 720px) { .filter-bar { grid-template-columns: 1fr 1fr; } .filter-bar .search-field { grid-column: 1 / -1; } }
${responsiveStylesSource(selected)}
${selected.has("panel.manager") ? panelStylesSource() + knobStylesSource() : ""}
${selected.has("installer.maintenance") ? installerStylesSource() : ""}
${selected.has("scene.launcher") ? sceneStylesSource() : ""}
${selected.has("automation.manager") ? automationStylesSource() : ""}
${hasAny(["scene.launcher", "automation.manager"]) ? propertyValueControlStylesSource() : ""}
${shellStylesSource()}
${familyRecipeStylesSource([...selected])}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; } }
`;
}
