# Lighting Design

Use this reference for full-room lighting plans, lighting moods, and design suggestions.

## Intent Routing

- Use `lighting.design.plan` when the user asks for a design, layout, ambience, or multi-room lighting plan.
- Use `lighting.experience.apply` only for temporary ambience or experience changes that Runtime can validate.
- Use `lighting.design.apply` only when the user asks to apply a design to real device lighting state. Runtime can apply verified device-level power (`p`), brightness (`l`), color temperature (`ct`), and RGB color (`c`) changes according to each device capability.
- Use `device.slot.create` when the user asks to add, reserve, prebuild, or create device slots for not-yet-installed lights in an existing home.
- Use `lighting.design.import` when the user asks to import or materialize a full-home lighting design topology: rooms, device slots, optional same-type groups, scenes, and automations. It is a Runtime semantic write and can be incremental or overwrite-style.
- Use `scene.create` only when the user explicitly wants to save a reusable scene from a design. Use `automation.create` only when the user wants a persistent trigger or schedule.
- Use `memory.remember` when the user explicitly says a lighting preference should apply later, such as "以后卧室默认暖一点" or "别再给我推荐彩光".

## Planning Model

- Translate subjective wording into: activity, time context, room role, desired stimulation level, explicit dislikes, target scope, and whether the change is temporary or persistent.
- Prefer a concrete but conservative proposal: target spaces, brightness range, color-temperature range, transition, and fallback when a capability is missing.
- If home topology is available, tailor the plan to actual rooms and device families. If topology is unavailable, state assumptions and keep the result as a proposal.
- If the user says the devices are not installed yet but wants design landing, create design slots rather than blocking. A design slot is a cloud metadata placeholder for planning and later installation, not a paired online device.
- For multi-step rituals, describe phases such as preparation, main ambience, transition, and exit. Do not pretend the phases were saved unless Runtime confirms a scene or automation write.

## Full-Home Design Workflow

Use this order for requests like "帮我创建和设计一个家庭":

1. Normalize the user's wording into home name, rooms/areas, device slot families, grouping requests, scenes, automations, and explicit product constraints.
2. Create or select the home when the user asked for a new or specific home. Then use that home as the target for all following Runtime requests.
3. For each distinct not-yet-installed product family, run `scripts/product-select.mjs`, choose an explicit product candidate, and attach the chosen product identity to each slot.
4. Import the topology with `lighting.design.import`: rooms, device slots, same-type groups, scene design metadata, and automation design metadata.
5. Call the semantic Runtime intent directly after user confirmation. After Runtime success, describe which rooms, slots, groups, scenes, and automations were actually created or verified.

Do not stop at a static design document when the user asks to "添加槽位", "先预留", "导入设计", "覆盖这个家庭设计", or "帮我完善整个家庭". These are Runtime-write requests.

## Natural Language Normalization

- Preserve user order and room attribution. A compact utterance such as "客厅一个吸顶灯, 2 个黑色格栅灯" means two slot families under the living room.
- Later corrections override earlier statements for the same target. Keep only the final, coherent plan in the SkillRequest.
- Merge repeated same-room requirements before import. Example: multiple "主卧射灯" mentions should become one room with multiple item families, not several separate requests.
- Keep all product constraints visible: series, color, installation style, opening, size, head count, beam angle, wattage, shape, model words, version words, and product nickname.
- Normalize obvious spoken variants only for understanding: "爱思/艾斯" means S-series candidate language; "三十六度射灯" means `36°射灯`; "槽位/占位设备" means design slot.
- Do not auto-create real paired sensors or devices to satisfy an automation. If a sensor is not installed, include it as a design-slot/recommendation only when the user asked for design planning; real automation triggering still requires Runtime evidence.

## Product Selection For Design Slots

- For new-home, whole-home, or not-yet-installed slot design, do not let Runtime blindly choose a product from a fuzzy word. First run `node scripts/product-select.mjs --query "<slot wording>" --room "<room>" --goal "<design goal>" --limit 8` for each distinct slot family, then choose the final product using the user's wording and lighting-design judgment.
- Treat `assets/catalog/lighting-design-products.json` as a release-safe candidate catalog for design selection. It is product evidence for slot planning, not evidence that a device is installed or controllable.
- Use the script output as candidate evidence, not as an automatic winner:
  - `requestedSignals` is the user's explicit constraints extracted from the wording.
  - `constraintReview.matched` and `constraintReview.missing` show whether color, installation style, beam angle, opening, size, head count, shape, series, and category really match.
  - `designAttributes`, `designRoles`, `designKeywords`, and `capabilityTags` are the main fields for AI judgment.
  - `score` is a recall ranking signal only. A lower-ranked candidate can be better if it satisfies room role, optical intent, install style, color, series, opening, wattage, or glare-control needs more cleanly.
- Choose products organically from the design:
  - Living room: combine ambient ceiling light with accent layers. For black grille wording, prefer black embedded grille candidates unless the user asks for surface-mounted or magnetic-track fixtures.
  - Bedroom: prioritize glare control, warm/low-stimulation defaults, and focused 24°/36° accent beams only where needed. For multiple 36° spots, choose opening/wattage based on scale; if unspecified, state the assumption.
  - Bathroom: prioritize comfort, clarity, and installer review. For `夙夜版青空灯`, prefer the Nightingale/夙夜 candidate when present.
  - Optical intent: `36°` is a focused accent beam; broad ambient wording favors ceiling lights, downlights, light strips, or wide-beam products.
  - Installation words: preserve `嵌入式`, `明装`, `磁吸`, `吸顶`, opening size, head count, shape, and color when the user states them.
  - Series words: map `爱思系列` to `S系列` candidates but keep the user's original wording in notes.
  - Version or marketing words: treat `designKeywords` such as `夙夜`, `Pro`, or `电竞` as product-version evidence, not installed-device evidence.
  - Capability needs: prefer products whose `capabilityTags` include `brightness`, `colorTemperature`, `color`, `openPercent`, or `sensorEvents` when the scene or automation needs them.
  - Ambiguity: when several candidates are plausible and the user did not give enough constraints, choose a reasonable default only if the task requires a concrete design, and state the assumption. Otherwise ask one small question.
- After selecting a product, pass explicit identity into the slot item: `materialCode`, `pid`, `pcId`, `productName`, `productSku`, `productSpu`, `category`, `series`, and a short `notes` value explaining the design assumption. Runtime will preserve these fields and use them as explicit product identity.
- If the user asks for official manuals, FAQ, model status, sale status, HomeKit support, or marketing product facts, use `product.pedia.search` in addition to the design catalog. The design catalog is for candidate selection, not complete product documentation.

## Design Slot Semantics

- A design slot is allowed for future installation planning. It may carry product identity, quantity, room, grouping intent, notes, and installer-facing assumptions.
- A design slot is not a paired device. Do not claim online state, real-time controllability, firmware capability, serial number, MAC address, or current brightness from a slot.
- Same-type groups may be created for slot families when the user asks for automatic grouping and the room has two or more compatible slots. Keep group names readable, such as `客厅格栅灯组`.
- Scenes and automations inside `lighting.design.import` are design metadata or Runtime-supported imported artifacts. Do not claim a scene can execute before real controllable devices or groups exist.
- If the user asks to overwrite a home design, pass overwrite/clear intent only through `lighting.design.import` after explicit chat confirmation.

## Room-Level Design Heuristics

- Living room: base ambient light plus accent layers. Use ceiling light for base, grille/spotlight for wall or object accents, and keep movie scenes low-glare.
- Bedroom: reduce glare and stimulation. Use warm defaults, slow transitions, focused spotlights only for wardrobe/wall/task needs, and avoid high cold-white nighttime scenes.
- Secondary bedroom/study: choose downlights or task-oriented fixtures; favor neutral color temperature for work and warmer scenes for rest.
- Bathroom: prioritize clarity, comfort, and installer review. Skylight/青空灯 products are atmosphere candidates, not moisture safety certification.
- Corridor/entrance: path lighting should be low to medium brightness with motion/time-window logic when sensors exist.
- Dining/table area: prioritize face and food rendering with warm-neutral light; avoid direct glare and overly colorful defaults.

## Objective Guardrails

- Treat old habits and inferred preferences as suggestions, not authority to create persistent configuration.
- If needed devices or capabilities are missing, ask Runtime for clarification or return the blocked result.
- The user-facing answer should describe the proposed result, not internal rules.
- Use real home topology returned by Runtime when available. If the user asks for a design without topology, make assumptions explicit and keep output as a plan.
- Do not claim a slot is paired, online, controllable, or physically installed. Slots can be planned and imported; real-time control still needs real device onboarding and Runtime evidence.
- Do not create physical sensors to satisfy a design idea. Rooms, groups, scenes, and automations may be part of `lighting.design.import` only when the user asked to materialize the design and Runtime validates and executes the semantic request directly.
- Do not describe `lighting.design.apply` as creating scenes, automations, groups, rooms, or areas. If a design requires persistent scene, automation, group, room, or area changes, split the answer into a proposal and the corresponding Runtime confirmation path only when that specific intent is supported.
- Product names, series names, and marketing features are design hints only. Installed-device capability evidence still comes from Runtime.
- Never hide a persistent side effect inside a "design". Saved scenes, recurring schedules, favorites, groups, room moves, and member/device changes must use their own semantic write intents.
- `clearAll`, `overwrite`, or "覆盖这个家庭设计" is high-impact. Route it to `lighting.design.import` and rely on Runtime caller-side confirmation; do not downplay the risk.

## Slot Import Shape

- Preserve room names and slot words from the user: `rooms[].name`, `rooms[].items[].name`, `quantity`, `category`, `color`, `installStyle`, `beamAngle`, `series`, product wording, and notes.
- When a product candidate was selected, include explicit product fields in the slot item instead of only a fuzzy name. Keep the original fuzzy phrase in `notes` or `description` when useful for later installer review.
- For "同类型自动成组", pass `autoGroup=true` or omit it because Runtime defaults to grouping same room and same type when there are two or more slots.
- For "客厅离家/回家模式" inside a full-home import, include scene names as design metadata only if the user asked to materialize them. For separate saved-scene work, route to `scene.create`.
- For "每天 9 点亮起来" inside a full-home import, include automation design metadata only if the user asked to materialize the design. If Runtime cannot validate the automation fields, ask for the smallest missing detail or keep it as a proposal.
- If the user asks "新建一个家庭并导入设计", create/select the home first, then import the design into that home. Do not answer that slots cannot be created just because devices are not installed.

## Example Import Skeleton

For a request like "客厅一个吸顶灯、2 个黑色格栅灯、2 个白色嵌入式射灯；相同类型自动成组":

```json
{
  "intent": "lighting.design.import",
  "parameters": {
    "houseId": "runtime-or-user-selected-home",
    "autoGroup": true,
    "rooms": [
      {
        "name": "客厅",
        "items": [
          {"name": "吸顶灯", "quantity": 1, "materialCode": "chosen-code", "pid": 0, "pcId": 0, "notes": "AI selected explicit ambient ceiling candidate"},
          {"name": "黑色格栅灯", "quantity": 2, "category": "格栅灯", "color": "黑色", "materialCode": "chosen-code", "notes": "AI selected black grille accent candidate"},
          {"name": "白色嵌入式射灯", "quantity": 2, "category": "射灯", "color": "白色", "installStyle": "嵌入式", "materialCode": "chosen-code", "notes": "AI selected white embedded spot candidate"}
        ]
      }
    ]
  }
}
```

Use real values from `product-select.mjs` for `materialCode`, `pid`, `pcId`, and product fields. The skeleton is shape guidance, not a default payload.

## Subjective Mapping

- "有点累", "想舒服点", "放松一下": lower stimulation, warm color temperature, slow transition, usually temporary.
- "太刺眼", "头疼", "不舒服": immediately reduce brightness, avoid color/dynamic effects, prefer warm white and slow changes.
- "看书", "工作", "写作业": task light first, medium-high brightness, neutral white, avoid whole-room over-brightening.
- "看电影", "游戏": reduce main light, keep low background or bias light, avoid reflections.
- "起夜", "不想吵醒人": very low warm path light, short duration, no cold light.
- "派对", "嗨一点": color or dynamic effect only if the user allows it and Runtime validates support.

## Response Shape

- For a design proposal: give a short room-by-room or phase-by-phase proposal plus what Runtime still needs to verify.
- For an apply request: send the Runtime intent, then report only the returned result.
- For ambiguous requests: ask one smallest question, usually target room, temporary vs saved, or whether color effects are allowed.
