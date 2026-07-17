import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadThemeCatalog } from "./theme-catalog.mjs";
import { migrateLegacyTheme, normalizeProductSpec, themeInputSourceFromProductSpec } from "./theme-migration.mjs";
import { normalizeThemeSpec } from "./theme-spec.mjs";
import { compileThemeTokens } from "./theme-token-compiler.mjs";

const themeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets/themes");
const packs = load("packs.json").packs;
const palettes = load("palettes.json").palettes;
const densities = load("densities.json").densities;
const catalog = loadThemeCatalog();

export function resolveTheme(theme = {}, densityId = "comfortable") {
  const normalized = theme.preset
    ? normalizeThemeSpec(theme, { catalog })
    : migrateLegacyTheme(theme, densityId, { catalog }).spec;
  const preset = catalog.presets.find((item) => item.id === normalized.preset);
  const family = catalog.families.find((item) => item.id === preset.familyId);
  const shape = catalog.shapes.find((item) => item.id === normalized.shape);
  const pack = packs.find((item) => item.id === preset.legacyPack);
  if (!pack) throw new Error(`未知主题：${theme.pack || "未指定"}`);
  const paletteSource = palettes.find((item) => item.id === preset.legacyPalette);
  if (!paletteSource) throw new Error(`未知兼容色板：${preset.legacyPalette}`);
  const palette = withThemeColors(paletteSource, normalized.colors);
  const density = densities.find((item) => item.id === normalized.density);
  if (!density) throw new Error(`未知密度：${normalized.density || "未指定"}`);
  return {
    pack: { ...pack, radius: shape.radius, motion: normalized.motion },
    palette,
    mode: normalized.mode,
    density,
    preset,
    family,
    normalized,
  };
}

export function themeCssSource(spec) {
  const normalizedSpec = normalizeProductSpec(spec);
  return compileThemeTokens(normalizedSpec.theme, { inputSource: themeInputSourceFromProductSpec(normalizedSpec) }).css;
}

function withThemeColors(palette, colors) {
  const known = Object.values(catalog.legacyAliases.palettes).some((candidate) => candidate.brand === colors.brand && candidate.accent === colors.accent);
  if (known) {
    const id = Object.entries(catalog.legacyAliases.palettes).find(([, candidate]) => candidate.brand === colors.brand && candidate.accent === colors.accent)?.[0];
    return structuredClone(palettes.find((item) => item.id === id) || palette);
  }
  return {
    ...structuredClone(palette),
    light: { ...palette.light, primary: colors.brand, accent: colors.accent },
  };
}

function load(fileName) {
  return JSON.parse(fs.readFileSync(path.join(themeRoot, fileName), "utf8"));
}
