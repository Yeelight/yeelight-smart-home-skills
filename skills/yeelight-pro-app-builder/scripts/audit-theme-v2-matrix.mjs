#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { parseArgs } from "./lib/common.mjs";
import { planThemePresetProductionMatrix } from "./lib/theme-matrix-planner.mjs";
import { planThemeV2Matrix } from "./lib/theme-v2-matrix-planner.mjs";

const args = parseArgs();
const evidenceDir = path.resolve(String(args["evidence-dir"] || "theme-v2-evidence"));
const outputPath = path.resolve(String(args.out || path.join(evidenceDir, "theme-matrix.json")));
const productionPlan = planThemePresetProductionMatrix();
const first = planThemeV2Matrix();
const second = planThemeV2Matrix();
const mandatoryEvidence = productionPlan.cases.map(readMandatoryEvidence);
const rejectedCases = first.rejectedCases.map(({ id, status, error }) => ({ id, status, error }));
const report = {
  schemaVersion: 1,
  kind: "theme-v2-mandatory-and-strength-2-audit",
  generatedAt: new Date().toISOString(),
  status: "failed",
  deterministic: JSON.stringify(first) === JSON.stringify(second),
  catalogVersion: first.catalogVersion,
  dimensions: first.dimensions,
  sourceDigests: first.sourceDigests,
  fullCartesianCandidateCount: first.fullCartesianCandidateCount,
  pairwiseCaseCount: first.cases.length,
  pairwiseCoverage: first.coverage,
  pairwiseCases: first.cases,
  mandatoryEvidence,
  rejectedCases,
};
report.status = first.status === "passed" && report.deterministic
  && mandatoryEvidence.length === 24 && mandatoryEvidence.every(({ status }) => status === "passed")
  && rejectedCases.every(({ status }) => status === "rejected") ? "passed" : "failed";

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, outputPath, mandatory: mandatoryEvidence.length, candidates: report.fullCartesianCandidateCount, pairwiseCases: report.pairwiseCaseCount, coveredPairs: report.pairwiseCoverage.coveredPairCount, rejected: rejectedCases.length }, null, 2));
if (report.status !== "passed") process.exit(1);

function readMandatoryEvidence(item) {
  const summaryPath = path.join(evidenceDir, "theme-matrix", `batch-${item.batch}`, "theme-target-summary.json");
  const reviewPath = path.join(evidenceDir, "theme-matrix", `batch-${item.batch}`, "batch-review.json");
  if (!fs.existsSync(summaryPath) || !fs.existsSync(reviewPath)) return { id: item.id, preset: item.themePreset, batch: item.batch, status: "missing" };
  const summary = readJson(summaryPath);
  const review = readJson(reviewPath);
  const target = summary.targets?.find(({ id }) => id === item.id);
  const manual = review.cases?.find(({ id }) => id === item.id);
  const screenshotFiles = target?.browser?.screenshotEvidence?.files || [];
  const status = summary.status === "passed" && target?.status === "passed" && target?.browser?.checks?.length === 31
    && manual?.reviewStatus === "passed" && screenshotFiles.length === 3 ? "passed" : "failed";
  return {
    id: item.id,
    preset: item.themePreset,
    familyId: item.familyId,
    batch: item.batch,
    validationRole: item.validationRole,
    target: item.target.id,
    status,
    browserCheckCount: target?.browser?.checks?.length || 0,
    screenshots: screenshotFiles,
    manualReview: manual || null,
    evidence: {
      summary: path.relative(evidenceDir, summaryPath),
      review: path.relative(evidenceDir, reviewPath),
    },
  };
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
