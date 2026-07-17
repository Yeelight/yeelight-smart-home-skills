import fs from "node:fs";
import path from "node:path";

import { assertFreshDirectory } from "./real-user-journey-runner.mjs";
import { assertEvidenceSafe } from "./real-user-journeys.mjs";

export async function executeJourney({ journey, evidenceDir, actions }) {
  assertFreshDirectory(evidenceDir);
  writeInputs(journey, evidenceDir);
  const commands = [];
  if (journey.resolution.decision === "reject") return recordRejectedJourney(journey, evidenceDir, commands);

  const retained = {};
  const completed = { validate: false, install: false, productionBuild: false };
  try {
    let buildResult;
    if (journey.runtime.mode === "live-readonly") {
      const reportResult = await actions.capabilityReport(journey);
      commands.push(commandRecord(reportResult.command));
      retained.capabilityReport = reportResult.capabilityReport;
      writeJSON(path.join(evidenceDir, "capability-report.json"), retained.capabilityReport);

      const strictResult = await actions.strictBuild(journey);
      commands.push(commandRecord(strictResult.command));
      if (strictResult.exitCode === 0 || strictResult.outputCreated) throw new Error(`${journey.id} strict build did not fail closed`);
      buildResult = await actions.partialBuild(journey);
    } else {
      buildResult = await actions.build(journey);
    }
    commands.push(commandRecord(buildResult.command));
    retained.productSpec = sanitizeProductSpec(buildResult.productSpec, journey.runtime.mode);
    retained.generationManifest = structuredClone(buildResult.generationManifest);
    assertGeneratedContract(journey, retained.productSpec, retained.generationManifest);
    writeJSON(path.join(evidenceDir, "product.spec.json"), retained.productSpec);
    writeJSON(path.join(evidenceDir, "generation-manifest.json"), retained.generationManifest);

    const validationResult = await actions.validate(journey);
    commands.push(commandRecord(validationResult.command));
    retained.validation = validationResult.validation;
    writeJSON(path.join(evidenceDir, "validation.json"), retained.validation);
    completed.validate = true;

    const installResult = await actions.install(journey);
    commands.push(commandRecord(installResult.command));
    completed.install = true;
    const productionResult = await actions.productionBuild(journey);
    commands.push(commandRecord(productionResult.command));
    completed.productionBuild = true;

    const browserResult = await actions.browserAudit(journey);
    commands.push(commandRecord(browserResult.command));
    retained.browserAudit = browserResult.browserAudit;
    writeJSON(path.join(evidenceDir, "browser-audit.json"), retained.browserAudit);
    if (retained.browserAudit.status !== "passed") throw new Error(`${journey.id} browser audit failed`);

    const record = {
      id: journey.id,
      status: "passed",
      decision: "build",
      freshGeneration: true,
      validateApp: "passed",
      npmCi: "passed",
      productionBuild: "passed",
      browserAudit: "passed",
      evidenceSafe: true,
    };
    assertEvidenceSafe({ record, commands, ...retained });
    writeJSON(path.join(evidenceDir, "command.json"), { steps: commands });
    writeJSON(path.join(evidenceDir, "journey-summary.json"), record);
    return record;
  } catch (error) {
    const record = {
      id: journey.id,
      status: "failed",
      decision: "build",
      freshGeneration: retained.productSpec !== undefined,
      validateApp: completed.validate ? "passed" : "failed",
      npmCi: completed.install ? "passed" : "not-run",
      productionBuild: completed.productionBuild ? "passed" : "not-run",
      browserAudit: retained.browserAudit?.status || "unknown",
      evidenceSafe: evidenceIsSafe({ commands, ...retained }),
      error: boundedError(error),
    };
    writeJSON(path.join(evidenceDir, "command.json"), { steps: commands });
    writeJSON(path.join(evidenceDir, "journey-summary.json"), record);
    throw Object.assign(new Error(`${journey.id} failed: ${record.error}`), { journeyRecord: record, cause: error });
  }
}

function recordRejectedJourney(journey, evidenceDir, commands) {
  const record = {
    id: journey.id,
    status: "passed",
    decision: "reject",
    freshGeneration: false,
    validateApp: "not-applicable",
    npmCi: "not-applicable",
    productionBuild: "not-applicable",
    browserAudit: "not-applicable",
    evidenceSafe: true,
    userMessage: journey.resolution.userMessage,
  };
  assertEvidenceSafe(record);
  writeJSON(path.join(evidenceDir, "command.json"), { steps: commands });
  writeJSON(path.join(evidenceDir, "journey-summary.json"), record);
  return record;
}

function writeInputs(journey, evidenceDir) {
  fs.writeFileSync(path.join(evidenceDir, "request.txt"), `${journey.request}\n`, "utf8");
  const runtime = journey.runtime.mode === "live-readonly" ? { ...journey.runtime, homeId: "[redacted-live-home]" } : journey.runtime;
  writeJSON(path.join(evidenceDir, "resolution.json"), {
    id: journey.id,
    resolution: journey.resolution,
    runtime,
    expected: journey.expected,
  });
}

function assertGeneratedContract(journey, productSpec, manifest) {
  const generated = productSpec.modules.map(({ id }) => id);
  const omitted = (manifest.omittedModules || []).map(({ moduleId }) => moduleId);
  if (!sameSet(generated, journey.expected.generatedModules)) throw new Error(`${journey.id} generated modules differ from resolution`);
  if (!sameSet(omitted, journey.expected.omittedModules)) throw new Error(`${journey.id} omitted modules differ from resolution`);
  if (!sameSet(manifest.requestedModules || generated, journey.resolution.choices.modules)) throw new Error(`${journey.id} requested modules differ from resolution`);
  if (productSpec.target.formFactor !== journey.resolution.choices.formFactor || productSpec.target.navigation !== journey.resolution.choices.navigation) {
    throw new Error(`${journey.id} generated target differs from resolution`);
  }
}

function sanitizeProductSpec(productSpec, runtimeMode) {
  const sanitized = structuredClone(productSpec);
  if (runtimeMode === "live-readonly") sanitized.scope.homeIds = ["[redacted-live-home]"];
  return sanitized;
}

function commandRecord(command = {}) {
  return { id: String(command.id || "unknown"), exitCode: Number(command.exitCode ?? 0), durationMs: Number(command.durationMs || 0) };
}

function boundedError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\x42earer\s+\S+|https?:\/\/\S+|(?:token|secret|password)\s*[=:]\s*\S+/gi, "[redacted]").slice(0, 500);
}

function evidenceIsSafe(value) {
  try { return assertEvidenceSafe(value); }
  catch { return false; }
}

function sameSet(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function writeJSON(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
