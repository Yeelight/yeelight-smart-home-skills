import crypto from "node:crypto";

import { opaqueActionId } from "./browser-boundary.mjs";
import { auditPageComposition, intentOwnersForModules } from "./composition-auditor.mjs";
import { moduleDirectory } from "./compiler.mjs";
import { compileProductSpec } from "./product-spec.mjs";
import { appSource } from "./templates/app-shell.mjs";
import { resolvePageContributions } from "./templates/page-contributions.mjs";
import { moduleIntents } from "./templates/project-runtime.mjs";
import { stylesSource } from "./templates/styles.mjs";

const productProfiles = {
  "room-control": ["home.lighting-summary", "room.lighting-control"],
  "daily-home": ["home.space-summary", "room.device-management", "sensor.environment", "scene.launcher", "automation.manager", "group.manager"],
  "whole-home": [
    "home.space-summary", "room.device-management", "home.lighting-summary", "room.lighting-control",
    "device.curtain-control", "device.switch-control", "device.climate-control", "sensor.environment",
    "scene.launcher", "automation.manager", "group.manager", "gateway.overview", "panel.manager",
  ],
  "wall-control": ["home.space-summary", "room.lighting-control", "device.curtain-control", "device.climate-control", "sensor.environment", "scene.launcher"],
  installer: ["installer.maintenance"],
};

export function modulesForProductProfile(profileId) {
  const modules = productProfiles[profileId];
  if (!modules) throw new Error(`未知产品画像：${profileId}`);
  return [...modules];
}

export function validateThemeMatrixContracts(plan) {
  const cases = plan.cases.map(validateCase);
  return {
    schemaVersion: 1,
    status: plan.status === "passed" && cases.every(({ status }) => status === "passed") ? "passed" : "failed",
    cases,
    summary: {
      caseCount: cases.length,
      productProfiles: [...new Set(cases.map(({ productProfile }) => productProfile))],
      sourceDigests: [...new Set(cases.map(({ sourceDigest }) => sourceDigest))].length,
    },
  };
}

function validateCase(item) {
  try {
    const requestedModules = modulesForProductProfile(item.target.productProfile);
    const spec = compileProductSpec({
      request: "只生成明确选择的易来 PRO 功能。",
      title: `矩阵 ${item.id}`,
      choices: {
        modules: requestedModules,
        formFactor: item.target.formFactor,
        navigation: item.target.navigation,
        density: item.density,
        themePack: item.pack,
        palette: item.palette,
        mode: item.mode,
        homeIds: ["990001"],
      },
    });
    const selected = spec.modules.map(({ id }) => id);
    const templates = Object.fromEntries(selected.map((moduleId) => [moduleId, { directory: moduleDirectory(moduleId) }]));
    const contributions = resolvePageContributions(selected, templates);
    const owners = intentOwnersForModules(moduleIntents);
    const privateActions = [...new Set(selected.flatMap((moduleId) => moduleIntents[moduleId] || []))].sort().map((intent) => ({ actionId: opaqueActionId(intent), intent }));
    const composition = auditPageComposition({ selected, contributions, privateActions, intentOwners: owners });
    const app = appSource(spec, selected, templates);
    const styles = stylesSource(spec);
    const attributes = `data-form-factor="${item.target.formFactor}" data-navigation="${item.target.navigation}" data-density="${item.density}" data-theme-pack="${item.pack}" data-theme-mode="${item.mode}"`;
    const checks = [
      result("product-spec", spec.target.formFactor === item.target.formFactor && spec.target.navigation === item.target.navigation && spec.target.density === item.density, spec.target),
      result("theme-contract", spec.theme.pack === item.pack && spec.theme.palette === item.palette && spec.theme.mode === item.mode, spec.theme),
      result("shell-attributes", app.includes(attributes), attributes),
      result("semantic-theme-tokens", ["--color-background", "--color-surface", "--color-foreground", "--color-primary", "--card-radius", "--control-min-height"].every((token) => styles.includes(token)), null),
      result("composition", composition.status === "passed", composition.checks.filter(({ status }) => status === "failed")),
    ];
    return {
      id: item.id,
      productProfile: item.target.productProfile,
      modules: selected,
      routes: composition.summary.routes.map(({ route }) => route),
      sourceDigest: digest(`${app}\n${styles}`),
      checks,
      status: checks.every(({ status }) => status === "passed") ? "passed" : "failed",
    };
  } catch (error) {
    return { id: item.id, productProfile: item.target.productProfile, status: "failed", error: error instanceof Error ? error.stack || error.message : String(error) };
  }
}

function result(id, passed, detail) {
  return { id, status: passed ? "passed" : "failed", detail };
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
