# Yeelight Smart Home Skills

English | [简体中文](README.zh-CN.md)

Official public release repository for Yeelight Smart Home agent skills. The default documentation is English; the Chinese version is maintained side by side for Chinese users and reviewers.

## Published Skills

| Skill | Version | Runtime | Packages |
| --- | --- | --- | --- |
| `yeelight-smart-home` | `0.1.3` | `yeelight-home >= 0.1.7` | Agent Skill ZIP, Codex Plugin ZIP, Claude Skill ZIP, Copilot Skill ZIP |

## What This Skill Does

`yeelight-smart-home` lets compatible agent platforms control, organize, diagnose, design, and answer product questions for a Yeelight smart home through the local `yeelight-home` Runtime.

It is intentionally packaged as a Skill, not as a bundled runtime. The Skill contains the instructions, schemas, catalogs, references, package manifests, and platform adapters required for agent distribution. The actual device access, account authentication, policy checks, and write confirmation gates stay inside the separately installed runtime.

## Release

- Repository: https://github.com/Yeelight/yeelight-smart-home-skills
- Latest release: https://github.com/Yeelight/yeelight-smart-home-skills/releases/tag/yeelight-skill-yeelight-smart-home-v0.1.3
- Release evidence: `releases/yeelight-smart-home/v0.1.3/`
- Checksums: `releases/yeelight-smart-home/v0.1.3/checksums.txt`
- Validation summary: `releases/yeelight-smart-home/v0.1.3/validation-summary.json`

## Install

### ClawHub / OpenClaw

The Skill is published under the official Yeelight publisher namespace:

```sh
openclaw skills install @yeelight/yeelight-smart-home
```

- ClawHub page: https://clawhub.ai/yeelight/skills/yeelight-smart-home
- Status: published and installable. The `@yeelight` publisher namespace is active; ClawHub platform trust/official review is still pending.

### skills.sh

The repository is indexed by skills.sh:

```sh
npx skills add https://github.com/yeelight/yeelight-smart-home-skills --skill yeelight-smart-home
```

- skills.sh page: https://www.skills.sh/yeelight/yeelight-smart-home-skills/yeelight-smart-home
- Status: indexed and installable, with visible security audit pass badges.

### Tencent SkillHub

Tencent SkillHub uses a platform-specific slug because the canonical slug was already occupied:

```sh
skillhub install yeelight-smart-home-official
```

- SkillHub page: https://skillhub.cn
- Status: published, approved, installable, and functional on the latest approved SkillHub package tracked in `platforms.json`.

### Codex / Agent Plugin

Install from this repository's marketplace metadata, or download:

```text
releases/yeelight-smart-home/v0.1.3/yeelight-smart-home-codex-plugin-v0.1.3.zip
```

### Claude Skill ZIP

Download and upload:

```text
releases/yeelight-smart-home/v0.1.3/yeelight-smart-home-claude-skill-v0.1.3.zip
```

### GitHub Copilot Agent Skill

Use:

```text
releases/yeelight-smart-home/v0.1.3/yeelight-smart-home-copilot-skill-v0.1.3.zip
```

### Open Agent Skills

Use:

```text
releases/yeelight-smart-home/v0.1.3/yeelight-smart-home-agent-skill-v0.1.3.zip
```

### LobeHub Skills

The first listing uses the web request form:

```text
https://lobehub.com/zh/skills
```

Click `请求收录` and submit:

```text
https://github.com/Yeelight/yeelight-smart-home-skills
```

After LobeHub collects the repository, use `@lobehub/market-cli` to claim ownership and publish later versions.

### Review Or Console-Based Platforms

Platforms such as Dify Marketplace, OpenAI GPT Store / Apps SDK, Coze, Bailian, Yuanqi, Qianfan, Volcano Ark, NanoSkill, and Molili/CocoLoop have platform-specific review, console, PR, or email flows. The reusable submission kits are tracked under `submissions/`.

## Runtime Dependency

This Skill depends on the separately installed `yeelight-home` runtime and invokes it through:

```sh
yeelight-home invoke --stdin
```

The runtime is not bundled in this repository. Do not publish runtime binaries, source code, local workspace paths, raw internal docs, credentials, or API tokens as part of a Skill package.

## Bridge Adapter

Platforms that cannot install Skill ZIPs directly should use:

```text
adapters/yeelight-skill-bridge/
```

The bridge exposes:

- `GET /health`
- `GET /openapi.json`
- `POST /invoke`
- `POST /mcp`

The bridge calls only `yeelight-home invoke --stdin`; the runtime remains responsible for authentication, policy enforcement, sensitive action confirmation, and device access.

## Platform Status

`platforms.json` is the source of truth for current marketplace status. `submissions/skill-directory-submission-status.json` keeps evidence and remaining work for each third-party marketplace.

Current status classes include:

- Published and installable: GitHub Release, ClawHub, skills.sh, Tencent SkillHub.
- Submitted or awaiting marketplace review: LobeHub, NanoSkill, Molili/CocoLoop, Dify Marketplace.
- Adapter kit ready for console review: OpenAI GPT Store / Apps SDK, Coze, Bailian, Yuanqi, Qianfan, Volcano Ark.

Do not treat review-pending platforms as published until the installed-copy or deployed-endpoint smoke test passes.

## Verify

Verify the release checksums:

```sh
cd releases/yeelight-smart-home/v0.1.3
shasum -a 256 -c checksums.txt
```

Run the full publication asset check:

```sh
node scripts/verify-publication-assets.mjs --skill yeelight-smart-home --version 0.1.3
```

The publication check validates JSON metadata, bilingual README links, package checksums, platform submission kits, Dify package structure, Node script syntax, and bridge health/invoke/MCP smoke tests.

## Reusable Release Flow

For later Yeelight skills or new versions:

1. Build and verify from the source repository's generic Skill release pipeline.
2. Refresh this public distribution repository with `scripts/publish-skill-release.mjs`.
3. Run `node scripts/verify-publication-assets.mjs --skill <skill-id> --version <x.y.z>`.
4. Publish native Skill directories through platform CLI/form flows.
5. Publish API/MCP-only platforms through the bridge adapter.
6. Record the final installed-copy or deployed-endpoint smoke evidence in `platforms.json` and `submissions/skill-directory-submission-status.json`.
