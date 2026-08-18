import os from "node:os";
import path from "node:path";
import { loadRecoveryRecords, saveRecoveryRecords } from "./validation-store.mjs";

export const SCREENING_RECOVERY_KIND = "screening";
export const SCREENING_RECOVERY_MAX_TARGETS = 160;
export const SCREENING_RECOVERY_TTL_MS = 30 * 60 * 1000;
export const SCREENING_RECOVERY_TIMEOUT_MS = 120 * 1000;
export const SCREENING_RECOVERY_CONFIRMATION = "确认恢复电影演出灯光";
export const DEFAULT_SCREENING_RECOVERY_PATH = path.join(os.homedir(), ".yeelight", "yeelight-cinema-director", "screening-recovery.json");

const STORE_OPTIONS = Object.freeze({ kind: SCREENING_RECOVERY_KIND, maxTargets: SCREENING_RECOVERY_MAX_TARGETS, maxRecords: 8 });

export function loadScreeningRecoveryRecords(filePath, context = {}) {
  return loadRecoveryRecords(filePath, context, STORE_OPTIONS);
}

export function saveScreeningRecoveryRecords(filePath, records, context = {}) {
  return saveRecoveryRecords(filePath, records, context, STORE_OPTIONS);
}

export const __testing = { STORE_OPTIONS };
