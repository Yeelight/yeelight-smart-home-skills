import { loadThemeCatalog } from "./theme-catalog.mjs";
import { normalizeThemeSpec } from "./theme-spec.mjs";

const productFields = new Set(["schemaVersion", "product", "target", "scope", "modules", "deviceFamilies", "theme", "runtime", "diagnostics"]);
const navigationByFormFactor = { desktop: "sidebar", tablet: "adaptive-rail", mobile: "bottom-tabs", wall: "touch-rail" };

export function migrateLegacyTheme(theme, density = "comfortable", options = {}) {
  const catalog = options.catalog || loadThemeCatalog();
  const pack = catalog.legacyPacks.find(({ id }) => id === theme?.pack);
  if (!pack) throw new Error(`未知旧主题：${theme?.pack || "未指定"}`);
  const palette = catalog.legacyAliases.palettes?.[theme?.palette];
  if (!palette) throw new Error(`未知旧色板：${theme?.palette || "未指定"}`);
  const mode = theme.mode || "light";
  if (mode === "auto" ? pack.modes.length < 2 : !pack.modes.includes(mode)) throw new Error(`旧主题 ${pack.id} 不支持 ${mode} 模式`);
  const preset = catalog.legacyAliases.packs?.[pack.id];
  const spec = normalizeThemeSpec({ schemaVersion: 1, preset, mode, density, colors: palette }, { catalog });
  return {
    spec,
    inputSource: "legacy",
    diagnostics: [{ code: "legacy-theme-migrated", pack: pack.id, palette: theme.palette, preset }],
  };
}

export function normalizeProductSpec(input, options = {}) {
  assertProductRoot(input);
  if (input.schemaVersion === 3) return migrateProductSpecV3(input, options);
  if (input.schemaVersion !== 4) throw new Error(`不支持的 ProductSpec 版本：${input.schemaVersion || "missing"}`);
  validateCommonProductSpec(input);
  assertFields(input.target, new Set(["formFactor", "navigation"]), "ProductSpec target");
  validateTarget(input.target.formFactor, input.target.navigation);
  const theme = normalizeThemeSpec(input.theme, options);
  return { ...structuredClone(input), theme };
}

export function themeInputSourceFromProductSpec(spec) {
  const diagnostics = Array.isArray(spec?.diagnostics) ? spec.diagnostics : [];
  return diagnostics.findLast?.(({ code }) => code === "theme-input-resolved")?.source
    || (diagnostics.some(({ code }) => code === "product-spec-v3-migrated") ? "legacy" : "inferred");
}

function migrateProductSpecV3(input, options) {
  validateCommonProductSpec(input);
  assertFields(input.target, new Set(["formFactor", "navigation", "density"]), "ProductSpec v3 target");
  const expectedNavigation = navigationByFormFactor[input.target.formFactor];
  if (!expectedNavigation) throw new Error(`未知目标形态：${input.target.formFactor || "未指定"}`);
  const theme = migrateLegacyTheme(input.theme, input.target.density, options);
  const diagnostics = [...structuredClone(input.diagnostics), ...theme.diagnostics, { code: "product-spec-v3-migrated", from: 3, to: 4 }];
  if (input.target.navigation !== expectedNavigation) diagnostics.push({ code: "legacy-navigation-migrated", from: input.target.navigation, to: expectedNavigation });
  return {
    schemaVersion: 4,
    product: structuredClone(input.product),
    target: { formFactor: input.target.formFactor, navigation: expectedNavigation },
    scope: structuredClone(input.scope),
    modules: structuredClone(input.modules),
    deviceFamilies: structuredClone(input.deviceFamilies),
    theme: theme.spec,
    runtime: structuredClone(input.runtime),
    diagnostics,
  };
}

function assertProductRoot(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("ProductSpec 必须是对象");
  assertFields(input, productFields, "ProductSpec");
}

function validateCommonProductSpec(input) {
  assertFields(input.product, new Set(["name", "title", "locale"]), "ProductSpec product");
  assertFields(input.scope, new Set(["homeIds", "roomNames", "includeAllRooms"]), "ProductSpec scope");
  assertFields(input.runtime, new Set(["contractVersion", "dataMode", "bridgeMode"]), "ProductSpec runtime");
  if (!input.product.name || !input.product.title || input.product.locale !== "zh-CN") throw new Error("ProductSpec product 无效");
  if (!Array.isArray(input.modules) || input.modules.length === 0) throw new Error("ProductSpec requires modules");
  if (!Array.isArray(input.deviceFamilies) || !Array.isArray(input.scope.homeIds) || !Array.isArray(input.scope.roomNames) || typeof input.scope.includeAllRooms !== "boolean") throw new Error("ProductSpec scope 无效");
  if (input.runtime.contractVersion !== "1.0" || input.runtime.bridgeMode !== "local" || !["live", "mock"].includes(input.runtime.dataMode)) throw new Error("ProductSpec runtime 无效");
  if (!Array.isArray(input.diagnostics)) throw new Error("ProductSpec diagnostics 无效");
}

function validateTarget(formFactor, navigation) {
  const expected = navigationByFormFactor[formFactor];
  if (!expected) throw new Error(`未知目标形态：${formFactor || "未指定"}`);
  if (navigation !== expected) throw new Error(`目标形态 ${formFactor} 必须使用 ${expected} 导航`);
}

function assertFields(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} 必须是对象`);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`${label} 包含未知字段：${unknown.join(", ")}`);
}
