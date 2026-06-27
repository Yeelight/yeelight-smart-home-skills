# Publishing Model

This repository is the canonical GitHub distribution center for Yeelight Smart Home Skills.

## Automated Now

- GitHub Release assets.
- ClawHub skill publication under `@yeelight/yeelight-smart-home`.
- skills.sh GitHub-indexed installation for `yeelight/yeelight-smart-home-skills`.
- GitHub Copilot-compatible marketplace metadata at `.github/plugin/marketplace.json`.
- Claude Code-compatible marketplace metadata at `.claude-plugin/marketplace.json`.
- Codex/Open Agent plugin package under `plugins/`.
- Open Skill package under `skills/`.
- Reusable HTTP/OpenAPI/MCP bridge adapter under `adapters/yeelight-skill-bridge/`.
- Publication asset verification through `scripts/verify-publication-assets.mjs`.

## Direct Skill Directory Publishing

These directories can consume the repository or skill folder directly:

- ClawHub: published at `https://clawhub.ai/yeelight/skills/yeelight-smart-home`; install with `openclaw skills install @yeelight/yeelight-smart-home`.
- skills.sh: indexed from GitHub at `https://www.skills.sh/yeelight/yeelight-smart-home-skills/yeelight-smart-home`; install with `npx skills add https://github.com/yeelight/yeelight-smart-home-skills --skill yeelight-smart-home`.

ClawHub currently shows the Yeelight publisher namespace but the publisher itself is not platform-trusted yet. Submit a ClawHub namespace claim or sign in with an official Yeelight-owned ClawHub/GitHub account when a platform-level official/trusted badge is required.

## Bridge-Based Platform Publishing

Most public agent marketplaces do not consume the current Skill ZIP directly. Use this flow:

1. Deploy `adapters/yeelight-skill-bridge/` on a host that can run `yeelight-home`.
2. Configure HTTPS, `YEELIGHT_BRIDGE_API_KEY`, CORS allowlist and runtime credentials.
3. Replace `https://YOUR_PUBLIC_BRIDGE_DOMAIN` in `adapters/yeelight-skill-bridge/openapi.json`.
4. Verify `/health`, `/openapi.json`, `/invoke` and `/mcp`.
5. Submit the OpenAPI or MCP endpoint through the target platform console or review flow.

Submission material lives under `submissions/`.

## Prepared, Review Required

These platforms now have a reusable bridge adapter and submission kit, but still require platform accounts, workspace ownership, public HTTPS deployment, privacy policy URLs and review or console actions:

- Dify Marketplace: `.difypkg` package and PR body are prepared under `submissions/dify/`; Marketplace publication requires a PR to `langgenius/dify-plugins`.
- OpenAI GPT Store / Apps SDK: submit the public `/mcp` endpoint through the OpenAI dashboard review flow.
- Coze / 扣子: import the OpenAPI bridge or create an API plugin in the console.
- 阿里云百炼: create an API plugin or custom MCP service, test it, then publish the application.
- 腾讯元器: import OpenAPI/Swagger/Postman or connect MCP, validate the tool, then save/publish the agent.
- 百度千帆: create a tool/API plugin from the bridge schema, test it, then publish through the workspace.
- 火山方舟: create an API or MCP tool from the bridge endpoint and submit through the project console.

Additional public skill directories are tracked in `submissions/skill-directory-submission-status.json`:

- NanoSkill: no public API/form found; email submission is required.
- Marketing Skills: domain-specific marketing directory; no third-party smart-home skill submission flow found.
- Tencent SkillHub: CLI submission is approved and installable under `yeelight-smart-home-official` v0.1.1; both security scans passed. The canonical `yeelight-smart-home` slug is owned by another user or reserved outside the current account.
- Molili / CocoLoop Skill: no public submit API or `/submit`, `/publish`, `/contact` route found from the public site crawl.
