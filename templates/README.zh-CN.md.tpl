# Yeelight Smart Home Skills

[English](README.md) | 简体中文

这是 Yeelight Smart Home agent skills 的官方公开发布仓库。默认入口是英文版 `README.md`，中文版会同步维护，方便中文用户、平台审核人员和内部发布验证使用。

## 已发布 Skill

| Skill | Version | Runtime | Packages |
| --- | --- | --- | --- |
| `{{skill}}` | `{{version}}` | `yeelight-home >= 0.1.7` | Agent Skill ZIP、Codex Plugin ZIP、Claude Skill ZIP、Copilot Skill ZIP |

## 这个 Skill 能做什么

`{{skill}}` 让兼容的 agent 平台可以通过本地 `yeelight-home` Runtime 控制、整理、诊断、设计和回答 Yeelight 智能家居相关问题。

它是一个 Skill 分发包，不是 Runtime 安装包。Skill 里只包含 agent 运行需要的指令、schema、catalog、reference、包元数据和平台适配材料。真实设备访问、账号认证、策略校验、敏感写操作确认这些能力都保留在单独安装的 runtime 里。

## 发布信息

- 仓库：{{repositoryUrl}}
- 最新 Release：{{releaseUrl}}
- 发布证据：`{{releasePath}}/`
- 校验和：`{{releasePath}}/checksums.txt`
- 验证摘要：`{{releasePath}}/validation-summary.json`

## 安装方式

### 让 AI 一句话帮你安装

如果你使用的是可以执行本地终端命令的 AI 助手，可以直接把下面这一句话发给它：

```text
请从 Yeelight 官方 GitHub Release 或已支持的包管理渠道，为我的系统安装 yeelight-home CLI，然后从 Yeelight 官方 Skill Release、ClawHub 或这个 GitHub 仓库安装 Yeelight Smart Home Skill。安装后用 `yeelight-home doctor --json` 验证 CLI，并引导我执行 `yeelight-home auth login --qr`；不要要求我把 token、密码或 cookie 粘贴到聊天里。
```

### ClawHub / OpenClaw

该 Skill 已发布到 Yeelight 官方 publisher namespace：

```sh
openclaw skills install @yeelight/{{skill}}
```

- ClawHub 页面：https://clawhub.ai/yeelight/skills/{{skill}}
- 状态：已发布且可安装。`@yeelight` publisher namespace 已生效；ClawHub 平台信任/官方认证仍在等待审核。

### skills.sh

该仓库已被 skills.sh 索引：

```sh
npx skills add {{repositoryInstallUrl}} --skill {{skill}}
```

- skills.sh 页面：https://www.skills.sh/yeelight/yeelight-smart-home-skills/{{skill}}
- 状态：已索引且可安装，页面可见安全审计通过标识。

### Codex / Agent Plugin

可以通过本仓库 marketplace metadata 安装，也可以下载：

```text
{{releasePath}}/{{skill}}-codex-plugin-v{{version}}.zip
```

### Claude Skill ZIP

下载并上传：

```text
{{releasePath}}/{{skill}}-claude-skill-v{{version}}.zip
```

### GitHub Copilot Agent Skill

使用：

```text
{{releasePath}}/{{skill}}-copilot-skill-v{{version}}.zip
```

### Open Agent Skills

使用：

```text
{{releasePath}}/{{skill}}-agent-skill-v{{version}}.zip
```

### LobeHub Skills

首次收录走网页请求表单：

```text
https://lobehub.com/zh/skills
```

点击 `请求收录`，提交：

```text
{{repositoryUrl}}
```

LobeHub 完成仓库收录后，再用 `@lobehub/market-cli` 认领所有权并发布后续版本。

### 需要审核或控制台配置的平台

Dify Marketplace、OpenAI GPT Store / Apps SDK、Coze、百炼、元器、千帆、火山方舟、NanoSkill、Molili/CocoLoop 等平台都有各自的审核、控制台、PR 或邮件流程。可复用的提审材料都放在 `submissions/` 目录下。

## Runtime 依赖

该 Skill 依赖单独安装的 `yeelight-home` runtime，并通过下面的命令调用：

```sh
yeelight-home invoke --stdin
```

这个仓库不会内置 runtime。发布 Skill 包时不要把 runtime 二进制、runtime 源码、本地工作区路径、内部原始文档、凭证或 API token 一起发布出去。

## Bridge Adapter

不能直接安装 Skill ZIP 的平台使用：

```text
adapters/yeelight-skill-bridge/
```

Bridge 暴露：

- `GET /health`
- `GET /openapi.json`
- `POST /invoke`
- `POST /mcp`

Bridge 只调用 `yeelight-home invoke --stdin`；认证、策略执行、敏感动作确认和真实设备访问仍由 runtime 负责。

## 平台状态

`platforms.json` 是当前各市场发布状态的事实来源。`submissions/skill-directory-submission-status.json` 记录每个平台的证据和剩余事项。

当前状态分类：

- 已发布且可安装：GitHub Release、ClawHub、skills.sh。
- 已提交或等待审核：LobeHub、NanoSkill、Molili/CocoLoop、Dify Marketplace。
- Adapter kit 已准备好，等待控制台审核：OpenAI GPT Store / Apps SDK、Coze、百炼、元器、千帆、火山方舟。

平台还在审核时，不要把它当成已发布。只有安装副本或线上 endpoint smoke 通过后，才可以把状态升级为已发布。

## 验证

校验 Release 文件：

```sh
cd {{releasePath}}
shasum -a 256 -c checksums.txt
```

运行完整发布资产检查：

```sh
node scripts/verify-publication-assets.mjs --skill {{skill}} --version {{version}}
```

该检查会覆盖 JSON 元数据、双语 README 互链、包校验和、各平台提审材料、Dify 包结构、Node 脚本语法，以及 bridge 的 health/invoke/MCP smoke。

## 可复用发布流程

后续 Yeelight 其他 Skill 或新版本发布时：

1. 在源仓库里走通通用 Skill release pipeline，并完成验证。
2. 用 `scripts/publish-skill-release.mjs` 刷新这个公开分发仓库。
3. 运行 `node scripts/verify-publication-assets.mjs --skill <skill-id> --version <x.y.z>`。
4. 通过各平台 CLI 或表单发布原生 Skill。
5. 对 API/MCP 类型平台，通过 bridge adapter 发布。
6. 把最终安装副本或线上 endpoint smoke 证据记录到 `platforms.json` 和 `submissions/skill-directory-submission-status.json`。
