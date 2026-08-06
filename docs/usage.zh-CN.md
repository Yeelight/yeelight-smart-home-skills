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

## Yeelight Interactive Light Experiences

需要让访客在实体 Yeelight 灯光装置前直接体验时，使用展会 Skill。AI Host 会自动启动或复用本机回环服务，访客不需要运行服务命令，也不需要手动粘贴 localhost 地址。

```text
使用 yeelight-interactive-light-experiences 启动 IFA 交互合集，并先打开 Fortune Light。
```

合集包含十二个独立页面，Fortune Light 是推荐入口。访客选择会先变成受约束的 AI 灯光方案，只有本地执行器可以调用 `yeelight-home invoke --stdin`。服务只监听 `127.0.0.1`，同一时间只保留一个访客会话，不开放局域网或手机参与入口。

真实硬件使用 `live-auto` 重新校验受保护的 EU 绑定，然后解析为明确绑定的四灯象限代理或十六灯拓扑。从四灯开发绑定切换到现场十六灯绑定只需操作员替换一次绑定，Host 启动命令和访客页面不变。真实绑定缺失或校验失败会直接停止，不会静默降级。Mock 结果会标记为“十六灯确定性模拟 parity”，不能描述成 IFA 真实硬件验证。

访客快速路径在 Runtime 接受成功控制后直接反馈，避免重复读状态以保持响应速度；写入失败、超时或取消后会执行一次独立协调读取。因此结果标签会明确区分“命令已确认”和“读回已验证”。

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
- 交互合集无法启动：确认 Agent host 可以执行本地 Skill 命令，再重试 Skill 的自动 `start` 动作；已有健康服务时不要手动再启动第二个服务。
- Builder 校验失败：保留生成应用和校验输出，修复报告的契约后重新运行 `validate-app.mjs`，通过后再启动开发服务器。
