const familyModules = new Map([
  ["light", "room.lighting-control"],
  ["curtain", "device.curtain-control"],
  ["switch-relay", "device.switch-control"],
  ["wireless-switch", "device.switch-control"],
  ["climate", "device.climate-control"],
  ["sensor", "sensor.environment"],
]);

const familyOrder = ["light", "curtain", "switch-relay", "wireless-switch", "climate", "sensor"];

export function controllerModuleForFamily(family) {
  return familyModules.get(String(family || "")) || "";
}

export function selectedControllerFamilies(moduleIds = []) {
  const selected = new Set(moduleIds);
  return familyOrder.filter((family) => selected.has(controllerModuleForFamily(family)));
}

export function resolveControllerContract(device = {}, moduleIds = []) {
  const family = normalizedFamily(device);
  const requiredModule = controllerModuleForFamily(family);
  if (!requiredModule || !new Set(moduleIds).has(requiredModule)) return emptyContract();

  const state = normalizedState(device);
  const controls = Array.isArray(device.controls) ? device.controls : [];
  const traits = familyTraits(family, state, controls);
  const protocols = normalizedProtocols(device, state);
  const terminal = terminalMode(device);
  const hasWrite = traits.some((trait) => trait.mode === "write");
  const adapter = family === "switch-relay" && isWirelessSwitch(device, state)
    ? "wireless-switch"
    : adapterForFamily(family);

  return {
    adapter,
    family,
    mode: terminal || (hasWrite ? "write" : "readonly"),
    traits: terminal ? traits.map((trait) => trait.mode === "write" ? { ...trait, mode: "blocked", reason: terminal } : trait) : traits,
    protocols,
  };
}

function familyTraits(family, state, controls) {
  if (family === "light") return lightTraits(state, controls);
  if (family === "curtain") return curtainTraits(state, controls);
  if (family === "switch-relay") return switchTraits(state, controls);
  if (family === "climate") return climateTraits(state, controls);
  if (family === "sensor") return sensorTraits(state);
  return [];
}

function lightTraits(state, controls) {
  return [
    trait("power", "power", state, controls, "light.power.set"),
    trait("brightness", "brightness", state, controls, "light.brightness.set"),
    trait("color-temperature", "colorTemperature", state, controls, "light.color_temperature.set"),
    trait("color", "color", state, controls, "light.color.set"),
  ].filter(Boolean);
}

function curtainTraits(state, controls) {
  const traits = [];
  if (hasAny(state, ["position", "targetPosition"])) {
    traits.push({
      id: "position",
      property: "targetPosition",
      value: state.targetPosition ?? state.position,
      mode: hasControl(controls, "device.property.set", "targetPosition") ? "write" : "read",
    });
  }
  if (Object.hasOwn(state, "runState")) traits.push({ id: "run-state", property: "runState", value: state.runState, mode: "read" });
  return traits;
}

function switchTraits(state, controls) {
  if (isWirelessSwitch({}, state)) return sensorTraits(state);
  return switchProperties(state)
    .map((property, index) => ({
      id: property === "switchPower" || property === "sp" ? "power" : `circuit-${index}`,
      property,
      value: state[property],
      mode: hasControl(controls, "device.property.set", property) ? "write" : "read",
    }));
}

function switchProperties(state) {
  const count = Number(state.numberOfChannels || state.ch_num || 0);
  const numbered = count > 0
    ? Array.from({ length: count }, (_, index) => `${index + 1}-sp`).filter((property) => Object.hasOwn(state, property))
    : Object.keys(state).filter((property) => /^[1-6]-sp$/.test(property)).sort(switchPropertyOrder);
  if (numbered.length) return numbered;
  if (Object.hasOwn(state, "0-sp")) return ["0-sp"];
  return ["switchPower", "sp"].filter((property) => Object.hasOwn(state, property));
}

function climateTraits(state, controls) {
  return [
    trait("power", "airConditionerPower", state, controls, "device.property.set"),
    trait("target-temperature", "airConditionerTargetTemperature", state, controls, "device.property.set"),
    trait("mode", "airConditionerMode", state, controls, "device.property.set"),
    trait("fan-speed", "airConditionerFanSpeed", state, controls, "device.property.set"),
    readTrait("current-temperature", "airConditionerCurrentTemperature", state),
  ].filter(Boolean);
}

function sensorTraits(state) {
  const properties = [
    ["temperature", "currentTemperature"],
    ["humidity", "humidity"],
    ["occupancy", "occupancyDetected"],
    ["occupancy-legacy", "occupancy"],
    ["motion", "motionDetected"],
    ["luminance", "luminance"],
    ["battery", "batteryLevel"],
    ["contact", "open"],
    ["water", "water"],
    ["smoke", "smoke"],
    ["pm25", "pm25"],
    ["co2", "co2"],
    ["voc", "voc"],
    ["button-count", "buttonCount"],
  ];
  return properties.map(([id, property]) => readTrait(id, property, state)).filter(Boolean);
}

function trait(id, property, state, controls, intent) {
  if (!Object.hasOwn(state, property)) return null;
  return { id, property, value: state[property], mode: hasControl(controls, intent, intent === "device.property.set" ? property : undefined) ? "write" : "read" };
}

function readTrait(id, property, state) {
  return Object.hasOwn(state, property) ? { id, property, value: state[property], mode: "read" } : null;
}

function hasControl(controls, intent, property) {
  return controls.some((control) => control?.intent === intent
    && control?.evidence === "preview-only"
    && (!property || control?.property === property));
}

function terminalMode(device) {
  if (device?.online === false || normalizedState(device).online === false || normalizedState(device).airConditionerOnline === false) return "offline";
  if (device?.capabilityStatus === "version-mismatch" || device?.access === "version-mismatch") return "version-mismatch";
  if (device?.readOnly === true || device?.access === "read-only") return "readonly";
  return "";
}

function normalizedState(device) {
  if (device?.properties && typeof device.properties === "object") return device.properties;
  if (device?.state && typeof device.state === "object") return device.state;
  return {};
}

function normalizedProtocols(device, state) {
  const values = Array.isArray(device?.protocols)
    ? device.protocols.map((protocol) => typeof protocol === "string" ? protocol : protocol?.id)
    : [];
  if (state.matterLinked === true) values.push("matter");
  if (state.daliVersion !== undefined || state.daliDeviceType !== undefined || state.daliSwitchType !== undefined) values.push("dali");
  return [...new Set(values.filter(Boolean).map((protocol) => String(protocol).toLowerCase()))].sort();
}

function normalizedFamily(device) {
  if (device?.family === "wireless-switch") return "wireless-switch";
  if (device?.family === "switch-relay" && isWirelessSwitch(device, normalizedState(device))) return "wireless-switch";
  return String(device?.family || "");
}

function isWirelessSwitch(device, state) {
  return device?.family === "wireless-switch"
    || (Object.hasOwn(state, "buttonCount") && !Object.keys(state).some((property) => property === "switchPower" || property === "sp" || /^(?:0|[1-6])-sp$/.test(property)));
}

function adapterForFamily(family) {
  return ({ light: "lighting", curtain: "curtain", "switch-relay": "switch-relay", climate: "climate", sensor: "sensor", "wireless-switch": "wireless-switch" })[family] || "none";
}

function hasAny(state, properties) {
  return properties.some((property) => Object.hasOwn(state, property));
}

function switchPropertyOrder(left, right) {
  const rank = (property) => property === "switchPower" || property === "sp" ? 0 : Number.parseInt(property, 10) + 1;
  return rank(left) - rank(right);
}

function emptyContract() {
  return { adapter: "none", family: "", mode: "readonly", traits: [], protocols: [] };
}
