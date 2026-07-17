const allModules = [
  "home.lighting-summary", "room.lighting-control", "home.space-summary", "room.device-management",
  "device.curtain-control", "device.switch-control", "device.climate-control", "sensor.environment",
  "scene.launcher", "automation.manager", "group.manager", "gateway.overview", "panel.manager", "installer.maintenance",
];

export function familyRecipeStylesSource(selectedModules) {
  const selectors = recipeSelectors(new Set(selectedModules ?? allModules));
  const rule = (prefix, values, suffix) => values.length > 0 ? `${prefix}:is(${values.join(", ")})${suffix}` : "";
  return `
/* EXECUTABLE FAMILY RECIPE CONTRACTS */
.management-shell[data-surface-style="crisp"] { --yp-family-surface: crisp; --yp-family-content-width: 1240px; --yp-family-frame-bg: var(--color-surface); --yp-family-frame-border: var(--color-border); --yp-family-frame-shadow: var(--shadow-card); }
.management-shell[data-surface-style="quiet"] { --yp-family-surface: quiet; --yp-family-content-width: 1120px; --yp-family-frame-bg: transparent; --yp-family-frame-border: transparent; --yp-family-frame-shadow: none; }
.management-shell[data-surface-style="warm"] { --yp-family-surface: warm; --yp-family-content-width: 1200px; --yp-family-frame-bg: color-mix(in srgb, var(--color-surface) 94%, var(--color-warning-bg)); --yp-family-frame-border: var(--color-border); --yp-family-frame-shadow: var(--shadow-card); }
.management-shell[data-surface-style="natural"] { --yp-family-surface: natural; --yp-family-content-width: 1180px; --yp-family-frame-bg: color-mix(in srgb, var(--color-surface) 94%, var(--color-accent)); --yp-family-frame-border: var(--color-border); --yp-family-frame-shadow: var(--shadow-card); }
.management-shell[data-surface-style="nocturnal"] { --yp-family-surface: nocturnal; --yp-family-content-width: 1280px; --yp-family-frame-bg: color-mix(in srgb, var(--color-surface) 96%, var(--color-primary)); --yp-family-frame-border: var(--color-border); --yp-family-frame-shadow: var(--shadow-overlay); }
.management-shell[data-surface-style="console"] { --yp-family-surface: console; --yp-family-content-width: 1360px; --yp-family-frame-bg: var(--color-surface); --yp-family-frame-border: var(--color-border); --yp-family-frame-shadow: none; }
.management-shell[data-surface-style="command"] { --yp-family-surface: command; --yp-family-content-width: 1440px; --yp-family-frame-bg: var(--color-surface); --yp-family-frame-border: var(--color-primary); --yp-family-frame-shadow: none; }
.management-shell[data-surface-style="technical"] { --yp-family-surface: technical; --yp-family-content-width: 1400px; --yp-family-frame-bg: var(--color-surface); --yp-family-frame-border: var(--color-border); --yp-family-frame-shadow: none; }
.management-shell[data-surface-style="contrast"] { --yp-family-surface: contrast; --yp-family-content-width: 1200px; --yp-family-frame-bg: var(--color-surface); --yp-family-frame-border: var(--color-foreground); --yp-family-frame-shadow: none; }
.management-shell[data-surface-style="gallery"] { --yp-family-surface: gallery; --yp-family-content-width: 1280px; --yp-family-frame-bg: transparent; --yp-family-frame-border: transparent; --yp-family-frame-shadow: none; }
.management-shell[data-surface-style="fabric"] { --yp-family-surface: fabric; --yp-family-content-width: 1280px; --yp-family-frame-bg: color-mix(in srgb, var(--color-surface) 97%, var(--color-accent)); --yp-family-frame-border: var(--color-border); --yp-family-frame-shadow: var(--shadow-card); }

.management-shell .shell-main { width: min(100%, var(--yp-family-content-width, 1240px)); }
${rule(".management-shell ", selectors.frames, " { border-color: var(--yp-family-frame-border, var(--color-border)); background: var(--yp-family-frame-bg, var(--color-surface)); box-shadow: var(--yp-family-frame-shadow, var(--shadow-card)); }")}
${rule(".management-shell[data-surface-style=\"quiet\"] ", selectors.editors, " { border-radius: 0; }")}
${rule(".management-shell[data-surface-style=\"command\"] ", selectors.editors, " { border-top-width: 3px; }")}
${rule(".management-shell[data-surface-style=\"contrast\"] ", selectors.editors, " { border-width: 2px; }")}
.management-shell[data-surface-style="gallery"] .shell-topbar { background: var(--color-surface); backdrop-filter: none; }

.management-shell[data-navigation-style="standard"] { --yp-family-navigation: standard; --yp-family-nav-gap: var(--space-1); --yp-family-nav-radius: var(--radius-sm); --yp-family-nav-weight: 500; --yp-family-nav-active-bg: var(--color-neutral-100); --yp-family-nav-active-shadow: none; }
.management-shell[data-navigation-style="minimal"] { --yp-family-navigation: minimal; --yp-family-nav-gap: 0px; --yp-family-nav-radius: 0px; --yp-family-nav-weight: 600; --yp-family-nav-active-bg: transparent; --yp-family-nav-active-shadow: inset 3px 0 0 var(--color-primary); }
.management-shell[data-navigation-style="home"] { --yp-family-navigation: home; --yp-family-nav-gap: var(--space-2); --yp-family-nav-radius: var(--radius-md); --yp-family-nav-weight: 600; --yp-family-nav-active-bg: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface)); --yp-family-nav-active-shadow: none; }
.management-shell[data-navigation-style="ambient"] { --yp-family-navigation: ambient; --yp-family-nav-gap: var(--space-2); --yp-family-nav-radius: var(--radius-md); --yp-family-nav-weight: 500; --yp-family-nav-active-bg: color-mix(in srgb, var(--color-accent) 18%, var(--color-surface)); --yp-family-nav-active-shadow: var(--shadow-card); }
.management-shell[data-navigation-style="compact"] { --yp-family-navigation: compact; --yp-family-nav-gap: 0px; --yp-family-nav-radius: var(--radius-sm); --yp-family-nav-weight: 500; --yp-family-nav-active-bg: var(--color-neutral-100); --yp-family-nav-active-shadow: inset 2px 0 0 var(--color-primary); }
.management-shell[data-navigation-style="command"] { --yp-family-navigation: command; --yp-family-nav-gap: var(--space-1); --yp-family-nav-radius: 0px; --yp-family-nav-weight: 700; --yp-family-nav-active-bg: var(--color-primary); --yp-family-nav-active-shadow: none; }
.management-shell[data-navigation-style="touch"] { --yp-family-navigation: touch; --yp-family-nav-gap: var(--space-2); --yp-family-nav-radius: var(--radius-md); --yp-family-nav-weight: 600; --yp-family-nav-active-bg: var(--color-primary); --yp-family-nav-active-shadow: var(--shadow-card); }
.management-shell[data-navigation-style="technical"] { --yp-family-navigation: technical; --yp-family-nav-gap: 0px; --yp-family-nav-radius: 0px; --yp-family-nav-weight: 600; --yp-family-nav-active-bg: var(--color-neutral-100); --yp-family-nav-active-shadow: inset 3px 0 0 var(--color-primary); }
.management-shell[data-navigation-style="accessible"] { --yp-family-navigation: accessible; --yp-family-nav-gap: var(--space-2); --yp-family-nav-radius: var(--radius-sm); --yp-family-nav-weight: 700; --yp-family-nav-active-bg: var(--color-primary); --yp-family-nav-active-shadow: 0 0 0 2px var(--color-foreground); }
.management-shell[data-navigation-style="gallery"] { --yp-family-navigation: gallery; --yp-family-nav-gap: var(--space-2); --yp-family-nav-radius: 0px; --yp-family-nav-weight: 500; --yp-family-nav-active-bg: transparent; --yp-family-nav-active-shadow: inset 0 -2px 0 var(--color-primary); }

.management-shell .desktop-navigation { gap: var(--yp-family-nav-gap, var(--space-1)); }
.management-shell .desktop-navigation a { border-radius: var(--yp-family-nav-radius, var(--radius-sm)); font-weight: var(--yp-family-nav-weight, 500); }
.management-shell .desktop-navigation a[aria-current="page"] { color: var(--color-heading); background: var(--yp-family-nav-active-bg, var(--color-neutral-100)); box-shadow: var(--yp-family-nav-active-shadow, none); }
.management-shell:is([data-navigation-style="command"], [data-navigation-style="touch"], [data-navigation-style="accessible"]) .desktop-navigation a[aria-current="page"] { color: var(--color-on-primary); }
.management-shell[data-navigation-style="touch"] .desktop-navigation a { min-height: 60px; }
.management-shell[data-navigation-style="accessible"] .desktop-navigation a { min-height: 52px; }

.management-shell[data-collection-style="hybrid"] { --yp-family-collection: hybrid; --yp-family-collection-gap: var(--space-3); --yp-family-card-padding: var(--space-4); }
.management-shell[data-collection-style="list"] { --yp-family-collection: list; --yp-family-collection-gap: 0px; --yp-family-card-padding: 14px 0; }
.management-shell[data-collection-style="cards"] { --yp-family-collection: cards; --yp-family-collection-gap: var(--space-4); --yp-family-card-padding: var(--space-5); }
.management-shell[data-collection-style="dense"] { --yp-family-collection: dense; --yp-family-collection-gap: var(--space-2); --yp-family-card-padding: var(--space-3); }
.management-shell[data-collection-style="tiles"] { --yp-family-collection: tiles; --yp-family-collection-gap: var(--space-3); --yp-family-card-padding: var(--space-4); }

${rule(".management-shell ", selectors.collections, " { gap: var(--yp-family-collection-gap, var(--space-3)); }")}
${rule(".management-shell ", selectors.cards, " { padding: var(--yp-family-card-padding, var(--space-4)); }")}
${rule(".management-shell[data-collection-style=\"list\"] ", selectors.grids, " { grid-template-columns: 1fr; }")}
${rule(".management-shell[data-collection-style=\"list\"] ", selectors.cards, " { border-width: 0 0 1px; border-radius: 0; box-shadow: none; }")}
${rule(".management-shell[data-collection-style=\"cards\"] ", selectors.tileGrids, " { grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); }")}
${rule(".management-shell[data-collection-style=\"dense\"] ", selectors.tileGrids, " { grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); }")}
${rule(".management-shell[data-collection-style=\"tiles\"] ", selectors.grids, " { grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }")}

.management-shell[data-controller-style="balanced"] { --yp-family-controller: balanced; --yp-family-controller-gap: var(--space-4); --yp-family-controller-padding: var(--space-4) 0; --yp-family-controller-bg: transparent; --yp-family-controller-border: var(--color-border); --yp-family-controller-radius: 0px; }
.management-shell[data-controller-style="focused"] { --yp-family-controller: focused; --yp-family-controller-gap: var(--space-5); --yp-family-controller-padding: var(--space-5); --yp-family-controller-bg: var(--color-surface); --yp-family-controller-border: var(--color-primary); --yp-family-controller-radius: var(--radius-md); }
.management-shell[data-controller-style="dense"] { --yp-family-controller: dense; --yp-family-controller-gap: var(--space-2); --yp-family-controller-padding: var(--space-3); --yp-family-controller-bg: var(--color-neutral-100); --yp-family-controller-border: var(--color-border); --yp-family-controller-radius: var(--radius-sm); }
.management-shell[data-controller-style="touch"] { --yp-family-controller: touch; --yp-family-controller-gap: var(--space-5); --yp-family-controller-padding: var(--space-5); --yp-family-controller-bg: var(--color-surface); --yp-family-controller-border: var(--color-border); --yp-family-controller-radius: var(--radius-md); }
.management-shell[data-controller-style="technical"] { --yp-family-controller: technical; --yp-family-controller-gap: var(--space-3); --yp-family-controller-padding: var(--space-4); --yp-family-controller-bg: var(--color-background); --yp-family-controller-border: var(--color-primary); --yp-family-controller-radius: var(--radius-sm); }

.management-shell .device-controller { gap: var(--yp-family-controller-gap, var(--space-4)); padding: var(--yp-family-controller-padding, var(--space-4) 0); border: 1px solid var(--yp-family-controller-border, var(--color-border)); border-radius: var(--yp-family-controller-radius, 0); background: var(--yp-family-controller-bg, transparent); }
.management-shell[data-controller-style="focused"] .device-controller { border-left-width: 3px; }
.management-shell[data-controller-style="touch"] .device-controller :is(button, input, select) { min-height: 52px; }
.management-shell[data-controller-style="technical"] .controller-heading { padding-bottom: var(--space-3); border-bottom: 1px solid var(--color-border); }

.management-shell[data-data-style="calm"] { --yp-family-data: calm; --yp-family-data-font: var(--yp-primitive-font-body); --yp-family-data-weight: 600; }
.management-shell[data-data-style="technical"] { --yp-family-data: technical; --yp-family-data-font: var(--yp-primitive-font-data); --yp-family-data-weight: 600; }
.management-shell[data-data-style="standard"] { --yp-family-data: standard; --yp-family-data-font: var(--yp-primitive-font-body); --yp-family-data-weight: 700; }
.management-shell[data-data-style="high-contrast"] { --yp-family-data: high-contrast; --yp-family-data-font: var(--yp-primitive-font-data); --yp-family-data-weight: 800; }
${rule(".management-shell ", selectors.data, " { font-family: var(--yp-family-data-font, var(--yp-primitive-font-data)); font-weight: var(--yp-family-data-weight, 600); font-variant-numeric: tabular-nums; }")}
${rule(".management-shell[data-data-style=\"technical\"] ", selectors.technicalData, " { font-family: var(--yp-family-data-font); }")}
.management-shell[data-data-style="high-contrast"] :is(small, .page-context) { color: var(--color-foreground); }

.management-shell[data-elevation-style="soft"] { --yp-family-elevation: soft; }
.management-shell[data-elevation-style="flat"] { --yp-family-elevation: flat; }
.management-shell[data-elevation-style="layered"] { --yp-family-elevation: layered; }
.management-shell[data-elevation-style="outlined"] { --yp-family-elevation: outlined; }
`;
}

function recipeSelectors(selected) {
  const values = { frames: [], editors: [], collections: [], cards: [], grids: [], tileGrids: [], data: ["output"], technicalData: [] };
  const add = (key, ...selectors) => values[key].push(...selectors);
  if (selected.has("home.lighting-summary") || selected.has("room.lighting-control")) {
    add("collections", ".device-list"); add("cards", ".light-card"); add("data", ".summary-metrics strong");
  }
  if (selected.has("home.space-summary") || selected.has("room.device-management")) {
    add("collections", ".managed-device-list"); add("cards", ".managed-device-row"); add("grids", ".home-area-grid", ".room-grid");
    add("data", ".space-metrics strong"); add("technicalData", ".device-facts");
  }
  for (const [moduleId, collection, card] of [
    ["device.curtain-control", ".curtain-device-list", ".curtain-card"],
    ["device.switch-control", ".switch-device-list", ".switch-card"],
    ["device.climate-control", ".climate-device-list", ".climate-card"],
  ]) if (selected.has(moduleId)) { add("collections", collection); add("cards", card); }
  if (selected.has("sensor.environment")) {
    add("collections", ".sensor-device-list"); add("cards", ".sensor-card"); add("grids", ".sensor-device-list"); add("tileGrids", ".sensor-device-list"); add("data", ".sensor-reading strong");
  }
  if (selected.has("scene.launcher")) {
    add("frames", ".scene-editor"); add("editors", ".scene-editor"); add("collections", ".scene-grid"); add("cards", ".scene-card"); add("grids", ".scene-grid", ".home-scene-list"); add("tileGrids", ".scene-grid");
  }
  if (selected.has("automation.manager")) { add("frames", ".automation-editor"); add("editors", ".automation-editor"); add("cards", ".automation-row"); }
  if (selected.has("group.manager")) add("frames", ".group-workspace");
  if (selected.has("gateway.overview")) {
    add("frames", ".gateway-detail"); add("collections", ".gateway-list"); add("cards", ".gateway-card"); add("grids", ".gateway-list"); add("tileGrids", ".gateway-list");
    add("data", ".gateway-stats strong"); add("technicalData", ".gateway-facts");
  }
  if (selected.has("panel.manager")) {
    add("frames", ".knob-detail"); add("collections", ".panel-grid", ".knob-grid"); add("cards", ".panel-card", ".knob-card");
    add("grids", ".panel-grid", ".knob-grid"); add("tileGrids", ".panel-grid", ".knob-grid");
  }
  if (selected.has("installer.maintenance")) { add("data", ".installer-table td"); add("technicalData", ".installer-table"); }
  return values;
}
