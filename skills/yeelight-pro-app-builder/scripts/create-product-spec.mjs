#!/usr/bin/env node
import path from "node:path";

import { parseArgs, splitList, writeJSON } from "./lib/common.mjs";
import { compileProductSpec } from "./lib/product-spec.mjs";
import { loadThemeSpecFile } from "./lib/theme-spec.mjs";
import { themeCliHelp } from "./lib/theme-cli-help.mjs";

const args = parseArgs();
if (args.help) {
  console.log(themeCliHelp("create-product-spec.mjs"));
  process.exit(0);
}
if (!args.request || !args.out) {
  console.error(themeCliHelp("create-product-spec.mjs"));
  process.exit(2);
}

try {
  const spec = compileProductSpec({
    request: args.request,
    title: args.title,
    name: args.name,
    themeFile: args["theme-file"] ? loadThemeSpecFile(String(args["theme-file"])) : undefined,
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
      themePreset: args["theme-preset"],
      brandColor: args["brand-color"],
      accentColor: args["accent-color"],
      typography: args.typography,
      shape: args.shape,
      motion: args.motion,
    },
  });
  const output = path.resolve(String(args.out));
  writeJSON(output, spec);
  console.log(JSON.stringify({ status: "ok", output, modules: spec.modules.map((module) => module.id) }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
