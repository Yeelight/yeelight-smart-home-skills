import { loadCapabilityCatalog } from "./capabilities/catalog.mjs";
import { compilePolicyDefinition } from "./action-policy-contracts.mjs";

const bodyKeys = new Set(["locale", "utterance", "targets", "options", "parameters"]);

export function compileActionPolicies({ privateActions, spec, snapshot, catalog = loadCapabilityCatalog() }) {
  const allowedHomeIds = [...new Set((spec?.scope?.homeIds || []).map(String))].sort();
  if (allowedHomeIds.length === 0) throw new Error("action policy requires a home scope");
  return privateActions.map(({ actionId, intent }) => ({
    actionId,
    intent,
    allowedHomeIds,
    ...compilePolicyDefinition(intent, snapshot, catalog),
  }));
}

export function validateActionRequest(policy, request) {
  if (!isObject(policy) || !isObject(request)) return { ok: false, reason: "invalid_request" };
  if (Object.keys(request).some((key) => !bodyKeys.has(key))) return { ok: false, reason: "unknown_body_field" };
  if (request.locale !== undefined && (typeof request.locale !== "string" || request.locale.length > 32)) return { ok: false, reason: "invalid_locale" };
  if (request.utterance !== undefined && (typeof request.utterance !== "string" || request.utterance.length > 256)) return { ok: false, reason: "invalid_utterance" };
  if (!isObject(request.parameters)) return { ok: false, reason: "invalid_parameters" };
  if (request.options !== undefined && !isObject(request.options)) return { ok: false, reason: "invalid_options" };
  if (request.targets !== undefined && !Array.isArray(request.targets)) return { ok: false, reason: "invalid_targets" };
  const normalized = { ...request, options: request.options || {}, targets: request.targets || [] };
  const homeId = String(normalized.parameters.houseId || "");
  if (!policy.allowedHomeIds?.includes(homeId)) return { ok: false, reason: "home_scope" };
  const branch = (policy.branches || []).find((candidate) => branchMatches(candidate, normalized));
  return branch ? { ok: true, branch } : { ok: false, reason: "policy_branch" };
}

export function observeActionResponse(policies, sourcePolicy, response) {
  if (!Array.isArray(policies) || !isObject(sourcePolicy) || !isObject(response) || !["success", "partial"].includes(String(response.status || ""))) return [];
  const resourceType = sourcePolicy.resourceType;
  if (!resourceType) return [];
  const observed = collectObservedIds(response, resourceType, sourcePolicy.intent.endsWith(".create"));
  if (observed.length === 0) return [];
  for (const policy of policies) {
    if (policy.resourceType !== resourceType) continue;
    policy.resourceIds = mergeIds(policy.resourceIds, observed);
    for (const branch of policy.branches || []) {
      if (!branch.resourceIdParameter) continue;
      branch.targetIds = mergeIds(branch.targetIds, observed);
      const schema = branch.values?.[branch.resourceIdParameter];
      if (schema) schema.enum = mergeIds(schema.enum, observed);
    }
  }
  return observed;
}

export function actionPolicyRuntimeSource() {
  return `const bodyKeys = new Set(["locale", "utterance", "targets", "options", "parameters"]);
${validateActionRequest.toString()}
${observeActionResponse.toString()}
${collectObservedIds.toString()}
${walkObserved.toString()}
${mergeIds.toString()}
${branchMatches.toString()}
${matchesValue.toString()}
${safeJson.toString()}
${isObject.toString()}
${sameValue.toString()}
`;
}

function collectObservedIds(response, resourceType, allowEntityId) {
  const values = new Set();
  walkObserved(response, resourceType, allowEntityId, "", values);
  return [...values].sort();
}

function walkObserved(value, resourceType, allowEntityId, parentKey, output) {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (parentKey === `${resourceType}s` && isObject(item) && item.id) output.add(String(item.id));
      walkObserved(item, resourceType, allowEntityId, parentKey, output);
    }
    return;
  }
  if (!isObject(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (key === `${resourceType}Id` && (typeof item === "string" || typeof item === "number")) output.add(String(item));
    if (allowEntityId && key === "entityId" && (typeof item === "string" || typeof item === "number")) output.add(String(item));
    walkObserved(item, resourceType, allowEntityId, key, output);
  }
}

function mergeIds(left, right) {
  return [...new Set([...(left || []), ...(right || [])].map(String))].sort();
}

function branchMatches(branch, request) {
  const parameters = request.parameters;
  const options = request.options;
  if (Object.keys(parameters).some((key) => !branch.parameterKeys.includes(key))) return false;
  if (Object.keys(options).some((key) => !(branch.optionKeys || []).includes(key))) return false;
  if ((branch.required || []).some((key) => !(key in parameters))) return false;
  if (Object.entries(branch.const || {}).some(([key, value]) => !sameValue(parameters[key], value))) return false;
  if (Object.entries(branch.values || {}).some(([key, schema]) => key in parameters && !matchesValue(schema, parameters[key]))) return false;
  if (Object.entries(branch.optionValues || {}).some(([key, schema]) => key in options && !matchesValue(schema, options[key]))) return false;
  if (request.targets.length === 0) return true;
  if (!branch.targetType) return false;
  return request.targets.every((target) => isObject(target) && target.entityType === branch.targetType && branch.targetIds.includes(String(target.id || "")));
}

function matchesValue(schema, value, depth = 0) {
  if (!isObject(schema) || depth > 8) return false;
  if (schema.oneOf) return schema.oneOf.some((item) => matchesValue(item, value, depth + 1));
  if (schema.const !== undefined && !sameValue(schema.const, value)) return false;
  if (schema.type === "never") return false;
  if (schema.type === "json") return safeJson(value, depth + 1);
  if (schema.type === "integer" && !Number.isInteger(value)) return false;
  if (schema.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) return false;
  if (schema.type === "boolean" && typeof value !== "boolean") return false;
  if (schema.type === "string" && typeof value !== "string") return false;
  if (schema.type === "array") {
    if (!Array.isArray(value)) return false;
    if (schema.minItems !== undefined && value.length < schema.minItems) return false;
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return false;
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) return false;
    if (schema.items && value.some((item) => !matchesValue(schema.items, item, depth + 1))) return false;
  }
  if (schema.type === "object") {
    if (!isObject(value)) return false;
    if ((schema.required || []).some((key) => !(key in value))) return false;
    if (schema.additionalProperties === false && Object.keys(value).some((key) => !(schema.allowedKeys || []).includes(key))) return false;
    if (Object.entries(schema.properties || {}).some(([key, item]) => key in value && !matchesValue(item, value[key], depth + 1))) return false;
  }
  if (schema.minimum !== undefined && value < schema.minimum) return false;
  if (schema.maximum !== undefined && value > schema.maximum) return false;
  if (schema.minLength !== undefined && value.length < schema.minLength) return false;
  if (schema.maxLength !== undefined && value.length > schema.maxLength) return false;
  if (schema.enum && !schema.enum.some((item) => sameValue(item, value))) return false;
  return true;
}

function safeJson(value, depth = 0) {
  if (depth > 8) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= 2000;
  if (Array.isArray(value)) return value.length <= 100 && value.every((item) => safeJson(item, depth + 1));
  return isObject(value) && Object.keys(value).length <= 100 && Object.entries(value).every(([key, item]) => key.length <= 120 && safeJson(item, depth + 1));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
