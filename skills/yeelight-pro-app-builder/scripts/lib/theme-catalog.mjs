import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultThemeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets/themes");
const catalogFiles = {
  families: "families.json",
  presets: "presets.json",
  typography: "typography.json",
  densities: "densities.json",
  shapes: "shapes.json",
  motions: "motions.json",
  targets: "targets.json",
  legacyAliases: "legacy-aliases.json",
  legacyPacks: "packs.json",
  legacyPalettes: "palettes.json",
};
const recipeKeys = ["collectionStyle", "controllerStyle", "dataStyle", "elevationStyle", "navigationStyle", "surfaceStyle"];

export function loadThemeCatalog(themeRoot = defaultThemeRoot) {
  const sources = Object.fromEntries(Object.entries(catalogFiles).map(([key, file]) => [key, readJSON(path.join(themeRoot, file))]));
  const catalog = {
    catalogVersion: sources.families.catalogVersion,
    families: sources.families.families,
    presets: sources.presets.presets,
    typography: sources.typography.typography,
    densities: sources.densities.densities,
    shapes: sources.shapes.shapes,
    motions: sources.motions.motions,
    targets: sources.targets.targets,
    legacyAliases: sources.legacyAliases,
    legacyPacks: sources.legacyPacks.packs,
    legacyPalettes: sources.legacyPalettes.palettes,
  };
  validateThemeCatalog(catalog, sources);
  return structuredClone(catalog);
}

export function validateThemeCatalog(catalog, sources = {}) {
  if (catalog.catalogVersion !== "2.0.0") throw new Error(`主题目录版本无效：${catalog.catalogVersion || "missing"}`);
  for (const [name, source] of Object.entries(sources)) {
    if (source.catalogVersion && source.catalogVersion !== catalog.catalogVersion) throw new Error(`主题目录版本不一致：${name}`);
  }
  assertUniqueCount(catalog.families, 12, "结构家族");
  assertUniqueCount(catalog.presets, 24, "主题预设");
  assertUniqueCount(catalog.typography, 4, "字体方案");
  assertUniqueCount(catalog.densities, 3, "密度方案");
  assertUniqueCount(catalog.shapes, 4, "形状方案");
  assertUniqueCount(catalog.motions, 4, "动效方案");
  assertUniqueCount(catalog.targets, 5, "目标画像");

  const dimensions = {
    typography: ids(catalog.typography), density: ids(catalog.densities),
    shape: ids(catalog.shapes), motion: ids(catalog.motions), target: ids(catalog.targets),
  };
  for (const family of catalog.families) {
    if (!family.name || !family.recipe || Object.keys(family.recipe).sort().join("|") !== recipeKeys.join("|")) {
      throw new Error(`主题家族 recipe 不完整：${family.id || "missing"}`);
    }
    if (Object.values(family.recipe).some((value) => typeof value !== "string" || !value)) throw new Error(`主题家族 recipe 值无效：${family.id}`);
    const variants = catalog.presets.filter(({ familyId }) => familyId === family.id);
    if (variants.length !== 2) throw new Error(`主题家族必须恰好包含两个预设：${family.id}`);
    if (sameNonColorDefaults(variants[0], variants[1])) throw new Error(`同家族主题不能只更换颜色：${family.id}`);
  }
  const familyIds = ids(catalog.families);
  for (const preset of catalog.presets) {
    if (!familyIds.has(preset.familyId) || !preset.name || !preset.description) throw new Error(`主题预设元数据不完整：${preset.id || "missing"}`);
    if (!Array.isArray(preset.targets) || preset.targets.length === 0 || preset.targets.some((id) => !dimensions.target.has(id))) throw new Error(`主题预设 target 无效：${preset.id}`);
    if (!Array.isArray(preset.supportedModes) || !preset.supportedModes.includes(preset.defaults?.mode)) throw new Error(`主题预设 mode 无效：${preset.id}`);
    for (const field of ["typography", "density", "shape", "motion"]) {
      if (!dimensions[field].has(preset.defaults?.[field])) throw new Error(`主题预设 ${preset.id} 引用了未知 ${field}`);
    }
    if (!isHex(preset.defaults?.colors?.brand) || !isHex(preset.defaults?.colors?.accent)) throw new Error(`主题预设颜色无效：${preset.id}`);
    if (!catalog.legacyPacks.some(({ id }) => id === preset.legacyPack) || !catalog.legacyPalettes.some(({ id }) => id === preset.legacyPalette)) {
      throw new Error(`主题预设兼容映射无效：${preset.id}`);
    }
  }
  for (const [legacy, preset] of Object.entries(catalog.legacyAliases.packs || {})) {
    if (!catalog.legacyPacks.some(({ id }) => id === legacy) || !catalog.presets.some(({ id }) => id === preset)) throw new Error(`旧主题 alias 无效：${legacy}`);
  }
  for (const [legacy, colors] of Object.entries(catalog.legacyAliases.palettes || {})) {
    if (!catalog.legacyPalettes.some(({ id }) => id === legacy) || !isHex(colors.brand) || !isHex(colors.accent)) throw new Error(`旧色板 alias 无效：${legacy}`);
  }
  return catalog;
}

function assertUniqueCount(values, count, label) {
  if (!Array.isArray(values) || values.length !== count) throw new Error(`${label}数量必须为 ${count}`);
  if (ids(values).size !== values.length || values.some(({ id }) => !id)) throw new Error(`${label} ID 必须唯一且非空`);
}

function sameNonColorDefaults(left, right) {
  const project = ({ defaults }) => [defaults.mode, defaults.density, defaults.typography, defaults.shape, defaults.motion];
  return JSON.stringify(project(left)) === JSON.stringify(project(right));
}

function ids(values) { return new Set(values.map(({ id }) => id)); }
function isHex(value) { return /^#[0-9A-F]{6}$/i.test(String(value || "")); }
function readJSON(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
