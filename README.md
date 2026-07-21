# Yeelight Smart Home Skills

English | [简体中文](README.zh-CN.md)

## Official Repository And Mirrors

[GitHub](https://github.com/Yeelight/yeelight-smart-home-skills) is the
canonical source for issues, contributions, CI, and releases. Read-only mirrors
are available on
[Gitee](https://gitee.com/yeelight/yeelight-smart-home-skills) and
[GitCode](https://gitcode.com/Yeelight/yeelight-smart-home-skills) for users who
cannot reach GitHub reliably, with
[GitLab.com](https://gitlab.com/Yeelight/yeelight-smart-home-skills) as an
additional global fallback. Clone or install source from any reachable mirror,
but report issues and contribute changes on GitHub.

Official Yeelight agent Skills for controlling a smart home and generating tailored smart-home applications. This repository contains the installable Skill source. Versioned archives belong in [GitHub Releases](https://github.com/Yeelight/yeelight-smart-home-skills/releases), not in the Git tree.

## Skills

| Skill | What it provides | Use it when | Runtime |
| --- | --- | --- | --- |
| [`yeelight-smart-home`](skills/yeelight-smart-home/) | Natural-language control, query, diagnostics, organization, scenes, automations, lighting design, product knowledge, memory, and recommendations | You want an AI agent to operate or help design a Yeelight home | `yeelight-home >= 0.1.20` |
| [`yeelight-pro-app-builder`](skills/yeelight-pro-app-builder/) | Generates a modular, local Yeelight application from one request and proven Runtime capabilities | You want a focused mobile, tablet, wall-panel, or desktop control application | `yeelight-home >= 0.1.21` |

Both Skills use the separately installed [`yeelight-home`](https://github.com/Yeelight/yeelight-home) Runtime. They do not embed account credentials or bypass Runtime policy and confirmation checks.

## How The Pieces Fit

- **Yeelight Home is the foundation.** It handles QR sign-in, the selected home,
  Cloud/LAN execution, safety checks, and verification.
- **Yeelight Smart Home is the recommended Skill.** It teaches the AI Yeelight
  rules and lighting best practices, then uses the foundation to do the work.
- **Yeelight MCP is the standard cloud route for MCP-only clients.** One setup
  configures its Metadata and IoT services together. Neither cloud service is a
  dependency of either Skill.

Choose `yeelight-smart-home` when you want to talk naturally about your home.
Choose the App Builder only when your goal is to generate a dedicated local
control application.

## Install With One Sentence

Give your local AI agent exactly one of these prompts. Each prompt names one Skill so the agent cannot silently install the wrong capability.

**Yeelight Smart Home:**

```text
Install `yeelight-home` from an official Yeelight GitHub Release, official mirror, or supported package manager, then run `yeelight-home setup --lang en-US --mode skill --agent auto`. Guide me to Yeelight Pro app Home -> top-right `+` -> MCP Authorization and wait for my scan. Use only official Yeelight sources and never request or print a token, password, cookie, Client ID, or QR result. Restart the Agent host, confirm that it discovers `yeelight-smart-home`, then run `yeelight-home doctor --json` and read-only home discovery.
```

**Yeelight PRO App Builder:**

```text
Install the official Yeelight Home Runtime for my operating system from Yeelight's GitHub Release or a supported package manager, then install only the `yeelight-pro-app-builder` Skill from https://github.com/Yeelight/yeelight-smart-home-skills; if GitHub is unreachable, use the official read-only mirror at https://gitee.com/yeelight/yeelight-smart-home-skills or https://gitcode.com/Yeelight/yeelight-smart-home-skills; run `yeelight-home version --json`, `yeelight-home doctor --json`, and `yeelight-home auth status --json`, use the local `yeelight-home auth login --qr` flow if sign-in is required, verify Node.js 22 or later, restart or refresh my agent host and verify that it discovers `yeelight-pro-app-builder`; use only official Yeelight sources, never ask me to paste a token, password, cookie, or QR result into chat, and stop with the unsupported host or channel clearly reported instead of inventing commands.
```

## Install

Install the Runtime first:

```sh
brew install Yeelight/tap/yeelight-home
yeelight-home version --json
yeelight-home doctor --json
yeelight-home auth status --json
yeelight-home auth login --qr
```

Then install one or both Skills with skills.sh:

```sh
npx skills add https://github.com/Yeelight/yeelight-smart-home-skills --skill yeelight-smart-home
npx skills add https://github.com/Yeelight/yeelight-smart-home-skills --skill yeelight-pro-app-builder
```

If GitHub is unreachable, replace the repository URL with the official Gitee
mirror `https://gitee.com/yeelight/yeelight-smart-home-skills` or GitCode mirror
`https://gitcode.com/Yeelight/yeelight-smart-home-skills`; keep the same
`--skill` value.

OpenClaw users can install the direct-control Skill from its official ClawHub listing:

```sh
clawhub install @yeelight/yeelight-smart-home
```

The GitHub repository remains the canonical Apache-2.0 source. ClawHub currently displays MIT-0 as platform version metadata; that platform limitation does not change the source license. `yeelight-pro-app-builder` is not listed on ClawHub and should be installed from GitHub with skills.sh.

See [Installation](docs/installation.md) for other operating systems, manual installation, upgrades, and verification.

## Use

After installation, ask your agent naturally:

```text
Use yeelight-smart-home to list the lights in my living room and show their current state.
```

```text
Use yeelight-smart-home to design a relaxing evening lighting scene. Preview the plan before making persistent changes.
```

```text
Use yeelight-pro-app-builder to generate a compact mobile app for living-room lights and curtains, with a bright green theme.
```

See [Usage](docs/usage.md) for common workflows, safety behavior, troubleshooting, and Builder output validation.

## Recommended Path

`yeelight-home` is the only CLI, sign-in entry, and execution Runtime. `yeelight-smart-home` is the recommended full-intelligence path for ordinary users; use `yeelight-home setup --mode mcp` when a client cannot install Skills; human terminal workflows and scripts use the same `yeelight-home` directly.

## License

Repository-maintained code and both Skills are licensed under the [Apache License 2.0](LICENSE). Third-party components retain their own licenses and notices.
