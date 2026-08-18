#!/usr/bin/env node
import fs from "node:fs";
import { createInteractiveServer } from "./server.mjs";
import { assertProductionBindingPath, defaultBindingPath } from "./lib/live-topology.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (!value.startsWith("--")) continue;
  const key = value.slice(2);
  args.set(key, process.argv[index + 1] && !process.argv[index + 1].startsWith("--") ? process.argv[++index] : true);
}

const mode = args.get("mode") || "mock-18";
const bindingPath = mode.startsWith("live") ? assertProductionBindingPath(args.get("binding-file") || defaultBindingPath()) : undefined;
const app = createInteractiveServer({
  port: args.has("port") ? Number(args.get("port")) : 8787,
  mode,
  scenario: args.get("scenario") || "online",
  profile: args.get("profile") || undefined,
  region: args.get("region") || undefined,
  houseId: args.get("house-id") || undefined,
  bindingPath,
  runtimeBin: args.get("runtime-bin") || (mode.startsWith("live") ? findRuntimeBinary() : undefined),
});

await app.ready;
app.server.listen(app.port, "127.0.0.1", () => {
  process.stdout.write(`Yeelight Interactive Light Experiences\n`);
  process.stdout.write(`Open http://127.0.0.1:${app.port}\n`);
  const modeLabel = app.runtime.requestedMode === app.runtime.mode
    ? app.runtime.mode
    : `${app.runtime.requestedMode} -> ${app.runtime.mode}`;
  process.stdout.write(`Mode: ${modeLabel}; scenario: ${app.runtime.scenario}\n`);
  process.stdout.write(`Provider setup: http://127.0.0.1:${app.port}/staff\n`);
});

const stop = () => app.server.close(() => process.exit(0));
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

function findRuntimeBinary() {
  const candidates = ["/opt/homebrew/bin/yeelight-home", "/usr/local/bin/yeelight-home", "/usr/bin/yeelight-home"];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try { return fs.realpathSync(candidate); } catch { /* Try the next fixed installation path. */ }
  }
  return "";
}
