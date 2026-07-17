import { parseCapabilityJSON as parseJSON } from "./capability-inspector-groups.mjs";
import { managementPreviewDiagnostic } from "./capability-management-diagnostics.mjs";

export async function inspectKnobs({ spec, knobs, run }) {
  const inspected = [];
  const diagnostics = [];
  let configureProven = false;
  let resetProven = false;
  for (const knob of knobs) {
    const result = await inspectKnob({ spec, knob, run, diagnostics });
    inspected.push(result);
    configureProven ||= result.editable;
    resetProven ||= result.actions.some((action) => action.resettable);
  }
  return {
    knobs: inspected,
    diagnostics,
    intents: {
      ...(configureProven ? { "knob.configure": { status: "proven", evidence: "preview-only" } } : {}),
      ...(resetProven ? { "knob.reset": { status: "proven", evidence: "preview-only" } } : {}),
    },
  };
}

async function inspectKnob({ spec, knob, run, diagnostics }) {
  const actions = (knob.actions || []).map((action) => ({ ...action, resettable: false }));
  const terminal = (unsupportedReason, extra = {}) => ({ ...knob, ...extra, actions, editable: false, unsupportedReason });
  if (!knob.detailComplete) return terminal(knob.unsupportedReason || "当前旋钮缺少完整配置，暂时无法编辑。");
  if (knob.online === false) return terminal("当前旋钮离线，恢复在线后可重新验证配置能力。");

  const access = await inspectKnobAccess(spec, knob, run);
  if (access === "version-mismatch") return terminal("当前运行版本无法验证此旋钮的配置能力。");
  if (access !== "write") return terminal(access === "read" ? "当前旋钮仅支持查看。" : "暂时无法验证此旋钮的配置能力。");

  const houseId = spec.scope?.homeIds?.[0] || "";
  const configureRows = actions.map(editableRow);
  const configure = await preview(run, {
    contractVersion: "1.0",
    requestId: `capability-knob-configure-${knob.id}`,
    locale: "zh-CN",
    utterance: `预览保存${knob.name}配置`,
    intent: "knob.configure",
    targets: [{ entityType: "device", id: knob.id }],
    parameters: { houseId, deviceId: knob.id, actions: configureRows },
  });
  const configuredRows = configure.payload?.result?.preview?.payloadPreview?.actions;
  const editable = configure.proven && String(configure.payload?.result?.preview?.payloadPreview?.deviceId || "") === knob.id
    && sameKnobRows(configuredRows, configureRows);
  if (!editable) diagnostics.push(managementPreviewDiagnostic({ result: configure.result, payload: configure.payload, subject: { id: knob.id, name: knob.name, type: "knob" }, probeId: "knob.configure" }));

  const inspectedActions = [];
  for (const action of actions) {
    const reset = await preview(run, {
      contractVersion: "1.0",
      requestId: `capability-knob-reset-${knob.id}-${action.index}`,
      locale: "zh-CN",
      utterance: `预览重置${knob.name}第${action.index}路`,
      intent: "knob.reset",
      targets: [{ entityType: "device", id: knob.id }],
      parameters: { houseId, deviceId: knob.id, index: action.index },
    });
    const payloadPreview = reset.payload?.result?.preview?.payloadPreview;
    const resettable = reset.proven && String(payloadPreview?.deviceId || "") === knob.id && Number(payloadPreview?.index) === action.index;
    if (!resettable) diagnostics.push(managementPreviewDiagnostic({ result: reset.result, payload: reset.payload, subject: { id: knob.id, name: knob.name, type: "knob" }, probeId: `knob.reset:${action.index}` }));
    inspectedActions.push({
      ...action,
      resettable,
    });
  }

  const { unsupportedReason: _unsupportedReason, ...base } = knob;
  return {
    ...base,
    actions: inspectedActions,
    editable,
    ...(editable ? { evidence: "preview-only" } : { unsupportedReason: "当前旋钮配置预览未通过，暂时无法编辑。" }),
  };
}

async function inspectKnobAccess(spec, knob, run) {
  const houseId = spec.scope?.homeIds?.[0] || "";
  const result = await run(["device", "capabilities", "--device-id", knob.id, ...(houseId ? ["--house-id", houseId] : []), "--json"]);
  const payload = parseJSON(result.stdout);
  if (result.code !== 0 || payload?.status !== "success") {
    const detail = `${result.stdout || ""}\n${result.stderr || ""}`;
    return /schema.*requested device|requested device.*schema/i.test(detail) ? "version-mismatch" : "unknown";
  }
  if (payload?.result?.schemaStatus === "not_connected") return "version-mismatch";
  const schema = payload?.result?.deviceSchema || payload?.result?.data?.deviceSchema;
  const properties = [
    ...(Array.isArray(schema?.properties) ? schema.properties : []),
    ...(Array.isArray(schema?.components) ? schema.components.flatMap((component) => Array.isArray(component?.properties) ? component.properties : []) : []),
  ];
  const access = properties.map((property) => String(property?.access || "").toLowerCase()).filter(Boolean);
  if (access.some((value) => value.includes("write"))) return "write";
  return access.length > 0 ? "read" : "unknown";
}

async function preview(run, request) {
  const result = await run(["invoke", "--stdin", "--preview-only"], { stdin: JSON.stringify(request) });
  const payload = parseJSON(result.stdout);
  const previewPayload = payload?.result?.preview;
  const noWrite = payload?.result?.persistentWrites === false || (
    payload?.traceId === "invoke-preview" && Array.isArray(payload?.warnings) && payload.warnings.includes("dry_run_no_cloud_write")
  );
  return { result, payload, proven: result.code === 0 && payload?.status === "success" && payload?.result?.dryRun === true && noWrite && previewPayload?.intent === request.intent };
}

function editableRow(action) {
  if (action.currentRow && typeof action.currentRow === "object" && !Array.isArray(action.currentRow)) return structuredClone(action.currentRow);
  const { currentRow: _currentRow, resettable: _resettable, editable: _editable, evidence: _evidence, ...row } = action;
  return structuredClone(row);
}

function sameKnobRows(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  return expected.every((row, index) => String(actual[index]?.id || "") === String(row.id || "") && Number(actual[index]?.index) === Number(row.index));
}
