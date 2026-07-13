# Dify Marketplace Submission Kit

Status: `0.1.11` `.difypkg` package ready; Marketplace update PR pending submission. The previous `0.1.9` update was merged after its Dify pre-check passed.

Marketplace PR:

```text
https://github.com/langgenius/dify-plugins/pull/2614
https://github.com/langgenius/dify-plugins/pull/2643
```

PR state:

- Merged.
- Submitted from `axdlee:yeelight-smart-home-0.1.0` after explicit approval.
- File list contained only `yeelight/yeelight-smart-home/yeelight-smart-home-0.1.0.difypkg`.
- GitHub Actions `pre-check-plugin` completed successfully.

Previous update PR state:

- Merged.
- Originally submitted from `axdlee:yeelight-smart-home-0.1.8`, then updated to package version `0.1.9` after the Skill release packaging fix for the `scripts/invoke` wrapper.
- File list contains only `yeelight/yeelight-smart-home/yeelight-smart-home-0.1.9.difypkg`.
- GitHub Actions `pre-check-plugin` completed successfully for the `0.1.9` update.

Current update target:

```text
yeelight/yeelight-smart-home/yeelight-smart-home-0.1.11.difypkg
```

Current release assets:

- `../../releases/yeelight-smart-home/v0.1.11/yeelight-smart-home-agent-skill-v0.1.11.zip`
- `../../releases/yeelight-smart-home/v0.1.11/checksums.txt`

Dify Marketplace does not consume the Agent Skill ZIP directly. This repository now includes a Dify tool plugin package that calls the Yeelight bridge:

```text
plugin/
yeelight-smart-home-0.1.11.difypkg
```

Recommended runtime deployment path:

1. Deploy `../../adapters/yeelight-skill-bridge/` on a public HTTPS endpoint.
2. In Dify, configure provider credentials:
   - `bridge_url`: public HTTPS bridge URL.
   - `api_key`: bridge API key, stored as a secret.
3. Package locally:

   ```sh
   dify plugin package submissions/dify/plugin -o submissions/dify/yeelight-smart-home-0.1.11.difypkg
   dify plugin checksum submissions/dify/yeelight-smart-home-0.1.11.difypkg
   ```

4. Submit the `0.1.11` Marketplace update PR and wait for Dify maintainer review.

Required credentials/material:

- Public HTTPS bridge URL.
- Runtime installation instructions for `yeelight-home`.
