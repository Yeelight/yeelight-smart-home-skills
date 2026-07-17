import { managementPreviewDiagnostic } from "./capability-management-diagnostics.mjs";
import { parseCapabilityJSON as parseJSON } from "./capability-inspector-groups.mjs";

export async function inspectPanelButtonAliases(spec, panels, run, diagnostics) {
  const houseId = spec.scope?.homeIds?.[0] || "";
  const inspected = [];
  for (const panel of panels) {
    const buttons = [];
    for (const button of panel.buttons) {
      const request = {
        contractVersion: "1.0",
        requestId: `capability-panel-${panel.id}-${button.id}`,
        locale: "zh-CN",
        utterance: `预览修改${panel.name}${button.name}别名`,
        intent: "panel.button.configure",
        targets: [{ entityType: "device", id: panel.id }],
        parameters: { houseId, deviceId: panel.id, buttons: [{ id: button.id, alias: button.alias }] },
      };
      const execution = await run(["invoke", "--stdin", "--preview-only"], { stdin: JSON.stringify(request) });
      const payload = parseJSON(execution.stdout);
      const preview = payload?.result?.preview;
      const rows = preview?.payloadPreview?.buttons;
      const proven = execution.code === 0 && payload?.status === "success" && payload?.result?.dryRun === true
        && payload?.warnings?.includes("dry_run_no_cloud_write") && preview?.intent === request.intent
        && String(preview?.payloadPreview?.deviceId || "") === panel.id && Array.isArray(rows)
        && String(rows[0]?.id || "") === button.id;
      if (!proven) diagnostics.push(managementPreviewDiagnostic({
        result: execution,
        payload,
        subject: { id: panel.id, name: panel.name, type: "panel" },
        probeId: `panel.button.configure:${button.id}`,
      }));
      buttons.push({ ...button, editable: proven, ...(proven ? { evidence: "preview-only" } : {}) });
    }
    inspected.push({ ...panel, buttons, editable: buttons.length > 0 && buttons.every((button) => button.editable) });
  }
  return inspected;
}

export async function inspectAutomationStatusActions(spec, automations, run, diagnostics) {
  const houseId = spec.scope?.homeIds?.[0] || "";
  const inspected = [];
  for (const automation of automations) {
    const actions = [];
    for (const intent of ["automation.enable", "automation.disable"]) {
      const request = {
        contractVersion: "1.0",
        requestId: `capability-${intent}-${automation.id}`,
        locale: "zh-CN",
        utterance: `${intent.endsWith("enable") ? "启用" : "停用"}自动化${automation.name}`,
        intent,
        targets: [{ entityType: "automation", id: automation.id }],
        parameters: { houseId, automationId: automation.id },
      };
      const result = await run(["invoke", "--stdin", "--preview-only"], { stdin: JSON.stringify(request) });
      const payload = parseJSON(result.stdout);
      const planned = payload?.result?.planned || payload?.result?.preview;
      const plannedAutomationId = planned?.automationId || planned?.payloadPreview?.automationId;
      const noWrite = payload?.result?.persistentWrites === false || (
        payload?.traceId === "invoke-preview" && Array.isArray(payload?.warnings) && payload.warnings.includes("dry_run_no_cloud_write")
      );
      const proven = result.code === 0 && payload?.status === "success" && payload?.result?.dryRun === true
        && noWrite && planned?.intent === intent && String(plannedAutomationId || "") === automation.id;
      if (proven) actions.push({ intent, evidence: "preview-only" });
      else diagnostics.push(managementPreviewDiagnostic({
        result,
        payload,
        subject: { id: automation.id, name: automation.name, type: "automation" },
        probeId: intent,
      }));
    }
    inspected.push({ ...automation, actions });
  }
  return inspected;
}

export async function inspectSceneExecutions(spec, scenes, run, diagnostics) {
  const houseId = spec.scope?.homeIds?.[0] || "";
  const inspected = [];
  for (const scene of scenes) {
    const request = {
      contractVersion: "1.0",
      requestId: `capability-scene-${scene.id}`,
      locale: "zh-CN",
      utterance: `预览执行情景${scene.name}`,
      intent: "scene.execute",
      targets: [{ entityType: "scene", id: scene.id }],
      parameters: { houseId, sceneId: scene.id },
    };
    const result = await run(["invoke", "--stdin", "--preview-only"], { stdin: JSON.stringify(request) });
    const payload = parseJSON(result.stdout);
    const planned = payload?.result?.planned;
    const executable = result.code === 0 && payload?.status === "success"
      && payload?.result?.dryRun === true && payload?.result?.persistentWrites === false
      && planned?.intent === request.intent && String(planned?.sceneId || "") === scene.id;
    if (!executable) diagnostics.push(managementPreviewDiagnostic({
      result,
      payload,
      subject: { id: scene.id, name: scene.name, type: "scene" },
      probeId: request.intent,
    }));
    inspected.push({ ...scene, executable, ...(executable ? { evidence: "preview-only" } : {}) });
  }
  return inspected;
}
