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
