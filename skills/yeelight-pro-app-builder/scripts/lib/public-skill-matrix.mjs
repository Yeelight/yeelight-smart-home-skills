import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const publicProductProfiles = [
  profile("room-control", "只要客厅灯光控制，移动端，简洁明亮，蓝绿色。", "客厅灯光", ["home.lighting-summary", "room.lighting-control"], "mobile", "bottom-tabs", "touch", "daylight-minimal", "teal-blue", "light", ["客厅"]),
  profile("daily-home", "生成家庭日常管理应用，包含空间、设备、环境、情景、自动化和设备组。", "我的家", ["home.space-summary", "room.device-management", "sensor.environment", "scene.launcher", "automation.manager", "group.manager"], "mobile", "bottom-tabs", "touch", "warm-residential", "sunset-amber", "light"),
  profile("whole-home", "生成完整的易来 PRO 全屋智能管理应用。", "易来 PRO 参考家庭", ["home.space-summary", "room.device-management", "home.lighting-summary", "room.lighting-control", "device.curtain-control", "device.switch-control", "device.climate-control", "sensor.environment", "scene.launcher", "automation.manager", "group.manager", "gateway.overview", "panel.manager"], "desktop", "sidebar", "comfortable", "daylight-minimal", "teal-blue", "light"),
  profile("installer", "生成易来 PRO 安装维护应用，包含网关、面板、旋钮、异常和诊断。", "易来 PRO 安装维护", ["gateway.overview", "panel.manager", "installer.maintenance"], "desktop", "sidebar", "compact", "installer-contrast", "neutral-graphite", "dark"),
];

export const publicJourneyValidators = [
  journey("space", "validate-space-slice.mjs", "whole-home"),
  journey("device-controller", "validate-device-controller-slice.mjs", "whole-home"),
  journey("lighting", "validate-lighting-slice.mjs", "whole-home"),
  journey("curtain", "validate-curtain-slice.mjs", "whole-home"),
  journey("switch", "validate-switch-slice.mjs", "whole-home"),
  journey("climate", "validate-climate-slice.mjs", "whole-home"),
  journey("sensor", "validate-sensor-slice.mjs", "whole-home"),
  journey("scene", "validate-scene-slice.mjs", "whole-home"),
  journey("automation", "validate-automation-slice.mjs", "whole-home"),
  journey("group", "validate-group-slice.mjs", "whole-home"),
  journey("management", "validate-management-suite.mjs", "whole-home"),
  journey("gateway", "validate-gateway-slice.mjs", "whole-home"),
  journey("panel", "validate-panel-slice.mjs", "whole-home"),
  journey("knob", "validate-knob-slice.mjs", "whole-home"),
  journey("installer", "validate-installer-canary.mjs", "installer"),
];

export function resolvePublicSkillStage({ yeelightRoot, version = "0.1.0", explicitRoot = "" }) {
  const stageRoot = path.resolve(explicitRoot || path.join(yeelightRoot, "dist/skill-release/yeelight-pro-app-builder", version, "stage/yeelight-pro-app-builder"));
  const required = ["SKILL.md", "scripts/build-app.mjs", "scripts/validate-app.mjs", "assets/schemas/product-spec.schema.json"];
  const missing = required.filter((relative) => !fs.existsSync(path.join(stageRoot, relative)));
  if (missing.length > 0) throw new Error(`公开 Skill stage 不完整：${missing.join(", ")}`);
  if (stageRoot.includes(`${path.sep}skill${path.sep}yeelight-pro-app-builder`) && !stageRoot.includes(`${path.sep}stage${path.sep}`)) {
    throw new Error("公开 Skill E2E 禁止回退到源码 Skill 目录");
  }
  return { stageRoot, digest: treeDigest(stageRoot), files: listFiles(stageRoot) };
}

export function buildProductArgs(product, { stageRoot, runtimeBin, outputRoot }) {
  const args = [
    path.join(stageRoot, "scripts/build-app.mjs"),
    "--request", product.request,
    "--title", product.title,
    "--modules", product.modules.join(","),
    "--form-factor", product.formFactor,
    "--navigation", product.navigation,
    "--density", product.density,
    "--theme-pack", product.themePack,
    "--palette", product.palette,
    "--mode", product.mode,
    "--mock-home", "reference-home",
    "--runtime-bin", runtimeBin,
    "--out", outputRoot,
  ];
  if (product.rooms.length > 0) args.push("--room", product.rooms.join(","));
  return args;
}

export function summarizePublicProduct(product, inspected, outputRoot) {
  return {
    profileId: product.id,
    request: product.request,
    outputRoot,
    product: inspected.product,
    modules: inspected.modules,
    routes: inspected.routes,
    actions: inspected.actions,
    allowlist: inspected.allowlist,
    sourceDigest: digest({ moduleFiles: inspected.moduleFiles, runtimeFiles: inspected.runtimeFiles }),
  };
}

function profile(id, request, title, modules, formFactor, navigation, density, themePack, palette, mode, rooms = []) {
  return { id, request, title, modules, formFactor, navigation, density, themePack, palette, mode, rooms };
}

function journey(id, script, productId) {
  return { id, script, productId };
}

function treeDigest(root) {
  const hash = crypto.createHash("sha256");
  for (const relative of listFiles(root)) {
    hash.update(relative);
    hash.update(fs.readFileSync(path.join(root, relative)));
  }
  return hash.digest("hex");
}

function listFiles(root) {
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .sort();
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
