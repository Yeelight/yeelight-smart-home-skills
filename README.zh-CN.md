# Yeelight Smart Home Skills

[English](README.md) | 简体中文

易来官方智能家居 Agent Skills，用于直接操作智能家居，以及按用户需求生成专属智能家居应用。本仓库只保存可安装的 Skill 源码；带版本的压缩包应位于 [GitHub Releases](https://github.com/Yeelight/yeelight-smart-home-skills/releases)，不重复放入 Git 当前树。

## Skills

| Skill | 能力 | 适用场景 | Runtime |
| --- | --- | --- | --- |
| [`yeelight-smart-home`](skills/yeelight-smart-home/) | 自然语言控制、查询、诊断、整理、场景、自动化、灯光设计、产品知识、记忆和推荐 | 希望 AI Agent 操作或协助设计 Yeelight 智能家居 | `yeelight-home >= 0.1.20` |
| [`yeelight-pro-app-builder`](skills/yeelight-pro-app-builder/) | 根据一个需求和已验证的 Runtime 能力，生成模块化本地 Yeelight 应用 | 需要面向手机、平板、墙屏或桌面的专用控制应用 | `yeelight-home >= 0.1.19` |

两个 Skill 都使用单独安装的 [`yeelight-home`](https://github.com/Yeelight/yeelight-home) Runtime，不内置账号凭据，也不会绕过 Runtime 的策略和确认门禁。

## 让 AI 一句话安装

把下面其中一句交给能够执行本地命令的 AI Agent。每句话只指定一个 Skill，避免装错能力。

**Yeelight Smart Home：**

```text
请从 Yeelight 官方 GitHub Release 或已支持的包管理器，为我的操作系统安装 Yeelight Home Runtime，然后只从 https://github.com/Yeelight/yeelight-smart-home-skills 安装 `yeelight-smart-home` Skill；执行 `yeelight-home version --json`、`yeelight-home doctor --json` 和 `yeelight-home auth status --json`，需要登录时只引导我在本机运行 `yeelight-home auth login --qr`，刷新或重启 Agent host 并确认它已发现 `yeelight-smart-home`；只使用 Yeelight 官方来源，不要要求我把 token、密码、cookie 或扫码结果粘贴到聊天里，若宿主或渠道不受支持就明确报告并停止，不要臆造命令。
```

**Yeelight PRO App Builder：**

```text
请从 Yeelight 官方 GitHub Release 或已支持的包管理器，为我的操作系统安装 Yeelight Home Runtime，然后只从 https://github.com/Yeelight/yeelight-smart-home-skills 安装 `yeelight-pro-app-builder` Skill；执行 `yeelight-home version --json`、`yeelight-home doctor --json` 和 `yeelight-home auth status --json`，需要登录时只引导我在本机运行 `yeelight-home auth login --qr`，确认 Node.js 不低于 22，刷新或重启 Agent host 并确认它已发现 `yeelight-pro-app-builder`；只使用 Yeelight 官方来源，不要要求我把 token、密码、cookie 或扫码结果粘贴到聊天里，若宿主或渠道不受支持就明确报告并停止，不要臆造命令。
```

## 安装

先安装 Runtime：

```sh
brew install Yeelight/tap/yeelight-home
yeelight-home version --json
yeelight-home doctor --json
yeelight-home auth status --json
yeelight-home auth login --qr
```

再通过 skills.sh 安装一个或两个 Skill：

```sh
npx skills add https://github.com/Yeelight/yeelight-smart-home-skills --skill yeelight-smart-home
npx skills add https://github.com/Yeelight/yeelight-smart-home-skills --skill yeelight-pro-app-builder
```

OpenClaw 用户也可以从可选的 ClawHub 渠道安装直控 Skill：

```sh
openclaw skills install @yeelight/yeelight-smart-home
```

其他操作系统、手动安装、升级和验证方式见[安装指南](docs/installation.zh-CN.md)。

## 使用

安装后可以直接向 Agent 提出自然语言请求：

```text
使用 yeelight-smart-home 列出客厅里的灯并显示当前状态。
```

```text
使用 yeelight-smart-home 为我设计一个放松的晚间灯光场景，持久化修改前先预览方案。
```

```text
使用 yeelight-pro-app-builder 生成一个控制客厅灯和窗帘的紧凑移动端应用，使用明亮绿色主题。
```

常见工作流、安全行为、故障排查和 Builder 产物验证见[使用指南](docs/usage.zh-CN.md)。

## Yeelight AI 能力矩阵

| 项目 | 定位与核心能力 | 适用场景 | GitHub |
| --- | --- | --- | --- |
| Yeelight Home | 首选本地语义 Runtime，通过统一结构化 `invoke --stdin` 边界提供查询、控制、场景、自动化、灯光设计、诊断、产品知识和生成应用能力。 | 需要稳定、受策略保护的智能家居执行层的 Agent host、本地自动化和应用。 | [Yeelight/yeelight-home](https://github.com/Yeelight/yeelight-home) |
| Yeelight Smart Home Skills | 官方 Agent Skills：Smart Home 把自然语言转换为安全的 Runtime 操作；PRO App Builder 基于已验证能力生成专用本地应用。 | 需要智能家居对话工作流或应用生成能力的 Agent host。 | [Yeelight/yeelight-smart-home-skills](https://github.com/Yeelight/yeelight-smart-home-skills) |
| Yeelight AI CLI | 统一终端工作台和 MCP 客户端，连接 Cloud、Metadata 和 LAN 服务，提供本地 profile、安全快捷命令、诊断、脚本和 AI 客户端配置。 | 希望通过通用 MCP 与自动化命令行入口操作的用户、脚本和 CI。 | [Yeelight/yeelight-cli](https://github.com/Yeelight/yeelight-cli) |
| Yeelight IoT MCP | 官方托管或可自行部署的 Streamable HTTP MCP 服务，提供拓扑、实时状态、设备控制和场景执行。 | 需要直接发现和控制 IoT 设备的 MCP 客户端。 | [Yeelight/yeelight-iot-mcp](https://github.com/Yeelight/yeelight-iot-mcp) |
| Yeelight Metadata MCP | 官方托管或可自行部署的 Streamable HTTP MCP 服务，提供受保护的家庭、房间、组、面板、场景、自动化、收藏和账号元数据工作流。 | 需要检查和管理元数据的 MCP 客户端。 | [Yeelight/yeelight-metadata-mcp](https://github.com/Yeelight/yeelight-metadata-mcp) |

Yeelight Home 还提供系统凭据存储、本地 QR 登录、秘密脱敏诊断、预览与校验、调用方确认和 Runtime 策略/写后读取、本地记忆与推荐、实操经验，以及机器可读的 intent schema 和解释。跨平台二进制通过 GitHub Release、npm 和已支持的包管理器分发。

典型组合：智能家居 Agent 和生成应用 -> Skills -> Yeelight Home；终端用户和脚本 -> Yeelight AI CLI；MCP 客户端 -> IoT MCP 和/或 Metadata MCP。

## 许可证

仓库维护的代码以及两个 Skill 均采用 [Apache License 2.0](LICENSE)。第三方组件继续遵循其各自许可证和声明。
