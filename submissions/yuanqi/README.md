# 腾讯元器提交材料

状态：OpenAPI/MCP bridge adapter 已准备，仍需元器控制台、公开 HTTPS 域名和审核发布动作。

建议路径：创建智能体插件/API 工具或接入 MCP 插件，调用 Yeelight Skill bridge；不要把本地凭据或 runtime token 暴露给平台模型。

桥接材料：

```text
../../adapters/yeelight-skill-bridge/openapi.json
../../adapters/yeelight-skill-bridge/privacy.md
```

需要补齐：

- 元器账号与应用空间。
- 公网 HTTPS bridge 或企业内网接入方案。
- 插件/API schema。
- 图标、简介、示例提示词。
- 在插件中心完成工具校验，保存后添加到 Agent 或工作流并发布。
