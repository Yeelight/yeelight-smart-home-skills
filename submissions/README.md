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
| skills.sh | GitHub repository Skill | Indexed and installable from GitHub; public page shows security audit pass badges |
| AgenticSkills | GitHub repository submission payload | Automatic API submission attempted; platform returned `Submission review queue is not configured.` |
| NanoSkill | GitHub repository + email template | No public API/form found; email submission required |
| Marketing Skills | GitHub repository | Not a fit for Yeelight smart-home Skill; no third-party submit route found |
| Tencent SkillHub | Skill ZIP / folder payload | Publish API exists; unauthenticated requests return 401, login/real-name/enterprise flow required |
| Molili / CocoLoop Skill | GitHub repository / Skill folder | No public submit endpoint found from public crawl |
| Dify Marketplace | Bridge adapter + submission notes | Requires `.difypkg`, developer identity and PR review |
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
- A runtime host with `yeelight-home >= 0.1.7` installed and authenticated.

Do not submit with a local URL, placeholder domain, missing privacy policy, or unauthenticated bridge.

Machine-readable status:

```text
skill-directory-submission-status.json
```
