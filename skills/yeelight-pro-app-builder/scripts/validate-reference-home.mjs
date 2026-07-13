#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadCapabilityCatalog, loadCapabilityCoverage, validateCapabilityCoverage } from "./lib/capabilities/catalog.mjs";
import { createCommandRunner } from "./lib/command-runner.mjs";
import { startMockHomeServer } from "./lib/mock-home-server.mjs";

const args = parseArgs(process.argv.slice(2));
const runtimeBin = String(args["runtime-bin"] || process.env.YEELIGHT_HOME_BIN || "yeelight-home");
const evidenceDir = path.resolve(String(args["evidence-dir"] || path.join(process.cwd(), ".trellis/tasks/07-11-yeelight-pro-app-builder-capability-reference-home/validation/reference-home")));
const runtimeHome = fs.mkdtempSync(path.join(os.tmpdir(), "ypa-reference-home-runtime-"));
const server = await startMockHomeServer({ fixtureId: "reference-home" });

try {
  const run = createCommandRunner({ runtimeBin, region: "dev", env: {
    YEELIGHT_API_BASE_URL: server.apiBaseUrl,
    YEELIGHT_HOME_ACCESS_TOKEN: server.credential,
    YEELIGHT_HOME_HOUSE_ID: server.homeId,
    YEELIGHT_HOME_DIR: runtimeHome,
  } });
  const fixture = server.fixture;
  const light = fixture.devices.find((device) => device.id === "992001");
  const steps = [
    ["home-list", ["home", "list", "--json"]],
    ["entity-list", ["entity", "list", "--house-id", server.homeId, "--json"]],
    ["room-list", ["room", "list", "--house-id", server.homeId, "--json"]],
    ["device-list", ["device", "list", "--house-id", server.homeId, "--json"]],
    ["device-detail", ["device", "detail", "--device-id", light.id, "--house-id", server.homeId, "--json"]],
    ["device-state", ["device", "state", "--device-id", light.id, "--house-id", server.homeId, "--json"]],
    ["sensor-list", ["sensor", "list", "--house-id", server.homeId, "--json"]],
    ["sensor-events", ["sensor", "events", "--house-id", server.homeId, "--json"]],
    ["scene-list", ["scene", "list", "--house-id", server.homeId, "--json"]],
    ["scene-preview", ["scene", "execute", "--scene-id", "994001", "--house-id", server.homeId, "--json", "--preview-only"]],
    ["automation-list", ["automation", "list", "--house-id", server.homeId, "--json"]],
    ["automation-preview", ["automation", "enable", "--automation-id", "995003", "--house-id", server.homeId, "--json", "--preview-only"]],
    ["group-list", ["group", "list", "--house-id", server.homeId, "--json"]],
    ["gateway-list", ["gateway", "list", "--house-id", server.homeId, "--json"]],
    ["gateway-thread", ["gateway", "thread", "--gateway-id", "992900", "--house-id", server.homeId, "--json"]],
    ["panel-detail", ["panel", "detail", "--panel-id", "992501", "--house-id", server.homeId, "--json"]],
    ["knob-detail", ["knob", "detail", "--knob-id", "992601", "--house-id", server.homeId, "--json"]],
  ];
  const results = [];
  for (const [id, command] of steps) results.push(await runStep(run, id, command));
  results.push(await runStep(run, "light-brightness-preview", ["invoke", "--stdin"], { stdin: JSON.stringify(lightRequest({ id: "light-brightness-preview", houseId: server.homeId, deviceId: light.id, intent: "light.brightness.set", parameters: { brightness: 51 }, previewOnly: true })) }));

  const before = await runStep(run, "light-before", ["device", "state", "--device-id", light.id, "--house-id", server.homeId, "--json"]);
  await runStep(run, "light-write-off", ["invoke", "--stdin"], { stdin: JSON.stringify(lightRequest({ id: "light-write-off", houseId: server.homeId, deviceId: light.id, intent: "light.power.set", parameters: { power: false } })) });
  const after = await runStep(run, "light-after", ["device", "state", "--device-id", light.id, "--house-id", server.homeId, "--json"]);
  await runStep(run, "light-restore", ["invoke", "--stdin"], { stdin: JSON.stringify(lightRequest({ id: "light-restore", houseId: server.homeId, deviceId: light.id, intent: "light.power.set", parameters: { power: true } })) });
  const restored = await runStep(run, "light-restored", ["device", "state", "--device-id", light.id, "--house-id", server.homeId, "--json"]);
  if (before.payload.result.properties.power !== true || after.payload.result.properties.power !== false || restored.payload.result.properties.power !== true) throw new Error("light mutation readback/restore contract failed");
  const mutations = [{ capabilityId: "light.power.write", before: true, after: false, restored: true }];
  if (args["extended-writes"]) mutations.push(...await validateExtendedWrites({ run, server }));
  for (const mutation of mutations) assertMutationProof(mutation);

  const catalog = loadCapabilityCatalog();
  const coverage = validateCapabilityCoverage({ catalog, coverage: loadCapabilityCoverage(), fixture });
  if (coverage.coveragePercent !== 100) throw new Error(`capability coverage is ${coverage.coveragePercent}%`);
  const summary = {
    schemaVersion: 1,
    fixture: { id: fixture.id, areas: fixture.areas.length, rooms: fixture.rooms.length, devices: fixture.devices.length, scenes: fixture.scenes.length, automations: fixture.automations.length, groups: fixture.groups.length, testScenarios: fixture.testScenarios.length },
    runtime: { binary: path.basename(runtimeBin), version: (await run(["--version"])).stdout.trim() },
    coverage,
    commands: [...results, before, after, restored].map(({ id, command, durationMs }) => ({ id, command, durationMs, passed: true })),
    mutations,
    requests: server.requestLog(),
  };
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ status: "ok", evidenceDir, fixture: summary.fixture, runtime: summary.runtime, coveragePercent: coverage.coveragePercent, commandCount: summary.commands.length }, null, 2) + "\n");
} finally {
  await server.close();
  fs.rmSync(runtimeHome, { recursive: true, force: true });
}

async function runStep(run, id, command, options = {}) {
  const started = Date.now();
  const result = await run(command, options);
  let payload;
  try { payload = JSON.parse(result.stdout); } catch { throw new Error(`${id} returned invalid JSON: ${result.stderr || result.stdout}`); }
  if (result.code !== 0 || (payload.status !== "success" && payload.ok !== true)) throw new Error(`${id} failed: ${result.stderr || result.stdout}`);
  return { id, command, durationMs: Date.now() - started, payload };
}

function lightRequest({ id, houseId, deviceId, intent, parameters, previewOnly = false }) {
  return {
    contractVersion: "1.0",
    requestId: `reference-home-${id}`,
    locale: "zh-CN",
    utterance: id,
    intent,
    targets: [{ entityType: "device", id: deviceId }],
    parameters: { houseId, ...parameters },
    ...(previewOnly ? { options: { previewOnly: true } } : {}),
  };
}

async function validateExtendedWrites({ run, server }) {
  const proofs = [];
  if (await supportsIntent(run, "device.property.set")) {
    proofs.push(await validateDeviceProperty({ run, server, capabilityId: "curtain.position.write", deviceId: "992101", property: "targetPosition", fixtureProperty: "targetPosition", nextValue: 40 }));
    proofs.push(await validateDeviceProperty({ run, server, capabilityId: "relay.circuit.write", deviceId: "992201", property: "switchPower", fixtureProperty: "sp", nextValue: false }));
    proofs.push(await validateDeviceProperty({ run, server, capabilityId: "climate.control.write", deviceId: "992301", property: "airConditionerTargetTemperature", fixtureProperty: "actt", nextValue: 25 }));
  }
  if (await supportsIntent(run, "automation.disable")) {
    const automation = server.fixture.automations.find((item) => item.id === "995001");
    const before = automation.status;
    await invoke(run, "automation-disable", server.homeId, "automation.disable", [{ entityType: "automation", id: automation.id }], { automationId: automation.id });
    const after = automation.status;
    await invoke(run, "automation-restore", server.homeId, "automation.enable", [{ entityType: "automation", id: automation.id }], { automationId: automation.id });
    proofs.push({ capabilityId: "automation.status.write", before, after, restored: automation.status });
  }
  if (await supportsIntent(run, "group.members.update")) {
    const group = server.fixture.groups.find((item) => item.id === "993001");
    const before = [...group.deviceIds];
    const afterIds = [...before, "992002"];
    await invoke(run, "group-members-write", server.homeId, "group.members.update", [{ entityType: "group", id: group.id }], { groupId: group.id, deviceIds: afterIds });
    const after = [...group.deviceIds];
    await invoke(run, "group-members-restore", server.homeId, "group.members.update", [{ entityType: "group", id: group.id }], { groupId: group.id, deviceIds: before });
    proofs.push({ capabilityId: "group.members.write", before, after, restored: [...group.deviceIds] });
  }
  if (await supportsIntent(run, "panel.button.configure")) {
    const panel = server.fixture.devices.find((item) => item.id === "992501");
    const buttonId = panel.panelButtons.click[0].id;
    const before = panel.panelButtons.click[0].alias;
    await invoke(run, "panel-button-write", server.homeId, "panel.button.configure", [{ entityType: "device", id: panel.id }], { deviceId: panel.id, buttons: [{ id: buttonId, alias: "欢迎回家" }] });
    const after = panel.panelButtons.click.find((button) => button.id === buttonId).alias;
    await invoke(run, "panel-button-restore", server.homeId, "panel.button.configure", [{ entityType: "device", id: panel.id }], { deviceId: panel.id, buttons: [{ id: buttonId, alias: before }] });
    proofs.push({ capabilityId: "panel.button.write", before, after, restored: panel.panelButtons.click.find((button) => button.id === buttonId).alias });
  }
  return proofs;
}

async function validateDeviceProperty({ run, server, capabilityId, deviceId, property, fixtureProperty, nextValue }) {
  const device = server.fixture.devices.find((item) => item.id === deviceId);
  const before = device.properties[fixtureProperty];
  await invoke(run, `${capabilityId}-write`, server.homeId, "device.property.set", [{ entityType: "device", id: deviceId }], { deviceId, property, value: nextValue });
  const after = device.properties[fixtureProperty];
  await invoke(run, `${capabilityId}-restore`, server.homeId, "device.property.set", [{ entityType: "device", id: deviceId }], { deviceId, property, value: before });
  return { capabilityId, before, after, restored: device.properties[fixtureProperty] };
}

async function invoke(run, id, houseId, intent, targets, parameters) {
  return runStep(run, id, ["invoke", "--stdin"], { stdin: JSON.stringify({ contractVersion: "1.0", requestId: `reference-home-${id}`, locale: "zh-CN", utterance: id, intent, targets, parameters: { houseId, ...parameters } }) });
}

async function supportsIntent(run, intent) {
  return (await run(["intent", "schema", "--intent", intent, "--json"])).code === 0;
}

function assertMutationProof({ capabilityId, before, after, restored }) {
  if (isEqual(before, after)) throw new Error(`${capabilityId} mutation did not change state`);
  if (!isEqual(before, restored)) throw new Error(`${capabilityId} mutation did not restore initial state`);
}

function isEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    parsed[key] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return parsed;
}
