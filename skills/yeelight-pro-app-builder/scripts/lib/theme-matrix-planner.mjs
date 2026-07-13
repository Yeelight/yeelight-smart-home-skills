import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultThemeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets/themes");
const dimensions = ["theme", "palette", "density", "target"];

export function loadThemeMatrixDefinition(themeRoot = defaultThemeRoot) {
  const sources = {
    packs: load(path.join(themeRoot, "packs.json")),
    palettes: load(path.join(themeRoot, "palettes.json")),
    densities: load(path.join(themeRoot, "densities.json")),
    targets: load(path.join(themeRoot, "targets.json")),
  };
  const definition = {
    schemaVersion: 1,
    themeVariants: sources.packs.packs.flatMap((pack) => pack.modes.map((mode) => ({ id: `${pack.id}:${mode}`, pack: pack.id, mode }))),
    palettes: sources.palettes.palettes.map(({ id }) => id),
    densities: sources.densities.densities.map(({ id }) => id),
    targets: sources.targets.targets.map((target) => structuredClone(target)),
    sourceDigests: Object.fromEntries(Object.entries(sources).map(([id, value]) => [id, digest(value)])),
  };
  validateDefinition(definition);
  return definition;
}

export function planThemeTargetMatrix(definition = loadThemeMatrixDefinition()) {
  validateDefinition(definition);
  const candidates = enumerateCandidates(definition);
  const requiredPairs = new Set(candidates.flatMap(casePairs));
  const uncovered = new Set(requiredPairs);
  const cases = [];

  while (uncovered.size > 0) {
    const ranked = candidates
      .filter((candidate) => !cases.some((selected) => selected.id === candidate.id))
      .map((candidate) => ({ candidate, score: casePairs(candidate).filter((pair) => uncovered.has(pair)).length }))
      .sort((left, right) => right.score - left.score || left.candidate.id.localeCompare(right.candidate.id));
    const next = ranked[0];
    if (!next || next.score === 0) break;
    cases.push(next.candidate);
    for (const pair of casePairs(next.candidate)) uncovered.delete(pair);
  }

  return {
    schemaVersion: 1,
    strategy: "deterministic-pairwise-strength-2",
    dimensions,
    sourceDigests: structuredClone(definition.sourceDigests),
    cases,
    coverage: {
      requiredPairCount: requiredPairs.size,
      coveredPairCount: requiredPairs.size - uncovered.size,
      uncoveredPairs: [...uncovered].sort(),
      values: dimensionValues(definition),
    },
    status: uncovered.size === 0 ? "passed" : "failed",
  };
}

export function selectBrowserRepresentativeCases(plan) {
  if (plan.status !== "passed") throw new Error("主题目标矩阵存在未覆盖组合");
  const uncovered = new Set(Object.entries(plan.coverage.values).flatMap(([dimension, values]) => values.map((value) => `${dimension}=${value}`)));
  const selected = [];
  while (uncovered.size > 0) {
    const ranked = plan.cases
      .filter((candidate) => !selected.some((item) => item.id === candidate.id))
      .map((candidate) => ({ candidate, score: caseValues(candidate).filter((value) => uncovered.has(value)).length }))
      .sort((left, right) => right.score - left.score || left.candidate.id.localeCompare(right.candidate.id));
    const next = ranked[0];
    if (!next || next.score === 0) break;
    selected.push(next.candidate);
    for (const value of caseValues(next.candidate)) uncovered.delete(value);
  }
  if (uncovered.size > 0) throw new Error(`浏览器代表集缺少覆盖：${[...uncovered].join(", ")}`);
  return selected;
}

export function validateThemeMatrixCase(input, definition = loadThemeMatrixDefinition()) {
  const theme = definition.themeVariants.find((item) => item.pack === input.pack && item.mode === input.mode);
  if (!theme) throw new Error(`非法主题模式组合：${input.pack || "missing"}/${input.mode || "missing"}`);
  if (!definition.palettes.includes(input.palette)) throw new Error(`未知色板：${input.palette || "missing"}`);
  if (!definition.densities.includes(input.density)) throw new Error(`未知密度：${input.density || "missing"}`);
  const target = definition.targets.find((item) => item.id === input.target);
  if (!target) throw new Error(`未知目标画像：${input.target || "missing"}`);
  if (input.formFactor && input.formFactor !== target.formFactor) throw new Error(`目标 ${target.id} 不支持 formFactor ${input.formFactor}`);
  if (input.navigation && input.navigation !== target.navigation) throw new Error(`目标 ${target.id} 不支持 navigation ${input.navigation}`);
  return { theme, target };
}

function enumerateCandidates(definition) {
  const candidates = [];
  for (const theme of definition.themeVariants) {
    for (const palette of definition.palettes) {
      for (const density of definition.densities) {
        for (const target of definition.targets) {
          const id = [theme.pack, theme.mode, palette, density, target.id].join("--");
          candidates.push({ id, pack: theme.pack, mode: theme.mode, palette, density, target: structuredClone(target) });
        }
      }
    }
  }
  return candidates.sort((left, right) => left.id.localeCompare(right.id));
}

function casePairs(candidate) {
  const values = caseValueMap(candidate);
  const pairs = [];
  for (let left = 0; left < dimensions.length; left += 1) {
    for (let right = left + 1; right < dimensions.length; right += 1) {
      pairs.push(`${dimensions[left]}=${values[dimensions[left]]}|${dimensions[right]}=${values[dimensions[right]]}`);
    }
  }
  return pairs;
}

function caseValues(candidate) {
  return Object.entries(caseValueMap(candidate)).map(([dimension, value]) => `${dimension}=${value}`);
}

function caseValueMap(candidate) {
  return { theme: `${candidate.pack}:${candidate.mode}`, palette: candidate.palette, density: candidate.density, target: candidate.target.id };
}

function dimensionValues(definition) {
  return {
    theme: definition.themeVariants.map(({ id }) => id),
    palette: [...definition.palettes],
    density: [...definition.densities],
    target: definition.targets.map(({ id }) => id),
  };
}

function validateDefinition(definition) {
  for (const [name, values] of Object.entries(dimensionValues(definition))) {
    if (values.length === 0) throw new Error(`主题矩阵维度为空：${name}`);
    if (new Set(values).size !== values.length) throw new Error(`主题矩阵维度存在重复值：${name}`);
  }
  for (const target of definition.targets) {
    if (!target.formFactor || !target.navigation || !target.viewport?.width || !target.viewport?.height || !target.inputMode || !target.defaultDensity || !target.productProfile) {
      throw new Error(`目标画像不完整：${target.id || "missing"}`);
    }
    if (!definition.densities.includes(target.defaultDensity)) throw new Error(`目标 ${target.id} 使用未知默认密度 ${target.defaultDensity}`);
  }
}

function load(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function digest(value) {
  return crypto.createHash("sha256").update(`${JSON.stringify(value)}\n`).digest("hex");
}
