# 安装指南

[English](installation.md)

## 让 AI 一句话安装

每次只使用一个 Skill 对应的提示词。AI 必须使用官方来源，验证 Runtime 和宿主发现结果；若本地宿主不受支持，应停止并明确说明，不能猜测命令。

### `yeelight-smart-home`

```text
请从 Yeelight 官方 GitHub Release 或已支持的包管理器，为我的操作系统安装 Yeelight Home Runtime，然后只从 https://github.com/Yeelight/yeelight-smart-home-skills 安装 `yeelight-smart-home` Skill；如果无法访问 GitHub，就改用官方只读镜像 https://gitee.com/yeelight/yeelight-smart-home-skills 或 https://gitcode.com/Yeelight/yeelight-smart-home-skills；执行 `yeelight-home version --json`、`yeelight-home doctor --json` 和 `yeelight-home auth status --json`，需要登录时只引导我在本机运行 `yeelight-home auth login --qr`，刷新或重启 Agent host 并确认它已发现 `yeelight-smart-home`；只使用 Yeelight 官方来源，不要要求我把 token、密码、cookie 或扫码结果粘贴到聊天里，若宿主或渠道不受支持就明确报告并停止，不要臆造命令。
```

### `yeelight-pro-app-builder`

```text
请从 Yeelight 官方 GitHub Release 或已支持的包管理器，为我的操作系统安装 Yeelight Home Runtime，然后只从 https://github.com/Yeelight/yeelight-smart-home-skills 安装 `yeelight-pro-app-builder` Skill；如果无法访问 GitHub，就改用官方只读镜像 https://gitee.com/yeelight/yeelight-smart-home-skills 或 https://gitcode.com/Yeelight/yeelight-smart-home-skills；执行 `yeelight-home version --json`、`yeelight-home doctor --json` 和 `yeelight-home auth status --json`，需要登录时只引导我在本机运行 `yeelight-home auth login --qr`，确认 Node.js 不低于 22，刷新或重启 Agent host 并确认它已发现 `yeelight-pro-app-builder`；只使用 Yeelight 官方来源，不要要求我把 token、密码、cookie 或扫码结果粘贴到聊天里，若宿主或渠道不受支持就明确报告并停止，不要臆造命令。
```

## 1. 安装 Yeelight Home

两个 Skill 都依赖本地 `yeelight-home` Runtime。

### Homebrew

```sh
brew install Yeelight/tap/yeelight-home
```

### npm

```sh
npm install -g yeelight-home
```

### GitHub Release

从 [Yeelight Home Releases](https://github.com/Yeelight/yeelight-home/releases) 下载适合当前系统的安装包，并确保 `yeelight-home` 位于 `PATH`。

验证 Runtime 并完成登录。不要把凭据发给 AI 助手：

```sh
yeelight-home version --json
yeelight-home doctor --json
yeelight-home auth status --json
yeelight-home auth login --qr
```

## 2. 安装 Skill

### skills.sh

```sh
npx skills add https://github.com/Yeelight/yeelight-smart-home-skills --skill yeelight-smart-home
npx skills add https://github.com/Yeelight/yeelight-smart-home-skills --skill yeelight-pro-app-builder
```

无法访问 GitHub 时，把命令中的仓库地址替换为官方 Gitee 镜像
`https://gitee.com/yeelight/yeelight-smart-home-skills` 或 GitCode 镜像
`https://gitcode.com/Yeelight/yeelight-smart-home-skills`，并保持 `--skill`
参数不变。

可以只安装需要的 Skill，也可以执行两条命令全部安装。

### OpenClaw / ClawHub

从 Yeelight 官方 listing 安装直控 Skill：

```sh
clawhub install @yeelight/yeelight-smart-home
```

GitHub 仓库是采用 Apache-2.0 的规范源。ClawHub 当前会把平台版本许可证元数据显示为 MIT-0，但这一平台限制不会改变源码许可证。`yeelight-pro-app-builder` 尚未在 ClawHub 上架，必须通过 skills.sh 或手动方式从 GitHub 安装。

### 手动安装

克隆本仓库，把 `skills/` 下选定的目录复制到 Agent 宿主的 Skill 目录。不要修改目录名，它需要与 `SKILL.md` 中的 `name` 一致。

```sh
git clone https://github.com/Yeelight/yeelight-smart-home-skills.git
```

具体 Skill 目录位置请参考宿主文档；常见宿主也可以直接通过 skills.sh 发现和安装本仓库。

## 3. 验证

安装后重启 Agent 宿主，先让它确认已识别 Skill，再请求设备操作。

应要求宿主返回准确的 Skill id，例如“列出已安装 Skill 并确认 `yeelight-smart-home` 是否可用”或“列出已安装 Skill 并确认 `yeelight-pro-app-builder` 是否可用”。只有笼统的“安装成功”但没有宿主发现结果，不应视为验证完成。

直控 Skill 还应单独验证 Runtime：

```sh
yeelight-home doctor --json --online
```

使用 Builder 前确认 Node.js 版本不低于 22：

```sh
node --version
```

## 升级

通过 GitHub 安装的副本可重新执行 skills.sh 命令刷新；ClawHub 直控 Skill 使用 `clawhub update @yeelight/yeelight-smart-home`。Runtime 应通过最初使用的包管理器独立升级。

升级后重新执行 `yeelight-home version --json`、`yeelight-home doctor --json`，并对所选 Skill 重新执行宿主发现验证。

## 故障排查

- 找不到 Runtime：确认启动 Agent host 的同一环境可以执行 `yeelight-home version --json`。
- 需要登录：只在本机运行 `yeelight-home auth login --qr`，再执行 `yeelight-home auth status --json`；不要通过聊天传递扫码结果。
- 未发现 Skill：使用准确的 Skill id 重装，刷新或重启宿主，并检查宿主配置的 Skill 目录。
- 宿主或市场不受支持：若宿主支持标准 Agent Skills，可改用 skills.sh 或手动仓库路径；否则停止并明确报告不受支持的接入方式。

## 安全说明

- 不要把 token、密码、cookie 或扫码登录结果粘贴到聊天中。
- Skill 调用本地 Runtime；Builder 生成的浏览器应用通过 loopback Bridge 通信。
- 持久化或敏感修改仍受 Runtime 校验与确认门禁约束。
