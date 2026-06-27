# Yeelight Skill Bridge

This adapter exposes the published `yeelight-smart-home` Skill as a small HTTP and MCP bridge for platforms that cannot install Agent Skill ZIP packages directly.

## Runtime Model

- The bridge does not bundle `yeelight-home`.
- The bridge calls only `yeelight-home invoke --stdin`.
- Secrets stay on the bridge host and must not be pasted into model prompts.
- Persistent or risky actions still rely on the runtime `confirmation_required` flow before execution.

## Run Locally

```sh
cd adapters/yeelight-skill-bridge
YEELIGHT_BRIDGE_API_KEY=dev-token node server.mjs
```

Health check:

```sh
curl -H "authorization: Bearer dev-token" http://127.0.0.1:8787/health
```

Invoke:

```sh
curl -X POST http://127.0.0.1:8787/invoke \
  -H "authorization: Bearer dev-token" \
  -H "content-type: application/json" \
  -d '{"contractVersion":"1.0","requestId":"smoke","locale":"zh-CN","utterance":"列出家庭","intent":"home.list"}'
```

## Deploy

Use any internal or public HTTPS runtime host that can access the local `yeelight-home` CLI and its credential store.

Environment variables:

| Name | Required | Default | Purpose |
| --- | --- | --- | --- |
| `YEELIGHT_HOME_BIN` | no | `yeelight-home` | Runtime executable path |
| `YEELIGHT_BRIDGE_API_KEY` | recommended | empty | Bearer or `x-api-key` value |
| `YEELIGHT_BRIDGE_HOST` | no | `127.0.0.1` | Listen host |
| `YEELIGHT_BRIDGE_PORT` | no | `8787` | Listen port |
| `YEELIGHT_BRIDGE_TIMEOUT_MS` | no | `30000` | Runtime timeout |
| `YEELIGHT_BRIDGE_ALLOWED_ORIGINS` | no | empty | Comma-separated CORS allowlist |

## Platform Mapping

| Platform | Recommended entry |
| --- | --- |
| OpenAI Apps SDK | `/mcp` over HTTPS |
| OpenAI GPT Actions | `/openapi.json` and `/invoke` |
| Coze / 扣子 | Import OpenAPI, call `/invoke` |
| 阿里云百炼 | Create API plugin or MCP service from `/invoke` or `/mcp` |
| 腾讯元器 | Create API plugin from `/openapi.json` |
| 百度千帆 | Create tool/API plugin from `/openapi.json` |
| 火山方舟 | Create API/MCP tool from `/openapi.json` or `/mcp` |

## Review Notes

Before submitting to a public marketplace, replace `https://YOUR_PUBLIC_BRIDGE_DOMAIN` in `openapi.json` with the real HTTPS domain, enable authentication, and provide a privacy policy URL.
