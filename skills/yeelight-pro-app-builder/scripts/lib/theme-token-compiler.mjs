import crypto from "node:crypto";

import { accessibleForeground, deriveAccessibleColor } from "./theme-color-engine.mjs";
import { loadThemeCatalog } from "./theme-catalog.mjs";
import { normalizeThemeSpec } from "./theme-spec.mjs";

export function compileThemeTokens(input, options = {}) {
  const catalog = options.catalog || loadThemeCatalog();
  const normalizedSpec = normalizeThemeSpec(input, { catalog });
  const preset = catalog.presets.find(({ id }) => id === normalizedSpec.preset);
  const family = catalog.families.find(({ id }) => id === preset.familyId);
  const density = catalog.densities.find(({ id }) => id === normalizedSpec.density);
  const typography = catalog.typography.find(({ id }) => id === normalizedSpec.typography);
  const shape = catalog.shapes.find(({ id }) => id === normalizedSpec.shape);
  const motion = catalog.motions.find(({ id }) => id === normalizedSpec.motion);
  const palette = catalog.legacyPalettes.find(({ id }) => id === preset.legacyPalette);
  const light = compileMode({ normalizedSpec, colors: palette.light, density, typography, shape, motion, family, mode: "light" });
  const dark = compileMode({ normalizedSpec, colors: palette.dark, density, typography, shape, motion, family, mode: "dark" });
  const adjustments = [...light.adjustments, ...dark.adjustments];
  const sourceDigests = sourceDigestsFor(catalog);
  const lockBase = {
    schemaVersion: 1,
    catalogVersion: catalog.catalogVersion,
    inputSource: options.inputSource || "inferred",
    normalizedSpec,
    familyId: family.id,
    familyRecipe: family.recipe,
    resolvedLightTokens: light.tokens,
    resolvedDarkTokens: dark.tokens,
    adjustments,
    sourceDigests,
  };
  const lock = { ...lockBase, resolvedDigest: digest(lockBase) };
  return { lock, css: cssSource(lock, preset) };
}

export function themeManifestFromLock(lock) {
  return {
    preset: lock.normalizedSpec.preset,
    familyId: lock.familyId,
    catalogVersion: lock.catalogVersion,
    inputSource: lock.inputSource,
    sourceDigests: lock.sourceDigests,
    resolvedDigest: lock.resolvedDigest,
  };
}

function compileMode({ normalizedSpec, colors, density, typography, shape, motion, family, mode }) {
  const action = deriveAccessibleColor(normalizedSpec.colors.brand, colors.surface, { minimumRatio: 4.5, role: `${mode}.action` });
  const accent = deriveAccessibleColor(normalizedSpec.colors.accent, colors.surface, { minimumRatio: 3, role: `${mode}.accent` });
  const onAction = accessibleForeground(action.resolved);
  const adjustments = [action, accent].filter(({ reason }) => reason === "contrast-adjusted");
  const warning = mode === "dark" ? "#F2B95F" : "#8A5A14";
  const error = mode === "dark" ? "#FF8A80" : "#B42318";
  const success = mode === "dark" ? "#72D6B2" : "#176B4D";
  const shadows = elevationTokens(family.recipe.elevationStyle, mode, colors.border);
  return {
    adjustments,
    tokens: {
      "--yp-primitive-brand-source": normalizedSpec.colors.brand,
      "--yp-primitive-accent-source": normalizedSpec.colors.accent,
      "--yp-primitive-space-1": "4px",
      "--yp-primitive-space-2": "8px",
      "--yp-primitive-space-3": `${density.componentGap}px`,
      "--yp-primitive-space-4": "16px",
      "--yp-primitive-space-6": `${density.sectionGap}px`,
      "--yp-primitive-radius-sm": `${Math.max(2, shape.radius - 2)}px`,
      "--yp-primitive-radius-md": `${shape.radius}px`,
      "--yp-primitive-duration-fast": `${motion.fastMs}ms`,
      "--yp-primitive-duration-standard": `${motion.standardMs}ms`,
      "--yp-primitive-font-body": typography.body,
      "--yp-primitive-font-heading": typography.heading,
      "--yp-primitive-font-data": typography.data,
      "--yp-semantic-page": colors.background,
      "--yp-semantic-surface": colors.surface,
      "--yp-semantic-text": colors.text,
      "--yp-semantic-text-muted": colors.muted,
      "--yp-semantic-border": colors.border,
      "--yp-semantic-action": action.resolved,
      "--yp-semantic-accent": accent.resolved,
      "--yp-semantic-on-action": onAction.resolved,
      "--yp-semantic-focus": accent.resolved,
      "--yp-semantic-warning": warning,
      "--yp-semantic-error": error,
      "--yp-semantic-success": success,
      "--yp-semantic-overlay": mode === "dark" ? "rgb(0 0 0 / 0.64)" : "rgb(0 0 0 / 0.48)",
      "--yp-semantic-overlay-soft": mode === "dark" ? "rgb(0 0 0 / 0.48)" : "rgb(8 20 24 / 0.42)",
      "--yp-semantic-overlay-strong": mode === "dark" ? "rgb(0 0 0 / 0.72)" : "rgb(8 20 24 / 0.56)",
      "--yp-component-control-min-height": `${density.controlMinHeight}px`,
      "--yp-component-shell-gutter": `${density.shellGutter}px`,
      "--yp-component-card-background": colors.surface,
      "--yp-component-card-border": colors.border,
      "--yp-component-button-background": action.resolved,
      "--yp-component-button-foreground": onAction.resolved,
      "--yp-component-input-background": colors.surface,
      "--yp-component-input-border": colors.border,
      "--yp-component-dialog-background": colors.surface,
      "--yp-component-shadow-card": shadows.card,
      "--yp-component-shadow-overlay": shadows.overlay,
      "--yp-component-shadow-inset-border": `inset 0 0 0 1px ${colors.border}`,
      "--yp-component-shadow-focus": `0 0 0 3px color-mix(in srgb, ${accent.resolved} 32%, transparent)`,
      "--yp-component-shadow-focus-subtle": `0 0 0 3px color-mix(in srgb, ${accent.resolved} 15%, transparent)`,
      "--yp-component-shadow-toggle-thumb": mode === "dark" ? "0 2px 8px rgb(0 0 0 / 0.44)" : "0 2px 8px rgb(20 35 40 / 0.18)",
      "--yp-component-shadow-light-glow": `0 0 20px color-mix(in srgb, ${warning} 34%, transparent)`,
      "--yp-component-shadow-summary": `0 12px 30px color-mix(in srgb, ${action.resolved} 18%, transparent)`,
      "--yp-component-shadow-curtain-left": "inset -10px 0 var(--color-neutral-100)",
      "--yp-component-shadow-curtain-right": "inset 10px 0 var(--color-neutral-100)",
      "--yp-component-shadow-curtain-opening": mode === "dark" ? "inset 0 12px 28px rgb(0 0 0 / 0.2)" : "inset 0 12px 28px rgb(25 54 60 / 0.06)",
      "--yp-component-shadow-selection": `inset 3px 0 0 ${action.resolved}`,
      "--yp-component-summary-border": `color-mix(in srgb, ${action.resolved} 20%, transparent)`,
      "--yp-component-summary-muted": `color-mix(in srgb, ${onAction.resolved} 80%, transparent)`,
      "--yp-component-color-swatch-1": "#FFB547",
      "--yp-component-color-swatch-2": "#FFD166",
      "--yp-component-color-swatch-3": "#FFF1C1",
      "--yp-component-color-swatch-4": "#FFFFFF",
      "--yp-component-color-swatch-5": "#8ED8FF",
      "--yp-component-color-swatch-6": "#4D96FF",
      "--yp-component-color-swatch-7": "#8B5CF6",
      "--yp-component-color-swatch-8": "#FF6B8A",
    },
  };
}

function elevationTokens(style, mode, border) {
  const dark = mode === "dark";
  const values = {
    flat: { card: "none", overlay: dark ? "0 18px 48px rgb(0 0 0 / 0.46)" : "0 18px 48px rgb(20 35 40 / 0.18)" },
    outlined: { card: `0 0 0 1px ${border}`, overlay: dark ? "0 20px 52px rgb(0 0 0 / 0.5)" : "0 20px 52px rgb(20 35 40 / 0.2)" },
    soft: { card: dark ? "0 8px 20px rgb(0 0 0 / 0.28)" : "0 8px 24px rgb(25 54 60 / 0.07)", overlay: dark ? "0 24px 64px rgb(0 0 0 / 0.52)" : "0 20px 60px rgb(10 25 29 / 0.22)" },
    layered: { card: dark ? "0 12px 28px rgb(0 0 0 / 0.38)" : "0 10px 28px rgb(25 54 60 / 0.11)", overlay: dark ? "0 28px 72px rgb(0 0 0 / 0.58)" : "0 24px 64px rgb(10 25 29 / 0.24)" },
  };
  return values[style] || values.soft;
}

function cssSource(lock, preset) {
  const light = block(lock.resolvedLightTokens, legacyAliases(lock.resolvedLightTokens, lock, preset));
  const dark = block(lock.resolvedDarkTokens, legacyAliases(lock.resolvedDarkTokens, lock, preset));
  if (lock.normalizedSpec.mode === "dark") return `/* PRIMITIVE TOKENS / SEMANTIC TOKENS / COMPONENT TOKENS */\n:root { ${dark} }`;
  if (lock.normalizedSpec.mode === "light") return `/* PRIMITIVE TOKENS / SEMANTIC TOKENS / COMPONENT TOKENS */\n:root { ${light} }`;
  return `/* PRIMITIVE TOKENS / SEMANTIC TOKENS / COMPONENT TOKENS */\n:root { color-scheme: light dark; ${light} }\n@media (prefers-color-scheme: dark) { :root { ${dark} } }`;
}

function legacyAliases(tokens, lock, preset) {
  return {
    "--theme-preset": `"${preset.id}"`, "--theme-family": `"${lock.familyId}"`, "--theme-pack": `"${preset.legacyPack}"`,
    "--theme-mode": `"${lock.normalizedSpec.mode}"`, "--density-pack": `"${lock.normalizedSpec.density}"`,
    "--color-white": "#FFFFFF", "--color-background": "var(--yp-semantic-page)", "--color-surface": "var(--yp-semantic-surface)",
    "--color-foreground": "var(--yp-semantic-text)", "--color-heading": "var(--yp-semantic-text)", "--color-muted": "var(--yp-semantic-text-muted)",
    "--color-primary": "var(--yp-semantic-action)", "--color-accent": "var(--yp-semantic-accent)", "--color-border": "var(--yp-semantic-border)",
    "--color-on-primary": "var(--yp-semantic-on-action)", "--color-warning": "var(--yp-semantic-warning)", "--color-error": "var(--yp-semantic-error)",
    "--color-warning-bg": `color-mix(in srgb, ${tokens["--yp-semantic-warning"]} 14%, var(--yp-semantic-surface))`,
    "--color-error-bg": `color-mix(in srgb, ${tokens["--yp-semantic-error"]} 14%, var(--yp-semantic-surface))`,
    "--color-neutral-100": "color-mix(in srgb, var(--yp-semantic-text) 7%, var(--yp-semantic-surface))",
    "--color-neutral-200": "color-mix(in srgb, var(--yp-semantic-text) 14%, var(--yp-semantic-surface))",
    "--color-amber-050": "var(--color-warning-bg)", "--color-amber-100": "color-mix(in srgb, var(--yp-semantic-warning) 24%, var(--yp-semantic-surface))",
    "--color-amber-700": "var(--yp-semantic-warning)", "--color-red-050": "var(--color-error-bg)", "--color-red-700": "var(--yp-semantic-error)",
    "--space-1": "var(--yp-primitive-space-1)", "--space-2": "var(--yp-primitive-space-2)", "--space-3": "var(--yp-primitive-space-3)",
    "--space-4": "var(--yp-primitive-space-4)", "--space-5": "20px", "--space-6": "var(--yp-primitive-space-6)", "--space-7": "28px",
    "--shell-gutter": "var(--yp-component-shell-gutter)", "--control-min-height": "var(--yp-component-control-min-height)",
    "--radius-sm": "var(--yp-primitive-radius-sm)", "--radius-md": "var(--yp-primitive-radius-md)", "--duration-fast": "var(--yp-primitive-duration-fast)",
    "--shadow-card": "var(--yp-component-shadow-card)", "--shadow-overlay": "var(--yp-component-shadow-overlay)",
    "--shadow-inset-border": "var(--yp-component-shadow-inset-border)", "--shadow-focus": "var(--yp-component-shadow-focus)",
    "--focus-ring": "color-mix(in srgb, var(--yp-semantic-focus) 32%, transparent)", "--card-bg": "var(--yp-component-card-background)",
    "--card-border": "var(--yp-component-card-border)", "--card-radius": "var(--yp-primitive-radius-md)", "--button-bg": "var(--yp-component-button-background)",
    "--button-fg": "var(--yp-component-button-foreground)", "--button-radius": "var(--yp-primitive-radius-md)", "--input-bg": "var(--yp-component-input-background)",
    "--input-border": "var(--yp-component-input-border)", "--nav-bg": "color-mix(in srgb, var(--yp-semantic-surface) 96%, transparent)",
  };
}

function block(tokens, aliases) { return Object.entries({ ...tokens, ...aliases }).map(([key, value]) => `${key}: ${value};`).join(" "); }
function sourceDigestsFor(catalog) { return Object.fromEntries(["families", "presets", "typography", "densities", "shapes", "motions", "targets", "legacyAliases"].map((key) => [key, digest(catalog[key])])); }
function digest(value) { return crypto.createHash("sha256").update(stableStringify(value)).digest("hex"); }
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
