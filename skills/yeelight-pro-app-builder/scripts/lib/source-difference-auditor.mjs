import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { moduleDirectory } from "./compiler.mjs";
import { resolvePageContributions } from "./templates/page-contributions.mjs";

const requiredProfiles = ["room-control", "daily-home", "whole-home", "installer"];

export function inspectGeneratedProduct(appRoot, profileId) {
  const spec = readJSON(path.join(appRoot, "product.spec.json"));
  const selected = spec.modules.map(({ id }) => id);
  const templates = Object.fromEntries(selected.map((moduleId) => [moduleId, { directory: moduleDirectory(moduleId) }]));
  const contributions = resolvePageContributions(selected, templates);
  const bridgeSource = fs.readFileSync(path.join(appRoot, "apps/bridge/src/index.mjs"), "utf8");
  const moduleRoot = path.join(appRoot, "apps/web/src/modules");
  const runtimeRoot = path.join(appRoot, "apps/web/src/runtime");
  return {
    profileId,
    product: { title: spec.product.title, target: spec.target, theme: spec.theme },
    modules: selected,
    routes: unique(contributions.map(({ route }) => route)),
    components: unique(contributions.map(({ component }) => component)),
    moduleFiles: fileManifest(moduleRoot, appRoot),
    runtimeFiles: fileManifest(runtimeRoot, appRoot),
    actions: parseBridgeRows(bridgeSource, "privateActions", "Map").map(([actionId, intent]) => ({ actionId, intent })),
    policies: parseBridgeRows(bridgeSource, "actionPolicies", "Map").map(([actionId, policy]) => ({
      actionId,
      intent: policy.intent,
      risk: policy.risk,
      resourceType: policy.resourceType || "home",
      allowedHomeCount: policy.allowedHomeIds?.length || 0,
      resourceCount: policy.resourceIds?.length || 0,
      branchCount: policy.branches?.length || 0,
      requiredParameters: unique((policy.branches || []).flatMap((branch) => branch.required || [])),
    })),
    allowlist: parseBridgeRows(bridgeSource, "allowedIntents", "Set"),
  };
}

export function auditGeneratedProductDifferences(products) {
  const byId = new Map(products.map((product) => [product.profileId, product]));
  const checks = [];
  check(checks, "required-profiles-present", requiredProfiles.every((id) => byId.has(id)), requiredProfiles.filter((id) => !byId.has(id)));
  check(checks, "profile-ids-unique", byId.size === products.length, products.map(({ profileId }) => profileId));
  for (const field of ["modules", "routes", "moduleFiles", "actions", "policies", "allowlist"]) {
    const signatures = products.map((product) => digest(product[field]));
    check(checks, `${field}-materially-different`, new Set(signatures).size === products.length, products.map((product, index) => ({ profileId: product.profileId, signature: signatures[index] })));
  }
  if (byId.has("room-control") && byId.has("whole-home")) {
    check(checks, "room-control-is-scoped", byId.get("room-control").modules.length < byId.get("whole-home").modules.length, {
      roomControl: byId.get("room-control").modules,
      wholeHome: byId.get("whole-home").modules,
    });
  }
  if (byId.has("installer")) {
    check(checks, "installer-has-maintenance", byId.get("installer").modules.includes("installer.maintenance") && byId.get("installer").routes.includes("maintenance"), byId.get("installer"));
  }
  return { schemaVersion: 1, status: checks.every(({ status }) => status === "passed") ? "passed" : "failed", checks, products };
}

function parseBridgeRows(source, name, constructorName) {
  const match = source.match(new RegExp(`const ${name} = new ${constructorName}\\((\\[[\\s\\S]*?\\])\\);`));
  if (!match) throw new Error(`生成 Bridge 缺少 ${name}`);
  return JSON.parse(match[1]);
}

function fileManifest(root, base) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort()
    .map((file) => ({ path: path.relative(base, file).split(path.sep).join("/"), sha256: digest(fs.readFileSync(file)) }));
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function digest(value) {
  const serialized = value === undefined ? "undefined" : JSON.stringify(value);
  return crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : serialized).digest("hex");
}

function unique(values) {
  return [...new Set(values)];
}

function check(checks, id, passed, detail) {
  checks.push({ id, status: passed ? "passed" : "failed", detail: structuredClone(detail) });
}
