# OpenAI GPT Store / Apps SDK Submission Kit

Status: MCP/OpenAPI bridge adapter ready, OpenAI dashboard review still required.

Current Skill package is not directly uploadable to GPT Store or Apps SDK.

Adapter:

```text
../../adapters/yeelight-skill-bridge/
```

Recommended path:

1. Apps SDK: deploy the bridge and submit the public HTTPS `/mcp` endpoint.
2. GPT Actions: import `openapi.json` and call `POST /invoke`.
3. Keep write operations confirmation-gated.
4. Use this GitHub Release as the public capability/reference source.

Required credentials/material:

- OpenAI builder/developer account.
- Public HTTPS endpoint for the bridge/app server.
- OAuth or local-device auth design.
- Privacy policy and user-facing safety copy.
- Logo, screenshots, test prompts and responses.
