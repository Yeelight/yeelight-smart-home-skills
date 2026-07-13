#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildApp } from "./lib/builder.mjs";
import { createCommandRunner } from "./lib/command-runner.mjs";
import { parseArgs, splitList } from "./lib/common.mjs";
import { startMockHomeServer } from "./lib/mock-home-server.mjs";
import { loadCapabilityCatalog, loadCapabilityCoverage, validateCapabilityProfile } from "./lib/capabilities/catalog.mjs";
import { runReferenceCapabilityProbe } from "./lib/capabilities/reference-probes.mjs";
import { probeRuntimeProfile } from "./lib/capabilities/runtime-profile.mjs";

const args = parseArgs();
if (!args.request || !args.out) {
  console.error("Usage: node scripts/build-app.mjs --request <text> --out <app-dir> --home-id <id> [choices]");
  process.exit(2);
}

let mockServer;
try {
  if (args["mock-home"]) mockServer = await startMockHomeServer({ fixtureId: String(args["mock-home"]) });
  const outputRoot = path.resolve(String(args.out));
  const homeIds = splitList(args["home-id"]);
  const runtimeEnv = mockServer ? {
    YEELIGHT_API_BASE_URL: mockServer.apiBaseUrl,
    YEELIGHT_HOME_ACCESS_TOKEN: mockServer.credential,
    YEELIGHT_HOME_AUTHENTICATED: "1",
    YEELIGHT_HOME_HOUSE_ID: mockServer.homeId,
    YEELIGHT_HOME_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "ypa-mock-runtime-")),
  } : {};
  const run = createCommandRunner({ runtimeBin: args["runtime-bin"], profile: args.profile, region: args.region || (mockServer ? "dev" : ""), env: runtimeEnv });
  const capabilityProfile = mockServer ? await probeMockRuntimeProfile(run, mockServer) : undefined;
  const result = await buildApp({
    request: args.request,
    title: args.title,
    name: args.name,
    outputRoot,
    choices: {
      formFactor: args["form-factor"],
      navigation: args.navigation,
      density: args.density,
      modules: splitList(args.modules),
      deviceFamilies: splitList(args["device-families"]),
      roomNames: splitList(args.room),
      homeIds: homeIds.length > 0 ? homeIds : mockServer ? [mockServer.homeId] : [],
      themePack: args["theme-pack"],
      palette: args.palette,
      mode: args.mode,
      dataMode: mockServer ? "mock" : args["data-mode"] || "live",
    },
    run,
    capabilityProfile,
  });
  console.log(JSON.stringify({ status: "ok", outputRoot, cliVersion: result.snapshot.cli.version, modules: result.compilation.modules, entityCount: Object.keys(result.snapshot.entities).length, runtimeSource: mockServer ? `mock-home:${mockServer.fixtureId}` : "live" }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (mockServer) await mockServer.close();
}

async function probeMockRuntimeProfile(run, server) {
  const catalog = loadCapabilityCatalog();
  const coverage = loadCapabilityCoverage();
  const profile = await probeRuntimeProfile({
    catalog,
    source: "generation-mock-runtime",
    run,
    executeProbe: (capability) => runReferenceCapabilityProbe({ capability, run, server }),
  });
  return validateCapabilityProfile(profile, { catalog, coverage });
}
