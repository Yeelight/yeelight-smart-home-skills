# Dify Submission Kit

Status: bridge adapter ready, Dify package/Marketplace PR still requires a Dify developer identity.

Current release assets:

- `../../releases/yeelight-smart-home/v0.1.0/yeelight-smart-home-agent-skill-v0.1.0.zip`
- `../../releases/yeelight-smart-home/v0.1.0/checksums.txt`

Dify Marketplace does not consume this Skill ZIP directly. Use the bridge adapter:

```text
../../adapters/yeelight-skill-bridge/
```

Recommended submission path:

1. Deploy the bridge on a public HTTPS endpoint.
2. Create a Dify tool plugin that calls `POST /invoke`.
3. Include `manifest.yaml`, `README.md`, `PRIVACY.md`, non-default icon and required `_assets/`.
4. Package one `.difypkg`.
5. Submit one package through the official `langgenius/dify-plugins` PR flow.

Required credentials/material:

- Dify plugin developer identity.
- Public repository URL.
- Plugin icon, screenshots and usage examples.
- Runtime installation instructions for `yeelight-home`.
- Public HTTPS bridge URL.
- Privacy policy URL or packaged `PRIVACY.md`.
