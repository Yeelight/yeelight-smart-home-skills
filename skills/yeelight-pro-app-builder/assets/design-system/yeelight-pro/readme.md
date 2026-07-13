# Yeelight PRO Product Design System

面向 `yeelight-pro-app-builder` 生成应用的产品设计系统。它以易来 PRO 的专业全屋照明与设备管理体验为核心，提供可组合主题、语义 token、基础组件和 mobile/tablet/desktop/wall 应用壳起点。

## Sources

- 代码源：`yeelight-smart-home/skill/yeelight-pro-app-builder` 当前生成模板、主题定义和 reference-home。
- 产品约束：父 Trellis 任务 `07-11-yeelight-pro-app-builder-product-system-rebuild`。
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

- `yeelight-pro-light`：默认专业日间体验。
- `warm-home`：暖色住宅氛围。
- `night-ambient`：低照度深色体验。
- `installer-contrast`：安装调试高对比体验。

## Index

- `tokens/`：primitive、semantic、component token。
- `components/`：动作、反馈、导航、overlay 与 app shell 组件。
- `foundations/`：颜色、排版、间距和状态 specimen。
- `starting-points/`：desktop、tablet、mobile、wall 应用壳。
- `_ds_manifest.json`、`_ds_bundle.js`、`preview.html`：由 Baoyu Design 工具生成，不手工编辑。
