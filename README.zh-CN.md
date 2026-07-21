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
| [`yeelight-pro-app-builder`](skills/yeelight-pro-app-builder/) | 根据一个需求和已验证的 Runtime 能力，生成模块化本地 Yeelight 应用 | 需要面向手机、平板、墙屏或桌面的专用控制应用 | `yeelight-home >= 0.1.21` |

两个 Skill 都使用单独安装的 [`yeelight-home`](https://github.com/Yeelight/yeelight-home) Runtime，不内置账号凭据，也不会绕过 Runtime 的策略和确认门禁。

## 这些项目怎样配合

- **Yeelight Home 是底座。**它负责扫码、当前家庭、Cloud/LAN 执行、安全检查和结果验证。
- **Yeelight Smart Home 是大多数人的推荐 Skill。**它先让 AI 学会易来规则和照明最佳实践，再通过底座完成操作。
- **Yeelight MCP 是 MCP-only 客户端的标准云端路线。**一次 setup 会同时配置内部 Metadata 与 IoT 两个服务；它们都不是两个 Skill 的依赖。

想用日常语言操作和管理家庭，选择 `yeelight-smart-home`；只有目标是生成一个
专用本地控制应用时，才选择 App Builder。

## 让 AI 一句话安装

把下面其中一句交给能够执行本地命令的 AI Agent。每句话只指定一个 Skill，避免装错能力。

**Yeelight Smart Home：**

```text
请从 Yeelight 官方 GitHub Release、国内官方镜像或已支持的包管理器安装 `yeelight-home`，然后运行 `yeelight-home setup --lang zh-CN --mode skill --agent auto`。引导我用 Yeelight Pro APP 首页右上角 `+` -> MCP 授权扫码并等待完成；只使用 Yeelight 官方来源，不要索要或打印 token、密码、Cookie、Client ID 或扫码结果。最后刷新 Agent host，确认它已发现 `yeelight-smart-home`，再运行 `yeelight-home doctor --json` 和只读家庭发现验证。
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

## 推荐路线

`yeelight-home` 是唯一 CLI、登录入口和执行 Runtime。`yeelight-smart-home` 是普通用户的推荐满血路线；客户端不能安装 Skill 时，使用 `yeelight-home setup --mode mcp` 配置轻量连接；真人终端操作和脚本仍直接使用同一个 `yeelight-home`。

## 许可证

仓库维护的代码以及两个 Skill 均采用 [Apache License 2.0](LICENSE)。第三方组件继续遵循其各自许可证和声明。
