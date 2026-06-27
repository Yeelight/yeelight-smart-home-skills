# Yeelight Smart Home

Yeelight Smart Home is a Dify tool plugin that invokes the official Yeelight Smart Home skill through a secure HTTPS bridge.

The bridge calls only:

```text
yeelight-home invoke --stdin
```

## Setup

1. Deploy the bridge from `adapters/yeelight-skill-bridge/` on a public HTTPS endpoint.
2. Configure the Dify provider credentials:
   - `bridge_url`: the public bridge URL, for example `https://yeelight-skill.example.com`.
   - `api_key`: the bridge API key.
3. Save credentials. The plugin validates the bridge by calling `/health`.

## Tool

`invoke_yeelight_skill` sends one SkillRequest to the bridge.

Required fields:

- `utterance`: the user request in natural language.
- `intent`: an intent from the Yeelight Smart Home intent catalog, for example `home.list`.

Optional fields:

- `parameters_json`: JSON object string copied into `SkillRequest.parameters`.

## Runtime And Safety

- Runtime credentials stay on the bridge host.
- The plugin never asks the user to paste Yeelight tokens into Dify prompts.
- Persistent or risky changes remain confirmation-gated by `yeelight-home`.
- The bridge should be protected with a bearer token or `x-api-key`.

## Source

https://github.com/Yeelight/yeelight-smart-home-skills
