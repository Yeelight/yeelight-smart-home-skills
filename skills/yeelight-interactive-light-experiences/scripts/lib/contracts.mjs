import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const catalogPath = path.join(packageRoot, "assets", "experiences.json");
export const EXPERIENCE_CATALOG = Object.freeze(JSON.parse(fs.readFileSync(catalogPath, "utf8")));
export const EXPERIENCE_IDS = new Set(EXPERIENCE_CATALOG.map((item) => item.id));
export const LOGICAL_SLOTS = Object.freeze([
  "L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9",
  "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9",
]);
export const PLAN_VERSION = 1;
export const PLAN_SOURCES = new Set(["ai", "fallback", "deterministic"]);
export const MIN_PHASE_DURATION_MS = 700;
export const MAX_PHASE_DURATION_MS = 2000;

export function catalogItem(id) {
  return EXPERIENCE_CATALOG.find((item) => item.id === id) || null;
}

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function boundedInteger(value, minimum, maximum, fallback = minimum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(parsed)));
}

export function cleanText(value, maximum = 160, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maximum);
}

export function validateExperiencePlan(plan, expectedExperienceId = undefined) {
  const errors = [];
  if (!isPlainObject(plan)) return { ok: false, errors: ["plan must be an object"] };
  const allowed = new Set(["version", "experienceId", "aiRole", "source", "summary", "phases", "explanation"]);
  for (const key of Object.keys(plan)) if (!allowed.has(key)) errors.push(`unknown field: ${key}`);
  if (plan.version !== PLAN_VERSION) errors.push("unsupported plan version");
  if (!EXPERIENCE_IDS.has(plan.experienceId)) errors.push("unknown experience");
  if (expectedExperienceId && plan.experienceId !== expectedExperienceId) errors.push("experience mismatch");
  if (typeof plan.aiRole !== "string" || plan.aiRole.length < 2 || plan.aiRole.length > 48) errors.push("invalid aiRole");
  if (!PLAN_SOURCES.has(plan.source)) errors.push("invalid source");
  if (typeof plan.summary !== "string" || !plan.summary.trim() || plan.summary.length > 180) errors.push("invalid summary");
  if (typeof plan.explanation !== "string" || !plan.explanation.trim() || plan.explanation.length > 360) errors.push("invalid explanation");
  if (!Array.isArray(plan.phases) || plan.phases.length < 1 || plan.phases.length > 8) errors.push("invalid phases");
  const seenPhases = new Set();
  for (const phase of plan.phases || []) {
    const phaseKeys = new Set(["phaseId", "label", "durationMs", "targets"]);
    if (!isPlainObject(phase)) { errors.push("phase must be object"); continue; }
    for (const key of Object.keys(phase)) if (!phaseKeys.has(key)) errors.push(`unknown phase field: ${key}`);
    if (!/^p[1-8]$/.test(phase.phaseId || "") || seenPhases.has(phase.phaseId)) errors.push("invalid phase id");
    seenPhases.add(phase.phaseId);
    if (typeof phase.label !== "string" || !phase.label.trim() || phase.label.length > 64) errors.push("invalid phase label");
    if (!Number.isInteger(phase.durationMs) || phase.durationMs < MIN_PHASE_DURATION_MS || phase.durationMs > MAX_PHASE_DURATION_MS) errors.push("invalid phase duration");
    if (!Array.isArray(phase.targets) || phase.targets.length !== LOGICAL_SLOTS.length) errors.push("phase must cover all 18 logical slots");
    const seenSlots = new Set();
    for (const target of phase.targets || []) {
      const targetKeys = new Set(["slot", "hue", "saturation", "brightness", "holdMs"]);
      if (!isPlainObject(target)) { errors.push("target must be object"); continue; }
      for (const key of Object.keys(target)) if (!targetKeys.has(key)) errors.push(`unknown target field: ${key}`);
      if (!LOGICAL_SLOTS.includes(target.slot) || seenSlots.has(target.slot)) errors.push("invalid or duplicate slot");
      seenSlots.add(target.slot);
      if (!Number.isInteger(target.hue) || target.hue < 0 || target.hue > 359) errors.push("invalid hue");
      if (!Number.isInteger(target.saturation) || target.saturation < 0 || target.saturation > 100) errors.push("invalid saturation");
      if (!Number.isInteger(target.brightness) || target.brightness < 1 || target.brightness > 85) errors.push("invalid brightness");
      if (!Number.isInteger(target.holdMs) || target.holdMs < 400 || target.holdMs > 12000) errors.push("invalid holdMs");
    }
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function publicExperienceCatalog() {
  return EXPERIENCE_CATALOG.map(({ id, title, summary, aiRole, duration, recommended, accent }) => ({ id, title, summary, aiRole, duration, recommended: Boolean(recommended), accent }));
}

export function redactedExecution(result) {
  if (!isPlainObject(result)) return { status: "error", userMessage: "No execution result." };
  const statuses = new Set(["success", "acknowledged", "partial", "blocked", "error", "unavailable"]);
  const modes = new Set(["mock-18", "proxy-4", "live-18", "live-proxy-4", "live-auto", "unknown"]);
  const status = statuses.has(result.status) ? result.status : "error";
  return {
    status,
    mode: modes.has(result.mode) ? result.mode : "unknown",
    verification: ["deterministic", "readback_verified", "write_acknowledged"].includes(result.verification) ? result.verification : "unknown",
    evidence: isPlainObject(result.evidence) ? {
      label: cleanText(result.evidence.label, 80, "unverified"),
      physicalCount: boundedInteger(result.evidence.physicalCount, 0, LOGICAL_SLOTS.length, 0),
      logicalCount: boundedInteger(result.evidence.logicalCount, 0, LOGICAL_SLOTS.length, LOGICAL_SLOTS.length),
      reduced: Boolean(result.evidence.reduced),
    } : { label: "unverified", physicalCount: 0, logicalCount: LOGICAL_SLOTS.length, reduced: false },
    physicalResults: Array.isArray(result.physicalResults) ? result.physicalResults.slice(0, LOGICAL_SLOTS.length).filter(isPlainObject).map((item) => ({
      alias: cleanText(item.alias, 24), status: cleanText(item.status, 24, "unknown"), phase: cleanText(item.phase, 24),
    })) : [],
    logicalStates: Array.isArray(result.logicalStates) ? result.logicalStates.slice(0, LOGICAL_SLOTS.length).filter(isPlainObject).map((item) => ({
      slot: cleanText(item.slot, 4), status: cleanText(item.status, 32, "unknown"), source: cleanText(item.source, 32, "unknown"),
    })) : [],
    recovery: isPlainObject(result.recovery) ? {
      needed: Boolean(result.recovery.needed), freshRead: Boolean(result.recovery.freshRead), restoreAvailable: Boolean(result.recovery.restoreAvailable),
      message: cleanText(result.recovery.message, 220),
    } : { needed: false, freshRead: false, restoreAvailable: false, message: "" },
    userMessage: cleanText(result.userMessage, 240, status === "success" ? "Light plan applied." : "Light plan could not be completed."),
  };
}
