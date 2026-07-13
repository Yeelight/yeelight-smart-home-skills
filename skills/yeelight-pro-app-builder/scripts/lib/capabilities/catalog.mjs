import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateJSONSchema } from "./json-schema.mjs";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const capabilityRoot = path.join(skillRoot, "assets/capabilities");
const allowedStatuses = new Set(["read-proven", "preview-proven", "write-proven", "read-only", "unsupported", "version-mismatch"]);

export function loadCapabilityCatalog() {
  const catalog = readJSON(path.join(capabilityRoot, "capability-catalog.json"));
  validateJSONSchema(readJSON(path.join(capabilityRoot, "catalog.schema.json")), catalog, "capabilityCatalog");
  validateCapabilityCatalog(catalog);
  return catalog;
}

export function loadCapabilityCoverage() {
  const coverage = readJSON(path.join(capabilityRoot, "coverage-matrix.json"));
  return validateJSONSchema(readJSON(path.join(capabilityRoot, "coverage.schema.json")), coverage, "capabilityCoverage");
}

export function validateCapabilityProfile(profile, { catalog, coverage } = {}) {
  validateJSONSchema(readJSON(path.join(capabilityRoot, "profile.schema.json")), profile, "capabilityProfile");
  if (!catalog) return profile;
  if (profile.catalogVersion !== catalog.catalogVersion) throw new Error(`capability profile catalog version mismatch: ${profile.catalogVersion}`);
  const entries = new Map(profile.capabilities.map((entry) => [entry.capabilityId, entry]));
  if (entries.size !== profile.capabilities.length) throw new Error("capability profile contains duplicate entries");
  const coverageRows = new Map((coverage?.rows || []).map((row) => [row.capabilityId, row]));
  for (const capability of catalog.capabilities) {
    const entry = entries.get(capability.id);
    if (!entry) throw new Error(`capability profile is missing ${capability.id}`);
    if (coverage && !coverageRows.get(capability.id)?.allowedStatuses.includes(entry.status)) throw new Error(`capability profile status is not allowed: ${capability.id}=${entry.status}`);
    const runtimeEvidence = entry.evidence.find((evidence) => evidence.type !== "intent-schema");
    if (entry.status === "read-proven" && runtimeEvidence?.type !== "runtime-read") throw new Error(`read capability lacks runtime evidence: ${capability.id}`);
    if (entry.status === "write-proven" && (!runtimeEvidence?.previewOnly || !runtimeEvidence?.previewStateUnchanged || !runtimeEvidence?.writeRestored || sameValue(runtimeEvidence.before, runtimeEvidence.after) || !sameValue(runtimeEvidence.before, runtimeEvidence.restored))) {
      throw new Error(`write capability lacks mutation proof: ${capability.id}`);
    }
    if ((entry.status === "unsupported" || entry.status === "read-only") && !entry.error) throw new Error(`degraded capability lacks diagnostic: ${capability.id}`);
  }
  for (const capabilityId of entries.keys()) if (!catalog.capabilities.some((capability) => capability.id === capabilityId)) throw new Error(`capability profile has unknown entry ${capabilityId}`);
  return profile;
}

export function validateCapabilityCatalog(catalog) {
  if (catalog?.schemaVersion !== 1 || !catalog.catalogVersion || !Array.isArray(catalog.capabilities)) throw new Error("invalid capability catalog header");
  if (!Array.isArray(catalog.statuses) || catalog.statuses.some((status) => !allowedStatuses.has(status))) throw new Error("invalid capability status vocabulary");
  const ids = new Set();
  for (const capability of catalog.capabilities) {
    if (!capability?.id || ids.has(capability.id)) throw new Error(`duplicate or missing capability id: ${capability?.id || "missing"}`);
    ids.add(capability.id);
    for (const field of ["resource", "intent", "operation", "risk", "handlerId", "probeId", "uiConsumer"]) {
      if (!capability[field]) throw new Error(`capability ${capability.id} is missing ${field}`);
    }
    if (!Array.isArray(capability.fixtureIds) || capability.fixtureIds.length === 0) throw new Error(`capability ${capability.id} has no representative fixture`);
    if (capability.operation === "write" && capability.previewRequired !== true) throw new Error(`write capability ${capability.id} must require preview`);
    if (capability.operation === "write" && capability.evidenceStrategy !== "mock-write-readback-restore") throw new Error(`write capability ${capability.id} requires mock write evidence`);
    if (capability.operation === "read" && capability.evidenceStrategy !== "read") throw new Error(`read capability ${capability.id} requires read evidence`);
  }
  return catalog;
}

export function validateCapabilityCoverage({ catalog, coverage, fixture }) {
  if (coverage?.catalogVersion !== catalog.catalogVersion) throw new Error(`capability coverage catalog version mismatch: ${coverage?.catalogVersion || "missing"}`);
  const rowIds = (coverage?.rows || []).map((row) => row.capabilityId);
  if (new Set(rowIds).size !== rowIds.length) throw new Error("capability coverage contains duplicate rows");
  const rows = new Map((coverage?.rows || []).map((row) => [row.capabilityId, row]));
  const fixtureIds = collectFixtureIds(fixture);
  const missing = [];
  for (const capability of catalog.capabilities) {
    const row = rows.get(capability.id);
    const absentFixtures = capability.fixtureIds.filter((id) => !fixtureIds.has(String(id)));
    const mappingMismatch = row && (
      !sameValues(row.fixtureIds, capability.fixtureIds)
      || !sameValues(row.apiHandlerIds, [capability.handlerId])
      || !sameValues(row.probeIds, [capability.probeId])
      || row.uiConsumer !== capability.uiConsumer
      || !row.allowedStatuses.includes(capability.operation === "read" ? "read-proven" : "write-proven")
    );
    if (!row || !Array.isArray(row.testIds) || row.testIds.length === 0 || absentFixtures.length > 0 || mappingMismatch) {
      missing.push({ capabilityId: capability.id, missingRow: !row, missingTests: !row?.testIds?.length, absentFixtures, mappingMismatch: Boolean(mappingMismatch) });
    }
  }
  const extraRows = [...rows.keys()].filter((id) => !catalog.capabilities.some((capability) => capability.id === id));
  return { total: catalog.capabilities.length, covered: catalog.capabilities.length - missing.length, coveragePercent: catalog.capabilities.length === 0 ? 100 : Math.round(((catalog.capabilities.length - missing.length) / catalog.capabilities.length) * 10000) / 100, missing, extraRows };
}

function sameValues(left, right) {
  return JSON.stringify([...(left || [])].sort()) === JSON.stringify([...(right || [])].sort());
}

function sameValue(left, right) {
  return JSON.stringify(sortValue(left)) === JSON.stringify(sortValue(right));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

function collectFixtureIds(fixture) {
  return new Set([fixture.home, ...(fixture.areas || []), ...(fixture.rooms || []), ...(fixture.devices || []), ...(fixture.groups || []), ...(fixture.scenes || []), ...(fixture.automations || [])].map((item) => String(item?.id || "")).filter(Boolean));
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
