# Action Payloads

Use this file only as a compatibility index. The payload contract has been split into smaller references so the AI can load the narrowest file.

## Load These Instead

- Common action row, target type semantics, light params, property key vocabulary, and contract lookup: `references/payload-shapes.md`.
- Scene create/update recipe conversion and HouseMeta scene rows: `references/scene-recipes.md`.
- Automation conditions, repeat rules, actions, and HouseMeta automation rows: `references/automation-recipes.md`.
- Full HouseMeta import structure and short-key compatibility: `references/housemeta-import.md`.

## Rule

Before guessing `details`, `params`, `actions`, `items`, `operations`, `buttonEvents`, or HouseMeta JSON, call local contract lookup:

```text
yeelight-home intent schema --intent <intent> --json
```

or use Runtime intent:

```json
{
  "intent": "intent.explain",
  "parameters": {
    "intent": "scene.update"
  }
}
```

Use returned `requestSchema`, `payloadGuide.payloadShape`, `examples`, `nextStep`, `editablePayload`, or `updateShape` as authoritative. Do not retry guessed variants blindly.
