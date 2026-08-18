import { MAX_TARGETS, compileLightingFrame, fail, normalizeFrame } from "./contracts.mjs";

export const ROLE_NAMES = Object.freeze(["Accent", "Ambient"]);
export const MAX_WAVE_SIZE = 8;

export function createLightingPlan(targets, frame, wave = 0) {
  if (!Array.isArray(targets) || targets.length < 1) fail("targets_required", "A lighting plan needs selected targets.");
  if (targets.length > MAX_TARGETS) fail("target_limit", `A screening supports at most ${MAX_TARGETS} selected lights.`);
  const rows = compileLightingFrame(targets, normalizeFrame(frame), wave);
  const handles = new Set(targets.map((target) => target.handle));
  if (handles.size !== targets.length || rows.length !== targets.length) fail("target_plan_mismatch", "The lighting plan does not cover the frozen target set.");
  return {
    status: "preview",
    acknowledged: false,
    physicalVerified: false,
    wave,
    rows,
    coverage: coverageFor(targets, rows),
  };
}

export function chunkPlan(plan, size = MAX_WAVE_SIZE) {
  const chunkSize = Number.isInteger(size) && size > 0 && size <= MAX_WAVE_SIZE ? size : MAX_WAVE_SIZE;
  const chunks = [];
  for (let index = 0; index < plan.rows.length; index += chunkSize) {
    chunks.push(plan.rows.slice(index, index + chunkSize));
  }
  return chunks;
}

export function selectLightingWindow(plan, cursor = 0, size = MAX_WAVE_SIZE) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  if (!rows.length) return [];
  const windowSize = Number.isInteger(size) && size > 0 ? Math.min(size, rows.length) : Math.min(MAX_WAVE_SIZE, rows.length);
  const start = Number.isInteger(cursor) ? ((cursor % rows.length) + rows.length) % rows.length : 0;
  return Array.from({ length: windowSize }, (_, index) => rows[(start + index) % rows.length]);
}

export function coverageFor(targets, rows) {
  const rowByHandle = new Map(rows.map((row) => [row.handle, row]));
  return targets.map((target) => ({
    handle: target.handle,
    role: target.role,
    status: rowByHandle.has(target.handle) ? "planned" : "missing",
  }));
}

export function mergeReceipts(targets, receipts, phase = "tick") {
  const byHandle = new Map(receipts.map((receipt) => [receipt.handle, receipt]));
  const rows = targets.map((target) => {
    const receipt = byHandle.get(target.handle);
    return receipt ? { ...receipt, handle: target.handle, role: target.role } : { handle: target.handle, role: target.role, status: "missing" };
  });
  const failed = rows.filter((row) => !["acknowledged", "verified", "skipped"].includes(row.status));
  return {
    phase,
    status: failed.length ? (failed.length === rows.length ? "uncertain" : "partial") : "acknowledged",
    acknowledged: failed.length < rows.length,
    physicalVerified: rows.every((row) => row.status === "verified"),
    rows,
  };
}

export function stopPlan(targets, brightness = 1) {
  return targets.map((target) => ({
    handle: target.handle,
    role: target.role,
    set: { brightness: Math.max(1, Math.min(100, brightness)), power: true },
  }));
}

export function restorePlan(targets) {
  return targets.map((target) => {
    const preState = target.preState || {};
    const set = {};
    for (const property of ["power", "brightness", "color", "colorTemperature"]) {
      if (preState[property] !== undefined) set[property] = preState[property];
    }
    return { handle: target.handle, role: target.role, set };
  }).filter((row) => Object.keys(row.set).length > 0);
}
