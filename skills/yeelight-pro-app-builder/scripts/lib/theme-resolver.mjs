import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const themeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets/themes");
const packs = load("packs.json").packs;
const palettes = load("palettes.json").palettes;
const densities = load("densities.json").densities;

export function resolveTheme(theme = {}, densityId = "comfortable") {
  const pack = packs.find((item) => item.id === theme.pack);
  if (!pack) throw new Error(`未知主题：${theme.pack || "未指定"}`);
  const palette = palettes.find((item) => item.id === theme.palette);
  if (!palette) throw new Error(`未知色板：${theme.palette || "未指定"}`);
  const mode = theme.mode || "light";
  if (mode === "auto" ? pack.modes.length < 2 : !pack.modes.includes(mode)) {
    throw new Error(`主题 ${pack.id} 不支持 ${mode} 模式`);
  }
  const density = densities.find((item) => item.id === densityId);
  if (!density) throw new Error(`未知密度：${densityId || "未指定"}`);
  return { pack, palette, mode, density };
}

export function themeCssSource(spec) {
  const resolved = resolveTheme(spec.theme, spec.target.density);
  const light = tokenBlock(resolved, resolved.mode === "dark" ? "dark" : "light");
  const automatic = resolved.mode === "auto" ? `\n@media (prefers-color-scheme: dark) { :root { ${semanticTokens(resolved.palette.dark)} } }` : "";
  return `/* PRIMITIVE TOKENS / SEMANTIC TOKENS / COMPONENT TOKENS */\n:root { ${light} }${automatic}`;
}

function tokenBlock({ pack, palette, mode, density }, colorMode) {
  const colors = palette[colorMode];
  const shadow = pack.surface === "dense-console" ? "0 8px 20px rgb(0 0 0 / 0.28)" : pack.surface === "high-contrast" ? "0 2px 0 rgb(0 0 0 / 0.2)" : pack.surface === "material-soft" ? "0 10px 28px rgb(74 52 28 / 0.1)" : "0 8px 24px rgb(25 54 60 / 0.07)";
  const warning = colorMode === "dark"
    ? { background: `color-mix(in srgb, #f2b95f 16%, ${colors.surface})`, soft: `color-mix(in srgb, #f2b95f 24%, ${colors.surface})`, foreground: "#f2b95f" }
    : { background: "#fff8e8", soft: "#fff3b0", foreground: "#8a5a14" };
  const error = colorMode === "dark"
    ? { background: `color-mix(in srgb, #ff8a80 14%, ${colors.surface})`, foreground: "#ff8a80" }
    : { background: "#fff1f0", foreground: "#b42318" };
  return `--theme-pack: "${pack.id}"; --theme-mode: "${mode}"; --density-pack: "${density.id}"; --color-white: #ffffff; --color-on-primary: ${colorMode === "dark" ? colors.background : "#ffffff"}; --color-neutral-100: color-mix(in srgb, ${colors.text} 7%, ${colors.surface}); --color-neutral-200: color-mix(in srgb, ${colors.text} 14%, ${colors.surface}); --color-amber-050: ${warning.background}; --color-amber-100: ${warning.soft}; --color-amber-700: ${warning.foreground}; --color-red-050: ${error.background}; --color-red-700: ${error.foreground}; --space-1: 4px; --space-2: 8px; --space-3: ${density.componentGap}px; --space-4: 16px; --space-5: 20px; --space-6: ${density.sectionGap}px; --space-7: 28px; --shell-gutter: ${density.shellGutter}px; --control-min-height: ${density.controlMinHeight}px; --radius-sm: ${Math.max(2, pack.radius - 2)}px; --radius-md: ${pack.radius}px; --shadow-card: ${shadow}; --duration-fast: ${pack.motion === "reduced" ? 120 : 180}ms; ${semanticTokens(colors)} --color-warning-bg: var(--color-amber-050); --color-warning: var(--color-amber-700); --color-error-bg: var(--color-red-050); --color-error: var(--color-red-700); --focus-ring: color-mix(in srgb, var(--color-primary) 32%, transparent); --card-bg: var(--color-surface); --card-border: var(--color-border); --card-radius: var(--radius-md); --button-bg: var(--color-primary); --button-fg: var(--color-on-primary); --button-radius: var(--radius-md); --input-bg: var(--color-surface); --input-border: var(--color-border); --nav-bg: color-mix(in srgb, var(--color-surface) 96%, transparent);`;
}

function semanticTokens(colors) {
  return `--color-background: ${colors.background}; --color-surface: ${colors.surface}; --color-foreground: ${colors.text}; --color-heading: ${colors.text}; --color-muted: ${colors.muted}; --color-primary: ${colors.primary}; --color-accent: ${colors.accent}; --color-border: ${colors.border};`;
}

function load(fileName) {
  return JSON.parse(fs.readFileSync(path.join(themeRoot, fileName), "utf8"));
}
