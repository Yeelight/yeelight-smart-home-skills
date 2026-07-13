# Coze / 扣子 Submission Kit

Status: OpenAPI bridge adapter ready, Coze console review still required.

Coze does not consume the current Skill ZIP directly. Use this repository as the canonical release source, then create a Coze bot/plugin that calls the bridge:

```text
../../adapters/yeelight-skill-bridge/openapi.json
```

Required materials:

- Bot/plugin name: Yeelight Smart Home.
- Description: Control, organize, diagnose, design and answer product questions for a Yeelight smart home through the local yeelight-home Runtime.
- Public release URL: https://github.com/Yeelight/yeelight-smart-home-skills/releases/tag/yeelight-skill-yeelight-smart-home-v0.1.0
- Runtime dependency: `yeelight-home >= 0.1.20`.
- Safety: write operations require confirmation.
- Tool endpoint: `POST /invoke`.
- Optional MCP endpoint: `POST /mcp` when the target workspace supports MCP.
- Required console work: create plugin, import API/OpenAPI, configure auth, validate tool, publish bot/plugin.
