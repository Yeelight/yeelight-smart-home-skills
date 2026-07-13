# Yeelight Smart Home Skills

English | [简体中文](README.zh-CN.md)

Official Yeelight agent Skills for controlling a smart home and generating tailored smart-home applications. This repository contains the installable Skill source. Versioned archives belong in [GitHub Releases](https://github.com/Yeelight/yeelight-smart-home-skills/releases), not in the Git tree.

## Skills

| Skill | What it provides | Use it when | Runtime |
| --- | --- | --- | --- |
| [`yeelight-smart-home`](skills/yeelight-smart-home/) | Natural-language control, query, diagnostics, organization, scenes, automations, lighting design, product knowledge, memory, and recommendations | You want an AI agent to operate or help design a Yeelight home | `yeelight-home >= 0.1.20` |
| [`yeelight-pro-app-builder`](skills/yeelight-pro-app-builder/) | Generates a modular, local Yeelight application from one request and proven Runtime capabilities | You want a focused mobile, tablet, wall-panel, or desktop control application | `yeelight-home >= 0.1.19` |

Both Skills use the separately installed [`yeelight-home`](https://github.com/Yeelight/yeelight-home) Runtime. They do not embed account credentials or bypass Runtime policy and confirmation checks.

## Install With One Sentence

Give your local AI agent exactly one of these prompts. Each prompt names one Skill so the agent cannot silently install the wrong capability.

**Yeelight Smart Home:**

```text
Install the official Yeelight Home Runtime for my operating system from Yeelight's GitHub Release or a supported package manager, then install only the `yeelight-smart-home` Skill from https://github.com/Yeelight/yeelight-smart-home-skills; run `yeelight-home version --json`, `yeelight-home doctor --json`, and `yeelight-home auth status --json`, use the local `yeelight-home auth login --qr` flow if sign-in is required, restart or refresh my agent host and verify that it discovers `yeelight-smart-home`; use only official Yeelight sources, never ask me to paste a token, password, cookie, or QR result into chat, and stop with the unsupported host or channel clearly reported instead of inventing commands.
```

**Yeelight PRO App Builder:**

```text
Install the official Yeelight Home Runtime for my operating system from Yeelight's GitHub Release or a supported package manager, then install only the `yeelight-pro-app-builder` Skill from https://github.com/Yeelight/yeelight-smart-home-skills; run `yeelight-home version --json`, `yeelight-home doctor --json`, and `yeelight-home auth status --json`, use the local `yeelight-home auth login --qr` flow if sign-in is required, verify Node.js 22 or later, restart or refresh my agent host and verify that it discovers `yeelight-pro-app-builder`; use only official Yeelight sources, never ask me to paste a token, password, cookie, or QR result into chat, and stop with the unsupported host or channel clearly reported instead of inventing commands.
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

OpenClaw users can install the direct-control Skill from the optional ClawHub channel:

```sh
openclaw skills install @yeelight/yeelight-smart-home
```

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

## Yeelight AI Capability Matrix

| Project | Role and capabilities | Best for | GitHub |
| --- | --- | --- | --- |
| Yeelight Home | Recommended local semantic Runtime with one structured `invoke --stdin` boundary for queries, control, scenes, automations, lighting design, diagnostics, product knowledge, and generated apps. | Agent hosts, local automation, and applications that need a stable and policy-aware smart-home execution layer. | [Yeelight/yeelight-home](https://github.com/Yeelight/yeelight-home) |
| Yeelight Smart Home Skills | Official Agent Skills: Smart Home turns natural language into safe Runtime operations; PRO App Builder generates focused local apps from proven Runtime capabilities. | Agent hosts that need conversational smart-home workflows or app generation. | [Yeelight/yeelight-smart-home-skills](https://github.com/Yeelight/yeelight-smart-home-skills) |
| Yeelight AI CLI | Unified terminal workspace and MCP client for Cloud, Metadata, and LAN services, with local profiles, safe shortcuts, diagnostics, scripting, and AI client configuration. | People, scripts, and CI that want one general MCP and automation entry point. | [Yeelight/yeelight-cli](https://github.com/Yeelight/yeelight-cli) |
| Yeelight IoT MCP | Hosted or self-hosted Streamable HTTP MCP server for topology, live state, device control, and scene execution. | MCP clients that need direct IoT discovery and control. | [Yeelight/yeelight-iot-mcp](https://github.com/Yeelight/yeelight-iot-mcp) |
| Yeelight Metadata MCP | Hosted or self-hosted Streamable HTTP MCP server for guarded home, room, group, panel, scene, automation, favorite, and account metadata workflows. | MCP clients that need metadata inspection and management. | [Yeelight/yeelight-metadata-mcp](https://github.com/Yeelight/yeelight-metadata-mcp) |

Yeelight Home also provides system credential storage, local QR login, secret-redacted diagnostics, preview and validation, caller confirmation and Runtime policy/readback behavior, local memory and recommendation support, operation lessons, and machine-readable intent schema/explanations. Cross-platform binaries are distributed through GitHub Releases, npm, and supported package managers.

Typical paths: smart-home agents and generated apps -> Skills -> Yeelight Home; terminal users and scripts -> Yeelight AI CLI; MCP clients -> IoT MCP and/or Metadata MCP.

## License

Repository-maintained code and both Skills are licensed under the [Apache License 2.0](LICENSE). Third-party components retain their own licenses and notices.
