import fs from "node:fs";
import path from "node:path";

const rawColor = /(?<![\w-])(?:#[0-9a-f]{3,8}\b|(?:rgb|rgba|hsl|hsla)\([^)]*\))/gi;
const shadowDeclaration = /box-shadow\s*:\s*([^;}]+)/gi;

export function auditThemeSources(root, options = {}) {
  const files = collectFiles(root).filter((file) => /\.(?:mjs|js|jsx|ts|tsx|css)$/.test(file));
  const findings = files.flatMap((file) => auditThemeSource(fs.readFileSync(file, "utf8"), {
    relativePath: path.relative(root, file).split(path.sep).join("/"),
    presetIds: options.presetIds || [],
  }));
  return { schemaVersion: 1, status: findings.length === 0 ? "passed" : "failed", filesScanned: files.length, findings };
}

export function auditThemeSource(source, options = {}) {
  const relativePath = options.relativePath || "inline";
  const findings = [
    ...matches(source, rawColor, relativePath, "hardcoded-color"),
    ...matches(source, shadowDeclaration, relativePath, "hardcoded-shadow")
      .filter(({ value }) => !/^box-shadow\s*:\s*(?:var\(|none\b)/i.test(value)),
  ];
  for (const presetId of options.presetIds || []) {
    const escaped = escapeRegExp(presetId);
    const branch = new RegExp(`(?:if|switch|case|\\?|===|!==)[^\\n]{0,160}["']${escaped}["']|["']${escaped}["'][^\\n]{0,160}(?:\\?|===|!==)`, "g");
    findings.push(...matches(source, branch, relativePath, "preset-id-branch"));
  }
  return findings.sort((left, right) => left.line - right.line || left.column - right.column || left.rule.localeCompare(right.rule));
}

function matches(source, pattern, file, rule) {
  pattern.lastIndex = 0;
  return [...source.matchAll(pattern)].map((match) => {
    const before = source.slice(0, match.index);
    const line = before.split("\n").length;
    const column = match.index - before.lastIndexOf("\n");
    return { rule, file, line, column, value: match[0].trim().slice(0, 180) };
  });
}

function collectFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name)).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? collectFiles(file) : [file];
  });
}

function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
