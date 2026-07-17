#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compileDesignSystemThemeAssets } from "./lib/design-system-theme-source.mjs";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const designRoot = path.join(skillRoot, "assets/design-system/yeelight-pro");
const assets = compileDesignSystemThemeAssets();

write("tokens/themes.generated.css", assets.css);
write("theme-index.generated.json", `${JSON.stringify(assets.index, null, 2)}\n`);
write("foundations/themes.html", `${assets.interactiveHtml}\n`);
write("foundations/theme-catalog.html", `${assets.catalogHtml}\n`);
console.log(JSON.stringify({ status: "ok", presets: assets.index.presets.length, cssSha256: assets.index.cssSha256 }, null, 2));

function write(relativePath, contents) {
  const file = path.join(designRoot, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}
