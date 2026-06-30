# Operation Lessons

Use this reference for reusable Skill/Runtime usage experience discovered during real operation.

Operation lessons are not user taste memory, cloud topology, diagnostics transcripts, or recommendations. They are compact local notes that help future agents avoid known Skill/Runtime pitfalls and choose faster, more reliable paths.

## Intent Routing

- Use `operation.lesson.list` before a complex, previously failed, or parameter-heavy operation when a known lesson could avoid wasted turns.
- Use `operation.lesson.record` after an actual operation attempt reveals a reusable lesson and the lesson is clear enough to summarize.
- Do not use operation lessons for normal user preferences. Use `memory.remember` for preferences such as ambience, product positioning, room purpose, or recommendation suppression.
- Do not use operation lessons for a one-off current state result, full chat transcript, secret, token, raw API detail, or private account data.

## Lesson Types

Use one of these `lessonType` values when possible:

| Type | Meaning |
| --- | --- |
| `fast_path` | A faster way to complete a common user goal. |
| `resource_resolution` | How to resolve names, rooms, devices, scenes, automations, or aliases reliably. |
| `parameter_shape` | A precise nested JSON or payload-shape requirement learned from Runtime responses. |
| `failure_pattern` | A repeated error pattern with cause and recovery path. |
| `fallback` | A safer or more reliable alternative intent when the first path is unavailable. |
| `capability_gap` | A confirmed unsupported or not-yet-registered capability that should not be retried blindly. |

## Record Shape

Preferred request:

```json
{
  "contractVersion": "1.0",
  "requestId": "operation-lesson-scene-update-001",
  "locale": "zh-CN",
  "utterance": "记录 scene.update 参数经验",
  "intent": "operation.lesson.record",
  "parameters": {
    "lesson": {
      "intent": "scene.update",
      "lessonType": "parameter_shape",
      "symptom": "invalid_scene_update_payload when guessing details/params",
      "cause": "acceptedFields lists details/params but does not define the nested action rows",
      "recommendedPath": "Call scene.detail.get first, use editablePayload/updateShape, then read-modify-send the complete details list.",
      "avoid": "Do not invent details/params from acceptedFields alone.",
      "fallbackIntent": "scene.create",
      "evidence": "Runtime returned invalid_scene_update_payload during update attempt.",
      "source": "runtime_response",
      "confidence": "high",
      "status": "confirmed",
      "stale": false,
      "lastValidatedAt": 1780000000
    }
  }
}
```

Required fields:

- lesson `intent`: the target capability that future agents should learn about, not `operation.lesson.record`.
- lesson `lessonType`: use the taxonomy above.
- lesson `symptom`: short observed symptom or error.
- lesson `recommendedPath`: concise action path to use next time.

Optional fields:

- `cause`: why the issue happens, only if known.
- `avoid`: what future agents should not do.
- `parametersHint`: minimal payload-shape note or compact JSON hint.
- `fallbackIntent`: semantic Runtime intent to try when the primary path is unavailable.
- `evidence`: short, sanitized evidence such as an error code or result summary.
- `source`: one of `ai_skill`, `runtime_response`, `source_review`, or another short objective source tag.
- `confidence`: `low`, `medium`, or `high`. Use `high` only for actual Runtime behavior or source-backed code review, not guesses.
- `status`: usually `confirmed`; use `candidate` only for a lesson that still needs more evidence, `deprecated` for a superseded path, and `rejected` for a bad lesson.
- `stale`: set `true` when a newer Runtime response or code review shows the lesson should not guide normal execution.
- `lastValidatedAt`: Unix seconds when this lesson was last verified by Runtime behavior, tests, or source-backed review.

## Query Shape

Before a complex operation, query by intent or symptom:

```json
{
  "contractVersion": "1.0",
  "requestId": "operation-lesson-list-scene-update-001",
  "locale": "zh-CN",
  "utterance": "查询 scene.update 的实操经验",
  "intent": "operation.lesson.list",
  "parameters": {
    "intent": "scene.update",
    "status": "confirmed",
    "minConfidence": "medium",
    "limit": 5
  }
}
```

Useful filters:

- `intent`: exact semantic intent such as `scene.update`, `lighting.design.import`, or `light.power.set`.
- `lessonType`: one of the lesson types above.
- `query`: text search across symptom, cause, recommended path, avoid, parameters hint, fallback, and evidence.
- `status`: optional exact status filter: `candidate`, `confirmed`, `deprecated`, or `rejected`.
- `source`: optional source filter.
- `minConfidence`: optional threshold: `low`, `medium`, or `high`.
- `includeStale`: default is false. Set true only during cleanup, debugging, or when you need to inspect superseded knowledge.
- `includeRejected`: default is false. Set true only during cleanup or audit.
- `limit`: default is 10; keep small for fast context.

## Trigger Policy

Record a lesson when all are true:

- The issue or path is reusable for future users or future turns.
- The lesson was learned from actual Runtime use, a Runtime response, validated CLI behavior, or source-backed Skill development.
- The lesson can be expressed without secrets, raw tokens, raw API headers, full transcripts, or private unrelated data.
- The lesson is more specific than the public reference text.

Do not record:

- Ordinary successful one-off commands.
- User preferences or style choices.
- Cloud topology snapshots such as current device lists or scene IDs.
- Temporary dev data, transient request IDs, or full payload dumps.
- Guesses that were not verified by Runtime behavior or source-backed analysis.

## Applying Lessons

- Treat returned lessons as local operational guidance, not proof that the current cloud state still exists.
- If a lesson says an intent is unsupported, do not retry it blindly. Use the recommended fallback or explain the current limitation.
- If a lesson gives a fast path, prefer it only when the user's current request matches the same scope and risk.
- If a lesson describes a payload shape, still respect the current Runtime clarification, `payloadShape`, `editablePayload`, and `updateShape`.
- If a lesson is stale or contradicted by a newer Runtime response, record a corrected lesson with better evidence.
- When a lesson is no longer reliable, record the same target/symptom with `status=deprecated` or `stale=true` and better evidence instead of leaving it as active guidance.
- Prefer active `confirmed` lessons with `medium` or `high` confidence. Treat `candidate` lessons as hints to verify, not as instructions.

## Boundaries

- Runtime stores caller-structured lessons only. It does not infer subjective experience from user utterances.
- Operation lessons may be profile-global when no `houseId` is supplied. If the lesson depends on a specific home, include `houseId`.
- Querying with a house context can return both house-specific and profile-global lessons.
- Operation lessons must never replace Runtime execution, validation, or write verification.
