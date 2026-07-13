export const INFRASTRUCTURE_READ_PROBES = {
  "gateway.read": (server) => ["gateway", "list", "--house-id", server.homeId, "--json"],
  "gateway.detail.read": (server) => invokeRead(server, "gateway-detail", "gateway.detail.get", gatewayTarget("992900"), { gatewayId: "992900" }),
  "gateway.stats.read": (server) => invokeRead(server, "gateway-stats", "gateway.stats.list"),
  "gateway.thread.read": (server) => invokeRead(server, "gateway-thread", "gateway.thread.get", gatewayTarget("992900"), { gatewayId: "992900" }),
  "gateway.scene-relations.read": (server) => invokeRead(server, "gateway-scene-relations", "gateway.scene_relation.list", gatewayTarget("992900"), { gatewayId: "992900" }),
  "gateway.diagnose.read": (server) => ({ ...invokeRead(server, "gateway-diagnose", "diagnose.gateway", gatewayTarget("992900"), { gatewayId: "992900" }), acceptedStatuses: ["success", "partial"] }),
  "panel.list.read": (server) => invokeRead(server, "panel-list", "panel.list"),
  "panel.read": (server) => ["panel", "detail", "--panel-id", "992501", "--house-id", server.homeId, "--json"],
  "panel.button-type.read": (server) => invokeRead(server, "panel-button-type", "panel.button.type.get", deviceTarget("992501"), { deviceId: "992501", buttonType: "2" }),
  "knob.read": (server) => ["knob", "detail", "--knob-id", "992601", "--house-id", server.homeId, "--json"],
};

export const INFRASTRUCTURE_WRITE_PROBES = {
  "gateway.configure": {
    target: gatewayTarget("992900"),
    intent: "gateway.configure",
    parameters: { gatewayId: "992900", name: "能力探针中枢", roomIds: ["991001"] },
    read: (server) => gatewayState(server, "992900"),
    readback: (server) => ["gateway", "detail", "--gateway-id", "992900", "--house-id", server.homeId, "--json"],
    restore: resetReferenceHome,
  },
  "gateway.delete": {
    target: gatewayTarget("992902"),
    intent: "gateway.delete",
    parameters: { gatewayId: "992902", confirmed: true },
    read: (server) => Boolean(device(server, "992902")),
    restore: resetReferenceHome,
  },
  "panel.button.write": {
    target: deviceTarget("992501"),
    intent: "panel.button.configure",
    parameters: { deviceId: "992501", buttons: [{ id: "992501-button-1", alias: "欢迎回家" }] },
    restoreParameters: { deviceId: "992501", buttons: [{ id: "992501-button-1", alias: "回家" }] },
    read: (server) => panelButton(server, "992501-button-1").alias,
    readback: panelReadback,
  },
  "panel.button-event.update": panelEventMutation({
    capability: "panel.button_event.update",
    eventId: "992501-event-1",
    parameters: { deviceId: "992501", buttonEvent: eventPayload("992501-event-1", "到家", "994001") },
    restoreParameters: { deviceId: "992501", buttonEvent: eventPayload("992501-event-1", "回家", "994001") },
  }),
  "panel.button-event.batch-update": {
    target: deviceTarget("992501"),
    intent: "panel.button_event.batch_update",
    parameters: { deviceId: "992501", buttonEvents: [eventPayload("992501-event-1", "到家", "994001"), eventPayload("992501-event-2", "影院", "994002")] },
    restoreParameters: { deviceId: "992501", buttonEvents: [eventPayload("992501-event-1", "回家", "994001"), eventPayload("992501-event-2", "观影", "994002")] },
    read: (server) => [panelEventState(server, "992501-event-1"), panelEventState(server, "992501-event-2")],
    readback: panelReadback,
  },
  "panel.button-event.reset": {
    target: deviceTarget("992501"),
    intent: "panel.button_event.reset",
    parameters: { deviceId: "992501", buttonEventId: "992501-event-1" },
    restoreIntent: "panel.button_event.update",
    restoreParameters: { deviceId: "992501", buttonEvent: eventPayload("992501-event-1", "回家", "994001") },
    read: (server) => panelEventState(server, "992501-event-1"),
    readback: panelReadback,
  },
  "panel.click": {
    target: deviceTarget("992501"),
    intent: "panel.click",
    parameters: { panelId: "992501", payload: { buttonEventId: "992501-event-2" } },
    read: (server) => Number(server.fixture.panelClickCounts["992501"] || 0),
    restore: resetReferenceHome,
  },
  "knob.configure": knobMutation({
    intent: "knob.configure",
    parameters: { deviceId: "992601", actions: [knobAction({ configType: "scene", mode: "scene", targetId: "994001", targetType: "scene", targetName: "回家模式" }), secondKnobAction()] },
    restoreParameters: { deviceId: "992601", actions: [knobAction({ configType: "device", mode: "brightness", targetId: "992003", targetType: "device", targetName: "书房灯带", sensitivity: 5 }), secondKnobAction()] },
  }),
  "knob.reset": knobMutation({
    intent: "knob.reset",
    parameters: { deviceId: "992601", index: 1 },
    restoreIntent: "knob.configure",
    restoreParameters: { deviceId: "992601", actions: [knobAction({ configType: "device", mode: "brightness", targetId: "992003", targetType: "device", targetName: "书房灯带", sensitivity: 5 }), secondKnobAction()] },
  }),
};

function panelEventMutation({ capability, eventId, parameters, restoreParameters }) {
  return { target: deviceTarget("992501"), intent: capability, parameters, restoreParameters, read: (server) => panelEventState(server, eventId), readback: panelReadback };
}

function knobMutation({ intent, parameters, restoreIntent, restoreParameters }) {
  return { target: deviceTarget("992601"), intent, parameters, restoreIntent, restoreParameters, read: (server) => knobState(server, 1), readback: (server) => ["knob", "detail", "--knob-id", "992601", "--house-id", server.homeId, "--json"] };
}

function invokeRead(server, requestId, intent, target, parameters = {}) {
  return { command: ["invoke", "--stdin"], stdin: JSON.stringify({ contractVersion: "1.0", requestId: `capability-probe-${requestId}`, locale: "zh-CN", utterance: requestId, intent, ...(target ? { targets: [target] } : {}), parameters: { houseId: server.homeId, ...parameters } }) };
}

function gatewayTarget(id) { return { entityType: "gateway", id }; }
function deviceTarget(id) { return { entityType: "device", id }; }
function device(server, id) { return server.fixture.devices.find((item) => item.id === id); }
function gatewayState(server, id) { const item = device(server, id); return item?.alias || item?.name || ""; }
function panelReadback(server) { return ["panel", "detail", "--panel-id", "992501", "--house-id", server.homeId, "--json"]; }
function panelButton(server, id) { return panelRows(device(server, "992501")).find((item) => item.id === id); }
function panelRows(panel) { return Object.values(panel?.panelButtons || {}).flatMap((rows) => Array.isArray(rows) ? rows : []); }
function panelEvent(server, id) { return panelRows(device(server, "992501")).flatMap((button) => button.buttonEvents || []).find((item) => String(item.buttonEventId || item.id) === id); }
function panelEventState(server, id) { const event = panelEvent(server, id); return { alias: event?.alias || "", targetId: String(event?.details?.[0]?.resId ?? event?.resId ?? "") }; }
function knobState(server, index) { const row = device(server, "992601")?.knobMulti?.details?.find((item) => Number(item.index) === index); return { configType: row?.configType || "", mode: row?.mode || "", targetId: String(row?.resId ?? ""), sensitivity: Number(row?.sensitivity ?? row?.sens ?? 0) }; }
function eventPayload(buttonEventId, alias, targetId) { return { buttonEventId, alias, actions: [{ targetType: "scene", targetId, targetName: alias }] }; }
function knobAction({ configType, mode, targetId, targetType, targetName, sensitivity = 1 }) { return { id: "992601-detail-1", index: 1, configType, mode, targetId, targetType, targetName, sensitivity }; }
function secondKnobAction() { return { id: "992601-detail-2", index: 2, configType: "scene", mode: "scene", targetId: "994003", targetType: "scene", targetName: "晚安", sensitivity: 1 }; }

async function resetReferenceHome({ server }) {
  const response = await fetch(`${server.origin}/__mock/reset`, { method: "POST" });
  if (!response.ok) throw new Error("reference-home reset failed after infrastructure mutation");
}
