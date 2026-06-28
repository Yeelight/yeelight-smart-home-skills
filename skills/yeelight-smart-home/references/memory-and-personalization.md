# Memory And Personalization

Use this reference for local memory, preferences, and personalization.

## Intent Routing

- Use `memory.remember` only for an explicit preference the user wants saved.
- Use `memory.list` when the user asks what is remembered.
- Use `memory.pause` or `memory.resume` for learning controls.
- Use `memory.forget` for export-and-delete requests in the current profile and house scope.
- For `memory.remember`, pass semantic fields `scopeType`, `scopeRef`, `preferenceType`, `preferenceValue`, optional `kind`, and `evidence`; do not wrap the preference inside a nested free-form object.
- When the user clearly says "remember", "use this by default later", "I prefer", or "I dislike" but the preference is not already structured, still use `memory.remember` with the original utterance. Runtime may extract a conservative candidate and will still require pending-plan confirmation.

## Memory Classes

- Explicit preferences are direct user instructions such as preferred ambience, disliked color modes, aliases, room purposes, or "do not recommend" choices.
- Strong memory signals are explicit phrases such as "remember", "use this by default later", "I prefer", "I dislike", "以后默认", "以后都", or "不要推荐". Route these to `memory.remember`.
- Medium memory signals are repeated corrections or repeated preference-shaped behavior observed by Runtime, such as repeatedly dimming the same room after saying it is too bright. Runtime may return these as `implicit_candidate` recommendations; do not describe them as confirmed long-term memory.
- Weak interaction signals are ordinary one-off operations. Runtime may aggregate them locally for recommendation ranking, but the Skill must not claim they became memory.
- Implicit candidates are repeated behavior signals inferred by Runtime. Treat them as low-confidence candidates unless Runtime promotes or returns them.
- Single behavior observations, one correction, or one undo are candidates only; never describe them as long-term memory by themselves.
- Current-turn instructions override saved preferences. Explicit dislikes override explicit likes, accepted personalization, implicit candidates, and generic recipes.

## Preference Extraction

- Save only useful preference assertions: preferred brightness/色温/彩光 policy, room purpose, friendly alias, recommendation suppression, or recurring comfort rules.
- Scope the memory as narrowly as the user says. "卧室晚上" is not "全屋全天"; "客厅观影" is not every scene.
- Preserve negative preferences exactly enough to act on them later, for example "不要彩光", "夜里别太亮", "别再推荐自动化".
- Do not save factual cloud state such as current device list, member list, product data, pending plans, one-time commands, diagnostic errors, or execution transcripts as memory.
- If the user's wording is a correction to the last result, route through Runtime so it can decide whether it is explicit memory, an implicit candidate, or only interaction evidence.

## Safety And Privacy

- Memory is scoped by local profile and house; never merge or reveal another house's preferences.
- Keep profile and house isolation strict. Do not combine memories across accounts, homes, hosts, or families.
- Never save secrets, account data, raw identifiers, auth material, cookies, full chat logs, or token-like values.
- Do not treat all conversation turns as memory. Runtime memory is preference state, not a transcript store.
- Local memory and recommendations are enabled by default. Treat `memory.pause` as the user's explicit opt-out and `memory.resume` as opt-in again.
- Runtime may recover already committed `memory.remember` plans into local memory before pending-plan compaction, but only when current consent is active and newer than any forget/pause boundary. Do not recover or infer memory yourself.
- First saved memory requires Runtime consent handling. Do not claim consent, consent version, retention, export, or deletion state was recorded unless Runtime confirms it.
- Default retention: explicit preferences stay until the user forgets or deletes them; implicit candidates last about 30 days; recommendation evidence and interaction evidence last about 90 days. Do not claim event-history retention is implemented unless Runtime returns event-history data.
- Export results are local Runtime snapshots for the current scope. Do not promise encrypted import/export or cross-device restore unless Runtime explicitly returns that support.

## Execution Rules

- `memory.remember` is a persistent local change. Follow Runtime's pending-plan confirmation and commit only the returned plan id.
- `memory.forget` exports the current scope snapshot and then deletes local consent, preferences, and recommendations for that scope when Runtime confirms it.
- `memory.pause` and `memory.resume` affect local learning only; they do not change cloud devices or home configuration.
- Persistent home changes suggested by memory still require Runtime planning and confirmation.
- Implicit candidates must not directly create room, group, scene, automation, device, gateway, or favorite configuration.
- Low-risk personalization may adjust wording or suggested defaults only when Runtime returns enough evidence; still explain that it is a preference-based local suggestion, not an applied cloud change.
- After Runtime confirms `memory.remember`, the local Runtime may create or refresh a preference-based pending recommendation. If the user asks for suggestions, call `recommendation.list` rather than inventing a recommendation from the remembered text.
- Recommendation feedback such as reject, cooldown, or permanent suppression must be respected.
- If the user asks why a suggestion appeared, cite Runtime's returned memory/recommendation evidence, not hidden reasoning or raw history.
