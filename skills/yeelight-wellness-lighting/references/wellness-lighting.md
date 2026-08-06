# Wellness Lighting Principles

Wellness lighting here means visual comfort and a more natural relationship with the day. It is not medical treatment and it does not claim to measure or change a person's body or mood.

## Composition Rules

- Use hierarchy before color: preserve a readable central/task area, then shape peripheral warmth or openness.
- Use weather to adjust contrast, coverage, saturation ceiling, and transition pace, not to paint the room the literal color of the sky.
- Keep changes gradual when the goal is seasonal continuity. Use a compact stable state when a public fact is uncertain.
- Prefer a small number of coherent properties. Preserve supported device differences rather than flattening every light to one value.
- Keep the requested target scope visible. Turning a target light on or off is allowed; unrelated rooms remain untouched.

## Priority Recipes

The canonical behavior is in `assets/catalog/recipes.json`.

### Seasonal Drift (P0)

Start from an existing Skill-owned host schedule or an explicit schedule the user approves. Use the local date, timezone/DST, sunrise, sunset, twilight, and daylight trend to move times or transition lengths by small bounded increments. Do not replace the whole season with a new scene. Explain the accumulated difference, record the new host revision, and use the previous baseline for a future rollback when the host supports revisions. Missing or ambiguous baseline means clarify; never edit an unrelated task.

### Lightness for a Hot Night (P0)

Require fresh temperature or apparent-temperature context for automatic selection. Open the target space with lighter spatial distribution, moderate brightness, low saturation, less dense amber, and clear task areas. Target lights may turn on or off as part of the composition. State plainly that light does not cool the air. If heat data is stale, a manual request can preview the idea with the missing fact called out; an automatic run skips the heat-specific branch.

### Warmth Without Darkness (P0)

Require fresh cold-night context for automatic selection. Put restrained warmth at the perimeter, retain central clarity and visible depth, and keep task areas readable. Use a slower supported transition when available. Target lights may turn on or off to create hierarchy. If temperature is stale, keep a neutral clear fallback rather than making the whole home dim yellow.

## Explicit Limits

Do not infer fatigue, reading, sleep, occupancy, presence, emotion, or health from a timer, weather, calendar, or light state. Do not make claims about cooling, heating, sleep improvement, medical benefit, safety, or emergency response. When a public fact is unknown, say so and choose a fact-independent fallback or ask one precise question.
