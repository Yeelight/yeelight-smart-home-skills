export function evaluateDevicePreview({ result, payload, expected, entity }) {
  const planned = payload?.result?.planned;
  const failure = classifyPreviewFailure(result, payload, planned, expected);
  if (!failure) return { proven: true, planned };
  return {
    proven: false,
    diagnostic: {
      id: `device-preview:${bounded(entity.id)}:${bounded(expected.property || expected.intent)}`,
      stage: "device-preview",
      reasonId: failure.reasonId,
      attempts: 1,
      retryable: false,
      ...(failure.businessCode ? { businessCode: failure.businessCode } : {}),
      entity: diagnosticEntity(entity),
      ...(expected.property ? { property: bounded(expected.property) } : {}),
      message: failure.message,
    },
  };
}

function classifyPreviewFailure(result, payload, planned, expected) {
  const stderr = String(result?.stderr || "");
  const status = String(payload?.status || "").toLowerCase();
  const errorCode = String(payload?.error?.code || payload?.reason || "").toLowerCase();
  const businessCode = Number(payload?.code ?? payload?.error?.code);
  if (/timed?\s*out|timeout/i.test(stderr)) return failure("transport-timeout", "设备控制预览超时。");
  if (/econn|connection|network|fetch failed|socket/i.test(stderr)) return failure("transport-error", "无法连接设备控制预览服务。");
  if (["auth_required", "unauthorized", "forbidden"].includes(status) || [401, 403].includes(businessCode) || /auth|token|credential/.test(errorCode)) {
    return failure("authentication-required", "设备控制预览需要重新认证。");
  }
  if (/unsupported|not_supported/.test(errorCode)) return failure("unsupported-property", "当前设备不支持该控制属性。");
  if (payload === null) return failure("invalid-payload", "设备控制预览响应结构无效。");
  if (Number.isInteger(businessCode) && businessCode >= 500) return failure("upstream-business-error", "设备控制预览服务返回业务错误。", businessCode);
  if (result?.code !== 0 || status !== "success") return failure("cli-failure", "设备控制预览失败。", Number.isInteger(businessCode) ? businessCode : undefined);
  const noWrite = payload?.result?.dryRun === true && payload?.result?.persistentWrites === false;
  const matches = planned?.intent === expected.intent
    && (!expected.property || planned?.property === expected.property)
    && (!("value" in expected) || Object.is(planned?.value, expected.value));
  return noWrite && matches ? null : failure("preview-mismatch", "设备控制预览与请求不一致。");
}

function failure(reasonId, message, businessCode) {
  return { reasonId, message, ...(businessCode ? { businessCode } : {}) };
}

function diagnosticEntity(entity) {
  return {
    id: bounded(entity.id),
    name: bounded(entity.name),
    family: bounded(entity.family),
    roomName: bounded(entity.roomName),
  };
}

function bounded(value) {
  return String(value || "").slice(0, 160);
}
