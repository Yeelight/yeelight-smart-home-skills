# Dify Marketplace Submission Kit

Status: `.difypkg` package ready, Dify Marketplace PR still requires an official Yeelight GitHub identity or explicit approval to submit from the current GitHub account.

Current release assets:

- `../../releases/yeelight-smart-home/v0.1.0/yeelight-smart-home-agent-skill-v0.1.0.zip`
- `../../releases/yeelight-smart-home/v0.1.0/checksums.txt`

Dify Marketplace does not consume the Agent Skill ZIP directly. This repository now includes a Dify tool plugin package that calls the Yeelight bridge:

```text
plugin/
yeelight-smart-home-0.1.0.difypkg
```

Recommended submission path:

1. Deploy `../../adapters/yeelight-skill-bridge/` on a public HTTPS endpoint.
2. In Dify, configure provider credentials:
   - `bridge_url`: public HTTPS bridge URL.
   - `api_key`: bridge API key, stored as a secret.
3. Package locally:

   ```sh
   dify plugin package submissions/dify/plugin -o submissions/dify/yeelight-smart-home-0.1.0.difypkg
   dify plugin checksum submissions/dify/yeelight-smart-home-0.1.0.difypkg
   ```

4. Fork `langgenius/dify-plugins`.
5. Add only this package file under `yeelight/yeelight-smart-home/`.
6. Submit the PR with `pull-request.md`.

Required credentials/material:

- Dify plugin developer identity.
- Public HTTPS bridge URL.
- Runtime installation instructions for `yeelight-home`.
- Official Yeelight GitHub identity for Marketplace PR submission, or explicit approval to submit from the currently authenticated GitHub account.
