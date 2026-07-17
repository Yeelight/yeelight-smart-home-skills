const definitions = {
  "scene.launcher": {
    list: operation("scene.read", "scene.list", "read", true),
    detail: operation("scene.detail.read", "scene.detail.get", "read", true),
    create: operation("scene.create", "scene.create", "write", true),
    update: operation("scene.update", "scene.update", "write", true),
    test: operation("scene.test", "scene.test", "write", true),
    execute: operation("scene.execute", "scene.execute", "write", true),
    delete: operation("scene.delete", "scene.delete", "write", true),
  },
  "automation.manager": {
    list: operation("automation.read", "automation.list", "read", true),
    detail: operation("automation.detail.read", "automation.detail.get", "read", true),
    supported: operation("automation.supported.read", "automation.supported.list", "read", true),
    supportedV2: operation("automation.supported.v2.read", "automation.supported.v2.list", "read", true),
    create: operation("automation.create", "automation.create", "write", true),
    update: operation("automation.update", "automation.update", "write", true),
    enable: operation("automation.status.write", "automation.enable", "write", true),
    disable: operation("automation.status.write", "automation.disable", "write", true),
    delete: operation("automation.delete", "automation.delete", "write", true),
  },
  "group.manager": {
    list: operation("group.read", "group.list", "read", true),
    detail: operation("group.detail.read", "group.detail.get", "read", true),
    create: operation("group.create", "group.create", "write", true),
    update: operation("group.update", "group.update", "write", true),
    members: operation("group.members.write", "group.members.update", "write", true),
    delete: operation("group.delete", "group.delete", "write", true),
  },
};

export function resolveManagementOperations(modules, snapshot) {
  return Object.fromEntries(normalizeModules(modules).filter(({ id }) => definitions[id]).map((module) => [
    module.id,
    Object.fromEntries(Object.entries(definitionsFor(module)).map(([name, definition]) => [
      name,
      resolveOperation(definition, snapshot),
    ])),
  ]));
}

export function generatedManagementIntents(operations) {
  return Object.fromEntries(Object.entries(operations).map(([moduleId, moduleOperations]) => [
    moduleId,
    Object.values(moduleOperations)
      .filter((item) => item?.generated && item.enabled)
      .map((item) => item.intent),
  ]));
}

export function prepareGeneratedManagementOperations(operations) {
  const next = structuredClone(operations);
  const scene = next["scene.launcher"];
  if (scene?.detail && !scene.detail.enabled) {
    const messages = {
      create: "当前家庭暂不支持安全读取并新建情景。",
      update: "当前家庭暂不支持安全读取并保存情景详情。",
      test: "当前家庭暂不支持安全读取并测试情景。",
      delete: "当前家庭暂不支持安全读取并删除情景。",
    };
    for (const [name, message] of Object.entries(messages)) {
      if (scene[name].enabled) disable(scene[name], message);
    }
  }
  const group = next["group.manager"];
  if (group && !group.detail.enabled) {
    for (const name of ["update", "members", "delete"]) {
      if (!group[name].enabled) continue;
      group[name].enabled = false;
      group[name].terminal = "readback-unavailable";
      group[name].userMessage = name === "members" ? "当前家庭暂不支持安全校验成员变更。" : "当前家庭暂不支持安全校验此设备组操作。";
    }
  }
  const automation = next["automation.manager"];
  const registryReadable = automation?.supported.enabled || automation?.supportedV2.enabled;
  if (automation?.create.enabled && !registryReadable) disable(automation.create, "当前家庭暂不支持安全读取自动化条件能力。");
  if (automation?.update.enabled && (!automation.detail.enabled || !registryReadable)) disable(automation.update, "当前家庭暂不支持安全读取并保存自动化详情。");
  if (automation?.delete.enabled && !automation.detail.enabled) disable(automation.delete, "当前家庭暂不支持安全读取并删除自动化。");
  return next;
}

function disable(operation, userMessage) {
  operation.enabled = false;
  operation.terminal = "readback-unavailable";
  operation.userMessage = userMessage;
}

export function projectManagementCapabilityProfile(modules, profile) {
  if (!profile?.capabilities) return {};
  const ids = new Set(normalizeModules(modules).flatMap((module) => Object.values(definitionsFor(module)).map((item) => item.capabilityId)));
  return Object.fromEntries(profile.capabilities
    .filter((item) => ids.has(item.capabilityId))
    .map((item) => [item.capabilityId, { intent: item.intent, status: item.status }]));
}

function normalizeModules(modules = []) {
  return modules.map((module) => typeof module === "string" ? { id: module, options: {} } : { ...module, options: module.options || {} });
}

function definitionsFor(module) {
  const moduleDefinitions = definitions[module.id] || {};
  if (module.id !== "scene.launcher" || module.options.management === true) return moduleDefinitions;
  return { list: moduleDefinitions.list, execute: moduleDefinitions.execute };
}

function operation(capabilityId, intent, mode, generated = false) {
  return { capabilityId, intent, mode, generated };
}

function resolveOperation(definition, snapshot) {
  const capability = snapshot?.capabilities?.[definition.capabilityId];
  const intent = snapshot?.intents?.[definition.intent];
  const status = capability?.status || legacyStatus(intent, definition.mode);
  const enabled = definition.mode === "read"
    ? ["read-proven", "proven"].includes(status)
    : ["preview-proven", "write-proven", "proven"].includes(status);
  const terminal = enabled ? "available" : terminalFor(status);
  return {
    ...definition,
    status: status || "unsupported",
    enabled,
    terminal,
    userMessage: messageFor(terminal),
  };
}

function legacyStatus(intent, mode) {
  if (intent?.status !== "proven") return intent?.status || "";
  if (mode === "read") return intent.evidence === "live-read" ? "read-proven" : "proven";
  return intent.evidence === "preview-only" ? "preview-proven" : "proven";
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
