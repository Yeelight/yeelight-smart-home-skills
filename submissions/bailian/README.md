# 阿里云百炼提交材料

状态：OpenAPI/MCP bridge adapter 已准备，仍需百炼控制台、公开 HTTPS 域名和审核发布动作。

建议路径：在百炼创建 API 插件或自定义 MCP 服务，通过 HTTPS 调用 Yeelight Skill bridge，后端再调用 `yeelight-home invoke --stdin`。

桥接材料：

```text
../../adapters/yeelight-skill-bridge/openapi.json
../../adapters/yeelight-skill-bridge/privacy.md
```

需要补齐：

- 百炼账号与工作空间。
- 公网 HTTPS bridge。
- 插件 OpenAPI schema。
- 隐私政策与写操作确认说明。
- 插件测试通过后，在智能体应用中添加该插件/MCP 服务并发布应用。
