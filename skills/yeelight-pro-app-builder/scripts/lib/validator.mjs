import fs from "node:fs";
import path from "node:path";

import { moduleDirectory } from "./compiler.mjs";
import { assertBrowserWorkspaceBoundary } from "./browser-boundary.mjs";

const forbiddenBrowserPatterns = [
  { id: "raw-cloud-host", pattern: /https?:\/\/(?:api[^/]*\.yeedev\.com|[^/]*yeelight[^/]*\/apis\/)/i },
  { id: "credential-field", pattern: /accessToken|Authorization\s*:|Bearer\s+[A-Za-z0-9._-]+/i },
  { id: "shell-command", pattern: /yeelight-home\s+invoke|child_process|spawn\s*\(/i },
  { id: "ai-runtime", pattern: /openai|anthropic|chatCompletion|promptInput/i },
];

export function validateGeneratedApp(root) {
  const spec = readJSON(root, "product.spec.json");
  const lock = readJSON(root, "runtime.lock.json");
  const manifest = readJSON(root, "generation-manifest.json");
  if (spec.schemaVersion !== 3) throw new Error("ProductSpec 版本无效");
  if (lock.cli?.contractVersion !== "1.0") throw new Error("Runtime contractVersion 无效");
  if (manifest.modules?.join("|") !== spec.modules.map((module) => module.id).join("|")) throw new Error("生成模块与 ProductSpec 不一致");

  const moduleRoot = path.join(root, "apps/web/src/modules");
  const actualDirectories = fs.existsSync(moduleRoot) ? fs.readdirSync(moduleRoot).filter((name) => fs.statSync(path.join(moduleRoot, name)).isDirectory()).sort() : [];
  const expectedDirectories = manifest.modules.map(moduleDirectory).sort();
  if (actualDirectories.join("|") !== expectedDirectories.join("|")) throw new Error("生成源码包含未选择模块或缺少模块");

  const browserSource = collectText(path.join(root, "apps/web/src"));
  for (const rule of forbiddenBrowserPatterns) {
    if (rule.pattern.test(browserSource)) throw new Error(`生成浏览器代码包含禁止内容: ${rule.id}`);
  }
  const semanticOperations = [...new Set([
    ...Object.keys(lock.intents || {}),
    ...Object.values(lock.entities || {}).flatMap((entity) => (entity.controls || []).map((control) => control.intent)),
  ])];
  assertBrowserWorkspaceBoundary(root, semanticOperations);

  const provenIntents = new Set(Object.entries(lock.intents || {}).filter(([, value]) => value?.status === "proven" && value?.evidence === "preview-only").map(([intent]) => intent));
  for (const entity of Object.values(lock.entities || {})) {
    for (const control of entity.controls || []) {
      if (!provenIntents.has(control.intent)) throw new Error(`控件缺少 preview-only 证据: ${control.intent}`);
    }
  }

  const bridgeSource = readText(root, "apps/bridge/src/index.mjs");
  if (/shell\s*:\s*true/.test(bridgeSource)) throw new Error("Bridge 禁止启用 shell");
  if (!/spawn\(runtimeBin, \["invoke", "--stdin"\]/.test(bridgeSource)) throw new Error("Bridge Runtime 调用方式无效");

  return { ok: true, modules: manifest.modules, cliVersion: lock.cli.version };
}

function readJSON(root, relativePath) {
  return JSON.parse(readText(root, relativePath));
}

function readText(root, relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) throw new Error(`缺少生成文件: ${relativePath}`);
  return fs.readFileSync(file, "utf8");
}

function collectText(root) {
  if (!fs.existsSync(root)) return "";
  const output = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(collectText(file));
    else if (/\.(?:ts|tsx|js|jsx|json|css|html)$/.test(entry.name)) output.push(fs.readFileSync(file, "utf8"));
  }
  return output.join("\n");
}
