import { CinemaError } from "./contracts.mjs";
import { classifyDesignReceipt } from "./runtime-adapter.mjs";
import { VALIDATION_READBACK_DELAYS_MS } from "./validation-constants.mjs";
import { propertiesMatch, queryOne, queryUntilPropertiesMatch, trustedState } from "./validation-helpers.mjs";

export async function applyOne(app, target, set, signal, options = {}) {
  const entries = Object.entries(set || {});
  const power = entries.find(([property]) => property === "power")?.[1];
  const designSet = Object.fromEntries(entries.filter(([property]) => property !== "power"));
  if (Object.keys(designSet).length > 0) await applyDesignStep(app, target, designSet, signal, options);
  // Design writes can wake a light; always fix the requested power state last.
  if (typeof power === "boolean") await applyPower(app, target, power, signal, designSet, options);
  return { status: "acknowledged" };
}

export async function applyDesignStep(app, target, set, signal, options = {}) {
  let result;
  const usesPropertyRuntime = typeof app.runtime.applyProperties === "function";
  try {
    result = usesPropertyRuntime
      ? await app.runtime.applyProperties(target, set, signal, options)
      : await app.runtime.applyDesign([{ handle: target.handle, runtimeId: target.runtimeId, set }], signal, options);
  } catch (error) {
    if (isBoundPropertyMismatch(error, target, set)) {
      const observed = await queryUntilPropertiesMatch(app, target, set, signal, VALIDATION_READBACK_DELAYS_MS);
      if (observed) return { status: "acknowledged", verification: "readback" };
    }
    throw error;
  }
  if (usesPropertyRuntime && result?.status === "acknowledged") return { status: "acknowledged" };
  const formalStatus = classifyDesignReceipt(result, target.runtimeId, set);
  if (formalStatus === "verified") return { status: "acknowledged" };
  if (formalStatus === "bound_verification_mismatch") {
    const observed = await queryUntilPropertiesMatch(app, target, set, signal, VALIDATION_READBACK_DELAYS_MS);
    if (observed) return { status: "acknowledged", verification: "readback" };
  } else {
    const row = result?.rows?.find((item) => item.handle === target.handle);
    const status = String(row?.status || "").toLowerCase();
    if (["acknowledged", "success", "applied", "verified", "ok"].includes(status)) return { status: "acknowledged" };
  }
  throw new CinemaError("validation_write_failed", "A validation write was not acknowledged or verified.", 502, { classification: formalStatus });
}

async function applyPower(app, target, power, signal, designSet = {}, options = {}) {
  if (typeof app.runtime.applyPower === "function") {
    try {
      const receipt = await app.runtime.applyPower(target, power, signal, options);
      if (receipt?.status !== "acknowledged") throw new CinemaError("validation_write_failed", "A power design write was not acknowledged.", 502);
      return receipt;
    } catch (error) {
      if (!isBoundPowerMismatch(error)) throw error;
      if (!Number.isInteger(designSet.brightness) || designSet.brightness < 1 || designSet.brightness > 100) throw error;
      const observed = await queryOne(app, target, signal);
      if (!trustedState(observed) || !propertiesMatch(observed, designSet)) throw error;
      if (observed.power === power) return { status: "acknowledged", verification: "readback" };
      if (typeof app.runtime.setPower !== "function") throw error;
      const fallback = await app.runtime.setPower(target, power, signal, options);
      if (fallback?.status !== "acknowledged") throw new CinemaError("validation_write_failed", "A fallback power write was not acknowledged.", 502);
      return { ...fallback, verification: "direct_power_fallback" };
    }
  }
  if (typeof app.runtime.setPower === "function") {
    const receipt = await app.runtime.setPower(target, power, signal, options);
    if (receipt?.status !== "acknowledged") throw new CinemaError("validation_write_failed", "A power write was not acknowledged.", 502);
    return receipt;
  }
  return applyDesignStep(app, target, { power }, signal, options);
}

function isBoundPowerMismatch(error) {
  return error?.code === "runtime_write_verification_mismatch"
    && error?.details?.intent === "lighting.design.apply"
    && error?.details?.property === "power"
    && error?.details?.classification === "bound_verification_mismatch";
}

function isBoundPropertyMismatch(error, target, set) {
  const details = error?.details || {};
  return error?.code === "runtime_write_verification_mismatch"
    && details.classification === "bound_verification_mismatch"
    && String(details.runtimeId) === String(target.runtimeId)
    && Object.hasOwn(set, details.property)
    && details.expectedValue === set[details.property];
}

export const __testing = { applyDesignStep };
