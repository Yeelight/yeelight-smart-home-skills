# Yeelight Smart Home Skills

English | [简体中文](README.zh-CN.md)

Official Yeelight agent Skills for controlling a smart home and generating tailored smart-home applications. This repository contains the installable Skill source. Versioned archives belong in [GitHub Releases](https://github.com/Yeelight/yeelight-smart-home-skills/releases), not in the Git tree.

## Skills

| Skill | What it provides | Use it when | Runtime |
| --- | --- | --- | --- |
| [`yeelight-smart-home`](skills/yeelight-smart-home/) | Natural-language control, query, diagnostics, organization, scenes, automations, lighting design, product knowledge, memory, and recommendations | You want an AI agent to operate or help design a Yeelight home | `yeelight-home >= 0.1.20` |
| [`yeelight-pro-app-builder`](skills/yeelight-pro-app-builder/) | Generates a modular, local Yeelight application from one request and proven Runtime capabilities | You want a focused mobile, tablet, wall-panel, or desktop control application | `yeelight-home >= 0.1.19` |

Both Skills use the separately installed [`yeelight-home`](https://github.com/Yeelight/yeelight-home) Runtime. They do not embed account credentials or bypass Runtime policy and confirmation checks.

## Install

Install the Runtime first:

```sh
brew install Yeelight/tap/yeelight-home
yeelight-home doctor --json
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

| Project | Role | Core capability | GitHub |
| --- | --- | --- | --- |
| Yeelight CLI | General AI command line | Authentication, API access, MCP client, and automation-friendly commands | [Yeelight/yeelight-cli](https://github.com/Yeelight/yeelight-cli) |
| Yeelight Metadata MCP | Metadata discovery MCP server | Product, capability, task, and action metadata | [Yeelight/yeelight-metadata-mcp](https://github.com/Yeelight/yeelight-metadata-mcp) |
| Yeelight IoT MCP | Device-control MCP server | MCP-native access to Yeelight IoT services | [Yeelight/yeelight-iot-mcp](https://github.com/Yeelight/yeelight-iot-mcp) |
| Yeelight Home | Local smart-home Runtime CLI | Authentication, query, control, diagnostics, policy, and structured invocation | [Yeelight/yeelight-home](https://github.com/Yeelight/yeelight-home) |
| Yeelight Smart Home Skills | Agent Skills | Direct smart-home operation and modular app generation | [Yeelight/yeelight-smart-home-skills](https://github.com/Yeelight/yeelight-smart-home-skills) |

## License

Repository-maintained code and both Skills are licensed under the [Apache License 2.0](LICENSE). Third-party components retain their own licenses and notices.
