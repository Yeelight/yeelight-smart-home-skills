# 百度千帆提交材料

状态：OpenAPI bridge adapter 已准备，仍需千帆控制台、公开 HTTPS 域名和审核发布动作。

建议路径：通过千帆智能体/插件能力接入一个 Yeelight Skill bridge，再由 bridge 调用 `yeelight-home invoke --stdin`。

桥接材料：

```text
../../adapters/yeelight-skill-bridge/openapi.json
../../adapters/yeelight-skill-bridge/privacy.md
```

需要补齐：

- 千帆账号与应用空间。
- 公网 HTTPS bridge。
- 插件/API schema。
- 安全和隐私说明。
- 控制台工具测试通过后再发布应用。
