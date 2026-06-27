# Tencent SkillHub Submission Record

Status: approved and installable under the alternate slug `yeelight-smart-home-official`.

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

0.1.1 resubmission:

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

Current dashboard verification:

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

Required next action:

- Ask SkillHub support/operator to transfer or release the canonical `yeelight-smart-home` slug to the official Yeelight publisher account.
- Either keep `yeelight-smart-home-official` as the SkillHub-specific slug or republish under `yeelight-smart-home` after transfer.

Security note:

- API tokens and SMTP credentials are not stored in this repository.
- The temporary SkillHub package only added SkillHub-required frontmatter fields; it did not modify the canonical Agent Skill package.
