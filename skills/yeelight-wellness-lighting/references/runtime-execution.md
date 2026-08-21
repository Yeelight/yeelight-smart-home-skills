# Runtime Execution

Use the local wrapper in `scripts/invoke`. It resolves the public `yeelight-home` executable, checks Runtime metadata, forwards JSON on standard input, and returns a structured missing or outdated result when the executable is unavailable. Do not bypass this boundary.

## Request Lanes

Every request keeps the common Runtime envelope: `contractVersion`, unique `requestId`, `locale`, `utterance`, `intent`, and `parameters`.

- Read live state with `state.query` for one target. For two or more stable device IDs, use one `state.batch.query` request so the local LAN Runtime can issue a bounded parallel read and the cloud Runtime can return action-level partial rows. For a wellness context pass, use `home.summary` (account-level discovery), `home.stat.get` (selected household), `entity.list` (dynamic topology), and `device.weather.get` only for a Runtime-resolved device. Do not use `home.detail.get`, whose legacy response can expose address/building/floor/image fields outside this Skill's coarse public context. Use natural target descriptions during discovery, then stable Runtime identities for the batch read. These are read-only probes; a `partial` weather response is evidence of missing context, not a weather fact, and its unknown fields must not participate in automatic recipe selection.
- Apply a single light property with `light.power.set`, `light.brightness.set`, `light.color_temperature.set`, or `light.color.set` when one concrete target and property are enough.
- Apply a multi-light wellness plan with one Runtime-supported `lighting.design.apply` request containing the complete `actions[]` list and `parameters.verification="batch"` when the exact action shape and capabilities are known. Runtime writes all requested properties for each device, then performs one all-properties readback per device; it can still return `partial` and is not an atomic transaction. Keep per-action verification for one-target writes and recovery/restore paths. The internal `acknowledged` mode is reserved for high-frequency animation paths that explicitly accept a write receipt without state readback.
- Do not put direct light operations inside a configuration batch. Use `intent.explain` only when a complex supported payload shape is genuinely unknown.

## Target Boundaries

Resolve the household/profile binding before a recurring run. Keep the Runtime-resolved target scope explicit. Validate duplicate and protected-overlap targets against stable Runtime identities before execution; if only ambiguous display names are available, stop without a write and ask for disambiguation. Preserve protected targets and never fan out to unrelated rooms. Invocation authorizes reversible power changes, including turning target lights on or off, along with supported brightness, color-temperature, color, or effect changes.

Before a write, capture a minimal pre-change snapshot only when the host can protect it. Do not promise restoration when the snapshot is missing, stale, or not trustworthy. Keep one write phase and retain the action-level result for explanation.

## Results

- `success`: describe the verified target changes.
- `partial` with action-level evidence: list completed, offline, unsupported, and unverified targets; do not claim an automatic rollback.
- Generic `error` after a multi-action write: the Runtime may have applied earlier actions before the failure. Treat the whole target set as uncertain, do not infer which lights changed, preserve the schedule, and obtain a fresh state read before proposing another plan or a restoration control.
- `clarification_required`: ask the smallest returned target or household question.
- `auth_required`: direct the user to their own local Runtime login flow without requesting secrets in chat.
- `runtime_missing` or `runtime_outdated`: show the wrapper's recovery message and leave a recurring task unchanged.
- `blocked`, `not_supported`, or `uncertain`: report the actual status, preserve the schedule, and offer a supported fallback or preview.
- No-op: state that the target already matches the plan.
