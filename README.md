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

## Official Smart Home Skill Tutorial

For the recommended full-intelligence path, follow the [official English tutorial](https://ai-tutorials.yeelight.com/en/guides/smart-home-skill/) from the Yeelight Home prerequisite through Skill installation, AI-client refresh, and real home verification. A [Simplified Chinese tutorial](https://ai-tutorials.yeelight.com/zh/guides/smart-home-skill/) is also available.

## Skills

| Skill | What it provides | Use it when | Runtime |
| --- | --- | --- | --- |
| [`yeelight-smart-home`](skills/yeelight-smart-home/) | Natural-language control, query, diagnostics, organization, scenes, automations, lighting design, product knowledge, memory, and recommendations | You want an AI agent to operate or help design a Yeelight home | `yeelight-home >= 0.1.20` |
| [`yeelight-wellness-lighting`](skills/yeelight-wellness-lighting/) | Adapts comfortable lighting from a confirmed city, local time, weather, daylight, and explicit preferences, then renders a private result page | You want manual, conversational, or host-scheduled wellness lighting | `yeelight-home >= 0.1.20`, Node.js 22+ |
| [`yeelight-interactive-light-experiences`](skills/yeelight-interactive-light-experiences/) | Starts a local collection of twelve AI-guided light games and exhibition scenes with Fortune Light as the recommended entry | You are running an IFA-style installation and want a visitor-ready physical-light experience | `yeelight-home >= 0.1.27` |
| [`yeelight-pro-app-builder`](skills/yeelight-pro-app-builder/) | Generates a modular, local Yeelight application from one request and proven Runtime capabilities | You want a focused mobile, tablet, wall-panel, or desktop control application | `yeelight-home >= 0.1.21`, Node.js 22+ |

All four Skills use the separately installed [`yeelight-home`](https://github.com/Yeelight/yeelight-home) Runtime. They do not embed account credentials or bypass Runtime policy and confirmation checks.

## How The Pieces Fit

- **Yeelight Home is the foundation.** It handles QR sign-in, the selected home,
  Cloud/LAN execution, safety checks, and verification.
- **Yeelight Smart Home is the recommended Skill.** It teaches the AI Yeelight
  rules and lighting best practices, then uses the foundation to do the work.
- **Yeelight Wellness Lighting follows public day context.** It requires a
  confirmed city before resolving local time, weather, and daylight. When the
  host has no scheduler, it returns a portable template instead of claiming a
  recurring task was created.
- **Interactive Light Experiences is the exhibition Skill.** It automatically
  starts or reuses a loopback-only collection host, then lets AI-guided
  experiences turn visitor choices into bounded physical-light plans.
- **Yeelight MCP is the standard cloud route for MCP-only clients.** One setup
  configures its Metadata and IoT services together. Neither cloud service is a
  dependency of these Skills.

Choose `yeelight-smart-home` for everyday home conversations, `yeelight-wellness-lighting`
when lighting should follow seasons, weather, or daylight, the Interactive Skill
for a local exhibition collection, and App Builder when your goal is to generate
a dedicated local control application.

## Install With One Sentence

Give your local AI agent exactly one of these prompts. Each prompt names one Skill so the agent cannot silently install the wrong capability.

**Yeelight Smart Home:**

```text
Install `yeelight-home` from an official Yeelight GitHub Release, official mirror, or supported package manager, then run `yeelight-home setup --lang en-US --mode skill --agent auto`. Guide me to Yeelight Pro app Home -> top-right `+` -> MCP Authorization and wait for my scan. Use only official Yeelight sources and never request or print a token, password, cookie, Client ID, or QR result. Restart the Agent host, confirm that it discovers `yeelight-smart-home`, then run `yeelight-home doctor --json` and read-only home discovery.
```

**Yeelight Wellness Lighting:**

```text
Install `yeelight-home >= 0.1.20` and Node.js 22 or later from official Yeelight or supported package-manager sources, then install only `yeelight-wellness-lighting` from https://github.com/Yeelight/yeelight-smart-home-skills. Run `yeelight-home version --json`, `yeelight-home doctor --json`, and `yeelight-home auth status --json`; guide me through the local QR sign-in flow if needed. Restart or refresh the Agent host and confirm that it discovers the exact Skill id. On first use, require me to confirm a city before automatically resolving local time, weather, sunrise, and sunset. Create, pause, or remove a recurring task only when the host exposes a scheduler; otherwise return a validated portable template and clearly say it is not scheduled. After every result, generate a private local HTML report and tell me its path without uploading it. Never request or print a token, password, cookie, Client ID, or QR result.
```

**Yeelight Interactive Light Experiences:**

```text
Install the official Yeelight Home Runtime for my operating system from Yeelight's GitHub Release or a supported package manager, then install only the `yeelight-interactive-light-experiences` Skill from https://github.com/Yeelight/yeelight-smart-home-skills; if GitHub is unreachable, use the official read-only mirror at https://gitee.com/yeelight/yeelight-smart-home-skills or https://gitcode.com/Yeelight/yeelight-smart-home-skills; run `yeelight-home version --json`, `yeelight-home doctor --json`, and `yeelight-home auth status --json`, use the local `yeelight-home auth login --qr` flow if sign-in is required, verify Runtime 0.1.27 or later, restart or refresh my agent host, and ask it to start the collection through the Skill so it opens its loopback page; use only official Yeelight sources, never ask me to paste a token, password, cookie, or QR result into chat, and report a missing live binding instead of silently switching a real installation to mock mode.
```

**Yeelight PRO App Builder — one sentence:**

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

Then install one or more Skills with skills.sh:

```sh
npx skills add https://github.com/Yeelight/yeelight-smart-home-skills --skill yeelight-smart-home
npx skills add https://github.com/Yeelight/yeelight-smart-home-skills --skill yeelight-wellness-lighting
npx skills add https://github.com/Yeelight/yeelight-smart-home-skills --skill yeelight-interactive-light-experiences
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

The GitHub repository remains the canonical Apache-2.0 source. ClawHub currently displays MIT-0 as platform version metadata; that platform limitation does not change the source license. `yeelight-wellness-lighting`, `yeelight-pro-app-builder`, and `yeelight-interactive-light-experiences` are not listed on ClawHub and should be installed from GitHub with skills.sh.

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
Use yeelight-wellness-lighting to adapt the selected rooms from the current weather and daylight in Qingdao, then generate the result page.
```

```text
Use yeelight-pro-app-builder to generate a compact mobile app for living-room lights and curtains, with a bright green theme.
```

```text
Use yeelight-interactive-light-experiences to start the local IFA collection and open Fortune Light first.
```

See [Usage](docs/usage.md) for common workflows, safety behavior, troubleshooting, and Builder output validation.

## Recommended Path

`yeelight-home` is the only CLI, sign-in entry, and execution Runtime. `yeelight-smart-home` is the recommended full-intelligence path for ordinary home use; use `yeelight-interactive-light-experiences` for the local IFA collection; use `yeelight-home setup --mode mcp` when a client cannot install Skills; human terminal workflows and scripts use the same `yeelight-home` directly.

## License

Repository-maintained code and all four Skills are licensed under the [Apache License 2.0](LICENSE). Third-party components retain their own licenses and notices.
