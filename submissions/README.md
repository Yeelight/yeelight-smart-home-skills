# Platform Submission Kits

The first public Yeelight Skill release is already published on GitHub:

```text
https://github.com/Yeelight/yeelight-smart-home-skills/releases/tag/yeelight-skill-yeelight-smart-home-v0.1.0
```

For platforms that do not consume Agent Skill ZIP packages directly, use the bridge adapter:

```text
../adapters/yeelight-skill-bridge/
```

## Status Matrix

| Platform | Ready Artifact | Real Submission Status |
| --- | --- | --- |
| ClawHub | Native Skill directory | Published under `@yeelight/yeelight-smart-home`; install smoke passed; publisher trust review still pending |
| skills.sh | GitHub repository Skill | Indexed and installable from GitHub; public page shows security audit pass badges; real `npx skills add` smoke passed |
| NanoSkill | GitHub repository + email template | Official Yeelight email submitted; awaiting platform review response |
| Marketing Skills | GitHub repository | Not a fit for Yeelight smart-home Skill; no third-party submit route found |
| LobeHub Skills | GitHub repository | First-listing request form is ready; real browser reached the `请求收录 Skill` modal, but Cloudflare human verification must be completed before submit |
| Tencent SkillHub | Skill folder payload | Original `yeelight-smart-home` slug is owned by another user; alternate slug `yeelight-smart-home-official` v0.1.2 is approved, both security scans passed, and real installed-copy runtime smoke passed |
| Molili / CocoLoop Skill | GitHub repository / Skill folder | Official Yeelight email submitted to known operator contacts; awaiting publisher route |
| Dify Marketplace | `.difypkg` + PR body | Update PR [langgenius/dify-plugins#2694](https://github.com/langgenius/dify-plugins/pull/2694) is open; `pre-check-plugin` passed; awaiting review |
| OpenAI GPT Store / Apps SDK | MCP endpoint + OpenAPI schema | Requires public HTTPS deployment and dashboard review |
| Coze / 扣子 | OpenAPI schema | Requires console import, auth config, validation and publish |
| 阿里云百炼 | OpenAPI/MCP bridge | Requires workspace setup, plugin/MCP test and app publish |
| 腾讯元器 | OpenAPI/MCP bridge | Requires plugin validation and agent publish |
| 百度千帆 | OpenAPI bridge | Requires workspace tool setup, test and publish |
| 火山方舟 | OpenAPI/MCP bridge | Requires project console setup, test and publish |

## Required Before Any Third-Party Review

- Public HTTPS bridge URL.
- `YEELIGHT_BRIDGE_API_KEY` or platform-specific auth.
- Privacy policy URL.
- Logo and screenshots when required by the platform.
- Test prompts and expected responses.
- A runtime host with `yeelight-home >= 0.1.20` installed and authenticated.
- For LobeHub first listing, submit the GitHub repository URL through the web `请求收录` form; after collection, use `lhm skill claim` and `lhm skill publish` for ownership and later versions.

Do not submit with a local URL, placeholder domain, missing privacy policy, or unauthenticated bridge.

Machine-readable status:

```text
skill-directory-submission-status.json
```
