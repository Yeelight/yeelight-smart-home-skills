const definitions = {
  "home.space-summary": [
    contribution({ route: "overview", label: "总览", icon: "Home", priority: 10, homeSlot: "status", component: "HomeStatusSummary", model: "home", render: "<HomeStatusSummary areas={homeModel.areas} rooms={homeModel.rooms} devices={homeModel.devices} loading={homeModel.loading} />" }),
    contribution({ route: "overview", label: "总览", icon: "Home", priority: 14, homeSlot: "rooms", component: "HomeRoomsSummary", model: "home", render: "<HomeRoomsSummary areas={homeModel.areas} rooms={homeModel.rooms} devices={homeModel.devices} onNavigate={navigatePath} />" }),
    contribution({ route: "overview", label: "总览", icon: "Home", priority: 18, homeSlot: "issues", component: "HomeIssuesSummary", model: "home", render: "<HomeIssuesSummary devices={homeModel.devices} />" }),
  ],
  "home.lighting-summary": contribution({ route: "overview", label: "总览", icon: "Home", priority: 20, component: "HomeLightingSummary", model: "light", render: "<HomeLightingSummary devices={lightModel.devices} loading={lightModel.loading} />" }),
  "room.device-management": [
    contribution({ route: "spaces", label: "空间", icon: "PanelsTopLeft", priority: 30, component: "SpaceDirectory", model: "home", render: "<SpaceDirectory areas={homeModel.areas} rooms={homeModel.rooms} devices={homeModel.devices} areaDetails={homeModel.areaDetails} roomDetails={homeModel.roomDetails} detailLoading={homeModel.spaceDetailLoading} detailErrors={homeModel.spaceDetailErrors} loadAreaDetail={homeModel.loadAreaDetail} loadRoomDetail={homeModel.loadRoomDetail} activeRoute={activeRoute} onNavigate={navigatePath} />" }),
    contribution({ route: "devices", label: "设备", icon: "LayoutGrid", priority: 31, component: "RoomDeviceManagement", model: "home", render: "<RoomDeviceManagement areas={homeModel.areas} rooms={homeModel.rooms} devices={homeModel.devices} details={homeModel.deviceDetails} detailLoading={homeModel.detailLoading} detailErrors={homeModel.detailErrors} loadDeviceDetail={homeModel.loadDeviceDetail} refreshDevice={homeModel.refreshDevice} activeRoute={activeRoute} onNavigate={navigatePath} />" }),
  ],
  "room.lighting-control": contribution({ route: "lights", label: "灯光", icon: "Lightbulb", priority: 40, component: "RoomLightingControl", model: "light", render: "<RoomLightingControl devices={lightModel.devices} />" }),
  "device.curtain-control": contribution({ route: "curtains", label: "窗帘", icon: "Blinds", priority: 50, component: "DeviceCurtainControl", model: "curtain", render: "<DeviceCurtainControl devices={curtainModel.devices} loading={curtainModel.loading} updatePosition={curtainModel.updatePosition} />" }),
  "device.switch-control": contribution({ route: "switches", label: "开关", icon: "ToggleLeft", priority: 60, component: "DeviceSwitchControl", model: "switch", render: "<DeviceSwitchControl devices={switchModel.devices} loading={switchModel.loading} updateProperty={switchModel.updateProperty} />" }),
  "device.climate-control": contribution({ route: "climate", label: "温控", icon: "Thermometer", priority: 70, component: "DeviceClimateControl", model: "climate", render: "<DeviceClimateControl devices={climateModel.devices} loading={climateModel.loading} updateProperty={climateModel.updateProperty} />" }),
  "sensor.environment": contribution({ route: "environment", label: "环境", icon: "Activity", priority: 80, component: "SensorEnvironment", model: "sensor", render: "<SensorEnvironment devices={sensorModel.devices} events={sensorModel.events} loading={sensorModel.loading} eventError={sensorModel.eventError} retry={sensorModel.refresh} />" }),
  "scene.launcher": contribution({ route: "scenes", label: "情景", icon: "Sparkles", priority: 90, component: "SceneLauncher", model: "scene", render: "<SceneLauncher scenes={sceneModel.scenes} loading={sceneModel.loading} execute={sceneModel.execute} />" }),
  "automation.manager": contribution({ route: "automations", label: "自动化", icon: "Workflow", priority: 100, component: "AutomationManager", model: "automation", render: "<AutomationManager automations={automationModel.automations} loading={automationModel.loading} toggle={automationModel.toggle} />" }),
  "group.manager": contribution({ route: "groups", label: "设备组", icon: "Users", priority: 110, component: "GroupManager", model: "group", render: "<GroupManager {...groupModel} activeRoute={activeRoute} onNavigate={navigatePath} />" }),
  "gateway.overview": contribution({ route: "gateways", label: "网关与协议", shortLabel: "网关", icon: "Router", priority: 120, component: "GatewayOverview", model: "gateway", render: "<GatewayOverview {...gatewayModel} activeRoute={activeRoute} onNavigate={navigatePath} />" }),
  "panel.manager": contribution({ route: "panels", label: "面板旋钮", shortLabel: "面板", icon: "SlidersHorizontal", priority: 130, component: "PanelManager", model: "panel", render: "<PanelManager {...panelModel} activeRoute={activeRoute} onNavigate={navigatePath} />" }),
  "installer.maintenance": [
    contribution({ route: "maintenance", label: "维护总览", shortLabel: "维护", icon: "Wrench", priority: 5, component: "InstallerOverview", model: "gateway", render: installerRender("InstallerOverview") }),
    contribution({ route: "issues", label: "异常设备", shortLabel: "异常", icon: "TriangleAlert", priority: 140, component: "InstallerIssues", model: "gateway", render: installerRender("InstallerIssues") }),
    contribution({ route: "diagnostics", label: "版本与诊断", shortLabel: "诊断", icon: "ShieldAlert", priority: 150, component: "InstallerDiagnostics", model: "gateway", render: installerRender("InstallerDiagnostics") }),
  ],
};

const optionalHomeSlots = {
  "sensor.environment": contribution({ route: "overview", label: "总览", icon: "Home", priority: 12, homeSlot: "environment", component: "HomeEnvironmentSummary", model: "sensor", render: "<HomeEnvironmentSummary devices={sensorModel.devices} loading={sensorModel.loading} error={sensorModel.stateError} retry={sensorModel.refresh} />" }),
  "scene.launcher": contribution({ route: "overview", label: "总览", icon: "Home", priority: 16, homeSlot: "scenes", component: "HomeSceneSummary", model: "scene", render: "<HomeSceneSummary scenes={sceneModel.scenes} loading={sceneModel.loading} execute={sceneModel.execute} />" }),
};

const homeSlots = ["status", "environment", "rooms", "scenes", "issues"];

const models = {
  home: model("useHomeModel", "use-home-model", "const homeModel = useHomeModel();", "homeModel.loading", "homeModel.error", "homeModel.refresh"),
  light: model("useLightDevices", "use-light-devices", "const lightModel = useLightDevices();", "lightModel.loading", "lightModel.error", "lightModel.refresh"),
  curtain: model("useCurtainDevices", "use-curtain-devices", "const curtainModel = useCurtainDevices();", "curtainModel.loading", "curtainModel.error", "curtainModel.refresh"),
  switch: model("useSwitchDevices", "use-switch-devices", "const switchModel = useSwitchDevices();", "switchModel.loading", "switchModel.error", "switchModel.refresh"),
  climate: model("useClimateDevices", "use-climate-devices", "const climateModel = useClimateDevices();", "climateModel.loading", "climateModel.error", "climateModel.refresh"),
  sensor: model("useSensorEnvironment", "use-sensor-environment", "const sensorModel = useSensorEnvironment();", "sensorModel.loading", "sensorModel.stateError || sensorModel.eventError", "sensorModel.refresh"),
  scene: model("useScenes", "use-scenes", "const sceneModel = useScenes();", "sceneModel.loading", "sceneModel.error", "sceneModel.refresh"),
  automation: model("useAutomations", "use-automations", "const automationModel = useAutomations();", "automationModel.loading", "automationModel.error", "automationModel.refresh"),
  group: model("useGroups", "use-groups", "const groupModel = useGroups();", "groupModel.loading", "groupModel.error", "groupModel.refresh"),
  gateway: model("useGateways", "use-gateways", "const gatewayModel = useGateways();", "gatewayModel.loading", "firstObjectError(gatewayModel.errors)", "gatewayModel.refresh"),
  panel: model("usePanels", "use-panels", "const panelModel = usePanels();", "panelModel.loading", "firstObjectError(panelModel.errors)", "panelModel.refresh"),
};

export function resolvePageContributions(selected, moduleTemplates, managementOperations = {}) {
  if (new Set(selected).size !== selected.length) throw new Error("ProductSpec 重复选择模块");
  const homeEnabled = selected.includes("home.space-summary");
  const contributions = selected.flatMap((moduleId) => {
    const entries = definitions[moduleId];
    if (!entries) throw new Error(`模块 ${moduleId} 缺少页面 contribution`);
    const template = moduleTemplates[moduleId];
    if (!template) throw new Error(`模块 ${moduleId} 缺少模板定义`);
    const selectedEntries = Array.isArray(entries) ? [...entries] : [entries];
    if (moduleId === "installer.maintenance") {
      const modelId = selected.includes("gateway.overview") ? "gateway" : "panel";
      for (let index = 0; index < selectedEntries.length; index += 1) {
        selectedEntries[index] = { ...selectedEntries[index], modelId, render: installerRender(selectedEntries[index].component, selected) };
      }
    }
    if (moduleId === "scene.launcher" && managementOperations[moduleId]?.detail?.enabled) {
      selectedEntries[0] = contribution({ route: "scenes", label: "情景", icon: "Sparkles", priority: 90, component: "SceneLauncher", model: "scene", render: sceneManagementRender(managementOperations[moduleId]) });
    }
    if (moduleId === "automation.manager" && managementOperations[moduleId]) {
      selectedEntries[0] = contribution({ route: "automations", label: "自动化", icon: "Workflow", priority: 100, component: "AutomationManager", model: "automation", render: automationManagementRender(managementOperations[moduleId]) });
    }
    if (homeEnabled && optionalHomeSlots[moduleId]) selectedEntries.push(optionalHomeSlots[moduleId]);
    return selectedEntries.map((definition) => ({
      ...definition,
      moduleId,
      directory: template.directory,
      model: models[definition.modelId],
    }));
  }).sort((left, right) => left.priority - right.priority || left.moduleId.localeCompare(right.moduleId));
  const slots = contributions.filter((item) => item.homeSlot);
  if (slots.some((item) => !homeSlots.includes(item.homeSlot))) throw new Error("Home slot 不受支持");
  if (new Set(slots.map((item) => item.homeSlot)).size !== slots.length) throw new Error("存在重复的 Home slot");
  return contributions;
}

function contribution(input) {
  return { shortLabel: input.label, ...input, modelId: input.model };
}

function installerRender(component, selected = ["gateway.overview", "panel.manager"]) {
  const gateway = selected.includes("gateway.overview");
  const panel = selected.includes("panel.manager");
  return `<${component} gateways={${gateway ? "gatewayModel.gateways" : "[]"}} panels={${panel ? "panelModel.panels" : "[]"}} knobs={${panel ? "panelModel.knobs" : "[]"}} gatewayErrors={${gateway ? "gatewayModel.errors" : "{}"}} panelErrors={${panel ? "panelModel.errors" : "{}"}} refreshGateways={${gateway ? "gatewayModel.refresh" : "async () => {}"}} refreshPanels={${panel ? "panelModel.refresh" : "async () => {}"}} onNavigate={navigatePath} />`;
}

function model(hook, file, binding, loading, error, refresh) {
  return { hook, file, binding, loading, error, refresh };
}

function sceneManagementRender(operations) {
  const props = [
    "scenes={sceneModel.scenes}",
    "loading={sceneModel.loading}",
    "execute={sceneModel.execute}",
    "details={sceneModel.details}",
    "detailLoading={sceneModel.detailLoading}",
    "detailErrors={sceneModel.detailErrors}",
    "loadDetail={sceneModel.loadDetail}",
    "activeRoute={activeRoute}",
    "onNavigate={navigatePath}",
    operations.create.enabled && "previewCreate={sceneModel.previewCreate}",
    operations.create.enabled && "createScene={sceneModel.createScene}",
    operations.update.enabled && "previewUpdate={sceneModel.previewUpdate}",
    operations.update.enabled && "updateScene={sceneModel.updateScene}",
    operations.test.enabled && "testScene={sceneModel.testScene}",
    operations.delete.enabled && "previewDelete={sceneModel.previewDelete}",
    operations.delete.enabled && "deleteScene={sceneModel.deleteScene}",
  ].filter(Boolean);
  return `<SceneLauncher ${props.join(" ")} />`;
}

function automationManagementRender(operations) {
  const props = [
    "automations={automationModel.automations}",
    "loading={automationModel.loading}",
    "toggle={automationModel.toggle}",
    operations.detail.enabled && "activeRoute={activeRoute}",
    operations.detail.enabled && "onNavigate={navigatePath}",
    operations.detail.enabled && "details={automationModel.details}",
    operations.detail.enabled && "detailLoading={automationModel.detailLoading}",
    operations.detail.enabled && "detailErrors={automationModel.detailErrors}",
    operations.detail.enabled && "loadDetail={automationModel.loadDetail}",
    (operations.supported.enabled || operations.supportedV2.enabled) && "registry={automationModel.registry}",
    (operations.supported.enabled || operations.supportedV2.enabled) && "registryLoading={automationModel.registryLoading}",
    (operations.supported.enabled || operations.supportedV2.enabled) && "registryError={automationModel.registryError}",
    operations.create.enabled && "previewCreate={automationModel.previewCreate}",
    operations.create.enabled && "createAutomation={automationModel.createAutomation}",
    operations.update.enabled && "previewUpdate={automationModel.previewUpdate}",
    operations.update.enabled && "updateAutomation={automationModel.updateAutomation}",
    operations.delete.enabled && "previewDelete={automationModel.previewDelete}",
    operations.delete.enabled && "deleteAutomation={automationModel.deleteAutomation}",
    !operations.detail.enabled && `detailUnavailableReason=${JSON.stringify(operations.detail.userMessage)}`,
  ].filter(Boolean);
  return `<AutomationManager ${props.join(" ")} />`;
}
