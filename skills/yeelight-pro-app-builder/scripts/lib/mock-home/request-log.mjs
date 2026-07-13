export function createMockRequestLog() {
  const entries = [];
  return {
    begin(request, body) {
      const entry = { method: request.method || "GET", path: request.url || "/", headers: publicHeaders(request.headers), body: redactValue(body), status: 500 };
      entries.push(entry);
      return entry;
    },
    complete(entry, status, body) {
      entry.status = status;
      entry.response = responseSummary(body);
    },
    snapshot() { return structuredClone(entries); },
    clear() { entries.length = 0; },
  };
}

function redactValue(value, key = "") {
  if (isSensitiveKey(key)) return "<redacted>";
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redactValue(child, childKey)]));
  if (typeof value === "string") return value.replace(/eyJ[A-Za-z0-9._~+/=-]+/g, "<jwt-redacted>");
  return value;
}

function isSensitiveKey(key) {
  return /(?:authorization|access.?token|refresh.?token|secret|credential|password)/i.test(String(key));
}

function publicHeaders(headers) {
  return {
    authPresent: Boolean(headers.authorization),
    clientId: headers["client-id"] || "",
    houseId: headers.houseid || headers["house-id"] || "",
    contentType: headers["content-type"] || "",
  };
}

function responseSummary(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { type: typeof body };
  return {
    success: typeof body.success === "boolean" ? body.success : undefined,
    code: body.code === undefined ? undefined : String(body.code),
    message: body.message === undefined ? undefined : String(body.message).slice(0, 240),
  };
}
