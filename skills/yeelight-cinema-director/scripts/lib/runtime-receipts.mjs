function valueDomain(property, value) {
  if (property === "power") return typeof value === "boolean";
  if (property === "brightness") return Number.isInteger(value) && value >= 1 && value <= 100;
  if (property === "color") return Number.isInteger(value) && value >= 0 && value <= 0xFFFFFF;
  if (property === "colorTemperature") return Number.isInteger(value) && value >= 1700 && value <= 6500;
  return false;
}

export function isVerifiedPowerWrite(value, runtimeId, expected) {
  const result = value?.result;
  const entityId = result?.entity?.id ?? result?.entity?.entityId;
  return value?.status === "success"
    && result?.property === "power"
    && entityId !== undefined
    && String(entityId) === String(runtimeId)
    && result?.verified === true
    && result?.verifiedValue === expected;
}

export function isVerifiedDesignPowerWrite(value, runtimeId, expected) {
  return classifyDesignReceipt(value, runtimeId, { power: expected }) === "verified";
}

export function classifyDesignReceipt(value, runtimeId, expectedSet = {}) {
  const expected = Object.entries(expectedSet);
  const result = value?.result;
  const rows = Array.isArray(result?.results) ? result.results : [];
  if (!expected.length || result?.capability !== "lighting.design.apply" || result?.persistentWrites !== true || !Array.isArray(result?.createdArtifacts) || result.createdArtifacts.length !== 0 || result?.actionCount !== expected.length || rows.length !== expected.length) return "invalid";
  const expectedByProperty = new Map(expected);
  const seen = new Set();
  for (const row of rows) {
    const entity = row?.entity || {};
    const entityId = entity.id ?? entity.entityId;
    if (entity.entityType !== undefined && entity.entityType !== "device") return "invalid";
    if (entityId === undefined || String(entityId) !== String(runtimeId) || !expectedByProperty.has(row?.property) || seen.has(row.property) || row?.expectedValue !== expectedByProperty.get(row.property) || !valueDomain(row?.property, row?.verifiedValue)) return "invalid";
    seen.add(row.property);
  }
  if (seen.size !== expected.length) return "invalid";
  if (value?.status === "success" && result.verified === true && rows.every((row) => row.verified === true && row.verifiedValue === expectedByProperty.get(row.property))) return "verified";
  if (value?.status === "partial" && result.verified === false && rows.every((row) => row.verified === false && row.verifiedValue !== expectedByProperty.get(row.property))) return "bound_verification_mismatch";
  return "invalid";
}

export function classifyPropertyReceipt(value, runtimeId, property, expected) {
  const result = value?.result;
  const entity = result?.entity || {};
  const entityId = entity.id ?? entity.entityId;
  const bound = entity.entityType !== undefined && entity.entityType === "device"
    && entityId !== undefined && String(entityId) === String(runtimeId)
    && result?.property === property
    && result?.expectedValue === expected;
  if (bound && value?.status === "success" && result?.verified === true && result?.verifiedValue === expected) return "verified";
  if (bound && value?.status === "partial" && result?.verified === false && valueDomain(property, result?.verifiedValue) && result.verifiedValue !== expected) return "bound_verification_mismatch";
  return "invalid";
}

export const __testing = { isVerifiedPowerWrite, isVerifiedDesignPowerWrite, classifyDesignReceipt, classifyPropertyReceipt };
