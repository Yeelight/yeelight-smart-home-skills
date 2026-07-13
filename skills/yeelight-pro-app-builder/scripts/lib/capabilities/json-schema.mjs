export function validateJSONSchema(schema, value, label = "value") {
  const errors = [];
  visit(schema, value, label, errors);
  if (errors.length > 0) throw new Error(`JSON schema validation failed: ${errors.join("; ")}`);
  return value;
}

function visit(schema, value, path, errors) {
  if (!schema || typeof schema !== "object") return;
  if (schema.type && !matchesType(schema.type, value)) {
    errors.push(`${path} must be ${schema.type}`);
    return;
  }
  if (schema.enum && !schema.enum.some((candidate) => isEqual(candidate, value))) errors.push(`${path} must be one of ${schema.enum.join(", ")}`);
  if (typeof value === "string" && schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path} must not be empty`);
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path} must contain at least ${schema.minItems} items`);
    if (schema.uniqueItems && new Set(value.map(stableKey)).size !== value.length) errors.push(`${path} must contain unique items`);
    if (schema.items) value.forEach((item, index) => visit(schema.items, item, `${path}[${index}]`, errors));
  }
  if (isObject(value)) {
    for (const key of schema.required || []) if (!(key in value)) errors.push(`${path}.${key} is required`);
    for (const [key, child] of Object.entries(schema.properties || {})) if (key in value) visit(child, value[key], `${path}.${key}`, errors);
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties || {}));
      for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${path}.${key} is not allowed`);
    }
  }
}

function matchesType(type, value) {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isObject(value);
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isEqual(left, right) {
  return stableKey(left) === stableKey(right);
}

function stableKey(value) {
  if (Array.isArray(value)) return `[${value.map(stableKey).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableKey(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
