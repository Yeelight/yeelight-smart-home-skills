import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { moduleDirectory } from "./compiler.mjs";
import { assertBrowserWorkspaceBoundary } from "./browser-boundary.mjs";
import { bridgePackageJson, generationToolchain, packageJson, packageLockJson, webPackageJson } from "./toolchain.mjs";
import { assertRuntimeSupported, generationRuntimeContract } from "./runtime-compatibility.mjs";
import { normalizeProductSpec, themeInputSourceFromProductSpec } from "./theme-migration.mjs";
import { compileThemeTokens, themeManifestFromLock } from "./theme-token-compiler.mjs";
import { stylesSource } from "./templates/styles.mjs";

const forbiddenBrowserPatterns = [
  { id: "raw-cloud-host", pattern: /https?:\/\/(?:api[^/]*\.yeedev\.com|[^/]*yeelight[^/]*\/apis\/)/i },
  { id: "credential-field", pattern: /accessToken|Authorization\s*:|Bearer\s+[A-Za-z0-9._-]+/i },
  { id: "shell-command", pattern: /yeelight-home\s+invoke|child_process|spawn\s*\(/i },
  { id: "ai-runtime", pattern: /openai|anthropic|chatCompletion|promptInput/i },
];

export function validateGeneratedApp(root) {
  const sourceSpec = readJSON(root, "product.spec.json");
  const spec = normalizeProductSpec(sourceSpec);
  const lock = readJSON(root, "runtime.lock.json");
  const themeLock = readJSON(root, "theme.lock.json");
  const manifest = readJSON(root, "generation-manifest.json");
  if (sourceSpec.schemaVersion !== 4) throw new Error("生成应用 ProductSpec 必须为 v4");
  if (lock.cli?.contractVersion !== "1.0") throw new Error("Runtime contractVersion 无效");
  assertRuntimeSupported(lock.cli?.version);
  if (manifest.modules?.join("|") !== spec.modules.map((module) => module.id).join("|")) throw new Error("生成模块与 ProductSpec 不一致");
  validateGenerationPlan(spec, manifest);
  validateThemeArtifacts(root, spec, themeLock, manifest);
  validateToolchain(root, spec, manifest);

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
  const bridgeSecurityPatterns = [
    /randomBytes\(32\)/,
    /\/api\/session/,
    /timingSafeEqual\(actual, candidate\)/,
    /isTrustedHost\(request\.headers\.host\)/,
    /isTrustedBrowserRequest\(request\)/,
    /trustedWebOrigins\.has\(normalized\)/,
    /isJsonRequest\(request\)/,
    /x-yeelight-app-session/,
    /maxBodyBytes/,
    /maxConcurrent/,
  ];
  if (bridgeSecurityPatterns.some((pattern) => !pattern.test(bridgeSource))) throw new Error("Bridge 会话安全边界无效");
  validateBridgePolicies(bridgeSource);

  const requestClient = readText(root, "apps/web/src/runtime/request.ts");
  const requestClientPatterns = [
    /fetch\("\/api\/session"/,
    /fetch\("\/api\/actions\/"/,
    /"X-Yeelight-App-Session": token/,
    /response\.status === 401 \|\| response\.status === 403/,
  ];
  const directFetch = collectSourceFiles(path.join(root, "apps/web/src"))
    .filter((file) => path.normalize(file) !== path.normalize(path.join(root, "apps/web/src/runtime/request.ts")))
    .some((file) => /\bfetch\(/.test(fs.readFileSync(file, "utf8")));
  if (directFetch || requestClientPatterns.some((pattern) => !pattern.test(requestClient))) throw new Error("浏览器请求客户端安全边界无效");

  return { ok: true, modules: manifest.modules, cliVersion: lock.cli.version };
}

function validateGenerationPlan(spec, manifest) {
  const fields = [manifest.requestedModules, manifest.generatedModules, manifest.omittedModules];
  if (fields.every((value) => value === undefined)) return;
  if (!Array.isArray(manifest.requestedModules) || !Array.isArray(manifest.generatedModules) || !Array.isArray(manifest.omittedModules)) throw new Error("生成计划元数据不一致");
  const generated = spec.modules.map((module) => module.id);
  const omitted = manifest.omittedModules.map((item) => item?.moduleId).filter(Boolean);
  const requested = manifest.requestedModules;
  const unique = (items) => new Set(items).size === items.length;
  const same = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);
  const partition = [...manifest.generatedModules, ...omitted];
  if (!unique(requested) || !unique(manifest.generatedModules) || !unique(omitted) || !same(manifest.generatedModules, generated) || requested.some((item) => !partition.includes(item)) || partition.some((item) => !requested.includes(item)) || requested.length !== partition.length) {
    throw new Error("生成计划元数据不一致");
  }
  for (const moduleId of omitted) {
    const diagnostic = spec.diagnostics.some((item) => item?.moduleId === moduleId && ["module-omitted-unavailable", "module-explicitly-skipped"].includes(item.code));
    if (!diagnostic) throw new Error("生成计划元数据不一致");
  }
}

function validateToolchain(root, spec, manifest) {
  for (const file of ["package.json", "apps/web/package.json", "apps/bridge/package.json", "package-lock.json"]) {
    if (!fs.existsSync(path.join(root, file))) throw new Error(`生成工具链文件缺失: ${file}`);
  }
  const actualPackages = [readJSON(root, "package.json"), readJSON(root, "apps/web/package.json"), readJSON(root, "apps/bridge/package.json")];
  const expectedPackages = [packageJson(spec), webPackageJson(), bridgePackageJson()];
  if (!sameJSON(actualPackages, expectedPackages)) throw new Error("生成依赖矩阵与 Builder toolchain 不一致");
  if (!sameJSON(readJSON(root, "package-lock.json"), packageLockJson(spec))) throw new Error("生成 lockfile 与 Builder toolchain 不一致");
  if (manifest.schemaVersion !== 3 || !sameJSON(manifest.toolchain, generationToolchain()) || !sameJSON(manifest.runtime, generationRuntimeContract(spec.runtime.contractVersion))) {
    throw new Error("generation manifest 工具链契约无效");
  }
}

function validateThemeArtifacts(root, spec, lock, manifest) {
  const expected = compileThemeTokens(spec.theme, { inputSource: themeInputSourceFromProductSpec(spec) });
  if (!sameJSON(lock, expected.lock)) throw new Error("theme.lock 与 ProductSpec 主题解析结果不一致");
  const styles = readText(root, "apps/web/src/styles.css");
  const expectedStyles = stylesSource(spec, { themeCss: expected.css });
  if (styles !== expectedStyles) throw new Error("生成 CSS 与 theme.lock 不一致");
  const expectedManifest = { ...themeManifestFromLock(expected.lock), cssDigest: digestText(expectedStyles) };
  if (!sameJSON(manifest.theme, expectedManifest)) throw new Error("generation manifest 主题摘要无效");
}

function digestText(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sameJSON(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateBridgePolicies(source) {
  const required = [/const actionPolicies = new Map/, /if \(!policy\)/, /validateActionRequest\(policy, body\)/, /observeActionResponse\(/];
  if (required.some((pattern) => !pattern.test(source))) throw new Error("Bridge action policy 边界无效");
  const actions = new Map(parseMap(source, "privateActions"));
  const policies = new Map(parseMap(source, "actionPolicies"));
  if (policies.size !== actions.size) throw new Error("Bridge action policy 边界无效");
  for (const [actionId, intent] of actions) {
    const policy = policies.get(actionId);
    if (policy?.intent !== intent || !Array.isArray(policy.allowedHomeIds) || policy.allowedHomeIds.length === 0 || !Array.isArray(policy.branches) || policy.branches.length === 0) {
      throw new Error("Bridge action policy 边界无效");
    }
  }
}

function parseMap(source, name) {
  const match = source.match(new RegExp(`const ${name} = new Map\\((\\[[\\s\\S]*?\\])\\);`));
  if (!match) throw new Error("Bridge action policy 边界无效");
  try { return JSON.parse(match[1]); } catch { throw new Error("Bridge action policy 边界无效"); }
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

function collectSourceFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(file);
    return /\.(?:ts|tsx|js|jsx)$/.test(entry.name) ? [file] : [];
  });
}
