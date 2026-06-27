# Yeelight Smart Home Skills

Public release repository for Yeelight Smart Home agent skills.

## Published Skills

| Skill | Version | Runtime | Packages |
| --- | --- | --- | --- |
| `yeelight-smart-home` | `0.1.0` | `yeelight-home >= 0.1.7` | Agent Skill ZIP, Codex Plugin ZIP, Claude Skill ZIP, Copilot Skill ZIP |

## Install

### Codex / Agent Plugin

Install the plugin from this repository marketplace metadata, or download:

- `releases/yeelight-smart-home/v0.1.0/yeelight-smart-home-codex-plugin-v0.1.0.zip`

### Claude Skill ZIP

Download and upload the Claude-compatible package:

- `releases/yeelight-smart-home/v0.1.0/yeelight-smart-home-claude-skill-v0.1.0.zip`

### GitHub Copilot Agent Skill

Use the Copilot-compatible package:

- `releases/yeelight-smart-home/v0.1.0/yeelight-smart-home-copilot-skill-v0.1.0.zip`

### Open Agent Skills

Use the open Agent Skill package:

- `releases/yeelight-smart-home/v0.1.0/yeelight-smart-home-agent-skill-v0.1.0.zip`

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

## Release Evidence

Release assets, manifests, checksums and validation summaries are under:

```text
releases/yeelight-smart-home/v0.1.0/
```

Verify checksums before installing downloaded packages:

```sh
cd releases/yeelight-smart-home/v0.1.0
sha256sum -c checksums.txt
```

Full publication asset check:

```sh
node scripts/verify-publication-assets.mjs
```
