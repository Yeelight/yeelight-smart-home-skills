import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { modulesForThemeProductionCase } from "./theme-matrix-contracts.mjs";

const generatedContractFiles = ["generation-manifest.json", "product.spec.json", "theme.lock.json"];

export function selectThemeProductionCases(plan, filters = {}) {
  const caseIds = values(filters.caseIds);
  const presetIds = values(filters.presetIds);
  const familyIds = values(filters.familyIds);
  const batches = values(filters.batches).map(Number);
  const selected = plan.cases.filter((item) => (
    (caseIds.length === 0 || caseIds.includes(item.id))
    && (presetIds.length === 0 || presetIds.includes(item.themePreset))
    && (familyIds.length === 0 || familyIds.includes(item.familyId))
    && (batches.length === 0 || batches.includes(item.batch))
  ));
  if (selected.length === 0) throw new Error("未找到主题生产 case");
  return selected;
}

export function buildThemeProductionArgs({ item, skillRoot, runtimeBin, appRoot, themeInputArgs = [] }) {
  const themeArgs = values(themeInputArgs);
  return [
    path.join(skillRoot, "scripts/build-app.mjs"),
    "--request", "只生成明确选择的易来 PRO 功能。",
    "--title", `易来 PRO ${item.title}`,
    "--modules", modulesForThemeProductionCase(item).join(","),
    "--scene-management",
    "--form-factor", item.target.formFactor,
    "--navigation", item.target.navigation,
    ...(themeArgs.length > 0 ? themeArgs : [
      "--density", item.density,
      "--theme-preset", item.themePreset,
      "--mode", item.mode,
      "--typography", item.typography,
      "--shape", item.shape,
      "--motion", item.motion,
    ]),
    "--mock-home", "reference-home",
    "--runtime-bin", runtimeBin,
    "--out", appRoot,
  ];
}

export function captureGeneratedThemeArtifacts({ appRoot, caseDir }) {
  fs.mkdirSync(caseDir, { recursive: true });
  const files = generatedContractFiles.map((name) => {
    const source = path.join(appRoot, name);
    if (!fs.existsSync(source)) throw new Error(`生成应用缺少主题证据：${name}`);
    const content = fs.readFileSync(source);
    fs.copyFileSync(source, path.join(caseDir, name));
    return { name, bytes: content.length, sha256: crypto.createHash("sha256").update(content).digest("hex") };
  });
  return { schemaVersion: 1, files };
}

export function captureThemeScreenshotEvidence({ evidenceDir, files }) {
  const uniqueFiles = [...new Set(values(files))];
  const evidence = uniqueFiles.map((name) => {
    if (path.basename(name) !== name) throw new Error(`非法主题截图证据路径：${name}`);
    const source = path.join(evidenceDir, name);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error(`缺少主题截图证据：${name}`);
    const content = fs.readFileSync(source);
    return { name, bytes: content.length, sha256: crypto.createHash("sha256").update(content).digest("hex") };
  });
  return { schemaVersion: 1, files: evidence };
}

function values(input) {
  if (input === undefined || input === null || input === "") return [];
  return (Array.isArray(input) ? input : String(input).split(",")).map((value) => String(value).trim()).filter(Boolean);
}
