# Publishing Model

This repository is the canonical GitHub distribution center for Yeelight Smart Home Skills.

## Automated Now

- GitHub Release assets.
- GitHub Copilot-compatible marketplace metadata at `.github/plugin/marketplace.json`.
- Claude Code-compatible marketplace metadata at `.claude-plugin/marketplace.json`.
- Codex/Open Agent plugin package under `plugins/`.
- Open Skill package under `skills/`.
- Reusable HTTP/OpenAPI/MCP bridge adapter under `adapters/yeelight-skill-bridge/`.
- Publication asset verification through `scripts/verify-publication-assets.mjs`.

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

- Dify Marketplace: package `.difypkg` or submit a Marketplace PR after wrapping the bridge as a Dify plugin.
- OpenAI GPT Store / Apps SDK: submit the public `/mcp` endpoint through the OpenAI dashboard review flow.
- Coze / 扣子: import the OpenAPI bridge or create an API plugin in the console.
- 阿里云百炼: create an API plugin or custom MCP service, test it, then publish the application.
- 腾讯元器: import OpenAPI/Swagger/Postman or connect MCP, validate the tool, then save/publish the agent.
- 百度千帆: create a tool/API plugin from the bridge schema, test it, then publish through the workspace.
- 火山方舟: create an API or MCP tool from the bridge endpoint and submit through the project console.
