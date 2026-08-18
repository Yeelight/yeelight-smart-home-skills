import { catalogItem, EXPERIENCE_IDS, LOGICAL_SLOTS, MAX_PHASE_DURATION_MS, MIN_PHASE_DURATION_MS, PLAN_VERSION, boundedInteger, cleanText, validateExperiencePlan } from "./contracts.mjs";

// Keep every visitor composition visible on an exhibition wall. This is a
// local policy, not a provider hint, and is intentionally applied before any
// topology aggregation or physical restore path.
export const EXHIBITION_MIN_BRIGHTNESS = 36;

// Provider q values describe the four visible quadrants. When a model repeats
// one nearly uniform color, add a subtle, deterministic spatial signature so a
// four-light proxy still reads as an installation rather than one large lamp.
const SPATIAL_HUE_UNIFORM_DISTANCE = 18;
const SPATIAL_CHANNEL_UNIFORM_SPREAD = 8;
const SPATIAL_MIN_SATURATION = 10;
const SPATIAL_HUE_OFFSETS = Object.freeze([-24, -8, 8, 24]);
const SPATIAL_SATURATION_OFFSETS = Object.freeze([-4, -1, 1, 4]);
const SPATIAL_BRIGHTNESS_OFFSETS = Object.freeze([-6, -2, 2, 6]);

const palette = {
  amber: [34, 68, 62], mint: [164, 58, 64], sky: [202, 72, 62], violet: [276, 62, 64],
  rose: [338, 68, 64], lime: [92, 65, 60], coral: [12, 76, 64], gold: [48, 78, 66],
  leaf: [132, 54, 58], blue: [222, 68, 62], cyan: [188, 76, 60], orange: [22, 76, 64],
};

export function buildDeterministicPlan(experienceId, input = {}, source = "fallback") {
  if (!EXPERIENCE_IDS.has(experienceId)) throw new Error("unknown experience");
  const item = catalogItem(experienceId);
  const seed = hash(`${experienceId}:${JSON.stringify(safeInput(input))}`);
  const [baseHue, baseSaturation, baseBrightness] = palette[item.accent] || palette.amber;
  const phases = Array.from({ length: phaseCount(experienceId) }, (_, index) => {
    const drift = (seed + index * 47) % 48 - 24;
    const phaseHue = (baseHue + drift + index * 13 + 360) % 360;
    const phaseBrightness = boundedInteger(baseBrightness + ((seed >> (index % 8)) % 12) - 6, 24, 78, 54);
    return {
      phaseId: `p${index + 1}`,
      label: phaseLabel(experienceId, index),
      durationMs: 1200 + ((seed + index * 31) % 700),
      targets: LOGICAL_SLOTS.map((slot, slotIndex) => ({
        slot,
        hue: (phaseHue + sideDrift(slot, slotIndex, index, seed) + 360) % 360,
        saturation: boundedInteger(baseSaturation + ((slotIndex + index) % 3) * 5 - 5, 20, 88, baseSaturation),
        brightness: Math.max(EXHIBITION_MIN_BRIGHTNESS, boundedInteger(phaseBrightness + (slot.startsWith("R") ? 4 : -2) + (slotIndex % 4) * 2, 18, 80, 50)),
        holdMs: 800 + ((seed + slotIndex * 17 + index * 19) % 900),
      })),
    };
  });
  const plan = {
    version: PLAN_VERSION,
    experienceId,
    aiRole: item.aiRole,
    source,
    summary: summaryFor(experienceId, input),
    explanation: explanationFor(experienceId, input),
    phases,
  };
  const checked = validateExperiencePlan(plan, experienceId);
  if (!checked.ok) throw new Error(`deterministic plan invalid: ${checked.errors.join(", ")}`);
  return plan;
}

/** Returns the strict, text-free provider response schema for one experience. */
export function compactSchemaForExperience(experienceId) {
  assertExperience(experienceId);
  const count = phaseCount(experienceId);
  return {
    type: "object",
    additionalProperties: false,
    required: ["v", "m", "p"],
    properties: {
      v: { type: "integer", enum: [PLAN_VERSION] },
      m: { type: "string", enum: ["flow"] },
      p: {
        type: "array",
        minItems: count,
        maxItems: count,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["d", "t", "q"],
          properties: {
            d: { type: "integer", minimum: MIN_PHASE_DURATION_MS, maximum: MAX_PHASE_DURATION_MS },
            t: { type: "integer", minimum: 400, maximum: 12000 },
            q: {
              type: "array",
              minItems: 4,
              maxItems: 4,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["h", "s", "b"],
                properties: {
                  h: { type: "integer", minimum: 0, maximum: 359 },
                  s: { type: "integer", minimum: 0, maximum: 100 },
                  b: { type: "integer", minimum: 1, maximum: 85 },
                },
              },
            },
          },
        },
      },
    },
  };
}

/** Compiles the closed compact provider response into a canonical ExperiencePlan. */
export function compileCompactPlan(experienceId, input = {}, compact, source = "ai") {
  assertExperience(experienceId);
  const normalized = decodeProviderLightPlan(experienceId, compact);
  const plan = buildDeterministicPlan(experienceId, input, source);
  const policy = applyProviderPlanPolicy(plan, normalized, source);
  const checked = validateExperiencePlan(policy, experienceId);
  if (!checked.ok) throw new Error(`compact plan invalid: ${checked.errors.join(", ")}`);
  return policy;
}

export function buildCompactPlanFixture(experienceId, input = {}) {
  const plan = buildDeterministicPlan(experienceId, input, "ai");
  return {
    v: PLAN_VERSION,
    m: "flow",
    p: plan.phases.map((phase) => ({
      d: phase.durationMs,
      t: phase.targets[0].holdMs,
      q: ["L1", "L6", "R1", "R6"].map((slot) => {
        const target = phase.targets.find((item) => item.slot === slot);
        return { h: target.hue, s: target.saturation, b: target.brightness };
      }),
    })),
  };
}

/** Validates the provider's four-key wire form without coercion. */
export function decodeProviderLightPlan(experienceId, compact) {
  assertExperience(experienceId);
  if (!isClosedObject(compact, ["v", "m", "p"]) || compact.v !== PLAN_VERSION || compact.m !== "flow") throw new Error("invalid compact plan");
  const count = phaseCount(experienceId);
  if (!Array.isArray(compact.p) || compact.p.length !== count) throw new Error("invalid compact phases");
  const phases = compact.p.map((phase) => {
    if (!isClosedObject(phase, ["d", "t", "q"]) || !isIntegerInRange(phase.d, MIN_PHASE_DURATION_MS, MAX_PHASE_DURATION_MS) || !isIntegerInRange(phase.t, 400, 12000) || !Array.isArray(phase.q) || phase.q.length !== 4) {
      throw new Error("invalid compact phase");
    }
    const colors = phase.q.map((color) => {
      if (!isClosedObject(color, ["h", "s", "b"]) || !isIntegerInRange(color.h, 0, 359) || !isIntegerInRange(color.s, 0, 100) || !isIntegerInRange(color.b, 1, 85)) throw new Error("invalid compact color");
      return { h: color.h, s: color.s, b: color.b };
    });
    return { d: phase.d, t: phase.t, q: colors };
  });
  return { m: "flow", p: phases };
}

/** Applies fixed local phase policy while preserving canonical plan invariants. */
export function applyProviderPlanPolicy(plan, compact, source = "ai") {
  if (!plan || typeof plan !== "object" || !["ai", "fallback", "deterministic"].includes(source)) throw new Error("invalid plan policy");
  const decoded = decodeProviderLightPlan(plan.experienceId, { v: PLAN_VERSION, ...compact });
  return {
    ...plan,
    source,
    phases: policyPhases(plan, decoded),
  };
}

function policyPhases(plan, decoded) {
  return plan.phases.map((phase, index) => {
    const decodedPhase = decoded.p[index];
    const colors = spatiallyDiversifyQuadrants(decodedPhase.q, `${plan.experienceId}:${phase.phaseId}`);
    return {
      ...phase,
      durationMs: decodedPhase.d,
      targets: phase.targets.map((target) => {
        const numericSlot = Number(target.slot.slice(1));
        const quadrantIndex = target.slot.startsWith("L") ? (numericSlot <= 5 ? 0 : 1) : (numericSlot <= 5 ? 2 : 3);
        const color = colors[quadrantIndex];
        return { ...target, hue: color.h, saturation: color.s, brightness: Math.max(EXHIBITION_MIN_BRIGHTNESS, color.b), holdMs: decodedPhase.t };
      }),
    };
  });
}

function spatiallyDiversifyQuadrants(colors, seed) {
  if (!isNearUniformQuadrants(colors)) return colors.map((color) => ({ ...color }));
  const center = {
    hue: circularMeanHue(colors),
    saturation: Math.round(colors.reduce((sum, color) => sum + color.s, 0) / colors.length),
    brightness: Math.round(colors.reduce((sum, color) => sum + color.b, 0) / colors.length),
  };
  const rotation = hash(`${seed}:rotation`) % SPATIAL_HUE_OFFSETS.length;
  const direction = hash(`${seed}:direction`) % 2 === 0 ? 1 : -1;
  const hasBrightnessHeadroom = center.brightness >= EXHIBITION_MIN_BRIGHTNESS + 6 && center.brightness <= 85 - 6;
  const brightnessOffsets = hasBrightnessHeadroom ? SPATIAL_BRIGHTNESS_OFFSETS : [0, 0, 0, 0];
  const saturationBase = Math.max(SPATIAL_MIN_SATURATION, center.saturation);
  return colors.map((_color, index) => {
    const profileIndex = (index + rotation) % SPATIAL_HUE_OFFSETS.length;
    return {
      h: wrapHue(center.hue + direction * SPATIAL_HUE_OFFSETS[profileIndex]),
      s: boundedInteger(saturationBase + SPATIAL_SATURATION_OFFSETS[profileIndex], 0, 100, saturationBase),
      b: boundedInteger(center.brightness + brightnessOffsets[profileIndex], 1, 85, center.brightness),
    };
  });
}

function isNearUniformQuadrants(colors) {
  if (!Array.isArray(colors) || colors.length !== 4) return false;
  let hueSpread = 0;
  let saturationMinimum = 100;
  let saturationMaximum = 0;
  let brightnessMinimum = 85;
  let brightnessMaximum = 1;
  for (let left = 0; left < colors.length; left += 1) {
    saturationMinimum = Math.min(saturationMinimum, colors[left].s);
    saturationMaximum = Math.max(saturationMaximum, colors[left].s);
    brightnessMinimum = Math.min(brightnessMinimum, colors[left].b);
    brightnessMaximum = Math.max(brightnessMaximum, colors[left].b);
    for (let right = left + 1; right < colors.length; right += 1) hueSpread = Math.max(hueSpread, hueDistance(colors[left].h, colors[right].h));
  }
  return hueSpread <= SPATIAL_HUE_UNIFORM_DISTANCE
    && saturationMaximum - saturationMinimum <= SPATIAL_CHANNEL_UNIFORM_SPREAD
    && brightnessMaximum - brightnessMinimum <= SPATIAL_CHANNEL_UNIFORM_SPREAD;
}

function circularMeanHue(colors) {
  const vector = colors.reduce((sum, color) => ({
    x: sum.x + Math.cos(color.h * Math.PI / 180),
    y: sum.y + Math.sin(color.h * Math.PI / 180),
  }), { x: 0, y: 0 });
  if (Math.abs(vector.x) < 0.0001 && Math.abs(vector.y) < 0.0001) return colors[0].h;
  return wrapHue(Math.round(Math.atan2(vector.y, vector.x) * 180 / Math.PI));
}

function hueDistance(left, right) {
  const distance = Math.abs(left - right) % 360;
  return Math.min(distance, 360 - distance);
}

function wrapHue(value) {
  return (value % 360 + 360) % 360;
}

/**
 * Lowers validated canonical phases to one bounded Runtime flow. Tuple count is
 * finite, non-zero, and the final tuple is always the final canonical phase.
 */
export function compilePhasesToFlowTuples(phases, flowName = "interactive-light-flow") {
  if (!Array.isArray(phases) || phases.length < 1 || phases.length > 6 || typeof flowName !== "string" || !/^[A-Za-z0-9._:-]{1,64}$/.test(flowName)) {
    throw new Error("invalid flow phases");
  }
  const tuples = phases.map((phase) => {
    if (!phase || !Number.isInteger(phase.durationMs) || phase.durationMs < MIN_PHASE_DURATION_MS || phase.durationMs > MAX_PHASE_DURATION_MS || !Array.isArray(phase.targets) || phase.targets.length < 1) {
      throw new Error("invalid flow phase");
    }
    const color = aggregatePhaseColor(phase.targets);
    return { type: "set", duration: phase.durationMs, set: { p: true, l: color.brightness, c: hsvToRgbInteger(color.hue, color.saturation, color.brightness) } };
  });
  return { flowName, count: tuples.length, tuples, ending: { type: "stay" } };
}

function phaseCount(id) {
  if (["light-dna", "close-the-day", "memory-capsule", "light-game-arena"].includes(id)) return 4;
  if (["light-game-arena", "no-shared-prompt", "intention-garden"].includes(id)) return 3;
  if (id === "common-ground" || id === "shared-breath") return 3;
  return 2;
}

function assertExperience(experienceId) {
  if (!EXPERIENCE_IDS.has(experienceId)) throw new Error("unknown experience");
}

function isClosedObject(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isIntegerInRange(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function aggregatePhaseColor(targets) {
  const colors = targets.map((target) => {
    if (!target || !isIntegerInRange(target.hue, 0, 359) || !isIntegerInRange(target.saturation, 0, 100) || !isIntegerInRange(target.brightness, 1, 85)) throw new Error("invalid flow target");
    return target;
  });
  const radians = colors.reduce((sum, target) => ({ x: sum.x + Math.cos(target.hue * Math.PI / 180), y: sum.y + Math.sin(target.hue * Math.PI / 180) }), { x: 0, y: 0 });
  const hue = (Math.round(Math.atan2(radians.y, radians.x) * 180 / Math.PI) + 360) % 360;
  return {
    hue,
    saturation: Math.round(colors.reduce((sum, target) => sum + target.saturation, 0) / colors.length),
    brightness: Math.round(colors.reduce((sum, target) => sum + target.brightness, 0) / colors.length),
  };
}

function hsvToRgbInteger(hue, saturation, brightness) {
  const saturationRatio = saturation / 100;
  const brightnessRatio = brightness / 100;
  const chroma = brightnessRatio * saturationRatio;
  const sector = hue / 60;
  const intermediate = chroma * (1 - Math.abs(sector % 2 - 1));
  const [red, green, blue] = sector < 1 ? [chroma, intermediate, 0]
    : sector < 2 ? [intermediate, chroma, 0]
      : sector < 3 ? [0, chroma, intermediate]
        : sector < 4 ? [0, intermediate, chroma]
          : sector < 5 ? [intermediate, 0, chroma] : [chroma, 0, intermediate];
  const match = brightnessRatio - chroma;
  return (Math.round((red + match) * 255) << 16) | (Math.round((green + match) * 255) << 8) | Math.round((blue + match) * 255);
}

function phaseLabel(id, index) {
  const labels = {
    "fortune-light": ["Gather", "Reveal"],
    "light-dna": ["Warmth", "Focus", "Color", "Motion"],
    "shared-breath": ["First rhythm", "Handoff", "Convergence"],
    "sensory-translator": ["Read the scene", "Translate"],
    "close-the-day": ["Notice", "Sort", "Release", "Keep"],
    "light-game-arena": ["Flash recall", "Color memory", "Morse", "Final score"],
    luma: ["Wake", "Temper", "Glow"],
    "memory-capsule": ["Frame", "Distill", "Illuminate", "Seal"],
    "intention-garden": ["Plant", "Grow", "Garden total"],
    "common-ground": ["First voice", "Handoff", "Overlap"],
    "no-shared-prompt": ["Left bank", "State inspection", "Right bank"],
    "impossible-light": ["Contradiction", "Resolution"],
  };
  return labels[id]?.[index] || `Phase ${index + 1}`;
}

function summaryFor(id, input) {
  const choices = Array.isArray(input.choices) ? input.choices.filter((choice) => typeof choice === "string").slice(0, 4) : [];
  if (id === "fortune-light") return `${input.primary || "Fire"} is carrying the moment into a quieter ${input.secondary || "Earth"}.`;
  if (id === "shared-breath") return "Two private cadences found a comfortable shared rhythm.";
  if (id === "common-ground") return "Two private priorities found a small, workable overlap.";
  if (id === "light-game-arena") return `The three-round light game resolved with a score of ${boundedInteger(input.score, 0, 3, 0)} / 3.`;
  if (id === "intention-garden") return `The anonymous garden received one bounded ${input.category || "wonder"} seed.`;
  if (id === "no-shared-prompt") return "The second agent read the first bank's public state before composing its complement.";
  if (id === "light-dna") return `Your four-signal light signature settled at ${boundedInteger(input.ratio, 20, 80, 52)}% intensity.`;
  if (id === "sensory-translator") return `The ${input.scene || "starting scene"} became a ${input.comfort || "balanced"} translation at ${boundedInteger(input.ratio, 24, 72, 48)}% comfort.`;
  if (id === "impossible-light") return `The contradiction found a ${boundedInteger(input.ratio, 25, 75, 50)}% middle path.`;
  if (choices.length) return `Your ${choices.join(" / ")} signal became a light composition.`;
  return catalogItem(id)?.summary || "A bounded light composition is ready.";
}

function explanationFor(id, input) {
  if (id === "fortune-light") return "The result is a transparent Five Elements-inspired interpretation for exhibition use, not professional fortune telling.";
  if (id === "memory-capsule") return "Only a mood and length bucket shaped this one-time postcard. The original text is discarded before any model or light plan sees it.";
  if (id === "intention-garden") return "The garden uses a bounded category signal. It is an aggregate, not a profile of any visitor.";
  if (id === "no-shared-prompt") return "MCP carries an allowlisted state observation between agents; it does not carry the hidden brief or private visitor input.";
  if (id === "light-dna") return "Each contrast and its bounded intensity shaped the four phases of the signature.";
  if (id === "sensory-translator") return "Comfort brightness became a bounded comfort band, while motion pace became a small tempo vocabulary.";
  if (id === "impossible-light") return "The resolution bias stayed bounded and only changed the balance of the two visible constraints.";
  return `The local rule engine kept the ${catalogItem(id)?.aiRole || "composition"} bounded before the lights moved.`;
}

function sideDrift(slot, index, phase, seed) {
  const side = slot.startsWith("L") ? -1 : 1;
  return side * (8 + ((index + phase + seed) % 14));
}

function safeInput(input) {
  if (!input || typeof input !== "object") return {};
  const allowed = new Set(["primary", "secondary", "ratio", "signalBand", "choices", "comfort", "scene", "tempo", "intention", "category", "cadenceBand", "round", "roundsCompleted", "score", "left", "right", "stateObservation", "inspectState"]);
  return Object.fromEntries(Object.entries(input).filter(([key]) => allowed.has(key)).slice(0, 16).map(([key, value]) => {
    if (typeof value === "string") return [key, value.slice(0, 40)];
    if (Array.isArray(value)) return [key, value.filter((item) => typeof item === "string").slice(0, 6)];
    if (value && typeof value === "object" && key === "stateObservation") return [key, {
      brightnessBand: String(value.brightnessBand || "unknown").slice(0, 16),
      colorFamily: String(value.colorFamily || "unknown").slice(0, 16),
      onlineBand: String(value.onlineBand || "unknown").slice(0, 16),
      sampleCoverage: {
        sampledCount: boundedInteger(value.sampleCoverage?.sampledCount, 0, LOGICAL_SLOTS.length, 0),
        totalTargets: boundedInteger(value.sampleCoverage?.totalTargets, 0, LOGICAL_SLOTS.length, 0),
        scope: String(value.sampleCoverage?.scope || "state sample").slice(0, 48),
      },
    }];
    if (typeof value === "number") return [key, boundedInteger(value, 0, 100, 0)];
    return [key, Boolean(value)];
  }));
}

function hash(value) {
  let result = 2166136261;
  for (const char of String(value)) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

export const __testing = { hash, phaseCount, phaseLabel, safeInput };
