#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyRuntimeCandidate } from "./lib/runtime-matrix.mjs";
import { evaluateRuntimeCompatibility, loadRuntimeCompatibility } from "./lib/runtime-compatibility.mjs";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const candidates = parseCandidates(process.argv.slice(2));
const evidenceDir = path.resolve(readOption(process.argv.slice(2), "evidence-dir") || path.join(process.cwd(), "runtime-compatibility-evidence"));
if (candidates.length === 0) {
  console.error("Usage: node scripts/validate-runtime-compatibility.mjs --candidate <label>=<binary> [--candidate ...] --evidence-dir <dir>");
  process.exit(2);
}

fs.mkdirSync(evidenceDir, { recursive: true });
const declaration = loadRuntimeCompatibility();
const results = candidates.map(runCandidate);
const summary = {
  schemaVersion: 1,
  status: results.every((item) => item.matchesDeclaration) ? "passed" : "failed",
  generatedAt: new Date().toISOString(),
  declaration,
  candidates: results,
};
fs.writeFileSync(path.join(evidenceDir, "runtime-compatibility-matrix.json"), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (summary.status !== "passed") process.exitCode = 1;

function runCandidate(candidate) {
  const candidateDir = path.join(evidenceDir, safeName(candidate.label));
  fs.mkdirSync(candidateDir, { recursive: true });
  const versionCommand = run(candidate.binary, ["version", "--json"]);
  const versionPayload = parseJson(versionCommand.stdout);
  const version = String(versionPayload?.version || "unknown");
  const contractCommand = run(candidate.binary, ["intent", "schema", "--intent", "home.list", "--json"]);
  const contractPayload = parseJson(contractCommand.stdout);
  const contractVersion = contractPayload?.properties?.contractVersion?.const;
  const checks = [
    check("runtime-contract", contractCommand.status === 0 && contractVersion === declaration.contractVersion, contractCommand),
    runNodeCheck("shortcut-contract", ["--test", path.join(scriptRoot, "tests/mock-home-cli.test.mjs")], candidate, candidateDir),
    runNodeCheck("builder-node-suite", ["--test", ...testFiles()], candidate, candidateDir),
    runNodeCheck("reference-home", [path.join(scriptRoot, "validate-reference-home.mjs"), "--runtime-bin", candidate.binary, "--extended-writes", "--evidence-dir", path.join(candidateDir, "reference-home")], candidate, candidateDir),
  ];
  const classification = classifyRuntimeCandidate({ version, checks });
  const declared = evaluateRuntimeCompatibility(version);
  const matchesDeclaration = declared.supported ? classification.status === "supported" : classification.status === "unsupported";
  return {
    label: candidate.label,
    binary: candidate.binary,
    version,
    source: candidate.source,
    commit: String(versionPayload?.commit || "unknown"),
    contractVersion: contractVersion || "unknown",
    declaredCompatibility: declared,
    observedStatus: classification.status,
    reasonId: classification.reasonId,
    matchesDeclaration,
    checks,
  };
}

function runNodeCheck(id, args, candidate, candidateDir) {
  const result = spawnSync(process.execPath, args, {
    cwd: scriptRoot,
    encoding: "utf8",
    timeout: 900000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, YEELIGHT_HOME_BIN: candidate.binary },
  });
  fs.writeFileSync(path.join(candidateDir, `${id}.stdout.log`), result.stdout || "");
  fs.writeFileSync(path.join(candidateDir, `${id}.stderr.log`), result.stderr || "");
  return check(id, result.status === 0, result);
}

function check(id, passed, result) {
  return { id, status: passed ? "passed" : "failed", exitCode: result.status ?? 1, signal: result.signal || null };
}

function run(binary, args) {
  return spawnSync(binary, args, { encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
}

function testFiles() {
  return fs.readdirSync(path.join(scriptRoot, "tests")).filter((name) => name.endsWith(".test.mjs")).sort().map((name) => path.join(scriptRoot, "tests", name));
}

function parseCandidates(argv) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--candidate") continue;
    const raw = String(argv[index + 1] || "");
    const separator = raw.indexOf("=");
    if (separator < 1) throw new Error(`invalid --candidate: ${raw}`);
    const label = raw.slice(0, separator);
    const binary = path.resolve(raw.slice(separator + 1));
    values.push({ label, binary, source: label });
    index += 1;
  }
  return values;
}

function readOption(argv, name) {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

function parseJson(value) {
  try { return JSON.parse(String(value || "")); } catch { return undefined; }
}

function safeName(value) {
  return String(value).replace(/[^0-9A-Za-z._-]+/g, "-");
}
