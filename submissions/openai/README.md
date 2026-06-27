# OpenAI GPT Store / Apps SDK Submission Kit

Status: submission kit ready, OpenAI adapter still required.

Current Skill package is not directly uploadable to GPT Store or Apps SDK.

Recommended path:

1. GPT Store: create a GPT with Actions that call a hosted Yeelight Skill bridge.
2. Apps SDK: implement a ChatGPT app server that wraps selected `yeelight-home` read/control intents.
3. Keep write operations confirmation-gated.
4. Use this GitHub Release as the public capability/reference source.

Required credentials/material:

- OpenAI builder/developer account.
- Public HTTPS endpoint for the bridge/app server.
- OAuth or local-device auth design.
- Privacy policy and user-facing safety copy.
