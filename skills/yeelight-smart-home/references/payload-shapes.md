# Payload Shapes

Use this reference when a Runtime intent accepts nested `details`, `params`, `actions`, `items`, `operations`, `buttonEvents`, or HouseMeta JSON.

## Contract Lookup First

Before guessing a large payload, ask Runtime for the objective contract:

```json
{
  "contractVersion": "1.0",
  "requestId": "intent-explain-scene-update",
  "locale": "zh-CN",
  "utterance": "查看 scene.update 的参数格式",
  "intent": "intent.explain",
  "parameters": {
    "intent": "scene.update"
  }
}
```

Traditional programs can also run:

```text
yeelight-home intent schema --intent scene.update --json
yeelight-home explain scene.update --json
```

Use returned `requestSchema`, `payloadGuide.payloadShape`, `examples`, and `nextStep` as authoritative. If Runtime returns `editablePayload` or `updateShape`, read-modify-send that complete payload.

## Common Action Row

Scene details, automation actions, design-import actions, panel event details, and knob-related actions share this basic row idea:

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

Required fields depend on the intent and Runtime schema.

- `typeId` selects the target kind.
- `resId` is a cloud target id for normal scene/automation/panel updates; preserve it from Runtime evidence.
- `tempId` is used only in HouseMeta import action rows and references imported resources from the same payload.
- `resName` is display evidence; preserve it when Runtime returns it.
- `rank` and `idx` preserve order or channel; keep existing values on update unless the user asks to reorder.
- `action` is usually preserved from detail rows. Do not invent action codes from natural language.
- `params` may be an object in SkillRequest; Runtime compacts object params for cloud writes when needed.

## Target Type Semantics

Use Runtime entity evidence, not guessed ids.

- `typeId=1`: room, when Runtime payloadShape/editablePayload/import metadata supports it.
- `typeId=2`: device or imported device slot.
- `typeId=3`: Runtime-managed group entity for normal cloud scene actions.
- `typeId=4`: imported HouseMeta group in design import, or source-backed mesh group where Runtime returned it.
- `typeId=5`: home scope when Runtime/import metadata supports it.
- `typeId=6`: scene.

Do not remap area ids into group type ids unless Runtime returned that mapping.

## Light Action Params

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

- `p`: power boolean.
- `l`: brightness 1-100.
- `ct`: color temperature, usually 2700-6500 when supported.
- `c`: RGB integer or Runtime-accepted color value.
- `delay`, `duration`, `delayoff`: non-negative milliseconds.
- `toggle`, `adjust`, `flow`, `action`, custom or channel-specific keys require Runtime/product evidence.

For updates, preserve unknown keys returned by `editablePayload`. Change only the intended field unless the user asks to replace the whole action.

## Property Key Vocabulary

| Key | Meaning | Notes |
| --- | --- | --- |
| p | power/on | Boolean light power. |
| l | brightness/level | Integer 1-100 for common lighting writes. |
| ct | color temperature | Kelvin-style color temperature where supported. |
| c | color/RGB | RGB color value where supported. |
| m | mode | Product-specific mode; preserve only from evidence. |
| o | online | Read-only online state. |
| mv / oc | motion / occupancy | Sensor evidence, not a light action. |
| dc | door closed | Contact sensor evidence. |
| ll | environment light level | Illuminance evidence. |
| sp | switch power | Multi-channel keys may appear as `0-sp`, `1-sp`. |
| acp / acm / actt / acf | HVAC keys | Use only when Runtime validates HVAC support. |
| mpmp / mppm / vol | media keys | Product-specific; preserve only from evidence. |

For multi-channel devices, channel-prefixed keys such as `1-acp`, `2-sp`, `1-p`, or `2-p` refer to a channel or sub-device. Use them only when Runtime detail or capability evidence contains them.

## Repair Rule

If a payload fails with `clarification_required`, do not retry variants blindly. Use the returned `acceptedFields`, `payloadShape`, `examples`, `nextStep`, `editablePayload`, or `updateShape`; ask the user only when a remaining business choice cannot be inferred.
