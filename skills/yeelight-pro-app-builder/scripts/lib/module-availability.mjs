const alwaysAvailable = new Set([
  "home.lighting-summary", "room.lighting-control", "home.space-summary",
  "room.device-management", "installer.maintenance",
]);

const messages = {
  "device.curtain-control": "窗帘位置控制缺少 preview-only 能力证据",
  "device.switch-control": "开关回路控制缺少 preview-only 能力证据",
  "device.climate-control": "温控目标温度缺少 preview-only 能力证据",
  "sensor.environment": "传感器当前读数缺少 state.query 能力证据",
  "scene.launcher": "情景页面缺少列表读取能力证据",
  "automation.manager": "自动化页面缺少列表读取能力证据",
  "group.manager": "设备组页面缺少列表读取能力证据",
  "gateway.overview": "网关总览缺少完整只读能力证据",
  "panel.manager": "面板管理缺少完整读取能力证据",
};

export function evaluateModuleAvailability({ spec, snapshot = {}, operations = {} }) {
  return (spec?.modules || []).map(({ id: moduleId }) => evaluate(moduleId, snapshot, operations));
}

export function assertAvailableModules(availability) {
  const unavailable = availability.filter((item) => item.status !== "available");
  if (unavailable.length === 0) return;
  const details = unavailable.map((item) => {
    const objects = item.objects.map((object) => (object.name || object.id) + "[" + object.reasonId + (object.businessCode ? ":" + object.businessCode : "") + "]").join(", ");
    return item.moduleId + ": " + item.message + " (reason: " + item.reasonIds.join(",") + (objects ? "; objects: " + objects : "") + ")";
  });
  const remediation = [...new Set(unavailable.flatMap((item) => item.remediation.map((choice) => choice.flag)))];
  throw new Error(details.join("\n") + "\n安全选择: " + remediation.join(", "));
}

function evaluate(moduleId, snapshot, operations) {
  if (alwaysAvailable.has(moduleId)) return available(moduleId, []);
  const entities = Object.values(snapshot.entities || {});
  if (moduleId === "device.curtain-control") return fromControl(moduleId, entities, "curtain", (control) => control.intent === "device.property.set" && control.property === "targetPosition", "curtain-target-position-preview-missing");
  if (moduleId === "device.switch-control") return fromControl(moduleId, entities, "switch-relay", (control) => control.intent === "device.property.set" && (control.property === "sp" || /^(?:0|[1-6])-sp$/.test(control.property || "")), "switch-relay-preview-missing");
  if (moduleId === "device.climate-control") {
    return attachDiagnostics(fromControl(moduleId, entities, "climate", (control) => control.intent === "device.property.set" && control.property === "airConditionerTargetTemperature", "climate-target-temperature-preview-missing"), snapshot.diagnostics, "climate");
  }
  if (moduleId === "sensor.environment") {
    const proven = entities.filter((entity) => entity.family === "sensor" && entity.readIntent === "state.query");
    return proven.length ? available(moduleId, proven.map((entity) => "state.query:" + entity.id)) : unavailable(moduleId, ["sensor-state-query-missing"], ["state.query live-read"]);
  }
  if (["scene.launcher", "automation.manager", "group.manager"].includes(moduleId)) {
    return operations[moduleId]?.list?.enabled === true
      ? available(moduleId, [moduleId + ":list"])
      : unavailable(moduleId, [moduleId.split(".")[0] + "-list-read-missing"], ["list read-proven"]);
  }
  if (moduleId === "gateway.overview") return operationSuite(moduleId, operations, ["list", "detail", "stats", "thread", "relations", "diagnose"], Array.isArray(snapshot.gateways), "gateway-read-suite-incomplete");
  if (moduleId === "panel.manager") return operationSuite(moduleId, operations, ["list", "detail", "buttonType", "knobDetail"], Array.isArray(snapshot.panels) && Array.isArray(snapshot.knobs), "panel-read-suite-incomplete");
  return unavailable(moduleId, ["unknown-module"], []);
}

function operationSuite(moduleId, operations, required, hasData, reasonId) {
  const proven = required.filter((name) => operations[moduleId]?.[name]?.enabled);
  return proven.length === required.length && hasData ? available(moduleId, proven) : unavailable(moduleId, [reasonId], required);
}

function fromControl(moduleId, entities, family, predicate, reasonId) {
  const controls = entities.filter((entity) => entity.family === family).flatMap((entity) => (entity.controls || [])
    .filter((control) => control.evidence === "preview-only" && predicate(control))
    .map((control) => [control.intent, control.property || control.id, entity.id].join(":")));
  return controls.length ? available(moduleId, controls) : unavailable(moduleId, [reasonId], ["instance preview-only"]);
}

function attachDiagnostics(result, diagnostics = [], family) {
  if (result.status === "available") return result;
  const related = diagnostics.filter((item) => item?.entity?.family === family);
  return {
    ...result,
    reasonIds: [...new Set([...result.reasonIds, ...related.map((item) => item.reasonId)])],
    objects: related.map((item) => ({ ...item.entity, stage: item.stage, reasonId: item.reasonId, ...(item.businessCode ? { businessCode: item.businessCode } : {}) })),
  };
}

function available(moduleId, provenEvidence) {
  return { moduleId, status: "available", requiredEvidence: [], provenEvidence, reasonIds: [], objects: [], remediation: [], message: "" };
}

function unavailable(moduleId, reasonIds, requiredEvidence) {
  return {
    moduleId, status: "unavailable", requiredEvidence, provenEvidence: [], reasonIds, objects: [],
    remediation: [
      { id: "skip-modules", flag: "--skip-modules " + moduleId },
      { id: "allow-partial", flag: "--allow-partial" },
      { id: "mock-home", flag: "--mock-home reference-home" },
    ],
    message: messages[moduleId] || "模块 " + moduleId + " 缺少能力证据",
  };
}
