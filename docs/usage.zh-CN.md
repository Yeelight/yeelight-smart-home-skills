# 使用指南

[English](usage.md)

## Yeelight Smart Home

直控 Skill 适用于智能家居查询、控制、诊断、整理、设计和产品知识问答。

示例：

```text
使用 yeelight-smart-home 显示所有离线设备，并按房间分组。
```

```text
使用 yeelight-smart-home 把客厅灯设置为适合阅读的暖色 40% 亮度。
```

```text
使用 yeelight-smart-home 诊断走廊自动化今天为什么没有执行。
```

```text
使用 yeelight-smart-home 提出一套全屋晚间灯光设计，应用持久化修改前先预览。
```

Skill 会把请求转换成一次结构化 Runtime 调用。Runtime 返回 `clarification_required` 时，只回答它提出的最小问题。删除、权限、解绑、转移、覆盖或清空类操作需要明确同意。

## Yeelight PRO App Builder

需要专用应用而不是 Agent 对话时使用 Builder。请求中说明房间、设备类型、目标屏幕、所需功能和视觉方向。

```text
使用 yeelight-pro-app-builder 生成一个一楼墙屏应用，包含灯光、窗帘、空调、场景和能耗传感器，使用深色高对比主题和大触控区域。
```

Builder 只生成选定模块和已验证的 Runtime 能力，不会把配置、审计或 CLI 页面放入生产应用。

生成后执行：

```sh
node scripts/validate-app.mjs /absolute/path/to/generated-app
npm install --prefix /absolute/path/to/generated-app
npm run build --prefix /absolute/path/to/generated-app
npm run dev --prefix /absolute/path/to/generated-app
```

安装依赖和构建需要顺序执行，避免构建读取到尚未安装完整的工作区。

## Runtime 命令

```sh
yeelight-home auth status --json
yeelight-home doctor --json --online
yeelight-home home list --json
```

Runtime 负责凭据、策略执行、设备访问和结构化写入确认。Skill 不应绕过 Runtime 或回退到原始云 API。

## 故障排查

- `runtime_missing`：安装 `yeelight-home`，或把 `YEELIGHT_HOME_BIN` 设置为其绝对路径。
- `auth_required`：在自己的终端执行 `yeelight-home auth login --qr`。
- `clarification_required`：回答 Runtime 返回的问题，不要猜测内部 ID。
- `blocked` 或 `not_supported`：按 Runtime 返回的安全替代方案处理。
- Builder 校验失败：保留生成应用和校验输出，修复报告的契约后重新运行 `validate-app.mjs`，通过后再启动开发服务器。
