# Publishing Model

This repository is the canonical GitHub distribution center for Yeelight Smart Home Skills.

## Automated Now

- GitHub Release assets.
- skills.sh GitHub-indexed installation for `yeelight/yeelight-smart-home-skills`.
- LobeHub first-listing request kit and post-listing CLI ownership/version workflow.
- GitHub Copilot-compatible marketplace metadata at `.github/plugin/marketplace.json`.
- Claude Code-compatible marketplace metadata at `.claude-plugin/marketplace.json`.
- Codex/Open Agent plugin package under `plugins/`.
- Open Skill package under `skills/`.
- Reusable HTTP/OpenAPI/MCP bridge adapter under `adapters/yeelight-skill-bridge/`.
- Publication asset verification through `scripts/verify-publication-assets.mjs`.

## Direct Skill Directory Publishing

These directories can consume the repository or skill folder directly:

- ClawHub: published optional channel at `https://clawhub.ai/yeelight/skills/yeelight-smart-home`; current ClawHub latest is `0.1.11`. GitHub Release remains the canonical release source.
- skills.sh: indexed from GitHub at `https://www.skills.sh/yeelight/yeelight-smart-home-skills/yeelight-smart-home`; install with `npx skills add https://github.com/yeelight/yeelight-smart-home-skills --skill yeelight-smart-home`.

ClawHub currently shows the Yeelight publisher namespace but the publisher itself is not platform-trusted yet. The `0.1.11` ClawHub-safe package published successfully after the earlier `0.1.10` schema failure. Submit a ClawHub namespace claim or sign in with an official Yeelight-owned ClawHub/GitHub account when a platform-level official/trusted badge is required. Keep ClawHub non-release-blocking so an optional directory cannot hold up GitHub Release or Dify.

## LobeHub Skills

LobeHub first listing is a web request flow, not a direct `lhm skill publish` flow.

Use the visible form on:

```text
https://lobehub.com/zh/skills
```

Click `请求收录`, fill the GitHub repository URL, and submit:

```text
https://github.com/Yeelight/yeelight-smart-home-skills
```

Automation note: a real browser reached the `请求收录 Skill` modal, but LobeHub required Cloudflare Turnstile human verification before enabling submit. Headless automation was blocked by Vercel Security Checkpoint Code 21. Do not bypass that verification; complete it in a real browser session.

After LobeHub collects the repository, use the CLI for ownership and later version publishing:

```sh
npx -y @lobehub/market-cli login
npx -y @lobehub/market-cli github connect
npx -y @lobehub/market-cli skill claim yeelight-smart-home
npx -y @lobehub/market-cli skill publish --identifier yeelight-smart-home --dir skills/yeelight-smart-home
npx -y @lobehub/market-cli skills install yeelight-smart-home --dir /tmp/lobehub-yeelight-smoke --agent codex
```

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
- LobeHub Skills: first-listing request form accepts a GitHub repository URL; Cloudflare human verification blocks unattended automation, while CLI ownership/version commands are ready after listing.
- Tencent SkillHub: CLI submission is approved and installable under `yeelight-smart-home-official` v0.1.2; both security scans passed and installed-copy runtime smoke passed. The canonical `yeelight-smart-home` slug is owned by another user or reserved outside the current account.
- Molili / CocoLoop Skill: no public submit API or `/submit`, `/publish`, `/contact` route found from the public site crawl.

## Reusable Skill Release Flow

Use this flow for every future `yeelight-smart-home/skill/<skill-id>` package.

1. Add or update the skill in the source repository release registry.
2. Run the generic source release builder and verifier for that skill.
3. Publish or refresh this public GitHub distribution repository from the generated release output.
4. Run `node scripts/verify-publication-assets.mjs` from this repository.
5. Ensure repository secret `CLAWHUB_TOKEN` is configured if ClawHub should be
   attempted; `publish-skill.yml` attempts the ClawHub-safe package from
   `skills-clawhub/<skill-id>` after the GitHub Release job, but this channel is
   optional and non-release-blocking.
6. Update `platforms.json` and `submissions/skill-directory-submission-status.json` with platform-specific status and evidence.
7. For native Skill directories, run platform install smoke from the installed copy, not only package smoke.
8. For bridge-based platforms, verify `/health`, `/openapi.json`, authenticated `/invoke`, and `/mcp` with the deployed bridge.
9. For review-gated platforms, record the exact blocking account, review, identity, HTTPS, privacy policy, or captcha requirement instead of marking the platform as published.

Next-version quick path after the first release:

```sh
cd /Users/yeelight/Desktop/workspace/ai/yeelight-ai-online-service/yeelight-smart-home
node tools/skill-release.mjs --skill <skill-id> --version <x.y.z> --dry-run --all-default-channels --ci
node tools/skill-release-verify.mjs --skill <skill-id> --version <x.y.z>

cd /tmp/yeelight-smart-home-skills-publish
node scripts/publish-skill-release.mjs --source <release-output-root> --skill <skill-id> --version <x.y.z> --dry-run
node scripts/verify-publication-assets.mjs
node scripts/publish-clawhub-skill.mjs --skill <skill-id> --version <x.y.z> --dry-run
```

Only after those pass, use the platform-specific publish commands or forms documented under `submissions/<platform>/`.
