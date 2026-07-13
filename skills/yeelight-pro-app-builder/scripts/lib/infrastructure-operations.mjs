const definitions = {
  "gateway.overview": {
    list: operation("gateway.read", "gateway.list", "read"),
    detail: operation("gateway.detail.read", "gateway.detail.get", "read"),
    stats: operation("gateway.stats.read", "gateway.stats.list", "read"),
    thread: operation("gateway.thread.read", "gateway.thread.get", "read"),
    relations: operation("gateway.scene-relations.read", "gateway.scene_relation.list", "read"),
    diagnose: operation("gateway.diagnose.read", "diagnose.gateway", "read"),
    configure: operation("gateway.configure", "gateway.configure", "write"),
    delete: operation("gateway.delete", "gateway.delete", "write"),
  },
  "panel.manager": {
    list: operation("panel.list.read", "panel.list", "read"),
    detail: operation("panel.read", "panel.get", "read"),
    buttonType: operation("panel.button-type.read", "panel.button.type.get", "read"),
    configure: operation("panel.button.write", "panel.button.configure", "write"),
    eventUpdate: operation("panel.button-event.update", "panel.button_event.update", "write"),
    eventBatch: operation("panel.button-event.batch-update", "panel.button_event.batch_update", "write"),
    eventReset: operation("panel.button-event.reset", "panel.button_event.reset", "write"),
    click: operation("panel.click", "panel.click", "write"),
    knobDetail: operation("knob.read", "knob.get", "read"),
    knobConfigure: operation("knob.configure", "knob.configure", "write"),
    knobReset: operation("knob.reset", "knob.reset", "write"),
  },
};

export function resolveInfrastructureOperations(selected, snapshot) {
  return Object.fromEntries(selected.filter((moduleId) => definitions[moduleId]).map((moduleId) => [
    moduleId,
    Object.fromEntries(Object.entries(definitions[moduleId]).map(([name, definition]) => [
      name,
      resolveOperation(definition, snapshot),
    ])),
  ]));
}

export function prepareInfrastructureOperations(operations, spec) {
  const next = structuredClone(operations);
  const gateway = next["gateway.overview"];
  if (gateway) {
    if (!gateway.detail.enabled) disable(gateway.configure, "当前家庭暂不支持安全读取并保存网关详情。", "readback-unavailable");
    const installer = spec.modules.find((module) => module.id === "gateway.overview")?.options?.profile === "installer";
    if (!installer) disable(gateway.delete, "删除网关仅在安装维护应用中提供。", "installer-only");
    else if (gateway.delete.status !== "write-proven") disable(gateway.delete, "删除网关需要通过完整写入与恢复验证后才可使用。", "write-proof-required");
  }
  const panel = next["panel.manager"];
  if (panel) {
    if (!panel.detail.enabled) {
      for (const name of ["configure", "eventUpdate", "eventBatch", "eventReset"]) disable(panel[name], "当前家庭暂不支持安全读取并保存面板详情。", "readback-unavailable");
    }
    if (!panel.knobDetail.enabled) {
      for (const name of ["knobConfigure", "knobReset"]) disable(panel[name], "当前家庭暂不支持安全读取并保存旋钮详情。", "readback-unavailable");
    }
    const installer = spec.modules.find((module) => module.id === "panel.manager")?.options?.profile === "installer";
    if (!installer) disable(panel.click, "面板测试仅在安装维护应用中提供。", "installer-only");
  }
  return next;
}

export function projectInfrastructureCapabilityProfile(selected, profile) {
  if (!profile?.capabilities) return {};
  const ids = new Set(selected.flatMap((moduleId) => Object.values(definitions[moduleId] || {}).map((item) => item.capabilityId)));
  return Object.fromEntries(profile.capabilities
    .filter((item) => ids.has(item.capabilityId))
    .map((item) => [item.capabilityId, { intent: item.intent, status: item.status }]));
}

function operation(capabilityId, intent, mode) {
  return { capabilityId, intent, mode, generated: true };
}

function resolveOperation(definition, snapshot) {
  const capability = snapshot?.capabilities?.[definition.capabilityId];
  const legacy = snapshot?.intents?.[definition.intent];
  const status = capability?.status || legacyStatus(legacy, definition.mode);
  const enabled = definition.mode === "read"
    ? ["read-proven", "proven"].includes(status)
    : ["preview-proven", "write-proven", "proven"].includes(status);
  const terminal = enabled ? "available" : terminalFor(status);
  return { ...definition, status: status || "unsupported", enabled, terminal, userMessage: messageFor(terminal) };
}

function legacyStatus(intent, mode) {
  if (intent?.status !== "proven") return intent?.status || "";
  if (mode === "read") return intent.evidence === "live-read" ? "read-proven" : "proven";
  return intent.evidence === "preview-only" ? "preview-proven" : "proven";
}

function disable(operation, userMessage, terminal) {
  if (!operation) return;
  operation.enabled = false;
  operation.terminal = terminal;
  operation.userMessage = userMessage;
}

function terminalFor(status) {
  if (status === "version-mismatch") return "version-mismatch";
  if (status === "read-only") return "read-only";
  return "unsupported";
}

function messageFor(terminal) {
  if (terminal === "available") return "";
  if (terminal === "version-mismatch") return "当前运行环境版本暂不支持此操作。";
  if (terminal === "read-only") return "当前家庭仅支持查看，暂不能修改。";
  return "当前家庭暂不支持此操作。";
}
