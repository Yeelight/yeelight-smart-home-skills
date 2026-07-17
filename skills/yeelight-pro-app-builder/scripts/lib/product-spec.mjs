import { loadThemeCatalog } from "./theme-catalog.mjs";
import { migrateLegacyTheme } from "./theme-migration.mjs";
import { mergeThemeSources } from "./theme-spec.mjs";

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
  const modules = requestedModules;
  if (modules.length === 0) throw new Error("无法确定要生成的功能模块，请明确设备、房间或管理范围。");
  const installer = modules.includes("installer.maintenance");
  if (installer && !modules.some((id) => ["gateway.overview", "panel.manager"].includes(id))) {
    throw new Error("安装维护至少需要显式选择 gateway.overview 或 panel.manager，请确认要查看的基础设施范围。");
  }
  const sceneManagement = choices.sceneManagement === true;

  const formFactor = choices.formFactor || inferFormFactor(request);
  const navigation = choices.navigation || navigationFor(formFactor);
  validateTarget(formFactor, navigation);
  const inferredFamilies = moduleRules.filter((rule) => modules.includes(rule.id)).flatMap((rule) => rule.families);
  const deviceFamilies = unique(normalizeList(choices.deviceFamilies).length > 0 ? normalizeList(choices.deviceFamilies) : inferredFamilies);
  const rooms = unique(normalizeList(choices.roomNames).length > 0 ? normalizeList(choices.roomNames) : roomNames.filter((name) => request.includes(name)));
  const density = choices.density || (installer ? "compact" : densityFor(formFactor));
  const targetId = installer ? "installer" : formFactor;
  const theme = resolveProductTheme({ request, choices, themeFile: input.themeFile, agentTheme: input.agentTheme, density, targetId, installer });

  return {
    schemaVersion: 4,
    product: {
      name: slugify(input.name || input.title || "Yeelight PRO"),
      title: input.title || "Yeelight PRO",
      locale: "zh-CN",
    },
    target: {
      formFactor,
      navigation,
    },
    scope: {
      homeIds: normalizeList(choices.homeIds),
      roomNames: rooms,
      includeAllRooms: rooms.length === 0,
    },
    modules: modules.map((id) => ({ id, options: moduleOptions(id, { installer, sceneManagement }) })),
    deviceFamilies,
    theme: theme.spec,
    runtime: {
      contractVersion: "1.0",
      dataMode: choices.dataMode || "live",
      bridgeMode: "local",
    },
    diagnostics: [...theme.diagnostics, { code: "theme-input-resolved", source: theme.inputSource }],
  };
}

function moduleOptions(id, { installer, sceneManagement }) {
  if (id === "scene.launcher") return { management: sceneManagement };
  if (installer && ["gateway.overview", "panel.manager"].includes(id)) return { profile: "installer" };
  return {};
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

function resolveProductTheme({ request, choices, themeFile, agentTheme, density, targetId, installer }) {
  const inferred = { ...inferTheme(request, targetId, installer), density };
  const diagnostics = [];
  let flags = {};
  if (choices.themePack || choices.palette) {
    const legacy = migrateLegacyTheme({
      pack: choices.themePack || "daylight-minimal",
      palette: choices.palette || "neutral-graphite",
      mode: choices.mode || "light",
    }, density);
    flags = legacy.spec;
    diagnostics.push(...legacy.diagnostics, { code: "legacy-theme-flags-deprecated" });
  }
  const explicitColors = compactObject({ brand: choices.brandColor, accent: choices.accentColor });
  const explicit = compactObject({
    preset: choices.themePreset,
    mode: choices.mode,
    density: choices.density,
    colors: Object.keys(explicitColors).length > 0 ? explicitColors : undefined,
    typography: choices.typography,
    shape: choices.shape,
    motion: choices.motion,
  });
  flags = { ...flags, ...explicit, colors: explicit.colors ? { ...(flags.colors || {}), ...explicit.colors } : flags.colors };
  if (flags.colors === undefined) delete flags.colors;
  const legacyOnly = Boolean(choices.themePack || choices.palette) && !choices.themePreset && !themeFile && !agentTheme;
  const merged = mergeThemeSources({ inferred, agent: agentTheme, file: themeFile, flags }, legacyOnly ? {} : { targetId });
  return { ...merged, diagnostics: [...diagnostics, ...merged.diagnostics] };
}

function inferTheme(request, targetId, installer = false) {
  const catalog = loadThemeCatalog();
  const dark = /深色|暗色|黑色|夜间|夜航|obsidian|dark/i.test(request);
  const named = catalog.presets.find(({ id, name }) => request.includes(id) || request.includes(name));
  let preset = named?.id;
  if (!preset && installer) preset = dark ? "commissioning-dark" : "installer-precision";
  if (!preset && /高对比|无障碍/.test(request)) preset = dark ? "contrast-night" : "contrast-clear";
  if (!preset && /建筑|DALI|展陈|剧场/i.test(request)) preset = dark ? "architect-theatre" : "architect-gallery";
  if (!preset && /Matter|Thread|多协议|互联/i.test(request)) preset = dark ? "unified-fabric" : "universal-home";
  if (!preset && /专业中控|控制中心|值守/.test(request)) preset = dark ? "command-night" : "command-day";
  if (!preset && targetId === "wall" && /墙屏|墙控/.test(request)) preset = dark ? "wall-night" : "wall-day";
  if (!preset && /影院|影音|微光/.test(request)) preset = "low-light-cinema";
  if (!preset && /月光|夜居/.test(request)) preset = "moonlight-home";
  if (!preset && dark) preset = targetId === "mobile" ? "moonlight-home" : "obsidian-focus";
  if (!preset && /温暖|奶油|暖色|温馨|亚麻|琥珀/.test(request)) preset = /晚|琥珀/.test(request) ? "amber-evening" : "linen-home";
  if (!preset && /自然|森林|林间|清氧/.test(request)) preset = "forest-air";
  if (!preset && /极简|纯净|简洁/.test(request)) preset = "pure-canvas";
  preset ||= "pro-daylight";

  const colors = [...request.matchAll(/#[0-9a-f]{6}\b/gi)].map(([value]) => value);
  const inferredColors = colors.length > 0
    ? compactObject({ brand: colors[0], accent: colors[1] })
    : /蓝绿|青绿|青色|teal/i.test(request)
      ? { brand: "#087F8C", accent: "#1BA8A0" }
      : /琥珀|暖金/.test(request)
        ? { brand: "#8A5A14", accent: "#C98218" }
        : undefined;
  return compactObject({
    preset,
    mode: /跟随系统|自动模式|auto/i.test(request) ? "auto" : dark ? "dark" : /明亮|日间|浅色|light/i.test(request) ? "light" : undefined,
    colors: inferredColors,
    typography: /技术|工程|数据/.test(request) ? "system-technical" : /易读|大字|长辈/.test(request) ? "system-readable" : /紧凑字体/.test(request) ? "system-compact" : undefined,
    shape: /直角|硬朗/.test(request) ? "sharp" : /柔和|圆润/.test(request) ? "soft" : undefined,
    motion: /减少动效|无动效|reduced/i.test(request) ? "reduced" : /生动|丰富动效/.test(request) ? "expressive" : undefined,
  });
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

function compactObject(value) {
  return Object.fromEntries(Object.entries(value || {}).filter(([, item]) => item !== undefined));
}

function slugify(value) {
  const slug = String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "yeelight-pro-app";
}
