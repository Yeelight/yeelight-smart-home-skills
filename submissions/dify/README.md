# Dify Submission Kit

Status: submission kit ready, Dify plugin adapter still required.

Current release assets:

- `../../releases/yeelight-smart-home/v0.1.0/yeelight-smart-home-agent-skill-v0.1.0.zip`
- `../../releases/yeelight-smart-home/v0.1.0/checksums.txt`

Dify Marketplace does not consume this Skill ZIP directly. Next implementation step:

1. Create a Dify plugin wrapper that exposes the Yeelight Smart Home capability as Dify tools.
2. Use `yeelight-home invoke --stdin` behind a safe server/tool boundary.
3. Package as `.difypkg`.
4. Submit through the Dify plugin marketplace PR/review flow.

Required credentials/material:

- Dify plugin developer identity.
- Public repository URL.
- Plugin icon, screenshots and usage examples.
- Runtime installation instructions for `yeelight-home`.
