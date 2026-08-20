import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LOGICAL_SLOTS,
  PLAN_VERSION,
  SMART_HOME_PLAN_IDS,
  boundedInteger,
  validateExperiencePlan,
} from "./contracts.mjs";
import { EXHIBITION_MIN_BRIGHTNESS } from "./plans.mjs";

const packageRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const assetPath = path.join(packageRoot, "assets", "smart-home-scenes.json");
const rawScenes = JSON.parse(fs.readFileSync(assetPath, "utf8"));

const MOTION_PHASES = Object.freeze({ slow: 2, steady: 2, cinematic: 3, playful: 3 });
const HUE_OFFSETS = Object.freeze([-18, -8, 4, 14, 22, 10, -2, -12, -20]);
const BRIGHTNESS_OFFSETS = Object.freeze([-4, -2, 0, 2, 4, 2, 0, -2, -4]);
const PHASE_LABELS = Object.freeze({
  slow: ["Settle", "Breathe"],
  steady: ["Clear the field", "Hold focus"],
  cinematic: ["Dim the room", "Find the frame", "Stay with the story"],
  playful: ["Wake the room", "Move the color", "Open the floor"],
});

const requiredSceneKeys = new Set(["id", "title", "summary", "intent", "effect", "accent", "temperature", "brightness", "hue", "saturation", "motion"]);
if (!Array.isArray(rawScenes) || rawScenes.length !== 4) throw new Error("smart_home_scene_asset_invalid");
for (const scene of rawScenes) {
  if (!scene || typeof scene !== "object" || Array.isArray(scene) || Object.keys(scene).some((key) => !requiredSceneKeys.has(key))) throw new Error("smart_home_scene_asset_invalid");
  if (!/^[a-z]+$/.test(scene.id) || typeof scene.title !== "string" || typeof scene.summary !== "string" || typeof scene.intent !== "string" || typeof scene.effect !== "string" || !MOTION_PHASES[scene.motion]) throw new Error("smart_home_scene_asset_invalid");
  if (!Number.isInteger(scene.temperature) || scene.temperature < 1800 || scene.temperature > 6500 || !Number.isInteger(scene.brightness) || scene.brightness < 1 || scene.brightness > 85 || !Number.isInteger(scene.hue) || scene.hue < 0 || scene.hue > 359 || !Number.isInteger(scene.saturation) || scene.saturation < 0 || scene.saturation > 100) throw new Error("smart_home_scene_asset_invalid");
  if (!SMART_HOME_PLAN_IDS.has(scenePlanId(scene.id))) throw new Error("smart_home_scene_allowlist_mismatch");
}

const sceneById = new Map(rawScenes.map((scene) => [scene.id, deepFreeze({ ...scene })]));
export const SMART_HOME_SCENE_IDS = new Set(sceneById.keys());
export const SMART_HOME_SCENES = Object.freeze([...sceneById.values()]);

export function getSmartHomeScene(sceneId) {
  return sceneById.get(sceneId) || null;
}

export function publicSmartHomeScenes() {
  return SMART_HOME_SCENES.map(({ id, title, summary, intent, effect, accent, temperature, brightness, hue, saturation, motion }) => ({
    id, title, summary, intent, effect, accent, temperature, brightness, hue, saturation, motion,
  }));
}

export function scenePlanId(sceneId) {
  return `smart-home-${sceneId}`;
}

export function buildSmartHomeScenePlan(sceneId) {
  const scene = getSmartHomeScene(sceneId);
  if (!scene) throw new Error("unknown_smart_home_scene");
  const phaseCount = MOTION_PHASES[scene.motion];
  const phases = Array.from({ length: phaseCount }, (_, phaseIndex) => ({
    phaseId: `p${phaseIndex + 1}`,
    label: PHASE_LABELS[scene.motion][phaseIndex],
    durationMs: phaseDuration(scene.motion, phaseIndex),
    targets: LOGICAL_SLOTS.map((slot, slotIndex) => sceneTarget(scene, slot, slotIndex, phaseIndex)),
  }));
  const plan = {
    version: PLAN_VERSION,
    experienceId: scenePlanId(sceneId),
    aiRole: "smart-home scene",
    source: "deterministic",
    summary: scene.summary,
    explanation: `${scene.intent} ${scene.effect} The preset is expanded across all 18 installation positions locally.`,
    phases,
  };
  const checked = validateExperiencePlan(plan, plan.experienceId);
  if (!checked.ok) throw new Error(`smart home plan invalid: ${checked.errors.join(", ")}`);
  return plan;
}

function sceneTarget(scene, slot, slotIndex, phaseIndex) {
  const numericSlot = slotIndex % 9;
  const rightSide = slot.startsWith("R");
  const sideOffset = rightSide ? 12 : -12;
  const phaseOffset = scene.motion === "playful" ? phaseIndex * 86 : phaseIndex * (rightSide ? 9 : -9);
  const hueOffset = HUE_OFFSETS[numericSlot] + sideOffset + phaseOffset;
  const saturationOffset = ((numericSlot + phaseIndex) % 3) * 4 - 4;
  const brightnessOffset = BRIGHTNESS_OFFSETS[numericSlot] + (rightSide ? 2 : -2) + phaseIndex * (scene.motion === "cinematic" ? -2 : 1);
  return {
    slot,
    hue: wrapHue(scene.hue + hueOffset),
    saturation: boundedInteger(scene.saturation + saturationOffset, 0, 100, scene.saturation),
    brightness: boundedInteger(scene.brightness + brightnessOffset, EXHIBITION_MIN_BRIGHTNESS, 82, EXHIBITION_MIN_BRIGHTNESS),
    holdMs: boundedInteger(1100 + numericSlot * 55 + phaseIndex * 120, 400, 12000, 1400),
  };
}

function phaseDuration(motion, phaseIndex) {
  const base = motion === "slow" ? 1600 : motion === "steady" ? 1300 : motion === "cinematic" ? 1500 : 1050;
  return boundedInteger(base + phaseIndex * 90, 700, 2000, 1200);
}

function wrapHue(value) {
  return (value % 360 + 360) % 360;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const __testing = { phaseDuration, sceneTarget, wrapHue };
