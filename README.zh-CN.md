# Yeelight Smart Home Skills

[English](README.md) | 简体中文

## 官方仓库与国内镜像

[GitHub](https://github.com/Yeelight/yeelight-smart-home-skills) 是 Issue、贡献、
CI 和发布的规范源。国内无法稳定访问 GitHub 时，可使用只读的
[Gitee 镜像](https://gitee.com/yeelight/yeelight-smart-home-skills) 或
[GitCode 镜像](https://gitcode.com/Yeelight/yeelight-smart-home-skills)；
[GitLab.com](https://gitlab.com/Yeelight/yeelight-smart-home-skills) 是额外的
全球备用源。可以从任一可访问镜像克隆或安装源码，但请仍在 GitHub 提交 Issue 和
贡献修改。

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
请从 Yeelight 官方 GitHub Release 或已支持的包管理器，为我的操作系统安装 Yeelight Home Runtime，然后只从 https://github.com/Yeelight/yeelight-smart-home-skills 安装 `yeelight-smart-home` Skill；如果无法访问 GitHub，就改用官方只读镜像 https://gitee.com/yeelight/yeelight-smart-home-skills 或 https://gitcode.com/Yeelight/yeelight-smart-home-skills；执行 `yeelight-home version --json`、`yeelight-home doctor --json` 和 `yeelight-home auth status --json`，需要登录时只引导我在本机运行 `yeelight-home auth login --qr`，刷新或重启 Agent host 并确认它已发现 `yeelight-smart-home`；只使用 Yeelight 官方来源，不要要求我把 token、密码、cookie 或扫码结果粘贴到聊天里，若宿主或渠道不受支持就明确报告并停止，不要臆造命令。
```

**Yeelight PRO App Builder：**

```text
请从 Yeelight 官方 GitHub Release 或已支持的包管理器，为我的操作系统安装 Yeelight Home Runtime，然后只从 https://github.com/Yeelight/yeelight-smart-home-skills 安装 `yeelight-pro-app-builder` Skill；如果无法访问 GitHub，就改用官方只读镜像 https://gitee.com/yeelight/yeelight-smart-home-skills 或 https://gitcode.com/Yeelight/yeelight-smart-home-skills；执行 `yeelight-home version --json`、`yeelight-home doctor --json` 和 `yeelight-home auth status --json`，需要登录时只引导我在本机运行 `yeelight-home auth login --qr`，确认 Node.js 不低于 22，刷新或重启 Agent host 并确认它已发现 `yeelight-pro-app-builder`；只使用 Yeelight 官方来源，不要要求我把 token、密码、cookie 或扫码结果粘贴到聊天里，若宿主或渠道不受支持就明确报告并停止，不要臆造命令。
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

无法访问 GitHub 时，把命令中的仓库地址替换为官方 Gitee 镜像
`https://gitee.com/yeelight/yeelight-smart-home-skills` 或 GitCode 镜像
`https://gitcode.com/Yeelight/yeelight-smart-home-skills`，并保持 `--skill`
参数不变。

OpenClaw 用户可以从官方 ClawHub listing 安装直控 Skill：

```sh
clawhub install @yeelight/yeelight-smart-home
```

GitHub 仓库仍是采用 Apache-2.0 的规范源。ClawHub 当前会把平台版本许可证元数据显示为 MIT-0，但这一平台限制不会改变源码许可证。`yeelight-pro-app-builder` 尚未在 ClawHub 上架，应通过 skills.sh 从 GitHub 安装。

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
| Yeelight Metadata MCP | 新 MCP 用户推荐的统一云端入口，提供受保护的家庭、房间、设备、设备组、面板、情景、自动化、收藏、维护和账号工作流，并支持多 Region 授权和请求级家庭选择。 | 需要广泛发现、检查和管理工作流的新 MCP 集成与 AI 客户端。 | [Yeelight/yeelight-metadata-mcp](https://github.com/Yeelight/yeelight-metadata-mcp) |
| Yeelight IoT MCP | 面向特定直接控制场景的专业补充，提供 Metadata MCP 尚未完全覆盖的拓扑与实时状态访问、设备控制和情景执行。 | 依赖 `control_node`、`execute_scene` 或特定实时控制的既有集成与客户端。 | [Yeelight/yeelight-iot-mcp](https://github.com/Yeelight/yeelight-iot-mcp) |

Yeelight Home 还提供系统凭据存储、本地 QR 登录、秘密脱敏诊断、预览与校验、调用方确认和 Runtime 策略/写后读取、本地记忆与推荐、实操经验，以及机器可读的 intent schema 和解释。跨平台二进制通过 GitHub Release、npm 和已支持的包管理器分发。

典型组合：智能家居 Agent 和生成应用 -> Skills -> Yeelight Home；终端用户和脚本 -> Yeelight AI CLI；新 MCP 集成 -> Metadata MCP；仅在 Metadata MCP 尚未覆盖的特定直接控制或情景执行场景下增加 IoT MCP。

## 许可证

仓库维护的代码以及两个 Skill 均采用 [Apache License 2.0](LICENSE)。第三方组件继续遵循其各自许可证和声明。
