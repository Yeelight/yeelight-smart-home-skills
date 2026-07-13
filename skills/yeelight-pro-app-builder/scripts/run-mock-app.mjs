#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { parseArgs } from "./lib/common.mjs";
import { startMockHomeServer } from "./lib/mock-home-server.mjs";

const args = parseArgs();
if (!args.app) {
  console.error("Usage: node scripts/run-mock-app.mjs --app <generated-app-dir> [--mock-home comprehensive]");
  process.exit(2);
}

const appRoot = path.resolve(String(args.app));
const specFile = path.join(appRoot, "product.spec.json");
if (!fs.existsSync(specFile)) {
  console.error("Generated app is missing product.spec.json");
  process.exit(2);
}

const spec = JSON.parse(fs.readFileSync(specFile, "utf8"));
const fixtureId = String(args["mock-home"] || "comprehensive");
const mockServer = await startMockHomeServer({ fixtureId });
if (!spec.scope?.homeIds?.includes(mockServer.homeId)) {
  await mockServer.close();
  console.error(`Generated app home does not match mock fixture ${fixtureId}`);
  process.exit(2);
}

const runtimeHome = fs.mkdtempSync(path.join(os.tmpdir(), "ypa-mock-app-runtime-"));
const child = spawn("npm", ["run", "dev", "--prefix", appRoot], {
  env: {
    ...process.env,
    YEELIGHT_API_BASE_URL: mockServer.apiBaseUrl,
    YEELIGHT_HOME_ACCESS_TOKEN: mockServer.credential,
    YEELIGHT_HOME_AUTHENTICATED: "1",
    YEELIGHT_HOME_HOUSE_ID: mockServer.homeId,
    YEELIGHT_HOME_DIR: runtimeHome,
    YEELIGHT_CLOUD_REGION: "dev",
  },
  stdio: "inherit",
});

console.log(`Mock home ${fixtureId} is serving app ${appRoot}`);
console.log(`Mock API ${mockServer.apiBaseUrl}`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", (code) => resolve(code ?? 1));
});
await mockServer.close();
process.exitCode = exitCode;
