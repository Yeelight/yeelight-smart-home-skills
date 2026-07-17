import fs from "node:fs";

import { summarizeJourneyCoverage } from "./real-user-journeys.mjs";

const buildSteps = ["build-app", "validate-app", "npm-ci", "production-build", "browser-audit"];
const liveSteps = ["capability-report", "strict-build", "partial-build", ...buildSteps.slice(1)];

export function planJourneyExecution(catalog, { includeLive = true } = {}) {
  return catalog.journeys
    .filter((journey) => includeLive || journey.runtime.mode !== "live-readonly")
    .map((journey, index) => ({
      sequence: index + 1,
      id: journey.id,
      runtimeMode: journey.runtime.mode,
      decision: journey.resolution.decision,
      steps: journey.resolution.decision === "reject"
        ? ["reject"]
        : journey.runtime.mode === "live-readonly" ? [...liveSteps] : [...buildSteps],
    }));
}

export function assertFreshDirectory(directory) {
  if (fs.existsSync(directory) && fs.readdirSync(directory).length > 0) throw new Error(`journey evidence directory must be empty: ${directory}`);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

export function sanitizeLiveCapabilityReport(report) {
  const identities = new Map();
  const identityFor = (entity = {}) => {
    const originalId = String(entity.id || "unknown");
    let identity = identities.get(originalId);
    if (!identity) {
      const family = String(entity.family || "entity").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
      const sequence = identities.size + 1;
      identity = { id: `live-${family}-${sequence}`, name: `[redacted-device-${sequence}]`, roomName: "[redacted-room]" };
      identities.set(originalId, identity);
    }
    return identity;
  };
  const modules = (report.modules || []).map((module) => ({
    moduleId: module.moduleId,
    status: module.status,
    requiredEvidence: module.requiredEvidence || [],
    provenEvidence: module.provenEvidence || [],
    reasonIds: module.reasonIds || [],
    objects: (module.objects || []).map((object) => ({ ...object, ...identityFor(object) })),
    remediation: module.remediation || [],
    message: module.message || "",
  }));
  const diagnostics = (report.diagnostics || []).map((diagnostic) => {
    const identity = identityFor(diagnostic.entity);
    const prefix = String(diagnostic.id || "diagnostic").split(":", 1)[0];
    return { ...diagnostic, id: `${prefix}:${identity.id}`, entity: { ...diagnostic.entity, ...identity } };
  });
  return {
    schemaVersion: report.schemaVersion || 1,
    kind: report.kind || "capability-report",
    status: report.status,
    cliVersion: report.cliVersion,
    runtimeSource: "live-readonly-redacted",
    requestedModules: report.requestedModules || [],
    modules,
    diagnostics,
  };
}

export function createRequirementCoverageAudit(catalog, records) {
  const byId = new Map(records.map((record) => [record.id, record]));
  const buildRecords = catalog.journeys.filter((journey) => journey.resolution.decision === "build").map((journey) => byId.get(journey.id));
  const rejectRecords = catalog.journeys.filter((journey) => journey.resolution.decision === "reject").map((journey) => byId.get(journey.id));
  const coverage = summarizeJourneyCoverage(catalog);
  const checks = [
    check("journeys:complete", catalog.journeys.every((journey) => byId.has(journey.id)) && records.length === catalog.journeys.length, { expected: catalog.journeys.length, actual: records.length }),
    check("journeys:passed", records.every((record) => record.status === "passed"), records.filter((record) => record.status !== "passed").map(({ id }) => id)),
    check("build:fresh-generation", buildRecords.every((record) => record?.freshGeneration === true), buildRecords.filter((record) => !record?.freshGeneration).map((record) => record?.id)),
    check("build:toolchain", buildRecords.every((record) => record?.validateApp === "passed" && record?.npmCi === "passed" && record?.productionBuild === "passed"), buildRecords.filter((record) => record?.validateApp !== "passed" || record?.npmCi !== "passed" || record?.productionBuild !== "passed").map((record) => record?.id)),
    check("browser:all-builds", buildRecords.every((record) => record?.browserAudit === "passed"), buildRecords.filter((record) => record?.browserAudit !== "passed").map((record) => record?.id)),
    check("reject:no-generation", rejectRecords.every((record) => record?.decision === "reject" && record?.freshGeneration === false), rejectRecords.map((record) => record?.id)),
    check("evidence:safe", records.every((record) => record.evidenceSafe === true), records.filter((record) => record.evidenceSafe !== true).map(({ id }) => id)),
    check("coverage:modules", coverage.modules.length === 14, coverage.modules),
    check("coverage:targets", coverage.formFactors.length === 4 && coverage.navigations.length === 4, { formFactors: coverage.formFactors, navigations: coverage.navigations }),
  ];
  return { schemaVersion: 1, status: checks.every(({ status }) => status === "passed") ? "passed" : "failed", coverage, checks };
}

function check(id, passed, detail) {
  return { id, status: passed ? "passed" : "failed", detail };
}
