# Yeelight PRO Product Design System

面向 `yeelight-pro-app-builder` 生成应用的产品设计系统。它以易来 PRO 的专业全屋照明与设备管理体验为核心，提供可组合主题、语义 token、基础组件和 mobile/tablet/desktop/wall 应用壳起点。

## Sources

- 代码源：`yeelight-smart-home/skill/yeelight-pro-app-builder` 当前生成模板、主题定义和 reference-home。
- 产品约束：Trellis 任务 `07-15-yeelight-pro-app-builder-theme-system-v2` 的 ThemeSpec、token 与真实生成门禁。
- 行业参考：易来 PRO 为第一基准；HomeKit、米家、Home Assistant、涂鸦仅用于空间层级、状态优先、管理效率、诊断透明和设备标准化的通用模式研究。
- 未使用竞品截图、品牌素材或专有像素布局作为生产资产。

## Content Fundamentals

- 文案先说家庭对象和当前状态，再说技术原因。
- 使用“客厅主灯离线”“网关同步失败”等对象化表达，避免“Error 500”“Bridge invoke failed”等实现术语。
- 主操作使用动词短语：`执行情景`、`重新同步`、`保存别名`。
- 错误信息包含影响和恢复动作；只读或版本不匹配必须明确原因，不伪装成 disabled 控件。
- 不使用 emoji、感叹式营销文案或 AI 助手口吻。

## Visual Foundations

- 默认背景为低对比冷中性面，主要 surface 近白；夜间主题使用深青灰而非纯黑。
- 易来青绿色只用于主要动作、选中状态和可控设备状态，不铺满整个界面。
- 4/8px 间距节奏，卡片半径不超过 8px，层级主要靠间距、细边框和克制阴影。
- 标题、正文和数据使用系统字体；数字保持稳定宽度，避免网络字体依赖。
- hover/pressed 仅改变颜色或阴影，不改变元素尺寸和布局。
- 动效 150-300ms，支持 reduced motion；无装饰性渐变球、bokeh 或营销 Hero。
- 页面 section 默认无框；卡片只用于独立重复对象、modal 和明确工具表面，禁止卡片套卡片。

## Iconography

- 生成应用统一使用 Lucide，使用一致线性风格和稳定尺寸 token。
- 图标必须有文本或 accessible name，不能只靠图标传达复杂状态。
- 本设计系统预览不打包手绘 SVG 或竞品图标资产；组件接受外部 icon slot，生产生成器注入 Lucide。
- emoji 和 Unicode 符号不作为结构图标。

## Themes

- 主题是 Builder 生成阶段的确定性输入；生成后的家庭应用不显示主题配置、CLI、Bridge 或审计页面。
- `theme-index.generated.json` 与 `tokens/themes.generated.css` 由生产主题目录和编译器生成，是设计系统预览的唯一主题真相源。
- 24 个 preset 分属 12 个结构家族：易来 PRO 核心、纯净极简、温暖住宅、自然舒适、夜间氛围、沉浸控制台、专业中控、墙面触控、安装调试、高对比无障碍、建筑照明和多协议互联。
- 每个 preset 同时提供 light/dark token scope；默认模式、密度和摘要见 `theme-index.generated.json`。
- 目录可解析和 specimen 可预览不等于生产验收完成；只有真实 Skill/CLI 生成、安装、build、Bridge、浏览器交互和截图门禁全部通过后，preset 才能计为生产可用。

## Component Contracts

- Form：Input、Select、Checkbox、Switch、Slider、ColorPicker。布尔值必须用 Switch/Checkbox，灯光颜色必须用色盘或 swatch，不向最终用户暴露 `true/false` 或原始整数颜色字段。
- Navigation：AppNavigation、Tabs、Menu。顶级导航保持稳定，Tabs 仅切换同级视图，低频命令进入 Menu。
- Feedback：StatusBadge、InlineNotice、Tooltip、Toast。状态必须有文字，错误包含恢复动作，Toast 不抢焦点。
- Overlay：Dialog、Sheet、ModalSurface。支持 Esc、焦点圈定、滚动锁、关闭后焦点恢复；移动端 Sheet 从底部呈现。
- Domain：DeviceTile、ControllerSurface。只渲染 Runtime capability 证明的灯光、窗帘、温控、开关、传感器、网关、面板、旋钮、Matter 或 DALI 控制。
- Shell：AppShell。desktop、tablet、mobile、wall 共用信息架构，只改变导航呈现和密度。

## Interaction Contracts

- 所有可点击目标至少 44x44px；相邻目标至少保留 8px 间隔。
- hover、pressed、focus、disabled、loading、error、read-only、offline 均使用语义 token，并保留文字或 ARIA 状态。
- 动效只表达状态或层级变化，持续 150-300ms，并遵循 `prefers-reduced-motion`。
- Dialog/Sheet 中未保存的编辑由产品层确认后再关闭；危险操作不得放入普通导航或无说明的快捷控件。
- mobile 375、tablet 768、wall 1024、desktop 1440 是固定回归视口；不得产生页面级横向滚动或文本遮挡。

## Index

- `tokens/`：primitive、semantic、component token。
- `components/`：动作、表单、反馈、导航、overlay、智能家居领域组件与 app shell。
- `foundations/`：颜色、排版、间距和状态 specimen。
- `starting-points/`：desktop、tablet、mobile、wall 应用壳。
- `theme-index.generated.json`：24 个 preset 的家族、默认模式、密度和 resolved digest。
- `_ds_manifest.json`、`_ds_bundle.js`、`preview.html`：由 Baoyu Design 工具生成，不手工编辑。
