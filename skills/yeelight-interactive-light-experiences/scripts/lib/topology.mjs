import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOGICAL_SLOTS, boundedInteger } from "./contracts.mjs";

const packageRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const fixture = JSON.parse(fs.readFileSync(path.join(packageRoot, "assets", "mock", "ifa-16-e20.json"), "utf8"));

export const QUADRANT_MAP = Object.freeze({
  "L-upper": Object.freeze({ physicalSlot: "Q-LU", coverage: Object.freeze(["L1", "L2", "L3", "L4"]) }),
  "L-lower": Object.freeze({ physicalSlot: "Q-LL", coverage: Object.freeze(["L5", "L6", "L7", "L8"]) }),
  "R-upper": Object.freeze({ physicalSlot: "Q-RU", coverage: Object.freeze(["R1", "R2", "R3", "R4"]) }),
  "R-lower": Object.freeze({ physicalSlot: "Q-RL", coverage: Object.freeze(["R5", "R6", "R7", "R8"]) }),
});

export const QUADRANT_ALIASES = Object.freeze(Object.keys(QUADRANT_MAP));

export function createFixture(scenario = "online") {
  if (!fixture.scenarios.includes(scenario)) throw new Error(`Unknown mock scenario: ${scenario}`);
  const slots = fixture.slots.map((slot) => ({
    ...slot,
    online: scenario === "offline" && slot.slot === "L5" ? false : slot.online,
    capabilities: {
      ...slot.capabilities,
      flowNames: Array.isArray(slot.capabilities.flowNames) && slot.capabilities.flowNames.length ? [...slot.capabilities.flowNames] : slot.capabilities.flow ? ["interactive-light-flow"] : [],
      flow: scenario === "unsupported-capability" && ["R5", "R6", "R7", "R8"].includes(slot.slot) ? false : slot.capabilities.flow,
    },
  }));
  return { profile: fixture.profile, region: fixture.region, gateway: { ...fixture.gateway }, slots, scenario };
}

export function createTopology(mode = "mock-16", scenario = "online") {
  if (!["mock-16", "proxy-4"].includes(mode)) throw new Error(`Unknown topology mode: ${mode}`);
  const source = createFixture(scenario);
  if (mode === "mock-16") {
    return {
      mode,
      reduced: false,
      physicalCount: 16,
      logicalCount: 16,
      gateway: { alias: "IFA Gateway", online: source.gateway.online },
      targets: source.slots.map((slot) => ({
        alias: slot.slot,
        slot: slot.slot,
        id: slot.id,
        online: slot.online,
        capabilities: { ...slot.capabilities },
        coverage: [slot.slot],
      })),
      evidenceLabel: "16-light deterministic mock parity validated",
      scenario,
    };
  }
  const bySlot = new Map(source.slots.map((slot) => [slot.slot, slot]));
  const targets = QUADRANT_ALIASES.map((alias) => {
    const mapping = QUADRANT_MAP[alias];
    const representative = bySlot.get(mapping.coverage[0]);
    const members = mapping.coverage.map((slot) => bySlot.get(slot));
    return {
      alias,
      slot: mapping.physicalSlot,
      id: `proxy-${mapping.physicalSlot.toLowerCase()}`,
      online: members.every((item) => item?.online),
      capabilities: {
        rgb: members.every((item) => item?.capabilities.rgb),
        brightness: members.every((item) => item?.capabilities.brightness),
        flowNames: commonFlowNames(members.map((item) => item?.capabilities?.flowNames || [])),
        flow: members.every((item) => item?.capabilities.flow) && commonFlowNames(members.map((item) => item?.capabilities?.flowNames || [])).length > 0,
      },
      coverage: [...mapping.coverage],
      representative: representative?.slot || null,
    };
  });
  return {
    mode: "proxy-4",
    reduced: true,
    physicalCount: 4,
    logicalCount: 16,
    gateway: { alias: "IFA Gateway", online: source.gateway.online },
    targets,
    evidenceLabel: "4-light deterministic mock quadrant parity validated",
    scenario,
  };
}

export function publicTopology(topology) {
  return {
    mode: topology.mode,
    reduced: topology.reduced,
    physicalCount: topology.physicalCount,
    logicalCount: topology.logicalCount,
    gateway: { alias: "IFA Gateway", online: Boolean(topology.gateway?.online) },
    evidenceLabel: topology.evidenceLabel,
    scenario: topology.scenario,
    targets: topology.targets.map((target) => ({
      alias: target.alias,
      slot: target.slot,
      online: Boolean(target.online),
      capabilities: { rgb: Boolean(target.capabilities.rgb), brightness: Boolean(target.capabilities.brightness), flow: Boolean(target.capabilities.flow) },
      coverage: [...target.coverage],
    })),
  };
}

export function assertTopologyReady(topology, required = { rgb: true, brightness: true }) {
  if (!topology || !Array.isArray(topology.targets) || topology.targets.length !== topology.physicalCount) {
    return { ok: false, reason: "topology_unavailable" };
  }
  if (!["mock-16", "proxy-4", "live-16", "live-proxy-4"].includes(topology.mode)) return { ok: false, reason: "unknown_topology_mode" };
  if (!topology.gateway?.online) return { ok: false, reason: "gateway_offline" };
  if (topology.mode === "mock-16" || topology.mode === "live-16") {
    const slots = topology.targets.map((target) => target.alias);
    if (topology.targets.length !== LOGICAL_SLOTS.length || slots.some((slot, index) => slot !== LOGICAL_SLOTS[index])) return { ok: false, reason: "logical_slot_binding_invalid" };
    if (topology.targets.some((target) => target.coverage?.length !== 1 || target.coverage[0] !== target.alias || target.slot !== target.alias)) return { ok: false, reason: "logical_slot_coverage_invalid" };
  }
  if (topology.reduced && topology.targets.length !== QUADRANT_ALIASES.length) return { ok: false, reason: "quadrant_proxy_requires_four_targets" };
  if (topology.reduced) {
    const aliases = topology.targets.map((target) => target.alias);
    if (new Set(aliases).size !== aliases.length || QUADRANT_ALIASES.some((alias) => !aliases.includes(alias))) return { ok: false, reason: "quadrant_alias_binding_invalid" };
    for (const alias of QUADRANT_ALIASES) {
      const target = topology.targets.find((item) => item.alias === alias);
      if (!target || target.coverage.join(",") !== QUADRANT_MAP[alias].coverage.join(",")) return { ok: false, reason: `${alias}_coverage_invalid` };
    }
  }
  const ids = topology.targets.map((target) => target.id).filter(Boolean);
  if (ids.length !== topology.targets.length || new Set(ids).size !== ids.length) return { ok: false, reason: "target_binding_invalid" };
  if (topology.mode.startsWith("live")) {
    if (typeof topology.bindingRevision !== "string" || !topology.bindingRevision) return { ok: false, reason: "live_binding_provenance_missing" };
    if (topology.provenance !== "live") return { ok: false, reason: "live_binding_provenance_invalid" };
    if (ids.length !== topology.targets.length || new Set(ids).size !== ids.length) return { ok: false, reason: "live_target_binding_invalid" };
  }
  for (const target of topology.targets) {
    if (!target.online) return { ok: false, reason: `${target.alias}_offline` };
    for (const [key, needed] of Object.entries(required)) if (needed && !target.capabilities[key]) return { ok: false, reason: `${target.alias}_${key}_unsupported` };
  }
  return { ok: true };
}

export function aggregatePlan(plan, topology) {
  if (!plan?.phases?.length) throw new Error("plan has no phases");
  if (!topology.reduced) {
    const targetBySlot = new Map(topology.targets.map((target) => [target.slot, target]));
    return {
      phases: plan.phases.map((phase) => ({ phaseId: phase.phaseId, label: phase.label, durationMs: phase.durationMs, targets: [...phase.targets].sort((a, b) => LOGICAL_SLOTS.indexOf(a.slot) - LOGICAL_SLOTS.indexOf(b.slot)).map((target) => ({ ...target, alias: target.slot, id: targetBySlot.get(target.slot)?.id })) })),
      derivedSlots: LOGICAL_SLOTS.map((slot) => ({ slot, alias: slot, source: "physical" })),
    };
  }
  const targetByAlias = new Map(topology.targets.map((target) => [target.alias, target]));
  const slotToAlias = new Map(topology.targets.flatMap((target) => target.coverage.map((slot) => [slot, target.alias])));
  const phases = plan.phases.map((phase) => {
    const groups = new Map();
    for (const target of [...phase.targets].sort((a, b) => LOGICAL_SLOTS.indexOf(a.slot) - LOGICAL_SLOTS.indexOf(b.slot))) {
      const alias = slotToAlias.get(target.slot);
      if (!alias) throw new Error(`unmapped logical slot: ${target.slot}`);
      if (!groups.has(alias)) groups.set(alias, []);
      groups.get(alias).push(target);
    }
    return {
      phaseId: phase.phaseId,
      label: phase.label,
      durationMs: phase.durationMs,
      targets: QUADRANT_ALIASES.map((alias) => {
        const items = groups.get(alias);
        if (!items || items.length !== QUADRANT_MAP[alias].coverage.length) throw new Error(`incomplete quadrant phase: ${alias}`);
        return { alias, id: targetByAlias.get(alias)?.id, ...aggregateTargets(items), coverage: [...(targetByAlias.get(alias)?.coverage || [])] };
      }),
    };
  });
  return {
    phases,
    derivedSlots: topology.targets.flatMap((target) => target.coverage.map((slot) => ({ slot, alias: target.alias, source: "derived_from_proxy" }))),
  };
}

function aggregateTargets(items) {
  const hue = circularMean(items.map((item) => item.hue));
  return {
    hue,
    saturation: boundedInteger(items.reduce((sum, item) => sum + item.saturation, 0) / items.length, 0, 100, 0),
    brightness: boundedInteger(items.reduce((sum, item) => sum + item.brightness, 0) / items.length, 1, 85, 1),
    holdMs: boundedInteger(items.reduce((sum, item) => sum + item.holdMs, 0) / items.length, 400, 12000, 700),
  };
}

function circularMean(values) {
  const radians = values.map((value) => (value * Math.PI) / 180);
  const x = radians.reduce((sum, value) => sum + Math.cos(value), 0) / radians.length;
  const y = radians.reduce((sum, value) => sum + Math.sin(value), 0) / radians.length;
  if (Math.abs(x) < 0.0001 && Math.abs(y) < 0.0001) return Math.round(values[0] || 0);
  return (Math.round((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

export const __testing = { circularMean, aggregateTargets };

function commonFlowNames(nameLists) {
  if (!Array.isArray(nameLists) || !nameLists.length) return [];
  const [first, ...rest] = nameLists.map((names) => new Set(Array.isArray(names) ? names.map((name) => String(name).toLowerCase()) : []));
  return [...first].filter((name) => rest.every((set) => set.has(name))).sort();
}
