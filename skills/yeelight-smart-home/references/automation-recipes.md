# Automation Recipes

Use this reference for schedule and trigger-action rules in lighting design or automation create/update.

## Repeat And Time Rules

- Daily: `repeatType=2`, `repeatValue=0x7f`.
- Weekdays: `repeatType=3`, `repeatValue=0x3e`.
- Weekend: `repeatType=5`, `repeatValue=0x41`.
- Custom days: Sunday 1, Monday 2, Tuesday 4, Wednesday 8, Thursday 16, Friday 32, Saturday 64. Sum and format as lower-case hex with `0x`; re-check by converting back.
- Legal holiday/workday repeat types are product/platform-specific; use only when Runtime evidence accepts them.
- Use `HH:mm:ss` clocks. If active window is not specified, use `00:00:00` to `23:59:59`.

## Condition Rules

Common scheduled condition:

```json
{
  "type": "and",
  "conditions": [
    {"type": "alarm", "clock": "09:00:00"}
  ]
}
```

- Separate triggers from facts. The first group should be trigger-like (`alarm`, `event`, `fact_change`); fact checks belong in a second group when needed.
- Do not invent event ids, property ids, `extArgs`, or sensor facts from natural language.
- Use `automation.supported.list`, `automation.supported.v2.list`, `automation.detail.get`, or Runtime payloadShape as source evidence.
- Missing light actions may target imported light/group tempIds in HouseMeta import.
- Missing sensor triggers may not be invented as live triggers. Keep them as design notes or recommendations unless product and target evidence exists.

## Action Rules

- Use `references/payload-shapes.md` for action rows and light params.
- Do not put enable/disable state in `automation.update`; use `automation.enable` or `automation.disable`.
- For updates, read `automation.detail.get` first when possible and resend the complete rule payload.

## HouseMeta Import Automations

```json
{
  "tempId": "at1",
  "name": "主卧每天9点",
  "startTime": "00:00:00",
  "endTime": "23:59:59",
  "repeatType": 2,
  "repeatValue": "0x7f",
  "version": 2,
  "params": {
    "type": "and",
    "conditions": [
      {"type": "alarm", "clock": "09:00:00"}
    ]
  },
  "actions": [
    {
      "typeId": 4,
      "tempId": "gp1",
      "resName": "主卧射灯组",
      "rank": 0,
      "params": {"set": {"p": true, "l": 60, "ct": 3000}}
    }
  ]
}
```
