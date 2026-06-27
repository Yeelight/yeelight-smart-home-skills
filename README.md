# Yeelight Smart Home Skills

Public release repository for Yeelight Smart Home agent skills.

## Published Skills

| Skill | Version | Runtime | Packages |
| --- | --- | --- | --- |
| `yeelight-smart-home` | `0.1.1` | `yeelight-home >= 0.1.7` | Agent Skill ZIP, Codex Plugin ZIP, Claude Skill ZIP, Copilot Skill ZIP |

## Release

- Repository: https://github.com/Yeelight/yeelight-smart-home-skills
- Latest release: https://github.com/Yeelight/yeelight-smart-home-skills/releases/tag/yeelight-skill-yeelight-smart-home-v0.1.1
- Release evidence: `releases/yeelight-smart-home/v0.1.1/`

## Install

### ClawHub / OpenClaw

The skill is published under the Yeelight publisher namespace:

```sh
openclaw skills install @yeelight/yeelight-smart-home
```

- ClawHub page: https://clawhub.ai/yeelight/skills/yeelight-smart-home
- Status: published and installable. The ClawHub publisher namespace is `@yeelight`; platform trust/official review is still pending.

### skills.sh

The repository is indexed by skills.sh:

```sh
npx skills add https://github.com/yeelight/yeelight-smart-home-skills --skill yeelight-smart-home
```

- skills.sh page: https://www.skills.sh/yeelight/yeelight-smart-home-skills/yeelight-smart-home
- Status: indexed and installable, with visible security audit pass badges.

### Codex / Agent Plugin

Install from this repository marketplace metadata or download `releases/yeelight-smart-home/v0.1.1/yeelight-smart-home-codex-plugin-v0.1.1.zip`.

### Claude Skill ZIP

Download and upload `releases/yeelight-smart-home/v0.1.1/yeelight-smart-home-claude-skill-v0.1.1.zip`.

### GitHub Copilot Agent Skill

Use `releases/yeelight-smart-home/v0.1.1/yeelight-smart-home-copilot-skill-v0.1.1.zip`.

### Open Agent Skills

Use `releases/yeelight-smart-home/v0.1.1/yeelight-smart-home-agent-skill-v0.1.1.zip`.

### LobeHub Skills

First listing uses the web request form:

```text
https://lobehub.com/zh/skills
```

Click `请求收录` and submit:

```text
https://github.com/Yeelight/yeelight-smart-home-skills
```

After LobeHub collects the repository, use `@lobehub/market-cli` to claim ownership and publish later versions.

## Runtime Dependency

This skill depends on the separately installed `yeelight-home` runtime and invokes it through:

```sh
yeelight-home invoke --stdin
```

The runtime is not bundled in this repository.

## Bridge Adapter

Platforms that cannot install Skill ZIPs directly should use:

```text
adapters/yeelight-skill-bridge/
```

The bridge exposes `GET /health`, `GET /openapi.json`, `POST /invoke` and `POST /mcp`.
It calls only `yeelight-home invoke --stdin`; the runtime remains responsible for auth, policy and confirmation gates.

## Platform Status

See `platforms.json` and `submissions/` for platform-specific distribution status and submission kits.

## Verify

```sh
cd releases/yeelight-smart-home/v0.1.1
shasum -a 256 -c checksums.txt
```

Full publication asset check:

```sh
node scripts/verify-publication-assets.mjs --skill yeelight-smart-home --version 0.1.1
```

Third-party directory submission status and evidence are tracked in `platforms.json` and `submissions/skill-directory-submission-status.json`.

## Reusable Release Flow

For later Yeelight skills or new versions:

1. Build and verify from the source repository's generic Skill release pipeline.
2. Refresh this public distribution repository with `scripts/publish-skill-release.mjs`.
3. Run `node scripts/verify-publication-assets.mjs --skill <skill-id> --version <x.y.z>`.
4. Publish native Skill directories through platform CLI/form flows.
5. Publish API/MCP-only platforms through the bridge adapter and verify installed-copy or deployed-endpoint smoke.
