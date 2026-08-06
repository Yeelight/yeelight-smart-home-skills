# Host Scheduling

The host task system owns recurring execution. Use it when scheduler tools are exposed; otherwise return the portable JSON shape in `assets/schemas/schedule-template.schema.json`.

## Lifecycle

1. Discover actual scheduler capabilities. Do not invent a tool name or silently fall back to a Yeelight cloud automation.
2. For creation, resolve and record the Runtime household binding, account region, host profile marker, and an unguessable Skill marker. The host returns the immutable task id; store it with `createdBy: yeelight-wellness-lighting`.
3. For inspect, pause, resume, update, or remove, address the exact task id and verify `createdBy`, household binding, profile, and region. A natural-language match that yields more than one task requires one smallest clarification.
4. Serialize the semantic template as structured JSON. Never interpolate cadence, user principles, source text, room names, or targets into shell, cron, or executable source.
5. Keep metadata minimal. Retain the rule, target scope, binding, and task lifecycle fields. Do not retain raw provider output, links, context snapshots, credentials, or Runtime responses. Pause may retain the minimal template; remove must clear Skill metadata when the host supports it.

The host and Runtime determine the number and names of homes, rooms, areas, groups, devices, scenes, and automations at run time. Do not add a fixed cardinality or assume that a sample target list represents the user's topology; `targets` and `protectedTargets` are dynamic scopes. After Runtime resolution, validate stable identities and reject duplicates or protected-overlap targets before any write is dispatched. If the host cannot obtain stable identities, keep the schedule unexecuted until the target scope is disambiguated.

## Portable Template

Validate the object before returning it:

```json
{
  "schemaVersion": "yeelight-wellness-schedule-v1",
  "skill": "yeelight-wellness-lighting",
  "enabled": true,
  "invocationMode": "scheduled",
  "schedule": {
    "localExpression": "sunset-aware daily check",
    "timezone": "Asia/Shanghai",
    "triggerWindow": {"start": "18:00", "end": "23:00"}
  },
  "homeBinding": {
    "runtimeHomeRef": "opaque-runtime-ref",
    "region": "cn",
    "profileRef": "home-profile"
  },
  "location": {"city": "configured city", "timezone": "Asia/Shanghai"},
  "rule": {
    "recipePreferences": ["seasonal-drift"],
    "userPrinciples": ["保持中央清晰"],
    "publicContextNeeds": {"required": ["sunset"], "optional": ["cloudCover"]}
  },
  "scope": {"targets": ["configured target"], "protectedTargets": ["configured protected target"]},
  "executionBounds": {
    "allowedActions": ["power", "brightness", "colorTemperature", "color", "supportedEffect"],
    "allowedPowerTransitions": ["on", "off"],
    "maxWritePhases": 1,
    "unrelatedScope": "exclude"
  },
  "fallback": "skip"
}
```

The example values are placeholders. Replace them only with the user's configured city, timezone, target scope, and Runtime binding. A missing or drifting binding leaves the task unchanged and asks for rebind. For Seasonal Drift, update the host task revision from the stored baseline; never rewrite an ambiguous unrelated task.

## Undo

For a recurring task, undo means pause or remove at the host scheduler. Restoring a previous light state is a new target-scope control and requires a trustworthy pre-change snapshot; it is not a promise of universal rollback.
