# Tencent SkillHub Submission Record

状态：发布 API 已确认存在，但自动提交被登录/认证挡住。

入口：

```text
https://skillhub.tencent.com
https://skillhub.cn
```

已确认 API：

```text
GET  https://api.skillhub.cn/api/v1/auth/me
GET  https://api.skillhub.cn/api/v1/community/skills/check-slug?slug=yeelight-smart-home
POST https://api.skillhub.cn/api/v1/community/skills/publish
POST https://api.skillhub.cn/api/v1/community/skill-icons/upload
```

未登录验证结果：

```json
{"error":"unauthorized"}
```

前端发布表单字段：

- `slug`
- `displayName`
- `version`
- `summaryZh`
- `changelog`
- `iconUrl`
- Skill 文件夹/ZIP 文件条目
- 可选 `claimSlug`
- 可选比赛报名参数

需要补齐：

- SkillHub 登录态。
- 手机绑定、实名或企业认证（平台前端包含 real-name / enterprise / GitHub binding 相关流程）。
- 官方 Yeelight 发布身份。
- 平台要求的图标、中文简介、版本说明和文件上传。

当前不能无凭据自动发布；提供可操作登录态或在浏览器中完成登录/实名后，可继续自动填表/提交。
