const previewOptions = { keys: ["previewOnly"], values: { previewOnly: { type: "boolean" } } };

export function compilePolicyDefinition(intent, snapshot, catalog) {
  const catalogRow = catalog.capabilities.find((item) => item.intent === intent);
  const risk = catalogRow?.risk || fallbackRisk(intent);
  const resourceType = resourceTypeFor(intent);
  const resourceIds = resourceType ? idsFor(snapshot, resourceType) : [];
  const branches = controlBranches(snapshot, intent) || contractBranches(intent, snapshot, catalogRow);
  if (!branches?.length) throw new Error(`缺少 action policy contract: ${intent}`);
  return { risk, resourceType, resourceIds, branches };
}

function controlBranches(snapshot, intent) {
  if (intent === "device.property.set") return propertyBranches(snapshot);
  if (["light.power.set", "light.brightness.set", "light.color_temperature.set", "light.color.set"].includes(intent)) {
    return directControlBranches(snapshot, intent);
  }
  return undefined;
}

function contractBranches(intent, snapshot, catalogRow) {
  const required = unique(["houseId", ...(catalogRow?.parameters?.required || [])]);
  if (["entity.list", "sensor.list", "sensor.event.list", "scene.list", "automation.list", "automation.supported.list", "automation.supported.v2.list", "gateway.stats.list", "panel.list"].includes(intent)) {
    return [branch(required, intent === "entity.list" ? [] : ["pageNo", "pageSize"], {}, undefined, undefined, paginationValues())];
  }
  if (intent === "group.list" || intent === "gateway.list") return [branch(required, ["pageNo", "pageSize"], {}, undefined, undefined, paginationValues())];
  if (intent === "state.query" || intent === "device.detail.get") return resourceBranches("device", "deviceId", idsFor(snapshot, "device"), required);
  if (intent === "area.detail.get") return resourceBranches("area", "areaId", idsFor(snapshot, "area"), required);
  if (intent === "room.detail.get") return resourceBranches("room", "roomId", idsFor(snapshot, "room"), required);
  if (intent === "device.rename") return deviceManagementBranch(snapshot, "name", { type: "string", minLength: 1, maxLength: 40 });
  if (intent === "device.move") return deviceManagementBranch(snapshot, "roomId", enumString(idsFor(snapshot, "room")));

  if (["scene.detail.get", "scene.test", "scene.execute", "scene.delete"].includes(intent)) return resourceBranches("scene", "sceneId", idsFor(snapshot, "scene"), required, intent.endsWith("delete") ? ["confirmed"] : []);
  if (intent === "scene.create") return [sceneWriteBranch(snapshot, false, required)];
  if (intent === "scene.update") return [sceneWriteBranch(snapshot, true, required)];

  if (["automation.detail.get", "automation.enable", "automation.disable", "automation.delete"].includes(intent)) return resourceBranches("automation", "automationId", idsFor(snapshot, "automation"), required, intent.endsWith("delete") ? ["confirmed"] : []);
  if (intent === "automation.create") return [automationWriteBranch(snapshot, false, required)];
  if (intent === "automation.update") return [automationWriteBranch(snapshot, true, required)];

  if (["group.detail.get", "group.delete"].includes(intent)) return resourceBranches("group", "groupId", idsFor(snapshot, "group"), required, intent.endsWith("delete") ? ["confirmed"] : []);
  if (intent === "group.create") return [groupCreateBranch(snapshot, required)];
  if (intent === "group.update") return [groupUpdateBranch(snapshot, required)];
  if (intent === "group.members.update") return [groupMembersBranch(snapshot, required)];

  if (["gateway.detail.get", "gateway.thread.get", "gateway.scene_relation.list", "diagnose.gateway"].includes(intent)) return resourceBranches("gateway", "gatewayId", idsFor(snapshot, "gateway"), required);
  if (intent === "gateway.configure") return [gatewayConfigureBranch(snapshot, required)];
  if (intent === "gateway.delete") return [gatewayDeleteBranch(snapshot, required)];

  if (intent === "panel.get") return resourceBranches("panel", "deviceId", idsFor(snapshot, "panel"), ["houseId", "deviceId"]);
  if (intent === "panel.button.type.get") return [panelResourceBranch(snapshot, ["buttonType"], { buttonType: { type: "integer", minimum: 0, maximum: 100 } })];
  if (intent === "panel.button.configure") return panelConfigureBranches(snapshot);
  if (intent === "panel.button_event.update") return [panelEventBranch(snapshot, false)];
  if (intent === "panel.button_event.batch_update") return [panelEventBranch(snapshot, true)];
  if (intent === "panel.button_event.reset") return [panelResetBranch(snapshot)];
  if (intent === "panel.click") return resourceBranches("panel", "panelId", idsFor(snapshot, "panel"), required);

  if (intent === "knob.get") return resourceBranches("knob", "deviceId", idsFor(snapshot, "knob"), ["houseId", "deviceId"]);
  if (intent === "knob.configure") return [knobConfigureBranch(snapshot)];
  if (intent === "knob.reset") return [knobResetBranch(snapshot)];
  return [];
}

function propertyBranches(snapshot) {
  return entities(snapshot).flatMap((entity) => (entity.controls || [])
    .filter((control) => control.intent === "device.property.set" && control.evidence === "preview-only" && control.property)
    .map((control) => branch(
      ["houseId", "deviceId", "property", "value"], ["confirmed"],
      { deviceId: String(entity.id), property: String(control.property) }, "device", [String(entity.id)],
      { value: propertyValueSchema(String(control.property)) },
    ))).sort((left, right) => `${left.const.deviceId}:${left.const.property}`.localeCompare(`${right.const.deviceId}:${right.const.property}`));
}

function directControlBranches(snapshot, intent) {
  return entities(snapshot).flatMap((entity) => (entity.controls || [])
    .filter((control) => control.intent === intent && control.evidence === "preview-only" && (control.property || control.id))
    .map((control) => {
      const property = String(control.property || control.id);
      return branch(
        ["houseId", "deviceId", property], ["confirmed"], { deviceId: String(entity.id) }, "device", [String(entity.id)],
        { [property]: directValueSchema(property) },
      );
    })).sort((left, right) => String(left.const.deviceId).localeCompare(String(right.const.deviceId)));
}

function deviceManagementBranch(snapshot, field, schema) {
  const ids = entities(snapshot).filter((entity) => (entity.controls || []).some((control) => control.intent === `device.${field === "name" ? "rename" : "move"}` && control.evidence === "preview-only")).map((entity) => String(entity.id));
  return [branch(["houseId", "deviceId", field], ["confirmed"], {}, "device", ids, { deviceId: enumString(ids), [field]: schema })];
}

function sceneWriteBranch(snapshot, updating, required) {
  const values = { name: text(1, 80), description: text(0, 240), icon: text(0, 80), roomId: enumString(idsFor(snapshot, "room")), actions: { type: "array", minItems: 1, maxItems: 64, items: targetActionSchema(snapshot) } };
  const extra = ["name", "description", "icon", "roomId", "actions", "confirmed"];
  if (updating) values.sceneId = enumString(idsFor(snapshot, "scene"));
  return branch(unique(required), extra, {}, updating ? "scene" : undefined, idsFor(snapshot, "scene"), values, previewOptions, updating ? "sceneId" : undefined);
}

function automationWriteBranch(snapshot, updating, required) {
  const values = {
    name: text(1, 80), activeWindow: strictObject(["start", "end"], { start: text(1, 16), end: text(1, 16) }),
    repeat: { oneOf: [text(1, 80), { type: "json" }] }, version: { oneOf: [{ type: "string", maxLength: 40 }, { type: "integer", minimum: 1, maximum: 100 }] },
    conditionType: { type: "string", enum: ["and", "or"] }, trigger: automationTriggerSchema(snapshot),
    actions: { type: "array", minItems: 1, maxItems: 64, items: targetActionSchema(snapshot) }, confirmed: { type: "boolean" },
  };
  if (updating) values.automationId = enumString(idsFor(snapshot, "automation"));
  return branch(unique(required), Object.keys(values), {}, updating ? "automation" : undefined, idsFor(snapshot, "automation"), values, previewOptions, updating ? "automationId" : undefined);
}

function groupCreateBranch(snapshot, required) {
  const values = groupDraftValues(snapshot); return branch(required, Object.keys(values), {}, undefined, undefined, values, previewOptions);
}

function groupUpdateBranch(snapshot, required) {
  const values = { groupId: enumString(idsFor(snapshot, "group")), ...groupDraftValues(snapshot) };
  return branch(required, Object.keys(values), {}, "group", idsFor(snapshot, "group"), values, previewOptions, "groupId");
}

function groupMembersBranch(snapshot, required) {
  const values = { groupId: enumString(idsFor(snapshot, "group")), deviceIds: idArray(idsFor(snapshot, "device"), 1, 100) };
  return branch(required, [], {}, "group", idsFor(snapshot, "group"), values, previewOptions, "groupId");
}

function groupDraftValues(snapshot) {
  return { name: text(1, 40), description: text(0, 120), icon: text(0, 80), roomId: enumString(idsFor(snapshot, "room")), groupCapability: { type: "string", enum: ["light", "curtain", "sensor", "infrastructure"] }, groupCategory: { type: "string", enum: ["lighting", "shading", "environment", "infrastructure"] }, deviceIds: idArray(idsFor(snapshot, "device"), 1, 100) };
}

function gatewayConfigureBranch(snapshot, required) {
  const values = { gatewayId: enumString(idsFor(snapshot, "gateway")), name: text(1, 80), roomIds: idArray(idsFor(snapshot, "room"), 0, 100) };
  return branch(required, ["name", "roomIds"], {}, "gateway", idsFor(snapshot, "gateway"), values, previewOptions, "gatewayId");
}

function gatewayDeleteBranch(snapshot, required) {
  const values = { gatewayId: enumString(idsFor(snapshot, "gateway")), name: text(0, 80), confirmed: { type: "boolean" } };
  return branch(required, ["name", "confirmed"], {}, "gateway", idsFor(snapshot, "gateway"), values, previewOptions, "gatewayId");
}

function panelResourceBranch(snapshot, extraRequired = [], values = {}) {
  const ids = idsFor(snapshot, "panel");
  return branch(["houseId", "deviceId", ...extraRequired], [], {}, "panel", ids, { deviceId: enumString(ids), ...values }, previewOptions, "deviceId");
}

function panelConfigureBranches(snapshot) {
  return valuesFor(snapshot.panels).flatMap((panel) => {
    const panelId = String(panel?.id || "");
    const buttons = Array.isArray(panel?.buttons) ? panel.buttons.filter((button) => button?.id) : [];
    if (!panelId || buttons.length === 0) return [];
    return [branch(
      ["houseId", "deviceId", "buttons"],
      [],
      {},
      "panel",
      [panelId],
      {
        deviceId: idValue([panelId]),
        buttons: {
          type: "array",
          minItems: 1,
          maxItems: 32,
          items: { oneOf: buttons.map((button) => panelButtonSchema(snapshot, panelId, button)) },
        },
      },
      previewOptions,
      "deviceId",
    )];
  });
}

function panelEventBranch(snapshot, batch) {
  const eventSchema = strictObject(["buttonEventId", "alias", "actions"], { buttonEventId: enumString(panelEventIds(snapshot)), alias: text(0, 80), actions: { type: "array", maxItems: 16, items: panelTargetSchema(snapshot) } });
  return panelResourceBranch(snapshot, [batch ? "buttonEvents" : "buttonEventId", ...(batch ? [] : ["alias", "actions"])], batch ? { buttonEvents: { type: "array", minItems: 1, maxItems: 32, items: eventSchema } } : { buttonEventId: enumString(panelEventIds(snapshot)), alias: text(0, 80), actions: { type: "array", maxItems: 16, items: panelTargetSchema(snapshot) } });
}

function panelResetBranch(snapshot) {
  return panelResourceBranch(snapshot, ["buttonEventId"], { buttonEventId: enumString(panelEventIds(snapshot)) });
}

function knobConfigureBranch(snapshot) {
  const ids = idsFor(snapshot, "knob");
  return branch(["houseId", "deviceId", "actions"], [], {}, "knob", ids, { deviceId: enumString(ids), actions: { type: "array", minItems: 1, maxItems: 32, items: knobActionSchema(snapshot) } }, previewOptions, "deviceId");
}

function knobResetBranch(snapshot) {
  const ids = idsFor(snapshot, "knob");
  return branch(["houseId", "deviceId", "index"], [], {}, "knob", ids, { deviceId: enumString(ids), index: { type: "integer", minimum: 0, maximum: 64 } }, previewOptions, "deviceId");
}

function resourceBranches(type, parameter, ids, required, optional = []) {
  return [branch(unique([...required, parameter]), optional, {}, type, ids, { [parameter]: enumString(ids), confirmed: { type: "boolean" } }, previewOptions, parameter)];
}

function branch(required, optional = [], constants = {}, targetType, targetIds = [], values = {}, options = { keys: [], values: {} }, resourceIdParameter) {
  return { targetType, targetIds: targetIds || [], parameterKeys: unique([...required, ...optional, ...Object.keys(values), ...Object.keys(constants)]), optionKeys: options.keys, required: unique(required), const: constants, values, optionValues: options.values, resourceIdParameter };
}

function targetActionSchema(snapshot) {
  return { oneOf: [
    targetVariant("device", idsFor(snapshot, "device"), setSchema()), targetVariant("group", idsFor(snapshot, "group"), setSchema()),
    targetVariant("room", unique([...idsFor(snapshot, "room"), ...valuesFor(snapshot.rooms).map((item) => String(item.name || "")).filter(Boolean)]), setSchema()),
    targetVariant("scene", idsFor(snapshot, "scene"), { type: "json" }),
  ] };
}

function targetVariant(type, ids, set) {
  return strictObject(["targetType", "targetId"], { targetType: { const: type }, targetId: idValue(ids), targetName: text(0, 100), rank: { type: "integer", minimum: 0, maximum: 100 }, action: { oneOf: [{ type: "integer" }, text(0, 80)] }, set, custom: { type: "json" } }, ["targetName", "rank", "action", "set", "custom"]);
}

function automationTriggerSchema(snapshot) {
  const condition = strictObject(["conditionKind"], { conditionKind: { type: "string", enum: ["alarm", "event", "fact", "fact_change"] }, time: text(0, 16), targetType: { const: "device" }, targetId: idValue(idsFor(snapshot, "device")), event: text(0, 100), eventId: text(0, 100), property: text(0, 100), operation: { type: "string", enum: ["eq", "ne", "gt", "gte", "lt", "lte", "change"] }, value: { type: "json" } }, ["time", "targetType", "targetId", "event", "eventId", "property", "operation", "value"]);
  return { oneOf: [condition, strictObject(["conditionType", "conditions"], { conditionType: { type: "string", enum: ["and", "or"] }, conditions: { type: "array", minItems: 1, maxItems: 16, items: condition } })] };
}

function setSchema() {
  return strictObject([], { power: { type: "boolean" }, brightness: { type: "integer", minimum: 1, maximum: 100 }, colorTemperature: { type: "integer", minimum: 2700, maximum: 6500 }, color: { type: "integer", minimum: 0, maximum: 16777215 }, targetPercent: { type: "integer", minimum: 0, maximum: 100 }, switchPower: { type: "boolean" } }, ["power", "brightness", "colorTemperature", "color", "targetPercent", "switchPower"]);
}

function panelTargetSchema(snapshot) {
  return { oneOf: [strictObject(["targetType", "targetId"], { targetType: { const: "scene" }, targetId: idValue(idsFor(snapshot, "scene")) }), strictObject(["targetType", "targetId"], { targetType: { const: "group" }, targetId: idValue(idsFor(snapshot, "group")) })] };
}

function panelButtonSchema(snapshot, panelId, button) {
  const currentRow = button?.currentRow && typeof button.currentRow === "object" && !Array.isArray(button.currentRow) ? button.currentRow : {};
  const buttonId = String(button?.id || "");
  const localButtonIds = unique([currentRow.buttonId].filter((value) => value !== undefined).map(String));
  const targetIds = unique([
    "",
    ...idsFor(snapshot, "device"),
    ...idsFor(snapshot, "room"),
    ...idsFor(snapshot, "group"),
    ...idsFor(snapshot, "scene"),
    ...idsFor(snapshot, "automation"),
  ]);
  const properties = {
    id: idValue([buttonId]),
    buttonId: localButtonIds.length > 0 ? idValue(localButtonIds) : { type: "never" },
    deviceId: idValue([panelId]),
    name: text(0, 100),
    alias: text(0, 100),
    keyValue: { type: "integer", minimum: 0, maximum: 64 },
    index: { type: "integer", minimum: 0, maximum: 64 },
    resId: idValue(targetIds),
    resType: { type: "integer", minimum: 0, maximum: 100 },
    visible: binaryValue(),
    available: binaryValue(),
    icon: { type: "integer", minimum: 0, maximum: 100000 },
    sort: { type: "integer", minimum: 0, maximum: 1000 },
    rank: { type: "integer", minimum: 0, maximum: 1000 },
    type: { type: "integer", minimum: 0, maximum: 100 },
    buttonType: { type: "integer", minimum: 0, maximum: 100 },
    targetId: idValue(targetIds),
    targetType: { type: "string", enum: ["", "room", "device", "group", "meshGroup", "home", "scene", "automation"] },
    targetName: text(0, 100),
    status: text(0, 40),
    extend: text(0, 2000),
    valid: binaryValue(),
  };
  return strictObject(["id"], properties, Object.keys(properties).filter((key) => key !== "id"));
}

function knobActionSchema(snapshot) {
  const common = { id: text(0, 100), index: { type: "integer", minimum: 0, maximum: 64 }, configType: text(0, 40), mode: { type: "string", enum: ["brightness", "power", "colorTemperature", "scene"] }, model: text(0, 80), alias: text(0, 100), sensitivity: { type: "number", minimum: 0, maximum: 100 }, targetType: { type: "string", enum: ["device", "scene", "group"] }, targetId: idValue(unique([...idsFor(snapshot, "device"), ...idsFor(snapshot, "scene"), ...idsFor(snapshot, "group")])), resId: text(0, 100), typeId: { type: "integer" }, property: text(0, 80), valid: { oneOf: [{ type: "integer" }, { type: "boolean" }] }, did: text(0, 100), name: text(0, 100), resettable: { type: "boolean" } };
  return strictObject(["index", "targetType", "targetId"], common, Object.keys(common).filter((key) => !["index", "targetType", "targetId"].includes(key)));
}

function strictObject(required, properties, optional = []) {
  return { type: "object", required, properties, allowedKeys: unique([...required, ...optional]), additionalProperties: false };
}

function paginationValues() { return { pageNo: { type: "integer", minimum: 1, maximum: 10000 }, pageSize: { type: "integer", minimum: 1, maximum: 1000 } }; }
function binaryValue() { return { oneOf: [{ type: "integer", enum: [0, 1] }, { type: "boolean" }] }; }
function idArray(ids, minItems, maxItems) { return { type: "array", minItems, maxItems, uniqueItems: true, items: idValue(ids) }; }
function enumString(values) { return { type: "string", enum: unique(values.map(String)) }; }
function idValue(values) {
  const strings = unique(values.map(String));
  const integers = unique(strings.filter((value) => /^\d+$/.test(value)).map(Number).filter(Number.isSafeInteger));
  return integers.length > 0 ? { oneOf: [{ type: "string", enum: strings }, { type: "integer", enum: integers }] } : { type: "string", enum: strings };
}
function text(minLength, maxLength) { return { type: "string", minLength, maxLength }; }
function entities(snapshot) { return valuesFor(snapshot?.entities); }
function valuesFor(value) { return Array.isArray(value) ? value : Object.values(value || {}); }
function idsFor(snapshot, type) {
  const direct = type === "device" ? entities(snapshot) : valuesFor(snapshot?.[`${type}s`]);
  const entityFamilies = type === "gateway" ? ["gateway"] : type === "panel" ? ["panel", "panel-screen"] : type === "knob" ? ["knob"] : [];
  return unique([...direct, ...entities(snapshot).filter((item) => entityFamilies.includes(String(item.family)))].map((item) => String(item?.id || "")).filter(Boolean));
}
function panelEventIds(snapshot) { return unique(valuesFor(snapshot?.panels).flatMap((panel) => (panel.buttons || []).flatMap((button) => (button.events || []).map((event) => String(event.id || "")))).filter(Boolean)); }
function propertyValueSchema(property) { if (property === "targetPosition") return { type: "integer", minimum: 0, maximum: 100 }; if (property === "airConditionerTargetTemperature") return { type: "integer", minimum: 16, maximum: 32 }; if (property === "airConditionerMode") return { type: "integer", enum: [1, 4, 8] }; if (property === "airConditionerFanSpeed") return { type: "integer", enum: [1, 2, 4] }; if (property === "airConditionerPower" || property === "sp" || /^(?:0|[1-6])-sp$/.test(property)) return { type: "boolean" }; return { type: "never" }; }
function directValueSchema(field) { if (field === "power") return { type: "boolean" }; if (field === "brightness") return { type: "integer", minimum: 1, maximum: 100 }; if (field === "colorTemperature") return { type: "integer", minimum: 2700, maximum: 6500 }; if (field === "color") return { type: "integer", minimum: 0, maximum: 16777215 }; return { type: "never" }; }
function resourceTypeFor(intent) { for (const type of ["scene", "automation", "group", "gateway", "panel", "knob"]) if (intent.startsWith(`${type}.`) || (type === "gateway" && intent === "diagnose.gateway")) return type; return undefined; }
function fallbackRisk(intent) { if (["device.rename", "device.move", "automation.disable"].includes(intent)) return "R2"; return intent.endsWith(".set") ? "R1" : "R0"; }
function unique(values) { return [...new Set(values.filter((value) => value !== undefined))].sort(); }
