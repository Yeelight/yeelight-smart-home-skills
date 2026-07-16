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
| [`yeelight-pro-app-builder`](skills/yeelight-pro-app-builder/) | Generates a modular, local Yeelight application from one request and proven Runtime capabilities | You want a focused mobile, tablet, wall-panel, or desktop control application | `yeelight-home >= 0.1.19` |

Both Skills use the separately installed [`yeelight-home`](https://github.com/Yeelight/yeelight-home) Runtime. They do not embed account credentials or bypass Runtime policy and confirmation checks.

## Install With One Sentence

Give your local AI agent exactly one of these prompts. Each prompt names one Skill so the agent cannot silently install the wrong capability.

**Yeelight Smart Home:**

```text
Install the official Yeelight Home Runtime for my operating system from Yeelight's GitHub Release or a supported package manager, then install only the `yeelight-smart-home` Skill from https://github.com/Yeelight/yeelight-smart-home-skills; if GitHub is unreachable, use the official read-only mirror at https://gitee.com/yeelight/yeelight-smart-home-skills or https://gitcode.com/Yeelight/yeelight-smart-home-skills; run `yeelight-home version --json`, `yeelight-home doctor --json`, and `yeelight-home auth status --json`, use the local `yeelight-home auth login --qr` flow if sign-in is required, restart or refresh my agent host and verify that it discovers `yeelight-smart-home`; use only official Yeelight sources, never ask me to paste a token, password, cookie, or QR result into chat, and stop with the unsupported host or channel clearly reported instead of inventing commands.
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

## Yeelight AI Capability Matrix

| Project | Role and capabilities | Best for | GitHub |
| --- | --- | --- | --- |
| Yeelight Home | Recommended local semantic Runtime with one structured `invoke --stdin` boundary for queries, control, scenes, automations, lighting design, diagnostics, product knowledge, and generated apps. | Agent hosts, local automation, and applications that need a stable and policy-aware smart-home execution layer. | [Yeelight/yeelight-home](https://github.com/Yeelight/yeelight-home) |
| Yeelight Smart Home Skills | Official Agent Skills: Smart Home turns natural language into safe Runtime operations; PRO App Builder generates focused local apps from proven Runtime capabilities. | Agent hosts that need conversational smart-home workflows or app generation. | [Yeelight/yeelight-smart-home-skills](https://github.com/Yeelight/yeelight-smart-home-skills) |
| Yeelight AI CLI | Unified terminal workspace and MCP client for Cloud, Metadata, and LAN services, with local profiles, safe shortcuts, diagnostics, scripting, and AI client configuration. | People, scripts, and CI that want one general MCP and automation entry point. | [Yeelight/yeelight-cli](https://github.com/Yeelight/yeelight-cli) |
| Yeelight Metadata MCP | Recommended cloud MCP entry for new integrations, with guarded workflows for homes, rooms, devices, groups, panels, scenes, automations, favorites, maintenance, accounts, multi-region authorization, and request-scoped home selection. | New MCP integrations and AI clients that need broad discovery, inspection, and management workflows. | [Yeelight/yeelight-metadata-mcp](https://github.com/Yeelight/yeelight-metadata-mcp) |
| Yeelight IoT MCP | Focused companion MCP for direct topology and live-state access, device control, and scene execution not yet fully covered by Metadata MCP. | Existing integrations or clients that specifically need `control_node`, `execute_scene`, or focused live control. | [Yeelight/yeelight-iot-mcp](https://github.com/Yeelight/yeelight-iot-mcp) |

Yeelight Home also provides system credential storage, local QR login, secret-redacted diagnostics, preview and validation, caller confirmation and Runtime policy/readback behavior, local memory and recommendation support, operation lessons, and machine-readable intent schema/explanations. Cross-platform binaries are distributed through GitHub Releases, npm, and supported package managers.

Typical paths: smart-home agents and generated apps -> Skills -> Yeelight Home; terminal users and scripts -> Yeelight AI CLI; new MCP integrations -> Metadata MCP; add IoT MCP only for focused direct control or scene execution that Metadata MCP does not yet cover.

## License

Repository-maintained code and both Skills are licensed under the [Apache License 2.0](LICENSE). Third-party components retain their own licenses and notices.
