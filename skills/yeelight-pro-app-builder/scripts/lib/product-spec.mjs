import { resolveTheme } from "./theme-resolver.mjs";

const moduleRules = [
  { id: "home.space-summary", families: [], keywords: ["空间", "房间", "设备管理", "全屋设备"] },
  { id: "room.device-management", families: [], keywords: ["空间", "房间", "设备管理", "全屋设备"] },
  { id: "home.lighting-summary", families: ["light"], keywords: ["灯光", "照明", "灯具"] },
  { id: "room.lighting-control", families: ["light"], keywords: ["灯光", "照明", "灯具"] },
  { id: "device.curtain-control", families: ["curtain"], keywords: ["窗帘", "卷帘", "开合帘"] },
  { id: "device.climate-control", families: ["climate"], keywords: ["温控", "空调", "地暖", "新风"] },
  { id: "device.switch-control", families: ["switch-relay"], keywords: ["开关", "继电器"] },
  { id: "sensor.environment", families: ["sensor"], keywords: ["传感器", "温湿度", "环境", "照度", "人体"] },
  { id: "scene.launcher", families: [], keywords: ["情景", "场景"] },
  { id: "automation.manager", families: [], keywords: ["自动化"] },
  { id: "group.manager", families: ["group"], keywords: ["设备组", "灯组"] },
  { id: "gateway.overview", families: ["gateway"], keywords: ["网关", "中枢"] },
  { id: "panel.manager", families: ["panel-screen", "knob"], keywords: ["面板", "旋钮"] },
  { id: "installer.maintenance", families: [], keywords: ["安装调试", "安装维护", "运维", "installer"] },
];

const roomNames = ["客厅", "餐厅", "主卧", "次卧", "卧室", "书房", "厨房", "卫生间", "阳台", "玄关", "儿童房", "老人房"];

export function compileProductSpec(input = {}) {
  const request = String(input.request || "").trim();
  const choices = input.choices || {};
  const explicitModules = normalizeList(choices.modules);
  const requestedModules = explicitModules.length > 0 ? explicitModules : inferModules(request);
  const modules = ensureInstallerComposition(requestedModules);
  if (modules.length === 0) throw new Error("无法确定要生成的功能模块，请明确设备、房间或管理范围。");
  const installer = modules.includes("installer.maintenance");

  const formFactor = choices.formFactor || inferFormFactor(request);
  const navigation = choices.navigation || navigationFor(formFactor);
  validateTarget(formFactor, navigation);
  const inferredFamilies = moduleRules.filter((rule) => modules.includes(rule.id)).flatMap((rule) => rule.families);
  const deviceFamilies = unique(normalizeList(choices.deviceFamilies).length > 0 ? normalizeList(choices.deviceFamilies) : inferredFamilies);
  const rooms = unique(normalizeList(choices.roomNames).length > 0 ? normalizeList(choices.roomNames) : roomNames.filter((name) => request.includes(name)));
  const theme = inferTheme(request, choices, installer);
  const density = choices.density || (installer ? "compact" : densityFor(formFactor));
  resolveTheme(theme, density);

  return {
    schemaVersion: 3,
    product: {
      name: slugify(input.name || input.title || "Yeelight PRO"),
      title: input.title || "Yeelight PRO",
      locale: "zh-CN",
    },
    target: {
      formFactor,
      navigation,
      density,
    },
    scope: {
      homeIds: normalizeList(choices.homeIds),
      roomNames: rooms,
      includeAllRooms: rooms.length === 0,
    },
    modules: modules.map((id) => ({ id, options: installer && ["gateway.overview", "panel.manager"].includes(id) ? { profile: "installer" } : {} })),
    deviceFamilies,
    theme,
    runtime: {
      contractVersion: "1.0",
      dataMode: choices.dataMode || "live",
      bridgeMode: "local",
    },
    diagnostics: [],
  };
}

function inferModules(request) {
  return unique(moduleRules.filter((rule) => rule.keywords.some((keyword) => request.includes(keyword))).map((rule) => rule.id));
}

function inferFormFactor(request) {
  if (/手机|移动端|mobile/i.test(request)) return "mobile";
  if (/墙控|大屏|wall|kiosk/i.test(request)) return "wall";
  if (/平板|pad|tablet/i.test(request)) return "tablet";
  return "desktop";
}

function inferTheme(request, choices, installer = false) {
  if (choices.themePack || choices.palette || choices.mode) {
    return {
      pack: choices.themePack || "daylight-minimal",
      palette: choices.palette || "neutral-graphite",
      mode: choices.mode || "light",
    };
  }
  if (/温暖|奶油|暖色|温馨/.test(request)) {
    return { pack: "warm-residential", palette: "sunset-amber", mode: "light" };
  }
  if (/深色|暗色|黑色|obsidian/i.test(request)) {
    return { pack: "obsidian-console", palette: "neutral-graphite", mode: "dark" };
  }
  if (/蓝绿|青绿|青色|teal/i.test(request)) {
    return { pack: "daylight-minimal", palette: "teal-blue", mode: "light" };
  }
  if (installer) return { pack: "installer-contrast", palette: "forest-cyan", mode: "light" };
  return { pack: "daylight-minimal", palette: "neutral-graphite", mode: "light" };
}

function ensureInstallerComposition(modules) {
  if (!modules.includes("installer.maintenance")) return modules;
  return unique(["gateway.overview", "panel.manager", ...modules]);
}

function navigationFor(formFactor) {
  if (formFactor === "mobile") return "bottom-tabs";
  if (formFactor === "wall") return "touch-rail";
  if (formFactor === "tablet") return "adaptive-rail";
  return "sidebar";
}

function densityFor(formFactor) {
  return formFactor === "mobile" || formFactor === "wall" ? "touch" : "comfortable";
}

function validateTarget(formFactor, navigation) {
  const expected = { desktop: "sidebar", tablet: "adaptive-rail", mobile: "bottom-tabs", wall: "touch-rail" };
  if (!expected[formFactor]) throw new Error(`未知目标形态：${formFactor || "未指定"}`);
  if (navigation !== expected[formFactor]) throw new Error(`目标形态 ${formFactor} 必须使用 ${expected[formFactor]} 导航`);
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function unique(items) {
  return [...new Set(items)];
}

function slugify(value) {
  const slug = String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "yeelight-pro-app";
}
