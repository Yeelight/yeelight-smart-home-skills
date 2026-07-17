import { loadThemeCatalog } from "./theme-catalog.mjs";

export function themeCliHelp(command, options = {}) {
  const catalog = loadThemeCatalog();
  const families = catalog.families.map((family) => {
    const presets = catalog.presets
      .filter(({ familyId }) => familyId === family.id)
      .map(({ id, name }) => `${id} (${name})`)
      .join(", ");
    return `  ${family.name}: ${presets}`;
  });
  const runtimeOptions = options.includeRuntime ? [
    "  --home-id <id>                 限定家庭，可用逗号分隔多个 ID",
    "  --mock-home <fixture>           使用 Builder 内置严格 Mock Runtime",
    "  --runtime-bin <path>            指定 yeelight-home 可执行文件",
    "  --region <region>               指定 Runtime 区域",
  ] : [];
  const planningOptions = options.includeRuntime ? [
    "",
    "能力规划（默认严格失败）:",
    "  --capability-report             仅输出结构化能力报告，不创建输出",
    "  --skip-modules <ids>            discovery 前显式排除模块，逗号分隔",
    "  --allow-partial                 显式省略不可用模块并生成其余模块",
    "  未指定上述降级参数时，任一请求模块不可用都会终止且不创建输出。",
  ] : [];

  return [
    `Usage: node scripts/${command} --request <text> ${options.includeRuntime ? "[--out <path>]" : "--out <path>"} [options]`,
    "",
    "必填参数:",
    "  --request <text>                一句话产品需求",
    options.includeRuntime
      ? "  --out <path>                    输出应用目录；能力报告模式可省略"
      : "  --out <path>                    输出 ProductSpec 文件",
    "",
    "产品范围:",
    "  --modules <ids>                 逗号分隔的模块 ID",
    "  --device-families <ids>         逗号分隔的设备族 ID",
    "  --room <names>                  逗号分隔的房间名称",
    "  --form-factor <value>           desktop|tablet|mobile|wall",
    "  --navigation <value>            sidebar|adaptive-rail|bottom-tabs|touch-rail",
    "  --scene-management              为 scene.launcher 显式启用详情、创建、编辑、测试和删除",
    ...runtimeOptions,
    ...planningOptions,
    "",
    "主题 v2:",
    "  --theme-file <theme.json>       本地 ThemeSpec v1，最大 64 KiB",
    "  --theme-preset <id>             选择以下 24 个生产预设之一",
    "  --mode <value>                  light|dark|auto",
    "  --density <value>               comfortable|compact|touch",
    "  --brand-color <#RRGGBB>         品牌源色，由编译器派生可访问语义色",
    "  --accent-color <#RRGGBB>        强调源色",
    "  --typography <value>            system-modern|system-readable|system-technical|system-compact",
    "  --shape <value>                 sharp|precise|balanced|soft",
    "  --motion <value>                reduced|precise|standard|expressive",
    "",
    "生产预设:",
    ...families,
    "",
    "输入优先级:",
    "  显式 CLI 字段 > --theme-file > Agent 结构化选择 > 自然语言推断 > pro-daylight",
    "",
    "兼容输入（已弃用，仅用于迁移）:",
    "  --theme-pack <id>               旧结构主题；迁移到 ThemeSpec 后记录诊断",
    "  --palette <id>                  旧色板；迁移到 ThemeSpec 后记录诊断",
    "",
    "安全边界:",
    "  ThemeSpec 不接受 CSS、JavaScript、HTML、URL、本地字体或结构 recipe。",
    "  校验失败会在 Runtime discovery 和输出创建前终止，请按报错字段修复。",
  ].join("\n");
}
