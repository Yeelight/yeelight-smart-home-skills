export const VALIDATION_CONFIRMATION = "确认执行上述 4 盏灯短时验证";
export const RECOVERY_CONFIRMATION = "确认恢复上述物理验证";
export const VALIDATION_TARGET_COUNT = 4;
export const VALIDATION_MAX_BRIGHTNESS = 10;
export const VALIDATION_GRANT_TTL_MS = 5 * 60 * 1000;
export const VALIDATION_TIMEOUT_MS = 120 * 1000;
export const VALIDATION_READBACK_DELAYS_MS = Object.freeze([250, 750]);
// EU Runtime can take several bounded calls per light during serial cleanup.
// Keep this below the ten-minute journal TTL while leaving room for four lights.
export const RECOVERY_TIMEOUT_MS = 240 * 1000;
export const RECOVERY_TTL_MS = 10 * 60 * 1000;
// Runtime state.query is a single-target read. Sixteen bounded workers keep a
// normal 18-light household to one full wave plus a small tail without turning
// Prepare into an unbounded Runtime burst.
export const PREFLIGHT_CONCURRENCY = 16;
// Cleanup writes are still bounded and journaled, but four workers avoid
// making the physical gate wait for every light in strict series.
export const CLEANUP_CONCURRENCY = 4;
