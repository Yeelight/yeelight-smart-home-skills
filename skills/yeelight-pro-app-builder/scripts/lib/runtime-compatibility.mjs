import fs from "node:fs";

const declarationUrl = new URL("../../assets/runtime/compatibility.json", import.meta.url);

export function loadRuntimeCompatibility() {
  return JSON.parse(fs.readFileSync(declarationUrl, "utf8"));
}

export function evaluateRuntimeCompatibility(version, declaration = loadRuntimeCompatibility()) {
  const normalized = String(version || "").trim().replace(/^v/, "");
  const base = { version: normalized, minimumVersion: declaration.minimumVersion };
  if (normalized === "dev") return { supported: true, ...base, reasonId: "workspace-development-build" };

  const parsed = parseVersion(normalized);
  if (!parsed) return { supported: false, ...base, reasonId: "unparseable-version" };
  if (parsed.major !== declaration.supportedMajor) return { supported: false, ...base, reasonId: "unsupported-major-version" };

  const known = declaration.knownIncompatible.find((item) => item.version === parsed.core);
  if (known) return { supported: false, ...base, reasonId: known.reasonId };
  const minimum = parseVersion(declaration.minimumVersion);
  if (compareParts(parsed, minimum) < 0) return { supported: false, ...base, reasonId: "below-minimum-version" };
  return { supported: true, ...base, reasonId: parsed.prerelease ? "supported-prerelease" : "supported" };
}

export function assertRuntimeSupported(version, declaration = loadRuntimeCompatibility()) {
  const result = evaluateRuntimeCompatibility(version, declaration);
  if (result.supported) return result;
  const error = new Error(`yeelight-home ${result.version || "unknown"} is not supported; install ${declaration.minimumVersion} or newer (${result.reasonId})`);
  error.code = "UNSUPPORTED_RUNTIME_VERSION";
  error.details = result;
  throw error;
}

export function generationRuntimeContract(contractVersion, declaration = loadRuntimeCompatibility()) {
  if (contractVersion !== declaration.contractVersion) throw new Error(`unsupported Runtime contract: ${contractVersion}`);
  return { contractVersion, minimumVersion: declaration.minimumVersion };
}

function parseVersion(value) {
  const match = String(value).match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || "",
    core: `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`,
  };
}

function compareParts(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  return 0;
}
