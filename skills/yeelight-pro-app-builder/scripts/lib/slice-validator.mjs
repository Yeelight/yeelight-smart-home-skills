import path from "node:path";

export const sliceValidators = {
  lighting: "validate-lighting-slice.mjs",
  space: "validate-space-slice.mjs",
  curtain: "validate-curtain-slice.mjs",
  switch: "validate-switch-slice.mjs",
  climate: "validate-climate-slice.mjs",
  sensor: "validate-sensor-slice.mjs",
  scene: "validate-scene-slice.mjs",
  automation: "validate-automation-slice.mjs",
  group: "validate-group-slice.mjs",
  gateway: "validate-gateway-slice.mjs",
  panel: "validate-panel-slice.mjs",
  knob: "validate-knob-slice.mjs",
  "device-controller": "validate-device-controller-slice.mjs",
  management: "validate-management-suite.mjs",
  installer: "validate-installer-canary.mjs",
  "theme-target": "validate-theme-target-matrix.mjs",
};

export function resolveSliceSelection({ name, all }) {
  if (all) return Object.keys(sliceValidators);
  if (!name || !sliceValidators[name]) throw new Error(`unknown slice: ${name || "(missing)"}`);
  return [name];
}

export async function runSliceValidation({ selected, evidenceRoot, run }) {
  const summary = { schemaVersion: 1, status: "passed", startedAt: new Date().toISOString(), evidenceRoot, results: [] };
  for (const id of selected) {
    if (!sliceValidators[id]) throw new Error(`unknown slice: ${id}`);
    const evidenceDir = path.join(evidenceRoot, id);
    const result = await run({ id, script: sliceValidators[id], args: ["--evidence-dir", evidenceDir], evidenceDir });
    const entry = {
      id,
      validator: sliceValidators[id],
      evidenceDir,
      status: result.status === 0 ? "passed" : "failed",
      exitCode: result.status ?? 1,
      stdout: String(result.stdout || "").slice(-12000),
      stderr: String(result.stderr || "").slice(-12000),
    };
    summary.results.push(entry);
    if (entry.status === "failed") {
      summary.status = "failed";
      break;
    }
  }
  summary.finishedAt = new Date().toISOString();
  return summary;
}
