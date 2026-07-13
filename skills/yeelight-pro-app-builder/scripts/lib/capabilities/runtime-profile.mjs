import crypto from "node:crypto";

export async function probeRuntimeProfile({ catalog, source, run, executeProbe }) {
  if (!source || typeof run !== "function" || typeof executeProbe !== "function") throw new Error("runtime profile probe requires source, runner and reference probe executor");
  const versionResult = await run(["--version"]);
  if (versionResult.code !== 0) throw new Error(`cannot read ${source} runtime version: ${versionResult.stderr || versionResult.stdout}`);
  const runtimeVersion = parseVersion(versionResult.stdout);
  const intentResults = new Map();
  for (const intent of new Set(catalog.capabilities.map((capability) => capability.intent))) {
    const result = await run(["intent", "schema", "--intent", intent, "--json"]);
    intentResults.set(intent, normalizeSchemaResult(result, intent));
  }
  const capabilities = [];
  for (const capability of catalog.capabilities) {
    const schema = intentResults.get(capability.intent);
    if (!schema.supported) {
      capabilities.push({ capabilityId: capability.id, intent: capability.intent, status: "unsupported", evidence: [schema.evidence], error: schema.error });
      continue;
    }
    try {
      const probe = await executeProbe(capability);
      capabilities.push({ capabilityId: capability.id, intent: capability.intent, status: probe.status, evidence: [schema.evidence, ...probe.evidence] });
    } catch (error) {
      capabilities.push({
        capabilityId: capability.id,
        intent: capability.intent,
        status: capability.operation === "write" ? "read-only" : "unsupported",
        evidence: [schema.evidence],
        error: String(error?.message || error).slice(0, 12000),
      });
    }
  }
  return {
    schemaVersion: 1,
    catalogVersion: catalog.catalogVersion,
    source,
    runtimeVersion,
    capabilities,
  };
}

export function diffRuntimeProfiles(left, right) {
  const leftById = new Map(left.capabilities.map((item) => [item.capabilityId, item]));
  const rightById = new Map(right.capabilities.map((item) => [item.capabilityId, item]));
  const ids = [...new Set([...leftById.keys(), ...rightById.keys()])].sort();
  const changes = [];
  for (const capabilityId of ids) {
    const before = leftById.get(capabilityId);
    const after = rightById.get(capabilityId);
    const beforeDigest = before?.evidence?.[0]?.schemaDigest || "";
    const afterDigest = after?.evidence?.[0]?.schemaDigest || "";
    if (!before || !after || before.status !== after.status || beforeDigest !== afterDigest) {
      changes.push({ capabilityId, leftStatus: before?.status || "missing", rightStatus: after?.status || "missing", status: "version-mismatch", schemaChanged: Boolean(beforeDigest && afterDigest && beforeDigest !== afterDigest) });
    }
  }
  return { schemaVersion: 1, catalogVersion: left.catalogVersion, left: { source: left.source, runtimeVersion: left.runtimeVersion }, right: { source: right.source, runtimeVersion: right.runtimeVersion }, changes };
}

export function classifyCapabilityStatus({ operation, schemaSupported, previewProven = false, writeProven = false, readOnly = false, versionMismatch = false }) {
  if (versionMismatch) return "version-mismatch";
  if (!schemaSupported) return "unsupported";
  if (readOnly) return "read-only";
  if (writeProven) return "write-proven";
  if (operation === "write" && previewProven) return "preview-proven";
  return operation === "read" ? "read-proven" : "read-only";
}

function normalizeSchemaResult(result, intent) {
  const evidenceBase = { type: "intent-schema", probeId: `intent-schema:${intent}`, command: ["intent", "schema", "--intent", intent, "--json"], exitCode: result.code };
  if (result.code !== 0) return { supported: false, evidence: evidenceBase, error: String(result.stderr || result.stdout || "unsupported intent").trim().slice(0, 500) };
  const text = String(result.stdout || "").trim();
  try {
    const schema = JSON.parse(text);
    const canonical = JSON.stringify(sortObject(schema));
    return { supported: true, evidence: { ...evidenceBase, schemaDigest: `sha256:${crypto.createHash("sha256").update(canonical).digest("hex")}` } };
  } catch {
    return { supported: false, evidence: evidenceBase, error: "intent schema output is not JSON" };
  }
}

function parseVersion(stdout) {
  const text = String(stdout || "").trim();
  return text.match(/(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)/)?.[1] || text.match(/^yeelight-home\s+(\S+)/)?.[1] || "unknown";
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}
