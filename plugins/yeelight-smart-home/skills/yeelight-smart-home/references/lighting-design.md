# Lighting Design

Use this reference as the routing and workflow entry for full-home lighting design, future device slots, room ambience, scene recipes, and HouseMeta import.

## Intent Routing

- Use `lighting.design.plan` for advice-only design, layout, ambience, or ritual planning.
- Use `lighting.design.apply` only for temporary real-device state changes: power `p`, brightness `l`, color temperature `ct`, and RGB color `c`.
- Use `device.slot.create` when the user asks to add or reserve not-yet-installed lighting positions in an existing home.
- Use `lighting.design.import` when the user asks to materialize a full design topology into a new, empty, or lightly configured home. It imports HouseMeta through Runtime and can include rooms, design slots, groups, areas, scenes, and automations.
- For a configured existing home with many rooms, devices, groups, scenes, or automations, prefer dedicated semantic intents such as `room.batch_create`, `group.create`, `scene.create/update`, and `automation.create/update` unless the user explicitly asks for full-home metadata import.

## Required Subreferences

- Product selection and candidate judgment: `references/lighting-product-selection.md`.
- HouseMeta `/v1/meta/import` payload contract: `references/housemeta-import.md`.
- Nested action rows, `details`, `params`, `actions`, and machine schema lookup: `references/payload-shapes.md`.
- Scene recipe conversion: `references/scene-recipes.md`.
- Automation schedule/trigger recipes: `references/automation-recipes.md`.
- Broader lighting experience, mood translation, and compound scene flows: `references/lighting-experience.md`.
- Full multi-room import example: `assets/examples/housemeta-full-home-lighting-design.json`.

Load only the needed subreference unless the user asks for a full-home materialization. For requests like "帮我创建和设计一个家庭，客厅一个吸顶灯..." load all six subreferences above.

## Design Workflow

1. Normalize the utterance into home, areas, rooms, device slot families, quantities, product constraints, groups, scenes, automations, and corrections.
2. Create or select the target home when the user asks for a new or named home.
3. Build the design in this fixed order: room structure -> device slots -> room-local groups -> scenes -> automations. Each later layer may reference only tempIds created by earlier layers.
4. Apply `references/lighting-experience.md` before choosing ambience parameters.
5. Resolve each distinct slot family to a concrete product candidate before import. Run `node scripts/product-select.mjs --query "<slot wording>" --room "<room>" --goal "<design goal>" --limit 8`.
6. Expand quantities into explicit HouseMeta `deviceList[]` rows. Do not send `quantity`, `autoGroup`, fuzzy slots, or old natural `rooms/items/groups` payloads to Runtime.
7. Author groups in the Skill layer as explicit room-local `groupList[]` rows. Use selected product evidence to choose `componentId`.
8. Author scene and automation rows only when their target `tempId` exists in the same HouseMeta import. Use objective light parameters, not mood words.
9. Call `lighting.design.import` once. After Runtime returns success or partial, report the actual imported counts and any warnings.

Do not stop at a static design document when the user asked to "添加槽位", "预留", "导入", "落到系统里", or "完善整个家庭".

## Requirement Normalization

- Preserve room attribution and order. "客厅一个吸顶灯, 2 个黑色格栅灯" means three slot rows under the living room after quantity expansion.
- Parse apartment shorthand before slot expansion. "三室两厅一卫" implies room candidates such as 客厅, 餐厅, 主卧, 次卧, 卧室3, 卫生间 unless the user provides explicit room names.
- If a lighting slot lacks a room but surrounding wording clearly implies one, assign it to the plausible stated room and record the assumption in `extraMeta.notes`; otherwise ask one smallest question.
- Later corrections override earlier statements for the same target. Merge same-room repeated mentions before import.
- Keep user-stated constraints: series, color, install style, opening, size, wattage, beam angle, shape, head count, protocol, product nickname, and version words.
- Normalize obvious wording only for understanding: 感应器 means 传感器; 厘米 means cm; 八瓦 means 8w; 十二瓦 means 12w; 十五瓦 means 15w; 七十五开孔 means 75开孔; 艾斯/爱斯/爱思 means S 系列; 三十六度 means 36°; 120射灯 means E20射灯 as a folk product phrase; 一来 means 易来.
- Do not create real sensors, gateways, panels, or paired devices just to satisfy an automation. Missing lights may be design slots; missing triggers should be recommendations or omitted executable conditions unless product and target evidence exists.
- Do not discard user intent only because one condition/action is unsupported. Remove or downgrade only the unsupported condition, keep supported actions and design metadata when still meaningful.

## Existing Home Safety

`/v1/meta/import` can replace or reshape home metadata. It is best for new homes, empty homes, or deliberate full-design materialization.

For existing homes with substantial configuration:

- Add rooms with `room.batch_create`.
- Rename/update rooms, areas, groups, scenes, or automations with their dedicated intents.
- Create standalone groups/scenes/automations with `group.create`, `scene.create`, and `automation.create`.
- Use `lighting.design.import` only when the user explicitly wants full metadata import for that home and has confirmed the broad change in chat.

## Response Shape

- For a proposal: give concise room-by-room design and assumptions.
- For a materialization request: call Runtime, then report actual created/imported items and partial failures.
- For ambiguity: ask one smallest question only when it materially changes product choice, room assignment, or persistent configuration.
