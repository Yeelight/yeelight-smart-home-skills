import { CinemaError } from "./contracts.mjs";
import { VALIDATION_MAX_BRIGHTNESS, VALIDATION_READBACK_DELAYS_MS, VALIDATION_TARGET_COUNT } from "./validation-constants.mjs";

export function snapshotTarget(target) {
  return {
    handle: target.handle,
    runtimeId: target.runtimeId,
    name: target.name,
    room: target.room,
    online: true,
    isLight: true,
    capabilities: { ...target.capabilities, power: true, brightness: true },
    preState: { ...target.preState },
    preStateVerified: true,
    preStateComplete: true,
  };
}

export function trustedState(state) {
  return Boolean(state && state.verified === true && state.online === true && state.simulated !== true && typeof state.power === "boolean");
}

export function propertiesMatch(state, expected) {
  return trustedState(state) && Object.entries(expected || {}).every(([property, value]) => state[property] === value);
}

export async function queryOne(app, target, signal, options = {}) {
  try {
    const rows = await app.runtime.queryState([target], signal, options);
    return rows.find((row) => row.runtimeId === target.runtimeId) || null;
  } catch {
    return null;
  }
}

export async function queryUntilPropertiesMatch(app, target, expected, signal, delays = VALIDATION_READBACK_DELAYS_MS) {
  const retryDelays = Array.isArray(delays) ? delays.slice(0, VALIDATION_READBACK_DELAYS_MS.length) : VALIDATION_READBACK_DELAYS_MS;
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    if (signal?.aborted) return null;
    const observed = await queryOne(app, target, signal, { retrySafeError: false });
    if (signal?.aborted) return null;
    if (trustedState(observed) && propertiesMatch(observed, expected)) return observed;
    if (attempt === retryDelays.length || !await waitForReadback(retryDelays[attempt], signal)) return null;
  }
  return null;
}

function waitForReadback(delayMs, signal) {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      resolve(value);
    };
    const abort = () => finish(false);
    const timer = setTimeout(() => finish(true), delayMs);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export function validateTargets(targets) {
  if (!Array.isArray(targets) || targets.length !== VALIDATION_TARGET_COUNT) throw preflightError();
  if (new Set(targets.map((target) => target?.runtimeId)).size !== VALIDATION_TARGET_COUNT) throw preflightError();
  if (targets.some((target) => !target || !target.online || target.isLight !== true || target.preStateComplete !== true)) throw preflightError();
  return targets;
}

export function expectedState(target, set) {
  return { ...target.preState, ...set };
}

export function sameState(state, expected) {
  return Boolean(state && state.verified === true && state.online === true && state.simulated !== true && Object.entries(expected).every(([property, value]) => state[property] === value));
}

export function isKnownValidationState(state, target, options = {}) {
  if (!state || state.verified !== true || state.online !== true || state.simulated === true) return false;
  const preState = target.preState || {};
  const known = [
    preState,
    expectedState(target, { power: true, brightness: VALIDATION_MAX_BRIGHTNESS }),
    expectedState(target, { power: false, brightness: 1 }),
    expectedState(target, { power: true, brightness: preState.brightness }),
    expectedState(target, { power: false, brightness: VALIDATION_MAX_BRIGHTNESS }),
    expectedState(target, { power: preState.power, brightness: 1 }),
    expectedState(target, { power: preState.power, brightness: VALIDATION_MAX_BRIGHTNESS }),
  ];
  if (preState.power === true || options.allowPowerOnAtFadeOff === true) known.push(expectedState(target, { power: true, brightness: 1 }));
  // A restore can finish the brightness property before the final power
  // property. This is a bounded, journaled intermediate state for lights
  // that were originally on; it is safe to retry the remaining power write.
  if (preState.power === true) known.push(expectedState(target, { power: false, brightness: preState.brightness }));
  return known.some((expected) => sameState(state, expected));
}

export function publicState(state) {
  if (!state) return null;
  return { verified: state.verified === true, online: state.online === true ? true : state.online === false ? false : null, power: state.power === true ? true : state.power === false ? false : null, brightness: bounded(state.brightness, 1, 100) ? state.brightness : null, color: bounded(state.color, 0, 0xFFFFFF) ? state.color : null, colorTemperature: bounded(state.colorTemperature, 1700, 6500) ? state.colorTemperature : null, simulated: state.simulated === true };
}

export function deadline(clock, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(timer), expiresAt: clock() + timeoutMs };
}

export function bounded(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function preflightError() {
  return new CinemaError("target_preflight_failed", "A selected light is no longer verified and writable.", 409);
}

export async function mapWithConcurrency(items, limit, worker) {
  let next = 0;
  let failure = null;
  const consume = async () => {
    while (!failure) {
      const index = next++;
      if (index >= items.length) return;
      try { await worker(items[index], index); } catch (error) { failure ||= error; return; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume));
  if (failure) throw failure;
}

export const __testing = { expectedState, sameState, isKnownValidationState, validateTargets, deadline, queryUntilPropertiesMatch };
