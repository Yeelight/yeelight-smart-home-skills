export async function inspectDeviceState(spec, entity, run) {
  const houseId = spec.scope?.homeIds?.[0] || entity.houseId || "";
  const args = ["device", "state", "--device-id", entity.id, ...(houseId ? ["--house-id", houseId] : []), "--json"];
  for (let attempts = 1; attempts <= 2; attempts += 1) {
    const result = await run(args);
    const payload = parseJSON(result.stdout);
    const state = payload?.result?.properties;
    const skippedPropertyCount = Array.isArray(payload?.result?.skippedProperties) ? payload.result.skippedProperties.length : 0;
    if (result.code === 0 && payload?.status === "success" && state && typeof state === "object" && !Array.isArray(state)
      && (Object.keys(state).length > 0 || skippedPropertyCount === 0)) return { proven: true, state };
    const failure = classifyFailure(result, payload, state);
    if (failure.retryable && attempts === 1) continue;
    return {
      proven: false,
      state: {},
      diagnostic: {
        id: `device-state:${entity.id}`,
        stage: "device-state",
        reasonId: failure.reasonId,
        attempts,
        retryable: failure.retryable,
        ...(failure.businessCode ? { businessCode: failure.businessCode } : {}),
        ...(skippedPropertyCount > 0 ? { skippedPropertyCount } : {}),
        entity: diagnosticEntity(entity),
        message: failure.message,
      },
    };
  }
}

function classifyFailure(result, payload, state) {
  const stderr = String(result?.stderr || "");
  const status = String(payload?.status || "").toLowerCase();
  const errorCode = String(payload?.error?.code || payload?.reason || "").toLowerCase();
  const businessCode = Number(payload?.code ?? payload?.error?.code);
  if (/timed?\s*out|timeout/i.test(stderr)) return failure("transport-timeout", true, "设备状态读取超时。");
  if (/econn|connection|network|fetch failed|socket/i.test(stderr)) return failure("transport-error", true, "无法连接设备状态服务。");
  if (["auth_required", "unauthorized", "forbidden"].includes(status) || [401, 403].includes(businessCode) || /auth|token|credential/.test(errorCode)) {
    return failure("authentication-required", false, "设备状态读取需要重新认证。");
  }
  if (/unsupported|not_supported/.test(errorCode)) return failure("unsupported-property", false, "当前设备不支持该状态读取。");
  if (result?.code === 0 && status === "success" && state && typeof state === "object" && !Array.isArray(state)
    && Object.keys(state).length === 0 && Array.isArray(payload?.result?.skippedProperties) && payload.result.skippedProperties.length > 0) {
    return failure("all-properties-unreadable", false, "设备状态属性均不可读。");
  }
  if (payload === null || (result?.code === 0 && status === "success" && (!state || typeof state !== "object" || Array.isArray(state)))) {
    return failure("invalid-payload", false, "设备状态响应结构无效。");
  }
  if (Number.isInteger(businessCode) && businessCode >= 500) return failure("upstream-business-error", true, "设备状态服务返回业务错误。", businessCode);
  return failure("cli-failure", false, "设备状态读取失败。", Number.isInteger(businessCode) ? businessCode : undefined);
}

function failure(reasonId, retryable, message, businessCode) {
  return { reasonId, retryable, message, ...(businessCode ? { businessCode } : {}) };
}

function diagnosticEntity(entity) {
  const bounded = (value) => String(value || "").slice(0, 160);
  return { id: bounded(entity.id), name: bounded(entity.name), family: bounded(entity.family), roomName: bounded(entity.roomName) };
}

function parseJSON(value) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return null;
  }
}
