export async function inspectGroupManagement(spec, groups, entities, run) {
  const houseId = spec.scope?.homeIds?.[0] || "";
  const group = groups[0];
  const member = entities.find((entity) => entity.family === "light") || entities[0];
  if (!group || !member) return [];
  const probes = [
    { intent: "group.create", target: undefined, parameters: { houseId, name: "能力验证设备组", roomId: group.roomId, groupCapability: "light", groupCategory: "lighting", deviceIds: [member.id] } },
    { intent: "group.update", target: { entityType: "group", id: group.id }, parameters: { houseId, groupId: group.id, name: group.name, description: group.description || "设备组" } },
    { intent: "group.delete", target: { entityType: "group", id: group.id }, parameters: { houseId, groupId: group.id, confirmed: true } },
  ];
  const proven = [];
  for (const probe of probes) {
    const request = { contractVersion: "1.0", requestId: `capability-${probe.intent}`, locale: "zh-CN", utterance: `预览${probe.intent}`, intent: probe.intent, ...(probe.target ? { targets: [probe.target] } : {}), parameters: probe.parameters };
    const result = await run(["invoke", "--stdin", "--preview-only"], { stdin: JSON.stringify(request) });
    const payload = parseCapabilityJSON(result.stdout); const preview = payload?.result?.preview || payload?.result?.planned;
    const noWrite = payload?.result?.dryRun === true && payload?.warnings?.includes("dry_run_no_cloud_write");
    if (result.code === 0 && payload?.status === "success" && noWrite && preview?.intent === probe.intent) proven.push(probe.intent);
  }
  return proven;
}

export async function inspectGroupMemberUpdates(spec, groups, entities, run) {
  const houseId = spec.scope?.homeIds?.[0] || "";
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const schemaByDevice = new Map();
  const inspected = [];
  for (const group of groups) {
    const memberFamilies = [...new Set(group.deviceIds.map((id) => entityById.get(id)?.family).filter(Boolean))];
    const family = group.groupCapability || (memberFamilies.length === 1 ? memberFamilies[0] : "");
    const existing = group.deviceIds.filter((id) => entityById.has(id));
    const additions = [];
    for (const entity of entities) {
      if (group.deviceIds.includes(entity.id) || entity.readOnly === true || entity.capabilityStatus === "version-mismatch" || !groupFamilyMatches(family, entity.family)) continue;
      if (await groupSchemaSupportsComponent(spec, entity, group.componentId, run, schemaByDevice)) additions.push(entity.id);
    }
    const eligible = [...new Set([...existing, ...additions])];
    const candidate = additions[0];
    const deviceIds = candidate ? [...group.deviceIds, candidate] : group.deviceIds.length > 1 ? group.deviceIds.slice(0, -1) : [...group.deviceIds];
    const request = { contractVersion: "1.0", requestId: `capability-group-${group.id}`, locale: "zh-CN", utterance: `预览更新设备组${group.name}成员`, intent: "group.members.update", targets: [{ entityType: "group", id: group.id }], parameters: { houseId, groupId: group.id, deviceIds } };
    const result = await run(["invoke", "--stdin", "--preview-only"], { stdin: JSON.stringify(request) });
    const payload = parseCapabilityJSON(result.stdout); const preview = payload?.result?.preview; const plannedIds = preview?.payloadPreview?.deviceIds;
    const noWrite = payload?.result?.dryRun === true && payload?.traceId === "invoke-preview" && payload?.warnings?.includes("dry_run_no_cloud_write");
    const editable = result.code === 0 && payload?.status === "success" && noWrite && preview?.intent === request.intent && String(preview?.payloadPreview?.groupId || "") === group.id && Array.isArray(plannedIds);
    inspected.push({ ...group, eligibleDeviceIds: eligible, editable, ...(editable ? { evidence: "preview-only" } : {}) });
  }
  return inspected;
}

export function parseCapabilityJSON(output) {
  try {
    return JSON.parse(String(output || "{}"));
  } catch {
    return null;
  }
}

async function groupSchemaSupportsComponent(spec, entity, componentId, run, cache) {
  const expected = String(componentId || "").trim();
  if (!expected) return false;
  let schema = cache.get(entity.id);
  if (schema === undefined) {
    const houseId = spec.scope?.homeIds?.[0] || entity.houseId || "";
    const result = await run(["device", "capabilities", "--device-id", entity.id, ...(houseId ? ["--house-id", houseId] : []), "--json"]);
    const payload = parseCapabilityJSON(result.stdout);
    schema = result.code === 0 && payload?.status === "success" && payload?.result?.schemaStatus !== "not_connected"
      ? payload?.result?.deviceSchema || payload?.result?.data?.deviceSchema || null
      : null;
    cache.set(entity.id, schema);
  }
  if (!schema) return false;
  if (String(schema.componentId || "") === expected) return true;
  return Array.isArray(schema.components) && schema.components.some((component) => String(component?.id || component?.componentId || "") === expected);
}

function groupFamilyMatches(capability, family) {
  if (capability === "infrastructure") return ["gateway", "bridge", "infrastructure"].includes(family);
  return Boolean(capability) && capability === family;
}
