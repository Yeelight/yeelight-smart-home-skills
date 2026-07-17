import fs from "node:fs";
import { TextDecoder } from "node:util";

import { loadThemeCatalog } from "./theme-catalog.mjs";

const maxThemeFileBytes = 64 * 1024;
const rootFields = new Set(["schemaVersion", "preset", "mode", "density", "colors", "typography", "shape", "motion"]);
const colorFields = new Set(["brand", "accent"]);
const sourceOrder = ["inferred", "agent", "file", "flags"];

export function normalizeThemeSpec(input, options = {}) {
  const catalog = options.catalog || loadThemeCatalog();
  assertPlainObject(input, "ThemeSpec 必须是对象");
  assertKnownFields(input, rootFields, "ThemeSpec");
  if (input.schemaVersion !== 1) throw new Error("ThemeSpec schemaVersion 必须为 1");
  if (input.colors !== undefined) {
    assertPlainObject(input.colors, "ThemeSpec colors 必须是对象");
    assertKnownFields(input.colors, colorFields, "ThemeSpec colors");
  }

  const preset = catalog.presets.find(({ id }) => id === input.preset);
  if (!preset) throw new Error(`未知主题预设：${input.preset || "未指定"}`);
  const defaults = preset.defaults;
  const mode = input.mode ?? defaults.mode;
  if (!preset.supportedModes.includes(mode)) throw new Error(`主题 ${preset.id} 不支持 ${mode} 模式`);
  if (options.targetId && !preset.targets.includes(options.targetId)) throw new Error(`主题 ${preset.id} 不支持目标 ${options.targetId}`);

  const result = {
    schemaVersion: 1,
    preset: preset.id,
    mode,
    density: dimension(input.density ?? defaults.density, catalog.densities, "密度"),
    colors: {
      brand: color(input.colors?.brand ?? defaults.colors.brand, "品牌颜色"),
      accent: color(input.colors?.accent ?? defaults.colors.accent, "强调颜色"),
    },
    typography: dimension(input.typography ?? defaults.typography, catalog.typography, "字体方案"),
    shape: dimension(input.shape ?? defaults.shape, catalog.shapes, "形状方案"),
    motion: dimension(input.motion ?? defaults.motion, catalog.motions, "动效方案"),
  };
  return result;
}

export function loadThemeSpecFile(filePath, options = {}) {
  const file = String(filePath || "");
  let stat;
  try { stat = fs.lstatSync(file); } catch { throw new Error(`ThemeSpec 文件不存在：${file || "未指定"}`); }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("ThemeSpec 必须是普通文件");
  if (stat.size > maxThemeFileBytes) throw new Error("ThemeSpec 文件不得超过 64 KiB");
  let source;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(file)); } catch { throw new Error("ThemeSpec 必须是有效 UTF-8"); }
  let parsed;
  try { parsed = JSON.parse(source); } catch (error) { throw new Error(`ThemeSpec JSON 无效：${error.message}`); }
  return normalizeThemeSpec(parsed, options);
}

export function mergeThemeSources(sources = {}, options = {}) {
  const catalog = options.catalog || loadThemeCatalog();
  const merged = { schemaVersion: 1, preset: "pro-daylight" };
  const owners = new Map([["preset", "default"]]);
  const diagnostics = [];
  let inputSource = "default";

  for (const sourceId of sourceOrder) {
    const fragment = sources[sourceId];
    if (!fragment || Object.keys(fragment).length === 0) continue;
    validateFragment(fragment, sourceId);
    inputSource = sourceId;
    for (const [field, value] of Object.entries(fragment)) {
      if (field === "schemaVersion") continue;
      if (field === "colors") {
        merged.colors ||= {};
        for (const [colorId, colorValue] of Object.entries(value)) assign(`${field}.${colorId}`, colorValue, sourceId, merged.colors, colorId, owners, diagnostics);
      } else assign(field, value, sourceId, merged, field, owners, diagnostics);
    }
  }
  return { spec: normalizeThemeSpec(merged, { ...options, catalog }), inputSource, diagnostics };
}

function validateFragment(fragment, sourceId) {
  assertPlainObject(fragment, `主题来源 ${sourceId} 必须是对象`);
  assertKnownFields(fragment, rootFields, `主题来源 ${sourceId}`);
  if (fragment.schemaVersion !== undefined && fragment.schemaVersion !== 1) throw new Error(`主题来源 ${sourceId} 版本无效`);
  if (fragment.colors !== undefined) {
    assertPlainObject(fragment.colors, `主题来源 ${sourceId} colors 必须是对象`);
    assertKnownFields(fragment.colors, colorFields, `主题来源 ${sourceId} colors`);
  }
}

function assign(path, value, sourceId, target, key, owners, diagnostics) {
  const previous = owners.get(path);
  if (previous && JSON.stringify(target[key]) !== JSON.stringify(value)) diagnostics.push({ code: "theme-field-overridden", field: path, previousSource: previous, source: sourceId });
  target[key] = value;
  owners.set(path, sourceId);
}

function assertKnownFields(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`${label} 包含未知字段：${unknown.join(", ")}`);
}

function assertPlainObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(message);
}

function color(value, label) {
  const normalized = String(value || "").toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(normalized)) throw new Error(`${label}必须是 #RRGGBB 颜色`);
  return normalized;
}

function dimension(value, items, label) {
  if (!items.some(({ id }) => id === value)) throw new Error(`未知${label}：${value || "未指定"}`);
  return value;
}
