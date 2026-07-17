#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptRoot, "..");
const defaultCssPath = path.join(skillRoot, "assets/design-system/yeelight-pro/tokens/themes.generated.css");
const comparedTokens = [
  "--yp-primitive-font-body",
  "--yp-primitive-radius-md",
  "--yp-semantic-page",
  "--yp-semantic-surface",
  "--yp-semantic-text",
  "--yp-semantic-action",
  "--yp-semantic-focus",
  "--yp-component-control-min-height",
  "--yp-component-card-background",
  "--yp-component-input-background",
];

export function compareDesignSystemThemeParity({ css, lock }) {
  const preset = lock?.normalizedSpec?.preset;
  if (!preset) throw new Error("theme lock normalizedSpec.preset is required");
  const modes = [
    ["light", lock.resolvedLightTokens],
    ["dark", lock.resolvedDarkTokens],
  ];
  const checks = modes.flatMap(([mode, productionTokens]) => {
    const designTokens = extractBlock(css, `[data-theme-preset="${preset}"][data-theme-mode="${mode}"]`);
    return comparedTokens.map((token) => ({
      mode,
      token,
      production: productionTokens?.[token] ?? null,
      designSystem: designTokens[token] ?? null,
      status: productionTokens?.[token] === designTokens[token] ? "passed" : "failed",
    }));
  });
  return {
    schemaVersion: 1,
    preset,
    status: checks.every(({ status }) => status === "passed") ? "passed" : "failed",
    comparedTokenCount: checks.length,
    checks,
  };
}

function extractBlock(css, selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return {};
  const bodyStart = css.indexOf("{", start) + 1;
  const bodyEnd = css.indexOf("\n}", bodyStart);
  if (bodyEnd < 0) return {};
  return Object.fromEntries([...css.slice(bodyStart, bodyEnd).matchAll(/^\s*(--[\w-]+):\s*(.*?);(?:\s*\/\*.*)?$/gm)].map((match) => [match[1], match[2].trim()]));
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lockPath = option("--theme-lock");
  const evidencePath = option("--evidence");
  if (!lockPath) throw new Error("--theme-lock <path> is required");
  const report = compareDesignSystemThemeParity({
    css: fs.readFileSync(option("--design-css") || defaultCssPath, "utf8"),
    lock: JSON.parse(fs.readFileSync(lockPath, "utf8")),
  });
  if (evidencePath) {
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, `${JSON.stringify({ ...report, generatedAt: new Date().toISOString() }, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "passed") process.exitCode = 1;
}
