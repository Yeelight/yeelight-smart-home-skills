#!/usr/bin/env node
import { YeelightHomeCommandAdapter } from "./lib/command-adapter.mjs";
import { assertProductionBindingPath, createBindingFromNames, defaultBindingPath, discoverLiveInstallation } from "./lib/live-topology.mjs";

const args = parseArgs(process.argv.slice(2));
const topology = args.topology || "live-proxy-4";
const profile = args.profile;
const region = args.region;
const houseId = args["house-id"];
const runtimeBin = args["runtime-bin"];
if (!profile || !region || !houseId || !runtimeBin || !args.map) fail("usage: live-bind --runtime-bin <absolute-path> --profile <name> --region <region> --house-id <id> --map alias=name,... [--topology live-proxy-4|live-16]; launch with --mode live-auto");
const bindingPath = assertProductionBindingPath(args["binding-file"] || defaultBindingPath());

const adapter = new YeelightHomeCommandAdapter({ runtimeBin, profile, region, houseId, strictRuntime: true });
const installation = await discoverLiveInstallation(adapter, { profile, region, houseId });
process.stdout.write(`Found ${installation.devices.length} device candidates and one online gateway.\n`);
const names = parseMap(args.map);
const result = await createBindingFromNames({ adapter, profile, region, houseId, topology, names, bindingPath });
process.stdout.write(`Saved ${topology} binding for ${Object.keys(result.bindings).length} physical targets.\n`);

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    result[key] = values[index + 1] && !values[index + 1].startsWith("--") ? values[++index] : true;
  }
  return result;
}

function parseMap(value) {
  const result = {};
  for (const entry of String(value).split(",")) {
    const separator = entry.indexOf("=");
    if (separator < 1) fail("invalid --map; use alias=device-name pairs");
    const alias = entry.slice(0, separator).trim();
    const name = entry.slice(separator + 1).trim();
    if (!alias || !name || result[alias]) fail("invalid --map; duplicate or empty alias");
    result[alias] = name;
  }
  return result;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
