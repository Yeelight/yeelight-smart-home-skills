export function managementPreviewDiagnostic({ result, payload, subject, probeId }) {
  const failure = classifyFailure(result, payload);
  return {
    id: `management-preview:${bounded(subject.type)}:${bounded(subject.id)}:${bounded(probeId)}`,
    stage: "management-preview",
    reasonId: failure.reasonId,
    attempts: 1,
    retryable: false,
    ...(failure.businessCode ? { businessCode: failure.businessCode } : {}),
    object: { id: bounded(subject.id), name: bounded(subject.name), type: bounded(subject.type) },
    probeId: bounded(probeId),
    message: failure.message,
  };
}

function classifyFailure(result, payload) {
  const stderr = String(result?.stderr || "");
  const status = String(payload?.status || "").toLowerCase();
  const errorCode = String(payload?.error?.code || payload?.reason || "").toLowerCase();
  const businessCode = Number(payload?.code ?? payload?.error?.code);
  if (/timed?\s*out|timeout/i.test(stderr)) return failure("transport-timeout", "管理操作预览超时。");
  if (/econn|connection|network|fetch failed|socket/i.test(stderr)) return failure("transport-error", "无法连接管理操作预览服务。");
  if (["auth_required", "unauthorized", "forbidden"].includes(status) || [401, 403].includes(businessCode) || /auth|token|credential/.test(errorCode)) {
    return failure("authentication-required", "管理操作预览需要重新认证。");
  }
  if (/unsupported|not_supported/.test(errorCode)) return failure("unsupported-property", "当前对象不支持该管理操作。");
  if (payload === null) return failure("invalid-payload", "管理操作预览响应结构无效。");
  if (Number.isInteger(businessCode) && businessCode >= 500) return failure("upstream-business-error", "管理操作预览服务返回业务错误。", businessCode);
  if (result?.code !== 0 || status !== "success") return failure("cli-failure", "管理操作预览失败。", Number.isInteger(businessCode) ? businessCode : undefined);
  return failure("preview-mismatch", "管理操作预览与请求不一致。");
}

function failure(reasonId, message, businessCode) {
  return { reasonId, message, ...(businessCode ? { businessCode } : {}) };
}

function bounded(value) {
  return String(value || "").slice(0, 160);
}
