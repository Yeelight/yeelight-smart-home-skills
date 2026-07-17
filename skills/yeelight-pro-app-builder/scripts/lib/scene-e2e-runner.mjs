import path from "node:path";
import { browserActionPaths, classifyExpectedFailures, probeBrowserBoundary, requestBrowserAction, routeNavigationIsValid } from "./e2e-browser-boundary.mjs";

const viewports = [
  { id: "mobile-375", width: 375, height: 812 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "tablet-landscape-1024", width: 1024, height: 768 },
  { id: "desktop-1440", width: 1440, height: 1000 },
];

export async function runSceneBrowserE2E({ chromium, baseUrl, bridgeOrigin, mockServer, evidenceDir }) {
  const report = { startedAt: new Date().toISOString(), baseUrl, bridgeOrigin, checks: [], viewports: [] };
  const browser = await launchBrowser(chromium);
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce", locale: "zh-CN" });
      const page = await context.newPage();
      const diagnostics = collectDiagnostics(page);
      await page.goto(`${baseUrl}#scenes`, { waitUntil: "domcontentloaded" });
      await page.getByText("家庭在线", { exact: true }).waitFor();
      await page.getByRole("heading", { name: "家庭情景", level: 2 }).waitFor();

      check(report, `${viewport.id}:navigation-contract`, await routeNavigationIsValid(page, "情景"), page.url());
      check(report, `${viewport.id}:scene-list`, await sceneNamesVisible(page), "Runtime scene directory is visible");
      check(report, `${viewport.id}:management-surface`, await page.getByRole("button", { name: "新建情景" }).isVisible(), "proven scene management is visible");
      await verifyDirectoryFlow({ page, report, viewport });
      await verifyEditorSurface({ page, report, viewport, evidenceDir });
      await verifyOpaqueDeepLink({ page, report, viewport, baseUrl });
      await verifyReducedMotion({ page, report, viewport });
      if (viewport.id === "mobile-375") await verifyTextResize({ page, report, evidenceDir });

      const layout = await inspectLayout(page);
      check(report, `${viewport.id}:no-horizontal-overflow`, layout.scrollWidth <= layout.clientWidth + 1, layout);
      check(report, `${viewport.id}:touch-targets`, layout.interactive.every((item) => item.width >= 44 && item.height >= 44), layout.interactive);
      check(report, `${viewport.id}:heading-order`, noSkippedHeadingLevel(layout.headings), layout.headings);
      check(report, `${viewport.id}:radius-contract`, layout.radii.every((radius) => radius <= 8), layout.radii);
      check(report, `${viewport.id}:contrast`, layout.contrast.every((ratio) => ratio >= 4.5), layout.contrast);
      const screenshot = path.join(evidenceDir, `${viewport.id}-detail.png`);
      await page.screenshot({ path: screenshot, fullPage: true });

      if (viewport.id === "mobile-375") await runPrimaryFlow({ page, report, bridgeOrigin, mockServer, evidenceDir, baseUrl });
      const expectedPaths = browserActionPaths(["scene.execute", "scene.list", "scene.detail.get", "scene.create", "scene.update", "scene.test", "scene.delete", "automation.enable"]);
      const { unexpectedHttpErrors, unexpectedConsoleErrors } = classifyExpectedFailures(diagnostics, { expectedHttpErrorPaths: expectedPaths });
      check(report, `${viewport.id}:page-errors`, diagnostics.pageErrors.length === 0, diagnostics.pageErrors);
      check(report, `${viewport.id}:request-failures`, diagnostics.failedRequests.length === 0, diagnostics.failedRequests);
      check(report, `${viewport.id}:http-errors`, unexpectedHttpErrors.length === 0, unexpectedHttpErrors);
      check(report, `${viewport.id}:console-errors`, unexpectedConsoleErrors.length === 0, unexpectedConsoleErrors);
      report.viewports.push({ ...viewport, screenshot: path.basename(screenshot), layout, ...diagnostics });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  report.finishedAt = new Date().toISOString();
  report.status = report.checks.every((item) => item.status === "passed") ? "passed" : "failed";
  return report;
}

async function verifyEditorSurface({ page, report, viewport, evidenceDir }) {
  await page.goto(page.url().split("#")[0] + "#scenes", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "新建情景" }).click();
  await page.getByRole("heading", { name: "未命名情景" }).waitFor();
  check(report, `${viewport.id}:create-route`, page.url().endsWith("#scenes/new"), page.url());
  check(report, `${viewport.id}:editor-stepper`, await page.getByRole("navigation", { name: "情景编辑步骤" }).getByRole("button").count() === 3, "three-step editor");
  const screenshot = path.join(evidenceDir, `${viewport.id}-editor.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await page.getByRole("button", { name: "取消" }).click();
  await page.getByRole("heading", { name: "家庭情景", level: 2 }).waitFor();
}

async function verifyDirectoryFlow({ page, report, viewport }) {
  const search = page.getByRole("textbox", { name: "搜索情景" });
  const room = page.getByRole("combobox", { name: "房间" });
  await search.fill("观影");
  check(report, `${viewport.id}:search`, await visibleSceneRows(page) === 1 && await sceneRow(page, "观影").isVisible(), "search narrows to the matching scene");
  await search.fill("");
  await room.selectOption({ label: "玄关" });
  const roomRows = await page.locator(".scene-list-row:visible").allTextContents();
  check(report, `${viewport.id}:room-filter`, roomRows.length > 0 && roomRows.every((text) => text.includes("玄关")), roomRows);
  await room.selectOption("all");

  await search.fill("回家");
  const opener = sceneRow(page, "回家").locator(".scene-open-button");
  await opener.click();
  await page.locator("#scene-detail-title").filter({ hasText: "回家" }).waitFor();
  await page.getByRole("heading", { name: "动作摘要" }).waitFor();
  check(report, `${viewport.id}:detail-deep-link`, page.url().endsWith("#scenes/994001"), page.url());
  check(report, `${viewport.id}:action-summary`, await page.locator(".scene-action-row").count() === 2, await page.locator(".scene-action-row").allTextContents());
  check(report, `${viewport.id}:adaptive-detail`, viewport.width <= 720 ? await page.locator(".scene-master:visible").count() === 0 : await page.locator(".scene-master:visible").count() === 1, viewport);

  await page.goBack();
  await page.locator("#scene-detail-title").waitFor({ state: "hidden" });
  check(report, `${viewport.id}:filter-restored`, await search.inputValue() === "回家", await search.inputValue());
  check(report, `${viewport.id}:focus-restored`, await page.evaluate(() => document.activeElement?.textContent?.includes("回家") === true), await page.evaluate(() => document.activeElement?.textContent || ""));
  await search.fill("");
}

async function verifyOpaqueDeepLink({ page, report, viewport, baseUrl }) {
  await page.goto(`${baseUrl}#scenes/994012`, { waitUntil: "domcontentloaded" });
  await page.locator("#scene-detail-title").filter({ hasText: "户外休闲" }).waitFor();
  const opaque = page.getByText("保留的厂商动作，仅查看", { exact: true });
  await opaque.waitFor();
  check(report, `${viewport.id}:opaque-action-readonly`, await opaque.isVisible() && await page.getByText("未知动作", { exact: true }).count() > 0, await page.locator(".scene-action-list").innerText());
}

async function verifyReducedMotion({ page, report, viewport }) {
  const motion = await page.evaluate(() => {
    const durations = [...document.querySelectorAll(".scene-detail, .scene-action-row, button")]
      .filter((element) => element.getClientRects().length > 0)
      .flatMap((element) => {
        const style = getComputedStyle(element);
        return [style.animationDuration, style.transitionDuration]
          .flatMap((value) => value.split(","))
          .map((value) => value.trim().endsWith("ms") ? Number.parseFloat(value) / 1000 : Number.parseFloat(value) || 0);
      });
    return { matches: matchMedia("(prefers-reduced-motion: reduce)").matches, maxDurationSeconds: Math.max(0, ...durations) };
  });
  check(report, `${viewport.id}:reduced-motion`, motion.matches && motion.maxDurationSeconds <= 0.02, motion);
}

async function verifyTextResize({ page, report, evidenceDir }) {
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await page.waitForTimeout(100);
  const textLayout = await page.evaluate(() => {
    const clipped = [...document.querySelectorAll("button, label, h1, h2, h3, p, strong, small, .scene-action-values span")]
      .filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).overflowX !== "hidden")
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => ({ text: element.textContent?.trim() || "", scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
    return { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, clipped };
  });
  check(report, "mobile-375:text-200-percent", textLayout.scrollWidth <= textLayout.clientWidth + 1 && textLayout.clipped.length === 0, textLayout);
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-text-200-percent.png"), fullPage: true });
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
}

async function runPrimaryFlow({ page, report, bridgeOrigin, mockServer, evidenceDir, baseUrl }) {
  check(report, "api:zero-executions-before-action", Object.keys(mockServer.fixture.sceneExecutions).length === 0, mockServer.fixture.sceneExecutions);
  check(report, "management:baseline-scenes", mockServer.fixture.scenes.length === 12, mockServer.fixture.scenes.length);
  await page.goto(`${baseUrl}#scenes`, { waitUntil: "domcontentloaded" });
  await page.getByText("家庭在线", { exact: true }).waitFor();

  await armFailure(mockServer, "/apis/iot/v1/scene/994002/r/detail");
  await sceneRow(page, "观影").locator(".scene-open-button").click();
  const detailAlert = page.getByRole("alert").filter({ hasText: "此情景详情暂时不可用" });
  await detailAlert.waitFor();
  check(report, "failure:detail-scoped", await detailAlert.getByText(/列表和其它情景仍可使用/).isVisible(), await detailAlert.innerText());
  check(report, "failure:no-technical-leak", !/invoke:|HTTP 503|Runtime|endpoint/i.test(await detailAlert.innerText()), await detailAlert.innerText());
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-detail-failure.png"), fullPage: true });
  await detailAlert.getByRole("button", { name: "重试" }).click();
  await page.getByRole("heading", { name: "动作摘要" }).waitFor();
  check(report, "failure:detail-recovered", await page.locator(".scene-action-row").count() === 2, await page.locator(".scene-action-list").innerText());

  await page.getByRole("button", { name: "执行情景" }).click();
  await waitFor(() => mockServer.fixture.sceneExecutions["994002"] === 1);
  check(report, "execute:success-feedback", await page.locator(".scene-feedback.success").isVisible(), mockServer.fixture.sceneExecutions);

  await page.getByRole("button", { name: "返回情景" }).click();
  await armFailure(mockServer, `/apis/iot/v1/open/control/house/${mockServer.homeId}/control/w/scenes/994001`);
  await sceneRow(page, "回家").locator(".scene-open-button").click();
  await page.getByRole("heading", { name: "动作摘要" }).waitFor();
  await page.getByRole("button", { name: "执行情景" }).click();
  await page.locator(".scene-feedback.error").waitFor();
  check(report, "failure:execute-visible", mockServer.fixture.sceneExecutions["994001"] === undefined, await page.locator(".scene-feedback").innerText());
  await page.getByRole("button", { name: "执行情景" }).click();
  await waitFor(() => mockServer.fixture.sceneExecutions["994001"] === 1);
  check(report, "failure:execute-recovered", await page.locator(".scene-feedback.success").isVisible(), mockServer.fixture.sceneExecutions);

  await armFailure(mockServer, "/apis/iot/v1/scene/r/all");
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  const listAlert = page.getByRole("alert").filter({ hasText: "部分家庭数据同步失败" });
  await listAlert.waitFor();
  check(report, "failure:list-preserves-detail", await page.locator("#scene-detail-title").isVisible(), await listAlert.innerText());
  await listAlert.getByRole("button", { name: "重新同步" }).click();
  await listAlert.waitFor({ state: "hidden" });
  check(report, "failure:list-recovered", await page.locator("#scene-detail-title").isVisible(), "active detail preserved");

  const detailCalls = mockServer.requestLog().filter((entry) => /\/scene\/\d+\/r\/detail$/.test(entry.path));
  check(report, "api:strict-detail-contract", detailCalls.length >= 4 && detailCalls.every((entry) => entry.method === "POST" && Object.keys(entry.body || {}).length === 0), detailCalls.map(({ path, method, body, status }) => ({ path, method, body, status })));
  const executionCalls = mockServer.requestLog().filter((entry) => /\/control\/w\/scenes\//.test(entry.path));
  check(report, "api:strict-execution-contract", executionCalls.length === 3 && executionCalls.every((entry) => entry.method === "POST" && Object.keys(entry.body || {}).length === 0), executionCalls.map(({ path, method, body, status }) => ({ path, method, body, status })));
  const preservationResponse = await requestBrowserAction(bridgeOrigin, "scene.detail.get", { locale: "zh-CN", utterance: "验证情景动作保留", targets: [{ entityType: "scene", id: "994012" }], parameters: { houseId: mockServer.homeId, sceneId: "994012" } });
  const preservationBody = await preservationResponse.json();
  const editablePayload = editablePayloadFromSceneResponse(preservationBody);
  const custom = editablePayload?.actions?.[1]?.custom;
  check(report, "api:editable-payload-lossless", preservationResponse.ok && custom?.vendorMode === "slow-breathe" && custom?.transition === 12 && !JSON.stringify(preservationBody).includes('"params"'), editablePayload);
  const boundary = await probeBrowserBoundary(bridgeOrigin, "automation.enable");
  check(report, "bridge:semantic-route-404", boundary.semanticRoute.status === 404, boundary.semanticRoute);
  check(report, "bridge:unknown-action-403", boundary.unknownAction.status === 403 && boundary.unknownAction.body.status === "blocked", boundary.unknownAction);

  const created = await verifyCreateFlow({ page, report, mockServer, baseUrl, evidenceDir });
  await verifyUpdateAndGuardFlow({ page, report, mockServer, baseUrl, evidenceDir });
  await verifyDeleteFlow({ page, report, mockServer, baseUrl, scene: created, evidenceDir });
  verifyManagementContracts({ report, mockServer });

  await fetch(`${mockServer.origin}/__mock/reset`, { method: "POST" });
  check(report, "restore:deterministic", Object.keys(mockServer.fixture.sceneExecutions).length === 0 && mockServer.fixture.scenes.length === 12, { executions: mockServer.fixture.sceneExecutions, scenes: mockServer.fixture.scenes.length });
}

export function editablePayloadFromSceneResponse(body) {
  const data = body?.result?.data || body?.result || {};
  return data?.editablePayload || data?.detail?.editablePayload;
}

async function verifyCreateFlow({ page, report, mockServer, baseUrl, evidenceDir }) {
  await page.goto(`${baseUrl}#scenes/new`, { waitUntil: "domcontentloaded" });
  const next = page.getByRole("button", { name: "下一步" });
  await next.click();
  check(report, "create:inline-validation", await page.getByRole("alert").filter({ hasText: "请输入情景名称" }).isVisible(), "empty name blocked");
  const name = page.getByLabel("情景名称");
  await name.fill("E2E 阅读灯光");
  await page.getByRole("heading", { name: "E2E 阅读灯光", level: 2 }).waitFor({ state: "visible" });
  const description = page.locator(".scene-form-grid textarea");
  await description.fill("真实 Runtime 创建与回读验证");
  try {
    await waitFor(async () => await description.inputValue() === "真实 Runtime 创建与回读验证");
  } catch {
    throw new Error(`scene description did not settle: ${JSON.stringify({ route: new URL(page.url()).hash, count: await description.count(), values: await description.evaluateAll((elements) => elements.map((element) => element.value)), visible: await description.isVisible() })}`);
  }
  const fieldValues = { name: await name.inputValue(), description: await description.inputValue() };
  if (fieldValues.name !== "E2E 阅读灯光" || fieldValues.description !== "真实 Runtime 创建与回读验证") throw new Error(`scene create fields crossed: ${JSON.stringify(fieldValues)}`);
  check(report, "create:field-integrity", true, fieldValues);
  await next.click();
  await page.getByRole("button", { name: "下一步" }).click();
  check(report, "create:action-validation", await page.getByRole("alert").filter({ hasText: "至少保留或添加一个情景动作" }).isVisible(), "empty actions blocked");
  await page.getByRole("button", { name: "添加动作" }).click();
  const actionRow = page.locator(".scene-action-editor-row").first();
  const targetSelect = actionRow.locator("select").nth(0);
  const propertySelect = actionRow.locator("select").nth(1);
  const targetLabels = await targetSelect.locator("option").allTextContents();
  check(report, "create:evidence-backed-targets", targetLabels.some((value) => value.includes("全屋窗帘")) && !targetLabels.some((value) => /环境传感器|安防传感器|基础设施/.test(value)), targetLabels);
  check(report, "create:boolean-control-target", await selectTargetWithProperty(actionRow, "开关"), await actionRow.innerText());
  await propertySelect.selectOption({ label: "开关" });
  const propertyToggle = actionRow.getByRole("switch");
  check(report, "create:boolean-semantic-switch", await propertyToggle.isVisible() && await propertyToggle.getAttribute("aria-checked") === "true", await actionRow.innerText());
  await propertyToggle.click();
  check(report, "create:boolean-switch-updates", await propertyToggle.getAttribute("aria-checked") === "false", await propertyToggle.getAttribute("aria-label"));
  await propertyToggle.click();
  check(report, "create:color-control-target", await selectTargetWithProperty(actionRow, "颜色"), await actionRow.innerText());
  await propertySelect.selectOption({ label: "颜色" });
  const colorInput = actionRow.locator('input[type="color"]');
  await colorInput.fill("#4d96ff");
  check(report, "create:color-picker-converts-rgb", await colorInput.inputValue() === "#4d96ff" && await actionRow.getByText("#4D96FF").isVisible() && await actionRow.locator('input[type="number"]').count() === 0, await actionRow.innerText());
  const colorLayout = await actionRow.evaluate((element) => { const control = element.querySelector(".property-color-control"); const remove = element.querySelector(".icon-button"); const controlRect = control?.getBoundingClientRect(); const removeRect = remove?.getBoundingClientRect(); return { clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, controlRight: controlRect?.right || 0, removeLeft: removeRect?.left || 0 }; });
  check(report, "create:color-control-no-overlap", colorLayout.scrollWidth <= colorLayout.clientWidth && colorLayout.controlRight <= colorLayout.removeLeft, colorLayout);
  const curtainValue = await targetSelect.locator("option").evaluateAll((options) => options.find((option) => option.textContent?.includes("全屋窗帘"))?.value || "");
  await targetSelect.selectOption(curtainValue);
  check(report, "create:curtain-property", await propertySelect.locator("option").allTextContents().then((items) => items.includes("开合度")), await actionRow.innerText());
  const positionSlider = actionRow.locator('input[type="range"]');
  await positionSlider.fill("64");
  check(report, "create:curtain-semantic-slider", await positionSlider.inputValue() === "64" && await actionRow.getByText("64%").isVisible(), await actionRow.innerText());
  await page.getByRole("button", { name: "下一步" }).click();
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-create-review.png"), fullPage: true });

  const createPath = `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/scene/w/create`;
  await armFailure(mockServer, createPath, "PUT");
  await page.getByRole("button", { name: "检查并保存", exact: true }).click();
  const feedback = page.locator(".scene-editor-feedback.visible");
  await feedback.waitFor();
  check(report, "create:failure-retains-draft", await page.locator(".scene-review-list dd").filter({ hasText: "E2E 阅读灯光" }).isVisible() && mockServer.fixture.scenes.length === 12, { scenes: mockServer.fixture.scenes.length, feedback: await feedback.innerText() });
  await page.getByRole("button", { name: "检查并保存", exact: true }).click();
  await waitFor(() => mockServer.fixture.scenes.some((scene) => scene.name === "E2E 阅读灯光"));
  const created = mockServer.fixture.scenes.find((scene) => scene.name === "E2E 阅读灯光");
  await page.waitForURL((url) => url.hash === `#scenes/${created.id}`);
  await page.locator(".scene-detail").getByRole("heading", { name: "E2E 阅读灯光", level: 2 }).waitFor();
  check(report, "create:write-list-detail-readback", Boolean(created) && created?.editablePayload?.actions?.[0]?.set?.targetPercent === 64 && mockServer.fixture.scenes.length === 13 && page.url().endsWith(`#scenes/${created?.id}`), { sceneId: created?.id, actions: created?.editablePayload?.actions, count: mockServer.fixture.scenes.length, url: page.url() });
  return created;
}

async function selectTargetWithProperty(row, propertyLabel) {
  const targetSelect = row.locator("select").nth(0);
  const propertySelect = row.locator("select").nth(1);
  for (const value of await targetSelect.locator("option").evaluateAll((options) => options.map((option) => option.value))) {
    await targetSelect.selectOption(value);
    if ((await propertySelect.locator("option").allTextContents()).includes(propertyLabel)) return true;
  }
  return false;
}

async function verifyUpdateAndGuardFlow({ page, report, mockServer, baseUrl, evidenceDir }) {
  await page.goto(`${baseUrl}#scenes/994012`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "户外休闲", level: 2 }).waitFor();
  await page.getByRole("button", { name: "编辑情景" }).click();
  const description = page.locator(".scene-form-grid textarea");
  await description.fill("保留厂商动作的 E2E 更新验证");
  await page.getByRole("button", { name: "下一步" }).click();
  check(report, "update:opaque-action-readonly", await page.getByText("保留的厂商动作，仅查看；保存时原样回传。").isVisible(), await page.locator(".scene-action-editor-list").innerText());
  await page.getByRole("button", { name: "下一步" }).click();
  const updatePath = `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/scene/994012/w/modify`;
  await armFailure(mockServer, updatePath, "POST");
  const save = page.getByRole("button", { name: "检查并保存", exact: true });
  let updateCalls = mutationCallCount(mockServer, updatePath);
  await save.click();
  await waitForMutationFeedback({ page, button: save, mockServer, path: updatePath, previousCalls: updateCalls });
  check(report, "update:failure-retains-draft", await page.locator(".scene-review-list dd").filter({ hasText: "保留厂商动作的 E2E 更新验证" }).isVisible() && page.url().endsWith("#scenes/994012/edit"), await page.locator(".scene-editor-feedback").innerText());
  await armNoop(mockServer, updatePath, "POST");
  updateCalls = mutationCallCount(mockServer, updatePath);
  await save.click();
  await waitForMutationFeedback({ page, button: save, mockServer, path: updatePath, previousCalls: updateCalls });
  check(report, "update:noop-readback-rejected", page.url().endsWith("#scenes/994012/edit") && await page.locator(".scene-review-list dd").filter({ hasText: "保留厂商动作的 E2E 更新验证" }).isVisible(), await page.locator(".scene-editor-feedback").innerText());
  await save.click();
  await waitFor(() => mockServer.fixture.scenes.find((scene) => scene.id === "994012")?.description === "保留厂商动作的 E2E 更新验证");
  await page.waitForURL((url) => url.hash === "#scenes/994012");
  await page.locator(".scene-detail").getByRole("heading", { name: "户外休闲", level: 2 }).waitFor();
  const updated = mockServer.fixture.scenes.find((scene) => scene.id === "994012");
  const custom = updated?.editablePayload?.actions?.[1]?.raw;
  check(report, "update:write-detail-readback-lossless", updated?.description === "保留厂商动作的 E2E 更新验证" && custom?.vendorMode === "slow-breathe" && custom?.transition === 12, updated);
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-update-success.png"), fullPage: true });

  const beforeTest = Number(mockServer.fixture.sceneExecutions["994012"] || 0);
  const testPath = `/apis/iot/v1/open/control/house/${mockServer.homeId}/control/w/scenes/994012`;
  await armFailure(mockServer, testPath, "POST", { delayMs: 3000 });
  await page.getByRole("button", { name: "测试情景" }).click();
  const timeoutFeedback = page.locator(".scene-feedback.visible");
  await timeoutFeedback.getByText(/超时|重试/).waitFor();
  check(report, "test:timeout-retains-state", Number(mockServer.fixture.sceneExecutions["994012"] || 0) === beforeTest && await page.getByRole("button", { name: "测试情景" }).isEnabled(), await timeoutFeedback.innerText());
  await waitFor(() => mockServer.requestLog().some((entry) => entry.path === testPath && entry.status === 503), 5000);
  await page.getByRole("button", { name: "测试情景" }).click();
  await waitFor(() => Number(mockServer.fixture.sceneExecutions["994012"] || 0) === beforeTest + 1);
  check(report, "test:timeout-recovered", await page.locator(".scene-feedback.visible").isVisible(), mockServer.fixture.sceneExecutions);
  check(report, "test:independent-state", page.url().endsWith("#scenes/994012") && await page.getByRole("button", { name: "执行情景" }).isEnabled(), mockServer.fixture.sceneExecutions);

  await page.getByRole("button", { name: "编辑情景" }).click();
  const name = page.getByLabel("情景名称");
  await name.fill("未保存的户外休闲");
  await page.goBack();
  const guard = page.getByRole("dialog", { name: "保留当前更改？" });
  await guard.waitFor();
  check(report, "guard:browser-back-blocked", page.url().endsWith("#scenes/994012/edit") && await name.inputValue() === "未保存的户外休闲", page.url());
  await guard.getByRole("button", { name: "继续编辑" }).click();
  await page.getByRole("button", { name: "取消" }).click();
  await guard.waitFor();
  await guard.getByRole("button", { name: "放弃更改" }).click();
  await page.getByRole("heading", { name: "户外休闲", level: 2 }).waitFor();
  check(report, "guard:discard-restores-route", page.url().endsWith("#scenes/994012"), page.url());
}

async function verifyDeleteFlow({ page, report, mockServer, baseUrl, scene, evidenceDir }) {
  await page.goto(`${baseUrl}#scenes/${scene.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: scene.name, level: 2 }).waitFor();
  await page.getByRole("button", { name: "删除情景" }).click();
  const dialog = page.getByRole("dialog", { name: `删除“${scene.name}”` });
  const confirm = dialog.getByRole("button", { name: "确认删除" });
  const deletePath = `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/scene/${scene.id}/w/info`;
  await armFailure(mockServer, deletePath, "DELETE");
  await confirm.click();
  await dialog.getByRole("alert").waitFor();
  check(report, "delete:failure-preserves-scene", mockServer.fixture.scenes.some((item) => item.id === scene.id), await dialog.innerText());
  await armNoop(mockServer, deletePath, "DELETE");
  await confirm.click();
  await dialog.getByRole("alert").waitFor();
  check(report, "delete:noop-absence-check", mockServer.fixture.scenes.some((item) => item.id === scene.id), await dialog.innerText());
  await confirm.click();
  await page.getByRole("heading", { name: "家庭情景", level: 2 }).waitFor();
  check(report, "delete:preview-confirm-absence", !mockServer.fixture.scenes.some((item) => item.id === scene.id) && mockServer.fixture.scenes.length === 12, mockServer.fixture.scenes.length);
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-delete-success.png"), fullPage: true });
}

function verifyManagementContracts({ report, mockServer }) {
  const calls = mockServer.requestLog();
  const creates = calls.filter((entry) => /\/scene\/w\/create$/.test(entry.path));
  const updates = calls.filter((entry) => /\/scene\/994012\/w\/modify$/.test(entry.path));
  const deletes = calls.filter((entry) => /\/scene\/\d+\/w\/info$/.test(entry.path));
  check(report, "api:strict-create-contract", creates.length === 2 && creates.every((entry) => entry.method === "PUT" && Array.isArray(entry.body?.details) && entry.body.details.length === 1), creates.map(contractEntry));
  check(report, "api:strict-update-contract", updates.length === 3 && updates.every((entry) => entry.method === "POST" && String(entry.body?.id) === "994012" && String(entry.body?.sceneId) === "994012"), updates.map(contractEntry));
  check(report, "api:strict-delete-contract", deletes.length === 3 && deletes.every((entry) => entry.method === "DELETE" && entry.body == null), deletes.map(contractEntry));
}

function contractEntry({ path, method, body, status }) { return { path, method, body, status }; }

function sceneRow(page, name) { return page.locator(".scene-list-row").filter({ hasText: name }); }
async function visibleSceneRows(page) { return page.locator(".scene-list-row:visible").count(); }
async function sceneNamesVisible(page) { return (await Promise.all(["回家", "观影", "晚安"].map((name) => sceneRow(page, name).isVisible()))).every(Boolean); }
async function armFailure(mockServer, apiPath, method = "POST", options = {}) { const response = await fetch(`${mockServer.origin}/__mock/fail-next`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method, path: apiPath, status: options.status || 503, delayMs: options.delayMs || 0, remaining: options.remaining || 1 }) }); if (!response.ok) throw new Error(`failed to arm ${apiPath}`); }
async function armNoop(mockServer, apiPath, method) { const response = await fetch(`${mockServer.origin}/__mock/succeed-without-mutation-next`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method, path: apiPath }) }); if (!response.ok) throw new Error(`failed to arm noop ${apiPath}`); }
function mutationCallCount(mockServer, apiPath) { return mockServer.requestLog().filter((entry) => entry.path === apiPath).length; }
async function waitForMutationFeedback({ page, button, mockServer, path: apiPath, previousCalls }) {
  await waitFor(() => mutationCallCount(mockServer, apiPath) > previousCalls);
  await button.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const control = [...document.querySelectorAll("button")].find((item) => item.textContent?.includes("检查并保存"));
    const feedback = document.querySelector(".scene-editor-feedback.visible");
    return Boolean(control && !control.hasAttribute("disabled") && feedback?.textContent?.trim());
  });
}
function noSkippedHeadingLevel(headings) { return headings.every((heading, index) => index === 0 || heading.level <= headings[index - 1].level + 1); }
function collectDiagnostics(page) { const diagnostics = { consoleMessages: [], pageErrors: [], failedRequests: [], httpErrors: [] }; page.on("console", (message) => diagnostics.consoleMessages.push({ type: message.type(), text: message.text() })); page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message)); page.on("requestfailed", (request) => diagnostics.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || "unknown" })); page.on("response", (response) => { if (response.status() >= 400) diagnostics.httpErrors.push({ url: response.url(), status: response.status() }); }); return diagnostics; }
async function inspectLayout(page) { return page.evaluate(() => { const rgb = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number); const luminance = (color) => color.map((part) => { const channel = part / 255; return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; }).reduce((sum, part, index) => sum + part * [0.2126, 0.7152, 0.0722][index], 0); const ratio = (foreground, background) => { const values = [luminance(rgb(foreground)), luminance(rgb(background))].sort((a, b) => b - a); return (values[0] + 0.05) / (values[1] + 0.05); }; const effectiveBackground = (element) => { let current = element; while (current) { const color = getComputedStyle(current).backgroundColor; const parts = color.match(/[\d.]+/g) || []; if (parts.length < 4 || Number(parts[3]) > 0) return color; current = current.parentElement; } return getComputedStyle(document.body).backgroundColor; }; const body = getComputedStyle(document.body); const muted = document.querySelector(".scene-action-row small"); return { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, interactive: [...document.querySelectorAll("button, a, input, select")].filter((element) => { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0; }).map((element) => { const rect = element.getBoundingClientRect(); return { name: element.getAttribute("aria-label") || element.textContent?.trim() || "", width: rect.width, height: rect.height }; }), headings: [...document.querySelectorAll("h1, h2, h3")].filter((heading) => getComputedStyle(heading).display !== "none" && heading.getClientRects().length > 0).map((heading) => ({ level: Number(heading.tagName.slice(1)), text: heading.textContent?.trim() || "" })), radii: [...document.querySelectorAll(".scene-directory, .scene-run-button, .scene-back-button, .scene-action-values span")].map((element) => parseFloat(getComputedStyle(element).borderRadius) || 0), contrast: [ratio(body.color, body.backgroundColor), ...(muted ? [ratio(getComputedStyle(muted).color, effectiveBackground(muted))] : [])] }; }); }
function check(report, id, passed, detail) { report.checks.push({ id, status: passed ? "passed" : "failed", detail: detail && typeof detail === "object" ? structuredClone(detail) : detail }); }
async function waitFor(predicate, timeoutMs = 10000) { const started = Date.now(); while (Date.now() - started < timeoutMs) { if (await predicate()) return; await new Promise((resolve) => setTimeout(resolve, 80)); } throw new Error("timed out waiting for scene state change"); }
async function launchBrowser(chromium) { try { return await chromium.launch({ channel: process.env.YPA_PLAYWRIGHT_CHANNEL || "chrome", headless: true }); } catch (channelError) { try { return await chromium.launch({ headless: true }); } catch { throw new Error(`无法启动 Chromium。${channelError instanceof Error ? channelError.message : ""}`); } } }
