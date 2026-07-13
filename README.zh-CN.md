# Yeelight Smart Home Skills

[English](README.md) | 简体中文

易来官方智能家居 Agent Skills，用于直接操作智能家居，以及按用户需求生成专属智能家居应用。本仓库只保存可安装的 Skill 源码；带版本的压缩包应位于 [GitHub Releases](https://github.com/Yeelight/yeelight-smart-home-skills/releases)，不重复放入 Git 当前树。

## Skills

| Skill | 能力 | 适用场景 | Runtime |
| --- | --- | --- | --- |
| [`yeelight-smart-home`](skills/yeelight-smart-home/) | 自然语言控制、查询、诊断、整理、场景、自动化、灯光设计、产品知识、记忆和推荐 | 希望 AI Agent 操作或协助设计 Yeelight 智能家居 | `yeelight-home >= 0.1.20` |
| [`yeelight-pro-app-builder`](skills/yeelight-pro-app-builder/) | 根据一个需求和已验证的 Runtime 能力，生成模块化本地 Yeelight 应用 | 需要面向手机、平板、墙屏或桌面的专用控制应用 | `yeelight-home >= 0.1.19` |

两个 Skill 都使用单独安装的 [`yeelight-home`](https://github.com/Yeelight/yeelight-home) Runtime，不内置账号凭据，也不会绕过 Runtime 的策略和确认门禁。

## 安装

先安装 Runtime：

```sh
brew install Yeelight/tap/yeelight-home
yeelight-home doctor --json
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

| 项目 | 定位 | 核心能力 | GitHub |
| --- | --- | --- | --- |
| Yeelight CLI | 通用 AI 命令行 | 登录鉴权、API 访问、MCP 客户端和自动化命令 | [Yeelight/yeelight-cli](https://github.com/Yeelight/yeelight-cli) |
| Yeelight Metadata MCP | 元数据发现 MCP 服务 | 产品、能力、任务与动作元数据 | [Yeelight/yeelight-metadata-mcp](https://github.com/Yeelight/yeelight-metadata-mcp) |
| Yeelight IoT MCP | 设备控制 MCP 服务 | MCP 原生 Yeelight IoT 服务访问 | [Yeelight/yeelight-iot-mcp](https://github.com/Yeelight/yeelight-iot-mcp) |
| Yeelight Home | 本地智能家居 Runtime CLI | 鉴权、查询、控制、诊断、策略和结构化调用 | [Yeelight/yeelight-home](https://github.com/Yeelight/yeelight-home) |
| Yeelight Smart Home Skills | Agent Skills | 智能家居直控和模块化应用生成 | [Yeelight/yeelight-smart-home-skills](https://github.com/Yeelight/yeelight-smart-home-skills) |

## 许可证

仓库维护的代码以及两个 Skill 均采用 [Apache License 2.0](LICENSE)。第三方组件继续遵循其各自许可证和声明。
