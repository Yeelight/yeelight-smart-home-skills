# Lighting Product Selection

Use this reference when a lighting design request contains future device slots or product wording such as 格栅灯, 射灯, 筒灯, 青空灯, 爱思/S 系列, beam angle, color, opening size, wattage, or premium positioning.

## Product Selection Boundary

Product choice is a Skill/AI decision, not a Runtime decision.

- Run `node scripts/product-select.mjs --query "<slot wording>" --room "<room>" --goal "<design goal>" --limit 8` for each distinct slot family.
- Use `product.pedia.search` only when official product facts, product status, model, manual, FAQ, SKU, material-code resources, or attachments are needed.
- Treat product candidates as evidence, not automatic winners. Compare user constraints and room/design role before choosing.
- Each imported design slot must carry a real `pid`; include `materialCode` and useful product fields when available.
- Never invent `pid`, `materialCode`, `componentId`, model, SKU, or product support.

## Constraint Order

1. Hard product constraints: category, install style, color, opening, size, beam angle, wattage, shape, head count, protocol, series, model, nickname, version words.
2. Room role: ambient, task, accent, decorative, path, wet-area ambience, low glare, high rendering, focused beam.
3. Future behavior: dimming, color temperature, RGB color, scene participation, automation action support.
4. Design positioning: entry/basic/value/professional/flagship/high-end only after hard facts fit.
5. Availability/status and practical installation notes.

## Room Guidance

- Living room: ambient ceiling light plus accent layers; grille/spot lights support wall/object emphasis.
- Bedroom: low glare, warm defaults, calm transitions; use focused 24°/36° beams only for accent or task needs.
- Secondary bedroom/study: neutral task-friendly lighting with warmer rest scenes.
- Bathroom: clarity and comfort; 青空灯 is ambience evidence, not moisture certification.
- Corridor/entrance: path lighting and time-window logic when real sensors exist.
- Dining/table area: warm-neutral rendering for face and food; avoid direct glare.

Series guidance: D is entry/basic, E is professional value, S is flagship/high-performance, P is exploratory high-end. Treat this as positioning guidance, not a substitute for product facts.

## Ambiguity Policy

- For ambiguous but actionable full-design requests, choose a reasonable default and record the assumption in `extraMeta.notes`.
- Ask only when the missing choice materially changes product choice, room assignment, safety, or persistent configuration.
- Keep user-stated constraints even if the chosen candidate is not the highest scoring candidate.
