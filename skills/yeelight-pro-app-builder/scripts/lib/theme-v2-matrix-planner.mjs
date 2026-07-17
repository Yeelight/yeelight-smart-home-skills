import { loadThemeCatalog } from "./theme-catalog.mjs";
import { planThemePresetProductionMatrix } from "./theme-matrix-planner.mjs";
import { normalizeThemeSpec } from "./theme-spec.mjs";

const dimensions = ["preset", "mode", "density", "target", "typography", "shape", "motion"];

export function loadThemeV2MatrixDefinition(themeRoot) {
  const catalog = loadThemeCatalog(themeRoot);
  return {
    schemaVersion: 1,
    catalogVersion: catalog.catalogVersion,
    catalog,
  };
}

export function planThemeV2Matrix(definition = loadThemeV2MatrixDefinition()) {
  const { catalog } = definition;
  const candidates = enumerateLegalCandidates(catalog);
  const requiredPairs = new Set();
  const firstOwnerByPair = new Map();

  for (const candidate of candidates) {
    for (const pair of casePairs(candidate)) {
      requiredPairs.add(pair);
      if (!firstOwnerByPair.has(pair)) firstOwnerByPair.set(pair, candidate.id);
    }
  }

  const productionPlan = planThemePresetProductionMatrix();
  const mandatory = productionPlan.cases.map((item) => {
    const matrixCaseId = caseId({
      preset: item.themePreset,
      mode: item.mode,
      density: item.density,
      target: item.target.id,
      typography: item.typography,
      shape: item.shape,
      motion: item.motion,
    });
    if (!candidates.some(({ id }) => id === matrixCaseId)) throw new Error(`mandatory 主题 case 非法：${item.id}`);
    return { productionCaseId: item.id, matrixCaseId, preset: item.themePreset };
  });

  const selectedIds = new Set([
    ...mandatory.map(({ matrixCaseId }) => matrixCaseId),
    ...firstOwnerByPair.values(),
  ]);
  const cases = candidates.filter(({ id }) => selectedIds.has(id));
  const coveredPairs = new Set(cases.flatMap(casePairs));
  const uncoveredPairs = [...requiredPairs].filter((pair) => !coveredPairs.has(pair)).sort();

  return {
    schemaVersion: 1,
    strategy: "mandatory-presets-plus-deterministic-strength-2-v2",
    catalogVersion: definition.catalogVersion,
    dimensions,
    sourceDigests: structuredClone(productionPlan.sourceDigests),
    fullCartesianCandidateCount: candidates.length,
    mandatory,
    cases,
    coverage: {
      requiredPairCount: requiredPairs.size,
      coveredPairCount: requiredPairs.size - uncoveredPairs.length,
      uncoveredPairs,
      values: dimensionValues(catalog),
    },
    rejectedCases: knownRejectedThemeV2Cases(definition),
    status: uncoveredPairs.length === 0 ? "passed" : "failed",
  };
}

export function validateThemeV2MatrixCase(input, definition = loadThemeV2MatrixDefinition()) {
  const target = definition.catalog.targets.find(({ id }) => id === input?.target);
  if (!target) throw new Error(`未知目标画像：${input?.target || "未指定"}`);
  const { target: _target, ...themeInput } = input;
  const theme = normalizeThemeSpec(themeInput, { catalog: definition.catalog, targetId: target.id });
  return { theme, target: structuredClone(target) };
}

export function knownRejectedThemeV2Cases(definition = loadThemeV2MatrixDefinition()) {
  const cases = [
    { id: "unknown-preset", input: base({ preset: "missing" }) },
    { id: "unknown-mode", input: base({ mode: "sepia" }) },
    { id: "unsupported-target", input: base({ preset: "amber-evening", target: "desktop" }) },
    { id: "unknown-target", input: base({ target: "kiosk" }) },
    { id: "unknown-density", input: base({ density: "dense" }) },
    { id: "unknown-typography", input: base({ typography: "remote-font" }) },
    { id: "unknown-shape", input: base({ shape: "pill" }) },
    { id: "unknown-motion", input: base({ motion: "infinite" }) },
    { id: "unsafe-css-field", input: { ...base(), css: ":root{}" } },
  ];
  return cases.map((item) => {
    try {
      validateThemeV2MatrixCase(item.input, definition);
      return { ...item, status: "failed", error: null };
    } catch (error) {
      return { ...item, status: "rejected", error: error instanceof Error ? error.message : String(error) };
    }
  });
}

function enumerateLegalCandidates(catalog) {
  const candidates = [];
  for (const preset of catalog.presets) {
    for (const mode of preset.supportedModes) {
      for (const density of catalog.densities) {
        for (const target of preset.targets) {
          for (const typography of catalog.typography) {
            for (const shape of catalog.shapes) {
              for (const motion of catalog.motions) {
                const values = {
                  preset: preset.id,
                  mode,
                  density: density.id,
                  target,
                  typography: typography.id,
                  shape: shape.id,
                  motion: motion.id,
                };
                candidates.push({ id: caseId(values), ...values });
              }
            }
          }
        }
      }
    }
  }
  return candidates;
}

function casePairs(candidate) {
  const pairs = [];
  for (let left = 0; left < dimensions.length; left += 1) {
    for (let right = left + 1; right < dimensions.length; right += 1) {
      pairs.push(`${dimensions[left]}=${candidate[dimensions[left]]}|${dimensions[right]}=${candidate[dimensions[right]]}`);
    }
  }
  return pairs;
}

function dimensionValues(catalog) {
  return {
    preset: catalog.presets.map(({ id }) => id),
    mode: ["light", "dark", "auto"],
    density: catalog.densities.map(({ id }) => id),
    target: catalog.targets.map(({ id }) => id),
    typography: catalog.typography.map(({ id }) => id),
    shape: catalog.shapes.map(({ id }) => id),
    motion: catalog.motions.map(({ id }) => id),
  };
}

function caseId(values) {
  return dimensions.map((dimension) => values[dimension]).join("--");
}

function base(overrides = {}) {
  return {
    schemaVersion: 1,
    preset: "pro-daylight",
    mode: "light",
    density: "comfortable",
    target: "desktop",
    typography: "system-modern",
    shape: "balanced",
    motion: "standard",
    ...overrides,
  };
}
