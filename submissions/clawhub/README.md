# ClawHub Publication Record

Status: published under the Yeelight publisher namespace.

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

Remaining ClawHub platform work:

- Publisher trust/official status is not complete yet (`trusted: false` when the publisher namespace was created).
- `clawhub skill verify @yeelight/yeelight-smart-home` currently fails on optional directory trust checks: `card.missing`, `security.status_not_clean`, `security.pending`. Static scan and VirusTotal signals were clean in the returned evidence.
- Submit a ClawHub namespace claim from an official Yeelight-owned account or after explicit public-claim approval if a trusted/official badge is required.
