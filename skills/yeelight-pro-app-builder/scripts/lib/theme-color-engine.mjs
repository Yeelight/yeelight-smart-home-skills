const epsilon = 1e-9;

export function contrastRatio(foreground, background) {
  const left = relativeLuminance(foreground);
  const right = relativeLuminance(background);
  return roundRatio((Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05));
}

export function hexToOklch(value) {
  const [red, green, blue] = hexToRgb(value).map(srgbToLinear);
  const lRoot = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const mRoot = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const sRoot = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  const lightness = 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot;
  const a = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
  const b = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;
  const chroma = Math.sqrt(a * a + b * b);
  const hue = chroma < epsilon ? 0 : normalizeHue(Math.atan2(b, a) * 180 / Math.PI);
  return { lightness, chroma, hue };
}

export function oklchToHex({ lightness, chroma, hue }) {
  const mappedChroma = mapChromaToSrgb({ lightness, chroma, hue });
  return rgbToHex(oklchToLinearRgb({ lightness, chroma: mappedChroma, hue }).map(linearToSrgb));
}

function oklchToLinearRgb({ lightness, chroma, hue }) {
  const angle = normalizeHue(hue) * Math.PI / 180;
  const a = chroma * Math.cos(angle);
  const b = chroma * Math.sin(angle);
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function deriveAccessibleColor(source, background, options = {}) {
  const normalizedSource = normalizeHex(source);
  const normalizedBackground = normalizeHex(background);
  const minimumRatio = Number(options.minimumRatio || 4.5);
  const sourceRatio = contrastRatio(normalizedSource, normalizedBackground);
  if (sourceRatio >= minimumRatio) return result(normalizedSource, normalizedSource, normalizedBackground, sourceRatio, minimumRatio, "source-accessible", options.role);

  const origin = hexToOklch(normalizedSource);
  for (let step = 1; step <= 500; step += 1) {
    const delta = step / 500;
    for (const lightness of [origin.lightness - delta, origin.lightness + delta]) {
      if (lightness < 0 || lightness > 1) continue;
      const candidate = oklchToHex({ ...origin, lightness });
      const ratio = contrastRatio(candidate, normalizedBackground);
      if (ratio >= minimumRatio) return result(normalizedSource, candidate, normalizedBackground, ratio, minimumRatio, "contrast-adjusted", options.role);
    }
  }
  throw new Error(`颜色 ${normalizedSource} 无法针对 ${normalizedBackground} 派生 ${minimumRatio}:1 的可访问语义色`);
}

export function accessibleForeground(background, minimumRatio = 4.5) {
  const black = contrastRatio("#000000", background);
  const white = contrastRatio("#FFFFFF", background);
  const resolved = black >= white ? "#000000" : "#FFFFFF";
  const ratio = Math.max(black, white);
  if (ratio < minimumRatio) throw new Error(`背景 ${background} 无可访问前景色`);
  return { resolved, ratio };
}

function result(source, resolved, background, ratio, minimumRatio, reason, role = "semantic") {
  return { source, resolved, background, ratio: roundRatio(ratio), minimumRatio, role, reason };
}

function mapChromaToSrgb(color) {
  if (isInSrgb(oklchToLinearRgb(color))) return color.chroma;
  let lower = 0;
  let upper = Math.max(0, color.chroma);
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const candidate = (lower + upper) / 2;
    if (isInSrgb(oklchToLinearRgb({ ...color, chroma: candidate }))) lower = candidate;
    else upper = candidate;
  }
  return lower;
}

function isInSrgb(values) {
  return values.every((value) => value >= -epsilon && value <= 1 + epsilon);
}

function relativeLuminance(value) {
  const [red, green, blue] = hexToRgb(value).map(srgbToLinear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function hexToRgb(value) {
  const hex = normalizeHex(value).slice(1);
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

function rgbToHex(values) {
  return `#${values.map((value) => Math.round(clamp(value) * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function normalizeHex(value) {
  const normalized = String(value || "").toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(normalized)) throw new Error(`非法颜色：${value || "未指定"}`);
  return normalized;
}

function srgbToLinear(value) { return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; }
function linearToSrgb(value) { return value <= 0.0031308 ? 12.92 * value : 1.055 * Math.max(0, value) ** (1 / 2.4) - 0.055; }
function clamp(value) { return Math.min(1, Math.max(0, value)); }
function normalizeHue(value) { return ((value % 360) + 360) % 360; }
function roundRatio(value) { return Math.round(value * 1000) / 1000; }
