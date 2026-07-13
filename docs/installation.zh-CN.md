# 安装指南

[English](installation.md)

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
yeelight-home --version
yeelight-home doctor --json
yeelight-home auth login --qr
yeelight-home auth status --json
```

## 2. 安装 Skill

### skills.sh

```sh
npx skills add https://github.com/Yeelight/yeelight-smart-home-skills --skill yeelight-smart-home
npx skills add https://github.com/Yeelight/yeelight-smart-home-skills --skill yeelight-pro-app-builder
```

可以只安装需要的 Skill，也可以执行两条命令全部安装。

### OpenClaw / ClawHub

可选的 ClawHub 渠道目前用于直控 Skill：

```sh
openclaw skills install @yeelight/yeelight-smart-home
```

### 手动安装

克隆本仓库，把 `skills/` 下选定的目录复制到 Agent 宿主的 Skill 目录。不要修改目录名，它需要与 `SKILL.md` 中的 `name` 一致。

```sh
git clone https://github.com/Yeelight/yeelight-smart-home-skills.git
```

具体 Skill 目录位置请参考宿主文档；常见宿主也可以直接通过 skills.sh 发现和安装本仓库。

## 3. 验证

安装后重启 Agent 宿主，先让它确认已识别 Skill，再请求设备操作。

直控 Skill 还应单独验证 Runtime：

```sh
yeelight-home doctor --json --online
```

使用 Builder 前确认 Node.js 版本不低于 22：

```sh
node --version
```

## 升级

重新执行 skills.sh 安装命令即可刷新 Skill。Runtime 应通过最初使用的包管理器独立升级。

## 安全说明

- 不要把 token、密码、cookie 或扫码登录结果粘贴到聊天中。
- Skill 调用本地 Runtime；Builder 生成的浏览器应用通过 loopback Bridge 通信。
- 持久化或敏感修改仍受 Runtime 校验与确认门禁约束。
