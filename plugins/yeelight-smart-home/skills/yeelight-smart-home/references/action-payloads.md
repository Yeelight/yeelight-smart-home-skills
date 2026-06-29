# Action Payloads

Use this reference when a scene, automation, lighting-design import, panel button, or knob request needs nested action JSON. Keep the module reference as the routing source, then use this file for the payload contract.

## Contents

- When To Load
- Common Action Row
- Target Type Semantics
- Light Action Params
- Property Key Vocabulary
- Scene Payloads
- Automation Condition Params
- Automation Payloads
- Lighting Design Import Embedding
- Panel And Knob Payloads
- Repair Rule

## When To Load

- Load with `scene.create`, `scene.update`, or `scene.detail.get` when the question is about saved scene action rows.
- Load with `automation.create`, `automation.update`, or `automation.detail.get` when the question is about trigger conditions, repeat rules, or action rows.
- Load with `lighting.design.import` when executable scene or automation rows are included in a full-home design import.
- Load with `panel.button_event.update`, `panel.button_event.batch_update`, or `knob.configure` when panel or knob detail rows contain action-like nested payloads.

## Common Action Row

Scene details, automation actions, and panel event details use the same basic row idea:

```json
{
  "typeId": 2,
  "resId": "device-or-group-id",
  "resName": "target display name",
  "action": 0,
  "rank": 0,
  "idx": 0,
  "params": {
    "set": {
      "p": true,
      "l": 60,
      "ct": 3000
    }
  }
}
```

Required fields depend on the intent and Runtime payloadShape. In general:

- typeId selects the target kind.
- resId is the target identifier returned by Runtime or preserved from editablePayload.
- resName is display evidence for readability and should be preserved when Runtime returns it.
- rank and idx preserve action order. Keep existing values on update unless the user asks to reorder.
- action is usually preserved from scene detail rows. Do not invent a new action code from natural language.
- params may be an object in SkillRequest. Runtime compacts object params for cloud writes when needed.

## Target Type Semantics

Use Runtime entity evidence, not guessed ids.

- typeId 1: room, only when Runtime payloadShape, editablePayload, or design-import metadata explicitly supports it.
- typeId 2: device.
- typeId 3: Runtime-managed group entity.
- typeId 4: mesh group.
- typeId 5: home, only when Runtime payloadShape, editablePayload, or design-import metadata explicitly supports it.
- typeId 6: scene.

Direct Runtime writes validate common direct targets. Source-backed design metadata may preserve additional backend type values returned by detail reads. Do not remap area ids into typeId 3 unless Runtime explicitly returned that mapping.

## Light Action Params

Ordinary light changes go under the set object:

```json
{
  "set": {
    "p": true,
    "l": 60,
    "ct": 3000,
    "c": 16777215
  }
}
```

Common keys:

- p: power, boolean.
- l: brightness, 1-100.
- ct: color temperature, usually warm-to-cool Kelvin values such as 2700-6500.
- c: RGB integer or Runtime-accepted color value.

Optional timing and effect-like keys:

- delay: non-negative milliseconds before the action.
- duration: non-negative milliseconds for a transition.
- delayoff: non-negative milliseconds before delayed off.
- toggle: list of property names to toggle; use only when Runtime says the target supports it.
- adjust: relative change map. Examples may look like brightness or color-temperature steps such as `{"l":"+10/100"}` or `{"ct":"-1/5"}`. Preserve source-backed aliases such as `b` only when returned by Runtime evidence.
- flow: dynamic sequence object, typically count, tuples, and ending. Tuples can be set/pause style phases with duration in milliseconds. Preserve tuple fields returned by detail reads; do not invent flow tuples from mood words alone.
- action: product-specific action object. Known families include blink, curtain motor adjustment, delayed-action cancellation, music player control, and local audio control, but the exact object must come from Runtime evidence.
- custom, channel-specific keys, or vendor-specific keys are allowed only when Runtime detail, payloadShape, or capability evidence returns them.

For updates, preserve unknown keys returned by editablePayload. Change only the intended set field unless the user explicitly asks to replace the whole action.

## Property Key Vocabulary

This vocabulary helps interpret Runtime evidence and build high-level semantic requests. It is not permission to write a raw property.

| Key | Meaning | Notes |
| --- | --- | --- |
| p | power/on | Boolean light power. |
| l | brightness/level | Integer 1-100 for common lighting writes. |
| ct | color temperature | Kelvin-style color temperature where supported. |
| c | color/RGB | RGB color value where supported. |
| m | mode | Product-specific mode, preserve only from evidence. |
| o | online | Read-only online state; do not write as a control action. |
| mv | motion detected | Sensor evidence, not a light action. |
| oc | occupancy detected | Presence sensor evidence, not a light action. |
| dc | door closed | Contact sensor evidence. |
| act | sensor active | Sensor state evidence. |
| alm | alarm | Sensor alarm evidence. |
| t | temperature | Environment sensor value. |
| h | humidity | Environment sensor value. |
| ll | environment light level | Illuminance level evidence. |
| cp | curtain covered percentage | Curtain position evidence/control only when Runtime validates curtain support. |
| tp | target curtain percentage | Curtain target position only when Runtime validates curtain support. |
| tra | curtain travel/angle | Curtain travel or angle-style value; preserve only from Runtime evidence. |
| sp | switch power | Single or multi-channel switch power. Multi-channel keys may appear as 0-sp, 1-sp, 2-sp and so on. |
| blp | backlight power | Switch/panel backlight power, product-specific. |
| acp | air-condition power | Multi-channel HVAC keys may appear as 1-acp, 2-acp and so on. |
| acm | air-condition mode | Product-specific HVAC mode. |
| acct | air-condition current temperature | Read-only current temperature. |
| actt | air-condition target temperature | Target temperature when Runtime validates HVAC support. |
| acf | air-condition fan speed | Product-specific fan speed. |
| aco | air-condition online | Read-only online state. |
| acd | air-condition delay | Delay value in milliseconds when Runtime validates support. |
| mpmp / mppm / vol | media keys | Music/media power, mode, or volume style keys. Product-specific; preserve only from evidence. |
| lc / li / slisaon / bp / rl | device attributes | LAN control, LED indicator, smart switch, power-on behavior, relay state. Use semantic adapters, not ad hoc action JSON. |

For multi-channel devices, channel-prefixed keys such as 1-acp, 2-sp, 1-p, or 2-p refer to a specific channel or sub-device. Use idx or a channel-specific key only when Runtime detail or capability evidence contains it.

## Scene Payloads

Use complete details rows for both create and update.

```json
{
  "name": "孩子屋暖光",
  "details": [
    {
      "typeId": 2,
      "resId": "device-or-group-id",
      "resName": "孩子屋吸顶灯",
      "rank": 0,
      "params": {
        "set": {
          "p": true,
          "l": 55,
          "ct": 3000
        }
      }
    }
  ]
}
```

For update, include sceneId and resend the complete details list. Scene update is a full replacement, not a partial patch.

## Automation Condition Params

The common scheduled condition shape is:

```json
{
  "type": "and",
  "conditions": [
    {
      "type": "alarm",
      "clock": "09:00:00"
    }
  ]
}
```

Condition rows can include these source-backed fields when Runtime returns or validates them:

- type: alarm, event, fact_change, fact, and, or.
- id, pid, typeId, resId: event/property/resource identifiers from Runtime evidence.
- prop, operation, value: property condition fields; operation defaults to equality when omitted by Runtime.
- weekdays, repeatType, clock: schedule fields.
- extArgs and actionItem: product-specific condition arguments.
- conditions: nested child conditions for and/or groups.

Do not invent event codes, property ids, extArgs, or sensor facts from natural language. Use `automation.supported.list`, `automation.supported.v2.list`, `automation.detail.get`, or Runtime clarification payloadShape as evidence.

## Automation Payloads

Automation create and update use a complete rule payload. Update includes automationId; create omits it.

```json
{
  "automationId": "automation-id-for-update",
  "name": "主卧每天9点开灯",
  "startTime": "00:00:00",
  "endTime": "23:59:59",
  "repeatType": 2,
  "repeatValue": "0x7f",
  "params": {
    "type": "and",
    "conditions": [
      {
        "type": "alarm",
        "clock": "09:00:00"
      }
    ]
  },
  "actions": [
    {
      "typeId": 2,
      "resId": "device-or-group-id",
      "resName": "主卧吸顶灯",
      "rank": 0,
      "params": {
        "set": {
          "p": true,
          "l": 60,
          "ct": 3000
        }
      }
    }
  ]
}
```

Repeat types:

- 1 once.
- 2 daily.
- 3 weekdays.
- 4 custom; provide repeatValue such as 0x7f when needed.
- 5 weekend.
- 6 legal holidays.
- 7 legal workdays.

Do not put enable/disable state in automation update. Use the status-specific Runtime intents.

## Lighting Design Import Embedding

Inside a full-home import:

- rooms and items define design slots.
- scenes may contain details rows when executable targets are known.
- automations may contain condition params and actions rows when executable targets are known.
- If only future slots exist, keep scenes and automations as design metadata or omit executable rows. Do not invent resId values for slots unless Runtime returned a documented local mapping.

Design-sync style metadata may include operation words for nodes, groups, rooms, scenes, rules, and areas. Use add, modify, remove, bind, or unbind only when Runtime payloadShape accepts them. Future-device slots are metadata nodes, not paired online devices. A design import should preserve version-like fields returned by Runtime, but the Skill should not invent version counters.

## Panel And Knob Payloads

Panel button event details follow the common action row where possible. A batch update row contains one buttonEventId, optional alias, and its own complete details list.

Panel button event rows may include startTime, endTime, repeatType, and repeatValue. If those are omitted, backend behavior is source-specific; keep existing timing fields on update.

Knob configuration should start from `knob.get` detail evidence. Preserve the existing row and update only the intended row fields such as index, configType, resId, typeId, resIndex, resName, model, propertyName, param, actionParamMap, configMap, sens, lightDetail, or curtainDetail. Known event words include rotate, press_rotate, click, double_click, and hold, but eventCode values and param maps are product-specific; do not invent them.

## Repair Rule

If Runtime returns clarification with payloadShape, examples, nextStep, editablePayload, or updateShape, treat that response as authoritative. Rebuild from it instead of guessing field names. Ask the user only when a remaining business choice cannot be inferred from current context.
