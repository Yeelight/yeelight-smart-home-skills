# Automations

Use this reference for automation rules and schedules.

## Intent Routing

- Use `automation.create` when the user wants a new persistent rule. Runtime must return a pending plan; after confirmation, `plan.commit` re-validates, creates the automation, and verifies it through the automation list.
- When the user imports a full lighting design that includes simple scheduled design intent such as "主卧每天 9 点亮起来", route to `lighting.design.import` if it is part of the requested design topology. For a standalone automation or later edit, use `automation.create` or `automation.update`.
- Use `automation.supported.list` or `automation.supported.v2.list` when the user asks what automation conditions/actions are supported or when a future automation write needs source-backed capability evidence.
- Use `automation.list` when the user asks for all saved automations in one home or when a follow-up update/delete/toggle needs a complete home-level automation candidate list.
- Use `automation.list.page` when the user asks to browse, count, or review saved automations with pagination.
- Use `automation.detail.get` when the user asks to inspect one existing automation's conditions, schedule, actions, repeated rules, or impact before an update.
- Use `schedule_job.list` when the user asks for saved timed jobs, scheduled actions, or legacy schedule-task style rules in one home.
- Use `automation.rule.list` when the user asks for automation rule details or rule-level impact evidence.
- Use `automation.update` for changing conditions, time windows, actions, or names. It requires a complete rule payload, returns a pending plan, and must not be used as a partial patch.
- Use `automation.enable` and `automation.disable` only when the user asks to toggle an existing automation. Runtime returns a pending plan and verifies the saved automation status after commit.
- Use `automation.delete` only when the user explicitly asks to delete one automation. Runtime must return a pending plan, re-check the automation, and verify removal after commit.
- Use `automation.batch_delete` only when the user explicitly asks to delete multiple automations. Runtime caps one plan at 20 automations, resolves each target by id or unique name, and verifies every automation disappeared from `entity.list`.
- Use `automation.explain` for "why", "what does this rule do", or rule audit requests.
- Use `automation.capabilities` when the user asks what automation creation, update, toggle, diagnosis, or delete capabilities are currently available in this Runtime.

## Planning Checklist

- Every automation proposal needs trigger, target scope, action, active time window, repeat rule, and conflict assumptions.
- Split a reusable ambience from its trigger: create or reference a scene for the desired lighting effect, then use automation to run that scene.
- Prefer minimum blast radius. A room sensor should normally affect that room or a path, not the whole home.
- For safety and comfort, add time windows or illuminance checks to motion-triggered lighting when the user's wording allows it.
- Use different no-motion delays by room role: short for corridor or bathroom, longer for living room or study, and explicit confirmation for bedroom.
- Ask one smallest question if any required piece is missing: target room/device, trigger device, time window, repeat days, action, or whether to enable after creation.
- Do not silently add a sensor, scene, room, group, or device if the rule would need one. Present it as a missing dependency or recommendation candidate.
- A design slot can be created for planning future lights, but it is not a live sensor or controllable device. Keep slot-based automations as design metadata unless Runtime confirms a supported automation payload.
- For user's typo or vague wording, preserve the utterance and ask Runtime to resolve; do not manually construct event IDs or product IDs.

## Recommended Patterns

- Presence plus time window: good for corridor, entrance, bathroom, and night path light.
- Illuminance plus occupancy: avoids turning lights on when daylight is enough.
- Schedule plus gradual transition: good for wake-up, sleep preparation, and daily routines.
- Door/contact plus narrow action: good for entrance, wardrobe, storage, and safety reminders.
- Manual scene plus optional automation: first save a scene, then ask whether the user wants a recurring trigger.
- Conflict review before broad writes: for all-home, member, gateway, HVAC, or multi-room automations, prefer `automation.explain` or `automation.list` evidence before update/create.

## Anti-Patterns

- One sensor controlling the whole home without a second condition.
- A rule that immediately reverses another rule or a recent manual override.
- Fixed-time lighting that ignores daylight when illuminance sensors exist.
- Multiple overlapping automations in one room doing similar actions.
- Triggering on unsupported device categories such as curtains or HVAC unless Runtime returns support.
- Treating a product family, room name, or old prompt rule as proof that the required sensor exists.

## Execution Rules

- Missing devices, sensors, events, actions, or time details should become the smallest clarification question.
- Never invent sensors, events, actions, gateway behavior, or background execution results.
- Treat new or changed automations as persistent R2 configuration; commit only by returned `planId`. Update and toggle plans ignore model-supplied mutation fields during commit and execute only the stored local plan.
- Treat `automation.capabilities` as policy evidence, not as proof that every named automation action can be executed.
- Do not put status changes inside `automation.update`; use `automation.enable` or `automation.disable` for existing automation state.
- For safety, a newly planned automation should not be described as enabled or running unless Runtime says so. Status values are Runtime evidence, not wording to infer manually.
- Automation condition candidates include presence, motion, contact, illuminance, button, knob, time window, duration, and threshold only after Runtime validates the entity and event.
- Automation action vocabulary may include executing a scene, room/area on-off, brightness or color-temperature adjustment, light power/brightness/color-temperature/RGB, curtain position, and multi-channel switch state. Keep these as planning words; Runtime validates actual support.
- Timing words such as delayed execution, delayed off, duration, repeat window, and active time range are allowed only as parameters for Runtime planning.
- Dynamic light flow, curtain motor action, audio playback, panel action, and air-conditioning mode are product-specific; do not claim support unless Runtime returns it.
- If Runtime returns `automation_commit_disabled`, keep the proposal as a non-applied plan and explain that owner-reviewed validation is still required before real creation.
