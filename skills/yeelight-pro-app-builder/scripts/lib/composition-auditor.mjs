export function auditPageComposition({ selected, contributions, privateActions = [], intentOwners = {} }) {
  const checks = [];
  const selectedSet = new Set(selected);
  check(checks, "selected-modules-unique", selectedSet.size === selected.length, duplicates(selected));

  const tracedModules = new Set(contributions.map(({ moduleId }) => moduleId));
  check(checks, "selected-modules-traceable", selected.every((moduleId) => tracedModules.has(moduleId)), selected.filter((moduleId) => !tracedModules.has(moduleId)));
  check(checks, "no-unselected-contributions", contributions.every(({ moduleId }) => selectedSet.has(moduleId)), contributions.filter(({ moduleId }) => !selectedSet.has(moduleId)).map(({ moduleId }) => moduleId));

  const routeGroups = groupBy(contributions, ({ route }) => route);
  const routeConflicts = [...routeGroups.entries()].flatMap(([route, entries]) => {
    const labels = unique(entries.map(({ label }) => label));
    const icons = unique(entries.map(({ icon }) => icon));
    return labels.length > 1 || icons.length > 1 ? [{ route, labels, icons, modules: unique(entries.map(({ moduleId }) => moduleId)) }] : [];
  });
  check(checks, "route-navigation-consistency", routeConflicts.length === 0, routeConflicts);

  const slotRows = contributions.filter(({ homeSlot }) => homeSlot);
  check(checks, "home-slots-unique", unique(slotRows.map(({ homeSlot }) => homeSlot)).length === slotRows.length, duplicates(slotRows.map(({ homeSlot }) => homeSlot)));

  const hookConflicts = ownershipConflicts(contributions, ({ model }) => model?.hook, ({ model }) => model?.file);
  check(checks, "runtime-hook-consistency", hookConflicts.length === 0, hookConflicts);
  const componentConflicts = ownershipConflicts(contributions, ({ component }) => component, ({ directory }) => directory);
  check(checks, "component-import-consistency", componentConflicts.length === 0, componentConflicts);

  const actionIds = privateActions.map(({ actionId }) => actionId);
  const actionIntents = privateActions.map(({ intent }) => intent);
  check(checks, "opaque-actions-unique", unique(actionIds).length === actionIds.length, duplicates(actionIds));
  check(checks, "allowlist-intents-unique", unique(actionIntents).length === actionIntents.length, duplicates(actionIntents));
  const unknownActions = privateActions.filter(({ intent }) => !(intent in intentOwners) || !intentOwners[intent].some((moduleId) => selectedSet.has(moduleId)));
  check(checks, "allowlist-owned-by-selected-module", unknownActions.length === 0, unknownActions);

  const routes = [...routeGroups.entries()].map(([route, entries]) => ({
    route,
    label: entries[0].label,
    icon: entries[0].icon,
    modules: unique(entries.map(({ moduleId }) => moduleId)),
    slots: entries.map(({ homeSlot }) => homeSlot).filter(Boolean),
  }));
  return {
    schemaVersion: 1,
    status: checks.every(({ status }) => status === "passed") ? "passed" : "failed",
    checks,
    summary: {
      selectedModules: [...selected],
      contributionCount: contributions.length,
      routes,
      hooks: unique(contributions.map(({ model }) => model?.hook).filter(Boolean)),
      components: unique(contributions.map(({ component }) => component)),
      actions: privateActions.map(({ actionId, intent }) => ({ actionId, intent })),
    },
  };
}

export function intentOwnersForModules(moduleIntents, overrides = {}) {
  const owners = {};
  for (const [moduleId, intents] of Object.entries({ ...moduleIntents, ...overrides })) {
    for (const intent of intents || []) (owners[intent] ||= []).push(moduleId);
  }
  return Object.fromEntries(Object.entries(owners).map(([intent, modules]) => [intent, unique(modules).sort()]));
}

function ownershipConflicts(entries, keyOf, ownerOf) {
  const groups = groupBy(entries.filter((entry) => keyOf(entry)), keyOf);
  return [...groups.entries()].flatMap(([key, rows]) => {
    const owners = unique(rows.map(ownerOf));
    return owners.length > 1 ? [{ key, owners, modules: unique(rows.map(({ moduleId }) => moduleId)) }] : [];
  });
}

function groupBy(values, keyOf) {
  const groups = new Map();
  for (const value of values) {
    const key = keyOf(value);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  return groups;
}

function duplicates(values) {
  return unique(values.filter((value, index) => values.indexOf(value) !== index));
}

function unique(values) {
  return [...new Set(values)];
}

function check(checks, id, passed, detail) {
  checks.push({ id, status: passed ? "passed" : "failed", detail: structuredClone(detail) });
}
