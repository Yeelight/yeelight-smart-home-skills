import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateJSONSchema } from "./capabilities/json-schema.mjs";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const catalogFile = path.join(skillRoot, "assets/journeys/real-user-journeys.json");
const schemaFile = path.join(skillRoot, "assets/schemas/real-user-journey.schema.json");
const moduleRegistryFile = path.join(skillRoot, "assets/modules/registry.json");
const navigationByTarget = { desktop: "sidebar", tablet: "adaptive-rail", mobile: "bottom-tabs", wall: "touch-rail" };
const internalRequestTerms = /(?:home\.|room\.|device\.|sensor\.|scene\.|automation\.|group\.|gateway\.|panel\.|installer\.)[a-z-]+|--[a-z-]+|\bCLI\b|ProductSpec/i;
const unsafeKey = /authorization|access.?token|refresh.?token|secret|credential|password|api.?host|raw.?host|payload/i;
const unsafeValue = /\x42earer\s+|https?:\/\/(?!127\.0\.0\.1|localhost)|yeelight-home\s+invoke\s+--stdin/i;

export function loadRealUserJourneyCatalog(file = catalogFile) {
  const catalog = readJSON(file);
  validateJSONSchema(readJSON(schemaFile), catalog, "realUserJourneys");
  validateCatalogSemantics(catalog);
  return structuredClone(catalog);
}

export function buildJourneyArgs(journey, { skillRoot: root = skillRoot, runtimeBin, outputRoot, phase = "build" }) {
  if (journey.resolution.decision !== "build") throw new Error(`journey ${journey.id} is not buildable`);
  const { choices } = journey.resolution;
  const args = [
    path.join(root, "scripts/build-app.mjs"),
    "--request", journey.request,
    "--title", choices.title,
    "--modules", choices.modules.join(","),
    "--device-families", choices.deviceFamilies.join(","),
    "--form-factor", choices.formFactor,
    "--navigation", choices.navigation,
    "--density", choices.density,
    "--theme-preset", choices.theme.preset,
    "--mode", choices.theme.mode,
    "--runtime-bin", runtimeBin,
  ];
  if (choices.sceneManagement) args.push("--scene-management");
  if (choices.roomNames.length > 0) args.push("--room", choices.roomNames.join(","));
  for (const [key, flag] of [["brandColor", "--brand-color"], ["accentColor", "--accent-color"], ["typography", "--typography"], ["shape", "--shape"], ["motion", "--motion"]]) {
    if (choices.theme[key]) args.push(flag, choices.theme[key]);
  }
  if (journey.runtime.mode === "reference") args.push("--mock-home", journey.runtime.fixture);
  if (journey.runtime.mode === "live-readonly") args.push("--home-id", journey.runtime.homeId, "--region", journey.runtime.region);
  if (phase === "capability-report") args.push("--capability-report");
  else {
    args.push("--out", outputRoot);
    if (phase === "partial" && choices.allowPartial) args.push("--allow-partial");
  }
  return args;
}

export function summarizeJourneyCoverage(catalog) {
  const buildJourneys = catalog.journeys.filter((journey) => journey.resolution.decision === "build");
  return {
    modules: collect(buildJourneys, (journey) => journey.resolution.choices.modules),
    formFactors: collect(buildJourneys, (journey) => [journey.resolution.choices.formFactor]),
    navigations: collect(buildJourneys, (journey) => [journey.resolution.choices.navigation]),
    densities: collect(buildJourneys, (journey) => [journey.resolution.choices.density]),
    deviceFamilies: collect(buildJourneys, (journey) => journey.coverage.deviceFamilies),
    protocols: collect(buildJourneys, (journey) => journey.coverage.protocols),
    themeDirections: collect(buildJourneys, (journey) => journey.coverage.themeDirections),
  };
}

export function assertEvidenceSafe(value) {
  visitEvidence(value, "evidence");
  return true;
}

function validateCatalogSemantics(catalog) {
  const moduleRegistry = readJSON(moduleRegistryFile);
  const knownModules = new Set(moduleRegistry.modules.map(({ id }) => id));
  const expectedIds = Array.from({ length: catalog.journeys.length }, (_, index) => `J${String(index + 1).padStart(2, "0")}`);
  if (catalog.journeys.length !== 12 || catalog.journeys.some((journey, index) => journey.id !== expectedIds[index])) throw new Error("real-user journey ids must be J01-J12 in order");
  for (const journey of catalog.journeys) {
    const { choices } = journey.resolution;
    if (internalRequestTerms.test(journey.request)) throw new Error(`journey ${journey.id} request contains internal implementation terms`);
    if (choices.navigation !== navigationByTarget[choices.formFactor]) throw new Error(`journey ${journey.id} target/navigation mismatch`);
    for (const moduleId of [...choices.modules, ...journey.expected.generatedModules, ...journey.expected.omittedModules]) {
      if (!knownModules.has(moduleId)) throw new Error(`journey ${journey.id} references unknown module ${moduleId}`);
    }
    if (journey.resolution.decision === "build" && choices.modules.length === 0) throw new Error(`journey ${journey.id} build decision requires modules`);
    if (journey.resolution.decision === "reject" && (choices.modules.length > 0 || journey.runtime.mode !== "none")) throw new Error(`journey ${journey.id} rejected decision must not build`);
    if (journey.runtime.mode === "reference" && journey.runtime.fixture !== "reference-home") throw new Error(`journey ${journey.id} must use reference-home`);
    if (journey.runtime.mode === "live-readonly" && (!journey.runtime.homeId || !journey.runtime.region)) throw new Error(`journey ${journey.id} live scope is incomplete`);
    const expectedFinal = choices.modules.filter((moduleId) => !journey.expected.omittedModules.includes(moduleId)).sort();
    if (JSON.stringify(expectedFinal) !== JSON.stringify([...journey.expected.generatedModules].sort())) throw new Error(`journey ${journey.id} expected module projection mismatch`);
  }
}

function visitEvidence(value, location) {
  if (Array.isArray(value)) return value.forEach((item, index) => visitEvidence(item, `${location}[${index}]`));
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (unsafeKey.test(key)) throw new Error(`unsafe journey evidence key at ${location}.${key}`);
      visitEvidence(child, `${location}.${key}`);
    }
    return;
  }
  if (typeof value === "string" && unsafeValue.test(value)) throw new Error(`unsafe journey evidence value at ${location}`);
}

function collect(journeys, project) {
  return [...new Set(journeys.flatMap(project))].sort();
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
