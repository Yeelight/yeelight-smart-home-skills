#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDeterministicPlan } from "./lib/plans.mjs";
import { aggregatePlan, assertTopologyReady, createTopology } from "./lib/topology.mjs";
import { EXPERIENCE_CATALOG, LOGICAL_SLOTS, validateExperiencePlan } from "./lib/contracts.mjs";

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const requiredFiles = ["SKILL.md", "agents/openai.yaml", "assets/experiences.json", "assets/mock/ifa-16-e20.json", "assets/schemas/experience-plan.schema.json", "scripts/invoke.sh", "scripts/invoke.ps1", "scripts/service.mjs", "scripts/lib/service-contract.mjs", "scripts/runtime-manifest.json", "web/index.html", "web/app.js", "web/styles.css", "web/staff.html", "web/staff.js"];
const errors = [];

for (const relative of requiredFiles) if (!fs.existsSync(path.join(packageRoot, relative))) errors.push(`missing file: ${relative}`);
const skillText = fs.readFileSync(path.join(packageRoot, "SKILL.md"), "utf8");
if (!skillText.startsWith("---\n") || !skillText.includes("\nname: yeelight-interactive-light-experiences\n") || !skillText.includes("\ndescription:")) errors.push("SKILL.md frontmatter is incomplete");
let serviceManifest;
try { serviceManifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "scripts/runtime-manifest.json"), "utf8")); } catch { errors.push("runtime-manifest.json must be valid JSON"); }
if (serviceManifest) {
  if (serviceManifest.service?.id !== "yeelight-interactive-light-experiences") errors.push("runtime manifest service id mismatch");
  if (serviceManifest.service?.protocolVersion !== 1) errors.push("runtime manifest protocol version mismatch");
  if (serviceManifest.service?.loopbackHost !== "127.0.0.1" || serviceManifest.service?.defaultPort !== 8787) errors.push("runtime manifest must use the fixed loopback endpoint");
  if (JSON.stringify(serviceManifest.service?.actions) !== JSON.stringify(["start", "status", "stop"])) errors.push("runtime manifest actions must be start/status/stop");
  for (const host of ["codex", "openclaw", "claude-code"]) {
    if (serviceManifest.hosts?.[host]?.wrapper !== "scripts/invoke.sh" || serviceManifest.hosts?.[host]?.startAction !== "start") errors.push(`${host} host wrapper contract is incomplete`);
  }
}
const openaiText = fs.readFileSync(path.join(packageRoot, "agents/openai.yaml"), "utf8");
if (!/default_prompt:\s*"[^"]*\$yeelight-interactive-light-experiences/.test(openaiText)) errors.push("openai default prompt must invoke the Skill by name");
if (!/allow_implicit_invocation:\s*true/.test(openaiText)) errors.push("openai policy must allow implicit invocation");
if (EXPERIENCE_CATALOG.length !== 12) errors.push(`expected 12 experiences, got ${EXPERIENCE_CATALOG.length}`);
if (EXPERIENCE_CATALOG[0]?.id !== "fortune-light" || !EXPERIENCE_CATALOG[0]?.recommended) errors.push("fortune-light must be the recommended first experience");
if (new Set(EXPERIENCE_CATALOG.map((item) => item.id)).size !== EXPERIENCE_CATALOG.length) errors.push("experience ids must be unique");

for (const mode of ["mock-16", "proxy-4"]) {
  const topology = createTopology(mode, "online");
  const ready = assertTopologyReady(topology, { rgb: true, brightness: true, flow: false });
  if (!ready.ok) errors.push(`${mode} topology not ready: ${ready.reason}`);
  for (const item of EXPERIENCE_CATALOG) {
    try {
      const plan = buildDeterministicPlan(item.id, { choices: ["Balanced"], primary: "Wood", secondary: "Earth", ratio: 60 }, "deterministic");
      const checked = validateExperiencePlan(plan, item.id);
      if (!checked.ok) errors.push(`${item.id} plan invalid: ${checked.errors.join(", ")}`);
      const compiled = aggregatePlan(plan, topology);
      if (compiled.derivedSlots.length !== LOGICAL_SLOTS.length) errors.push(`${item.id} ${mode} does not preserve 16 derived slots`);
    } catch (error) {
      errors.push(`${item.id} ${mode} failed: ${error.message}`);
    }
  }
}

if (errors.length) {
  console.error(errors.map((error) => `FAIL ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, experiences: EXPERIENCE_CATALOG.length, logicalSlots: LOGICAL_SLOTS.length, modes: ["mock-16", "proxy-4"], liveMode: "live-auto" }));
}
