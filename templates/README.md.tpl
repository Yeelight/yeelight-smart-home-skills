# Yeelight Smart Home Skills

English | [简体中文](README.zh-CN.md)

Official public release repository for Yeelight Smart Home agent skills. The default documentation is English; the Chinese version is maintained side by side for Chinese users and reviewers.

## Published Skills

| Skill | Version | Runtime | Packages |
| --- | --- | --- | --- |
| `{{skill}}` | `{{version}}` | `yeelight-home >= {{runtimeMinVersion}}` | Agent Skill ZIP, Codex Plugin ZIP, Claude Skill ZIP, Copilot Skill ZIP |

## What This Skill Does

`{{skill}}` lets compatible agent platforms control, organize, diagnose, design, and answer product questions for a Yeelight smart home through the local `yeelight-home` Runtime.

It is intentionally packaged as a Skill, not as a bundled runtime. The Skill contains the instructions, schemas, catalogs, references, package manifests, and platform adapters required for agent distribution. The actual device access, account authentication, policy checks, and write confirmation gates stay inside the separately installed runtime.

## Release

- Repository: {{repositoryUrl}}
- Latest release: {{releaseUrl}}
- Release evidence: `{{releasePath}}/`
- Checksums: `{{releasePath}}/checksums.txt`
- Validation summary: `{{releasePath}}/validation-summary.json`

## Install

### One-Sentence AI Install

If you use a local AI assistant that can run terminal commands, paste this single request:

```text
Install the official yeelight-home CLI for my operating system from Yeelight's GitHub Release or supported package manager, then install the latest Yeelight Smart Home Skill from the official Yeelight Skill GitHub Release or this GitHub repository. Verify the CLI with `yeelight-home doctor --json`, and guide me through `yeelight-home auth login --qr`; do not ask me to paste tokens, passwords, or cookies into chat.
```

### ClawHub / OpenClaw

The Skill remains available under the official Yeelight publisher namespace, but this channel is currently optional and stale at `0.1.9`. Use GitHub Release for the latest `{{version}}` package.

```sh
openclaw skills install @yeelight/{{skill}}
```

- ClawHub page: https://clawhub.ai/yeelight/skills/{{skill}}
- Status: optional / blocked for `{{version}}`. The ClawHub-safe package excludes extensionless `scripts/invoke`, but ClawHub still returns `skillId/versionId invalid value`; GitHub Release remains the canonical latest channel.

### skills.sh

The repository is indexed by skills.sh:

```sh
npx skills add {{repositoryInstallUrl}} --skill {{skill}}
```

- skills.sh page: https://www.skills.sh/yeelight/yeelight-smart-home-skills/{{skill}}
- Status: indexed and installable, with visible security audit pass badges.

### Codex / Agent Plugin

Install from this repository's marketplace metadata, or download:

```text
{{releasePath}}/{{skill}}-codex-plugin-v{{version}}.zip
```

### Claude Skill ZIP

Download and upload:

```text
{{releasePath}}/{{skill}}-claude-skill-v{{version}}.zip
```

### GitHub Copilot Agent Skill

Use:

```text
{{releasePath}}/{{skill}}-copilot-skill-v{{version}}.zip
```

### Open Agent Skills

Use:

```text
{{releasePath}}/{{skill}}-agent-skill-v{{version}}.zip
```

### LobeHub Skills

The first listing uses the web request form:

```text
https://lobehub.com/zh/skills
```

Click `请求收录` and submit:

```text
{{repositoryUrl}}
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

- Published and installable for latest release: GitHub Release, skills.sh.
- Published but optional: ClawHub has `{{version}}` and remains non-release-blocking.
- Submitted or awaiting marketplace review: LobeHub, NanoSkill, Molili/CocoLoop, Dify Marketplace.
- Adapter kit ready for console review: OpenAI GPT Store / Apps SDK, Coze, Bailian, Yuanqi, Qianfan, Volcano Ark.

Do not treat review-pending platforms as published until the installed-copy or deployed-endpoint smoke test passes.

## Verify

Verify the release checksums:

```sh
cd {{releasePath}}
shasum -a 256 -c checksums.txt
```

Run the full publication asset check:

```sh
node scripts/verify-publication-assets.mjs --skill {{skill}} --version {{version}}
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
