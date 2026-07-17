#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs, writeJSON } from "./lib/common.mjs";
import { resolveSliceSelection, runSliceValidation } from "./lib/slice-validator.mjs";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const args = parseArgs(argv);
const name = argv.find((value) => !value.startsWith("--") && value !== args["evidence-dir"]);
const evidenceRoot = path.resolve(String(args["evidence-dir"] || path.join(os.tmpdir(), `ypa-slices-${Date.now()}`)));

try {
  const selected = resolveSliceSelection({ name, all: args.all === true });
  const summary = await runSliceValidation({ selected, evidenceRoot, run: runValidator });
  writeJSON(path.join(evidenceRoot, "validation-summary.json"), summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.status !== "passed") process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}

function runValidator({ script, args: validatorArgs }) {
  return spawnSync(process.execPath, [path.join(scriptRoot, script), ...validatorArgs], {
    cwd: path.resolve(scriptRoot, ".."),
    env: process.env,
    encoding: "utf8",
    timeout: 900000,
    maxBuffer: 64 * 1024 * 1024,
  });
}
