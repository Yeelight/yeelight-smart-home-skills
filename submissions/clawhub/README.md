# ClawHub Publication Record

Status: published under the Yeelight publisher namespace.

Current version: `0.1.1`.

Public page:

```text
https://clawhub.ai/yeelight/skills/yeelight-smart-home
```

Install:

```sh
openclaw skills install @yeelight/yeelight-smart-home
```

Verification performed:

- Created ClawHub publisher namespace `@yeelight`.
- Transferred `yeelight-smart-home` from `@axdlee` to `@yeelight`.
- `clawhub inspect @yeelight/yeelight-smart-home --json` returns owner handle `yeelight`, display name `Yeelight`, version `0.1.0`, moderation verdict `clean`.
- `clawhub install @yeelight/yeelight-smart-home` installs version `0.1.0` successfully.
- `clawhub inspect @axdlee/yeelight-smart-home --json` no longer resolves the skill.
- `clawhub skill publish ... --version 0.1.1 --owner yeelight` published version `0.1.1` from the official GitHub distribution repository.
- `clawhub inspect @yeelight/yeelight-smart-home --json` now returns `latestVersion.version=0.1.1`, owner handle `yeelight`, and tags `latest`, `yeelight`, `smart-home`, `lighting`, `agent-skill`, `codex`, `claude`, and `copilot` all pointing to `0.1.1`.
- `clawhub install @yeelight/yeelight-smart-home --version 0.1.1` installed into `/tmp/clawhub-yeelight-smart-home-011-smoke/skills/yeelight-smart-home`.
- Installed-copy hashes for the two updated reference files matched the GitHub release package:
  - `references/memory-and-personalization.md`: `5f0d744dec3e45961d7da1d15b1cb324698e7b0c20d990e8209a6ea1e13bd06c`
  - `references/recommendations.md`: `2869582b421bce1493d3c14cf7b84e312970c986b67b29ca1ac990e7f0808243`

Remaining ClawHub platform work:

- Publisher trust/official status is not complete yet (`trusted: false` when the publisher namespace was created).
- `clawhub skill verify @yeelight/yeelight-smart-home --json` for `0.1.1` currently fails on optional directory trust checks: `card.missing`, `security.status_not_clean`, `security.pending`. Static scan returned clean; aggregate security status is waiting for ClawHub's asynchronous scans.
- Submit a ClawHub namespace claim from an official Yeelight-owned account or after explicit public-claim approval if a trusted/official badge is required.
