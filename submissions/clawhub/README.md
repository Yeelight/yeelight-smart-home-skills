# ClawHub Publication Record

Status: optional / blocked for the current release. ClawHub remains published
under the Yeelight publisher namespace at `0.1.9`, while newer publish attempts are
blocked by an upstream ClawHub API response schema error. Future releases attempt
ClawHub publication from `.github/workflows/publish-skill.yml` after GitHub
Release assets are created, but ClawHub failures are non-blocking.

Current ClawHub version: `0.1.9`.
Current GitHub Release target version: `0.1.11`.

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
- `clawhub inspect @yeelight/yeelight-smart-home --json` now returns `latestVersion.version=0.1.7`, owner handle `yeelight`, and tags `latest`, `yeelight`, `smart-home`, `lighting`, `agent-skill`, `codex`, `claude`, and `copilot`.
- `clawhub install @yeelight/yeelight-smart-home --version 0.1.1` installed into `/tmp/clawhub-yeelight-smart-home-011-smoke/skills/yeelight-smart-home`.
- `clawhub --workdir <tmp> --dir skills --no-input install @yeelight/yeelight-smart-home --version 0.1.7` installed into `skills/@yeelight/yeelight-smart-home`; installed `SKILL.md` hash: `2acfb57278a488513002d7a84bdb56cef6d15d0fd6fc861fcdaf5192ee5f0890`.
- Installed-copy hashes for the two updated reference files matched the GitHub release package:
  - `references/memory-and-personalization.md`: `5f0d744dec3e45961d7da1d15b1cb324698e7b0c20d990e8209a6ea1e13bd06c`
  - `references/recommendations.md`: `2869582b421bce1493d3c14cf7b84e312970c986b67b29ca1ac990e7f0808243`
- GitHub workflow `28647580940` published GitHub Release and ClawHub `0.1.9` successfully.
- `clawhub inspect @yeelight/yeelight-smart-home --json` returns `latestVersion.version=0.1.9` and moderation verdict `clean`.
- The `0.1.10` ClawHub-safe package excludes extensionless `scripts/invoke`, keeps `scripts/invoke.sh`, and passes local publication asset verification.
- GitHub workflow `28861378981` published GitHub Release `0.1.10` successfully, but ClawHub still failed with `API response: skillId: invalid value; versionId: invalid value`, including the minimal metadata retry.
- `clawhub inspect @yeelight/yeelight-smart-home --json` still returns `latestVersion.version=0.1.9` and moderation verdict `clean` after the failed `0.1.10` attempts.

Remaining ClawHub platform work:

- Treat ClawHub as optional and non-release-blocking until the upstream publish
  API or CLI response schema issue is resolved.
- Publisher trust/official status is not complete yet (`trusted: false` when the publisher namespace was created).
- ClawHub asynchronous scans may lag immediately after a publish; use `clawhub inspect @yeelight/yeelight-smart-home --json` for version confirmation and `clawhub skill verify @yeelight/yeelight-smart-home --json` after scans settle.
- Submit a ClawHub namespace claim from an official Yeelight-owned account or after explicit public-claim approval if a trusted/official badge is required.
