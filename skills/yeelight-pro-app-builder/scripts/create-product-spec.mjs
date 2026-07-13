#!/usr/bin/env node
import path from "node:path";

import { parseArgs, splitList, writeJSON } from "./lib/common.mjs";
import { compileProductSpec } from "./lib/product-spec.mjs";

const args = parseArgs();
if (!args.request || !args.out) {
  console.error("Usage: node scripts/create-product-spec.mjs --request <text> --out <product.spec.json> [choices]");
  process.exit(2);
}

try {
  const spec = compileProductSpec({
    request: args.request,
    title: args.title,
    name: args.name,
    choices: {
      formFactor: args["form-factor"],
      navigation: args.navigation,
      density: args.density,
      modules: splitList(args.modules),
      deviceFamilies: splitList(args["device-families"]),
      roomNames: splitList(args.room),
      homeIds: splitList(args["home-id"]),
      themePack: args["theme-pack"],
      palette: args.palette,
      mode: args.mode,
    },
  });
  const output = path.resolve(String(args.out));
  writeJSON(output, spec);
  console.log(JSON.stringify({ status: "ok", output, modules: spec.modules.map((module) => module.id) }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
