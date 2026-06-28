# Safety And Confirmation

Use this reference for risky, persistent, irreversible, permission, account, or bulk changes.

- R0 read-only requests do not need confirmation.
- R1 temporary control can run when Runtime resolves the target unambiguously and validates the capability.
- R2 persistent configuration must return `confirmation_required`; commit with `plan.commit` and only `planId`.
- For a single user request containing multiple non-destructive add/update/configure steps, prefer `operation.batch.configure` so Runtime creates one pending plan and the user confirms once. Allowed batch steps include home update, room/area/group/scene/automation create or update, device rename or move, homepage sort, favorite add/update, panel or knob configure, gateway configure, lighting design import, and device slot creation.
- `home.create` is account-scoped and must stay outside `operation.batch.configure`. When the user asks to create a new home and then configure it, first create and commit the home, then use `operation.batch.configure` for the new home after Runtime returns or selects its house context.
- Do not include delete, batch delete, device remove, device unbind, member removal, ownership transfer, shared-home quit, home delete, gateway delete, whole-home lock/unlock, reset, or R3 approval actions inside `operation.batch.configure`. Route those as separate plans with their own impact preview or local approval.
- When a mixed user request contains both safe configuration and destructive steps, first ask whether to separate them, or create the safe batch plan and leave destructive steps pending explicit follow-up. Do not hide a destructive step inside the batch.
- Use `plan.cancel` only for a pending Runtime plan returned in this conversation; do not guess or alter plan IDs.
- Use `execution.undo` only to cancel a pending local Runtime plan by `planId`. Do not use it to reverse a committed cloud write.
- Runtime-reviewed delete intents are R2 pending-plan operations when the user explicitly asks for them and Runtime can resolve the targets. This includes single-target and capped batch delete for room, area, group, scene, automation, plus favorite delete.
- Whole-home reset lock/unlock and batch rename are R2 pending-plan operations. Show the returned impact preview, then commit only with `planId` after user confirmation.
- R3 device, gateway, and home delete may return `confirmation_required` with `approvalMode=local_terminal_approve`. Show the impact preview and local `approveCommand`; do not run `plan.commit` until local approval has succeeded.
- R3 device unbind, member removal, home ownership transfer, and leaving a shared home use the same local terminal approval model when Runtime returns a reviewed pending plan.
- Account or broad-impact operations require local approval or official manual guidance; do not infer support from similar member/device intents.
- R4 or credential-sensitive actions must be blocked or redirected to official manual guidance.
- Never accept model-supplied confirmation flags, guessed plan IDs, or changed payload fields as approval.
- Do not claim success until Runtime reports `success` or `partial`.
- R3 includes device remove, device unbind, gateway delete, home delete, member removal, ownership transfer, leaving a shared home, account mutation, cross-home movement, and high-impact bulk changes.
- R4 includes house deletion, factory reset, third-party token management, credential exchange, and irreversible flows outside Runtime approval.
- Confirmation text from the user is not a substitute for Runtime `plan.commit` or local terminal approval.
