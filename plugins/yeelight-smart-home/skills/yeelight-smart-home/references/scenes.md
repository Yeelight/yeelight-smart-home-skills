# Scenes

Use this reference for existing scenes and scene configuration.

## Intent Routing

- Use `scene.execute` when the user asks to run an existing scene.
- Use `entity.list` or `entity.get` when the user asks what scenes exist or which scene matches a name.
- Use `scene.list` when the user asks for all scenes in one selected home or when a scene-affecting plan needs a complete scene candidate list.
- Use `scene.scoped.list` when the user asks for scenes under a specific room or when a room-scoped scene picker is needed.
- Use `scene.search` when the user gives a fuzzy scene name or asks to find matching scenes.
- Use `scene.detail.get` when the user asks what an existing scene will do or before proposing a scene update.
- Use `scene.create` for a new persistent scene; Runtime must return a pending plan.
- When the user imports a full lighting design that includes scene names such as "离家模式" or "回家模式", route to `lighting.design.import` if the scene is part of the requested design topology. For a standalone saved scene, use `scene.create`.
- Use `scene.update` for edits to an existing scene. It requires a complete updated action list, returns a pending plan, and is verified by scene detail after commit.
- Use `scene.test` only for a test run request; Runtime may block if not enabled.
- Use `scene.delete` only when the user explicitly asks to delete one scene. Runtime must return a pending plan, re-check the scene, and verify removal after commit.
- Use `scene.batch_delete` only when the user explicitly asks to delete multiple scenes. Runtime caps one plan at 20 scenes, resolves each target by id or unique name, and verifies every scene disappeared from `entity.list`.

## Scene Design Rules

- A scene is a saved action bundle, not a trigger. If the user says "每天", "当有人", "门打开时", or any condition, route to automation planning, optionally with a scene as the action.
- Keep scene names user-friendly and specific. Prefer "客厅观影", "卧室睡前", "玄关迎宾" over vague duplicates such as "模式1" or another "观影".
- A good scene proposal has target scope, action order, brightness/color-temperature/color choices, transition, delay or delayed-off where relevant, and fallback when a target lacks support.
- Use room/area/group actions for broad ambience only when Runtime validates that scope. Use device-level actions when the user names specific lamps.
- Treat curtains, multi-channel switches, panels, audio, HVAC, and dynamic effects as capability-dependent; mention them only as planned actions after Runtime accepts or as optional ideas before applying.
- For "把这个方案保存成情景", reuse the last explicit lighting/design proposal only if it is still in conversation context; otherwise ask for the target room and desired effect.
- For not-yet-installed slot designs, describe scenes as planned design artifacts until Runtime confirms import. Do not claim they can run before real controllable devices or groups exist.

## Recipe Guidance

- Rest/sleep scenes: low brightness, warm white, slow transition, no color effect by default.
- Focus/reading scenes: task target first, medium-high brightness, neutral white, background light lower than task light.
- Movie/game scenes: main light off or very low, weak background light, avoid screen reflections.
- Welcome/home scenes: entrance/path first, then living areas; brightness high enough for orientation but not harsh.
- Cleaning/safety scenes: direct and bright; transitions can be short because function matters more than ambience.
- Party scenes: color and effects require explicit user preference and Runtime capability support.

## Persistent Policy

- Never convert an implicit habit into a persistent scene without confirmation.
- Scene create or update is persistent R2 configuration and must use pending-plan confirmation. Commit only the returned `planId`; do not add extra action fields during commit.
- Scene action vocabulary may describe room/area on-off, light power, brightness, color temperature, RGB color, curtain position, multi-channel switch state, delayed execution, delayed off, and transition duration.
- Treat dynamic light effects as capability-dependent and mutually constrained by Runtime; do not add timing, transition, or restore behavior unless Runtime accepts it.
- Do not expose raw action payloads, channel property keys, scene IDs, or device IDs unless Runtime asks for a clarification or diagnostic detail.
- If a scene update would replace the full action list, ask for confirmation of the whole desired result. Do not describe a partial patch as safe unless Runtime explicitly supports it.
