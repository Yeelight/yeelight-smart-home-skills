# Tencent SkillHub Submission Record

Status: approved and installable under the alternate slug `yeelight-smart-home-official`.

Current public latest version: `0.1.2`.

Important correction: `0.1.1` was only an audit-probe package and is not the functional release. The functional SkillHub release is `0.1.2`, which keeps the runtime invoke helpers, schemas, intent catalog, references, and a redacted domain catalog.

Entrypoints:

```text
https://skillhub.tencent.com
https://skillhub.cn
https://skillhub.cn/tutorials#publish-via-cli
```

The published tutorial documents this release path:

```sh
curl -fsSL https://skillhub.cn/install/install.sh | bash -s -- --cli-only
skillhub login --key <skh_token> --host https://api.skillhub.cn
skillhub auth whoami
skillhub publish <skill-dir> --dry-run
skillhub publish <skill-dir> --changelog "首次发布"
```

Execution performed:

```text
skillhub --version
skillhub 2026.6.27

skillhub login --key <redacted> --host https://api.skillhub.cn
✓ Logged in as @user_9efe3688 (userId=561819)

skillhub auth whoami
userId : 561819
handle : user_9efe3688
role   : user

skillhub publish /tmp/skillhub-yeelight-smart-home-submit --dry-run --json
{"dryRun": true, "slug": "yeelight-smart-home", "version": "0.1.0"}
```

Original slug publish result:

```json
{
  "success": false,
  "status": 500,
  "error": "服务端错误，请稍后重试 (500): 发布失败: skill exists and is owned by another user",
  "body": {
    "error": "发布失败: skill exists and is owned by another user"
  }
}
```

The original `yeelight-smart-home` slug is owned by another SkillHub user or reserved outside the current account.

After explicit approval to slightly change the slug when the current account has no matching skill, the package was submitted under:

```text
https://skillhub.cn/skill/yeelight-smart-home-official
```

0.1.0 publish result:

```json
{
  "ok": true,
  "skillId": 91967,
  "slug": "yeelight-smart-home-official",
  "version": "0.1.0",
  "versionId": 121717,
  "reviewStatus": "pending",
  "contentAuditStatus": "pending",
  "securityScanStatus": "pending"
}
```

0.1.0 was then rejected by platform content compliance:

```json
{
  "version": "0.1.0",
  "versionId": 121717,
  "reviewStatus": "rejected",
  "reviewRejectReason": "content_audit_failed",
  "reviewNote": "审核未通过：未通过内容合规审查"
}
```

Likely trigger: the full canonical package includes a large local capability catalog, shell wrappers, and safety wording around credentials and high-impact operations. Those are legitimate in the GitHub/ClawHub package, but are noisy for SkillHub's community content audit.

0.1.1 audit-probe resubmission:

```json
{
  "ok": true,
  "fileCount": 2,
  "skillId": 91967,
  "slug": "yeelight-smart-home-official",
  "version": "0.1.1",
  "versionId": 121718,
  "reviewStatus": "pending",
  "contentAuditStatus": "pending",
  "securityScanStatus": "pending"
}
```

0.1.1 dashboard verification:

```json
{
  "version": "0.1.1",
  "reviewStatus": "approved",
  "reviewRejectReason": null,
  "reviewNote": "auto-approved by skillhub-sanbu-scan-worker",
  "securityReports": {
    "keen": {
      "status": "benign",
      "statusText": "安全，无风险",
      "reportUrl": "available"
    },
    "sanbu": {
      "status": "benign",
      "statusText": "安全，无风险",
      "reportUrl": "available"
    }
  }
}
```

Additional verification:

- `skillhub check-slug` reports `yeelight-smart-home-official` as owned by the current account and publishable for new versions.
- `skillhub install yeelight-smart-home-official` installed version `0.1.1` into a clean temporary directory.
- Installed target: `/tmp/skillhub-yeelight-official-install-smoke-approved/skills/yeelight-smart-home-official`.

0.1.1 was intentionally not accepted as the official functional release because it contained only two files and could not exercise the expected Yeelight runtime flow.

0.1.2 functional release:

```json
{
  "version": "0.1.2",
  "versionId": 121721,
  "reviewStatus": "approved",
  "reviewRejectReason": null,
  "reviewNote": "auto-approved by skillhub-sanbu-scan-worker",
  "securityReports": {
    "keen": {
      "status": "benign",
      "statusText": "安全，无风险",
      "reportUrl": "available"
    },
    "sanbu": {
      "status": "benign",
      "statusText": "安全，无风险",
      "reportUrl": "available"
    }
  }
}
```

0.1.2 package verification:

- `fileCount`: 26.
- Required files present: `SKILL.md`, `agents/openai.yaml`, `assets/intent-catalog.json`, `assets/catalog/yeelight-domain.json`, both schemas, `scripts/invoke.sh`, `scripts/invoke.ps1`, and `scripts/runtime-manifest.json`.
- Referenced files: 18 referenced file tokens, no missing references.
- References directory: 17 markdown references.
- JSON files parsed successfully.
- Installed latest version after review: `0.1.2`.
- Installed target: `/tmp/skillhub-yeelight-official-install-smoke-latest-after-013/skills/yeelight-smart-home-official`.

Functional install smoke from the SkillHub-installed copy:

```sh
skillhub install yeelight-smart-home-official --dir /tmp/skillhub-yeelight-official-install-smoke-latest-after-013/skills --force --json
printf '{"contractVersion":"1.0","requestId":"latest-after-013-smoke","locale":"zh-CN","utterance":"列出家庭","intent":"entity.list"}' \
  | sh /tmp/skillhub-yeelight-official-install-smoke-latest-after-013/skills/yeelight-smart-home-official/scripts/invoke.sh
```

Smoke result:

```json
{
  "status": "success",
  "userMessage": "已找到 144 个实体。",
  "counts": {
    "area": 1,
    "automation": 1,
    "device": 131,
    "group": 2,
    "room": 8,
    "scene": 1
  }
}
```

0.1.3 follow-up attempt:

```json
{
  "version": "0.1.3",
  "versionId": 121735,
  "reviewStatus": "rejected",
  "reviewRejectReason": "content_audit_failed",
  "reviewNote": "审核未通过：未通过内容合规审查"
}
```

0.1.3 attempted to document a shell-based invoke entrypoint for SkillHub installs because the SkillHub installer does not preserve the Unix executable bit for `scripts/invoke.sh`. It was rejected by content compliance and did not replace the public latest version. `skillhub install yeelight-smart-home-official` still installs the approved functional `0.1.2` release.

0.1.9 candidate preparation:

- Candidate directory: `/tmp/skillhub-yeelight-smart-home-official-0.1.9`.
- SkillHub metadata uses the approved alternate slug `yeelight-smart-home-official`.
- `skillhub publish ... --dry-run --json` passed with `slug=yeelight-smart-home-official` and `version=0.1.9`.
- Candidate package contains 39 files, including `scripts/invoke`, `scripts/invoke.sh`, `scripts/invoke.ps1`, product selection assets, examples, schemas and references.
- Referenced-file validation found 30 referenced files and no missing references.
- JSON validation passed for all packaged JSON files.
- Product alias smoke passed: `120 射灯` normalized to E20射灯 candidates.
- Functional runtime smoke passed from `scripts/invoke`; `entity.list` returned `status=success` and 59 entities from the current dev sample home.
- Formal publish is blocked by local SkillHub auth state: `auth whoami` returns `未登录。请先执行: skillhub login --key skh_xxx`.

Required next action:

- Ask SkillHub support/operator to transfer or release the canonical `yeelight-smart-home` slug to the official Yeelight publisher account.
- Either keep `yeelight-smart-home-official` as the SkillHub-specific slug or republish under `yeelight-smart-home` after transfer.
- Log in locally with a SkillHub token in the operator terminal, then publish the verified 0.1.9 candidate; do not paste the token into chat.

Security note:

- API tokens and SMTP credentials are not stored in this repository.
- The temporary SkillHub package only added SkillHub-required frontmatter fields; it did not modify the canonical Agent Skill package.
