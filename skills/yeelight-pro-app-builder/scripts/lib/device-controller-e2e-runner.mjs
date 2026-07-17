import path from "node:path";

import { requestBridgePath } from "./e2e-browser-boundary.mjs";

const viewports = [
  { id: "mobile-375", width: 375, height: 812, target: 44 },
  { id: "tablet-768", width: 768, height: 1024, target: 36 },
  { id: "tablet-landscape-1024", width: 1024, height: 768, target: 36 },
  { id: "desktop-1440", width: 1440, height: 1000, target: 36 },
];

export async function runDeviceControllerBrowserE2E({ chromium, baseUrl, bridgeOrigin, mockServer, evidenceDir }) {
  const report = { schemaVersion: 1, startedAt: new Date().toISOString(), baseUrl, bridgeOrigin, checks: [], viewports: [] };
  const browser = await launchBrowser(chromium);
  let activePage;
  let activeStage = "browser:launch";
  let activeDiagnostics;
  try {
    for (const viewport of viewports) {
      activeStage = `${viewport.id}:open`;
      const context = await browser.newContext({ viewport, reducedMotion: "reduce", locale: "zh-CN" });
      const page = await context.newPage();
      activePage = page;
      const diagnostics = collectDiagnostics(page);
      activeDiagnostics = diagnostics;
      activeStage = `${viewport.id}:climate-detail`;
      await gotoDevice(page, baseUrl, "992301", "主卧空调温控器");
      const layout = await inspectLayout(page);
      check(report, `${viewport.id}:no-horizontal-overflow`, layout.scrollWidth <= layout.clientWidth + 1, layout);
      check(report, `${viewport.id}:target-size`, layout.interactive.every((item) => item.width >= viewport.target && item.height >= viewport.target), { threshold: viewport.target, interactive: layout.interactive });
      check(report, `${viewport.id}:heading-order`, validHeadingOrder(layout.headings), layout.headings);
      check(report, `${viewport.id}:controller-landmark`, await page.locator(".device-controller[aria-labelledby]").count() === 1, "one labelled controller region");
      const screenshot = path.join(evidenceDir, `${viewport.id}-climate-detail.png`);
      await page.screenshot({ path: screenshot, fullPage: true });

      if (viewport.id === "mobile-375") {
        activeStage = "mobile-375:text-200";
        await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
        const zoomLayout = await inspectLayout(page);
        check(report, "mobile-375:text-200-overflow", zoomLayout.scrollWidth <= zoomLayout.clientWidth + 1, zoomLayout);
        const zoomTypography = await inspectZoomTypography(page);
        check(report, "mobile-375:text-200-temperature-label", zoomTypography.temperatureLabel.width >= 96 && zoomTypography.temperatureLabel.lines <= 2.2 && !zoomTypography.temperatureLabel.overlapsControls && zoomTypography.temperatureLabel.clearance >= 8, zoomTypography);
        await page.screenshot({ path: path.join(evidenceDir, "mobile-375-text-200.png"), fullPage: true });
        await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
        activeStage = "mobile-375:primary-flows";
        await runPrimaryFlows({ page, report, baseUrl, bridgeOrigin, mockServer, diagnostics, evidenceDir });
      }

      const unexpectedHttpErrors = diagnostics.httpErrors.filter((item) => !item.expected);
      const unexpectedConsoleErrors = diagnostics.consoleMessages.filter((item) => item.type === "error" && !item.text.includes("Failed to load resource"));
      check(report, `${viewport.id}:page-errors`, diagnostics.pageErrors.length === 0, diagnostics.pageErrors);
      check(report, `${viewport.id}:request-failures`, diagnostics.failedRequests.length === 0, diagnostics.failedRequests);
      check(report, `${viewport.id}:http-errors`, unexpectedHttpErrors.length === 0, unexpectedHttpErrors);
      check(report, `${viewport.id}:console-errors`, unexpectedConsoleErrors.length === 0, unexpectedConsoleErrors);
      report.viewports.push({ ...viewport, screenshot: path.basename(screenshot), layout, ...diagnostics });
      await context.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    const screenshot = path.join(evidenceDir, "browser-failure.png");
    let visibleText = "";
    try {
      visibleText = (await activePage?.locator("body").innerText())?.slice(-12000) || "";
      await activePage?.screenshot({ path: screenshot, fullPage: true });
    } catch { /* 页面可能已关闭，保留已有诊断。 */ }
    report.error = message;
    report.failure = { stage: activeStage, url: activePage?.url() || baseUrl, screenshot: path.basename(screenshot), visibleText, diagnostics: activeDiagnostics };
    check(report, `runner:${activeStage}`, false, { message, url: report.failure.url });
  } finally {
    await browser.close();
  }
  report.finishedAt = new Date().toISOString();
  report.status = report.checks.every((item) => item.status === "passed") ? "passed" : "failed";
  return report;
}

async function runPrimaryFlows({ page, report, baseUrl, bridgeOrigin, mockServer, diagnostics, evidenceDir }) {
  await runLightingFlow({ page, report, baseUrl, mockServer });
  await runCurtainFlow({ page, report, baseUrl, mockServer });
  await runSwitchFlow({ page, report, baseUrl, mockServer, diagnostics, evidenceDir });
  await runClimateFlow({ page, report, baseUrl, mockServer });
  await runSensorAndProtocolFlow({ page, report, baseUrl });
  const legacyRoute = await bridgeRequest(bridgeOrigin, "/api/operations/scene.run");
  check(report, "bridge:semantic-route-404", legacyRoute.status === 404, legacyRoute);
  const unknownAction = await bridgeRequest(bridgeOrigin, "/api/actions/a_000000000000");
  check(report, "bridge:unknown-action-403", unknownAction.status === 403 && unknownAction.body.status === "blocked", unknownAction);
  checkRequestContracts(report, mockServer);
}

async function runLightingFlow({ page, report, baseUrl, mockServer }) {
  const light = () => device(mockServer, "992010");
  await gotoDevice(page, baseUrl, "992010", "DALI客厅洗墙灯");
  const power = page.locator(".lighting-controller .controller-power");
  await power.click();
  await waitFor(() => light().properties.p === false);
  check(report, "lighting:power-off", await power.getAttribute("aria-pressed") === "false", light().properties);
  await power.click();
  await waitFor(() => light().properties.p === true);
  check(report, "lighting:power-restore", await power.getAttribute("aria-pressed") === "true", light().properties);
}

async function runCurtainFlow({ page, report, baseUrl, mockServer }) {
  const curtain = () => device(mockServer, "992101");
  await gotoDevice(page, baseUrl, "992101", "客厅电动窗帘");
  await page.getByRole("button", { name: "一半", exact: true }).click();
  await waitFor(() => curtain().properties.targetPosition === 50);
  check(report, "curtain:quick-position", await page.getByText("当前开启 50%", { exact: true }).isVisible(), curtain().properties);
  const slider = page.getByRole("slider", { name: "调整窗帘开启位置" });
  await slider.evaluate((element) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(element, "65");
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  await waitFor(() => curtain().properties.targetPosition === 65);
  check(report, "curtain:restore", curtain().properties.position === 65 && curtain().properties.targetPosition === 65, curtain().properties);
}

async function runSwitchFlow({ page, report, baseUrl, mockServer, diagnostics, evidenceDir }) {
  const relay = () => device(mockServer, "992201");
  const writePath = "/apis/iot/v1/controll/device/2/992201/w/properties/1-sp";
  await gotoDevice(page, baseUrl, "992201", "厨房双路继电器");
  const channel = () => page.getByRole("switch", { name: /回路 1/ });
  check(report, "switch:two-circuits", await page.getByRole("switch").count() === 2, await page.getByRole("switch").count());
  const circuitLayout = await inspectCircuitLayout(page);
  check(report, "switch:circuit-inline-alignment", circuitLayout.every((item) => item.gap >= 8 && item.centerDelta <= 8), circuitLayout);

  await arm(mockServer, "/__mock/fail-next", { method: "POST", path: writePath, status: 503 });
  await channel().click();
  await page.getByText(/设备操作没有完成/).waitFor();
  markLatestActionError(diagnostics);
  check(report, "switch:write-failure", relay().properties["1-sp"] === true && await channel().getAttribute("aria-checked") === "true", relay().properties);

  await arm(mockServer, "/__mock/fail-next", { method: "POST", path: writePath, status: 503, delayMs: 4000 });
  await channel().click();
  await page.getByText("家庭连接响应超时，请稍后重试。", { exact: true }).waitFor();
  check(report, "switch:timeout", relay().properties["1-sp"] === true, relay().properties);
  await new Promise((resolve) => setTimeout(resolve, 4200));
  markLatestActionError(diagnostics);

  await arm(mockServer, "/__mock/succeed-without-mutation-next", { method: "POST", path: writePath });
  await channel().click();
  await page.getByText(/回读不一致/).waitFor();
  check(report, "switch:readback-mismatch", relay().properties["1-sp"] === true && await channel().getAttribute("aria-checked") === "true", relay().properties);
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-switch-mismatch.png"), fullPage: true });

  await channel().click();
  await waitFor(() => relay().properties["1-sp"] === false);
  check(report, "switch:write-readback", await channel().getAttribute("aria-checked") === "false", relay().properties);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "厨房双路继电器" }).waitFor();
  await waitForLocatorState(channel(), "false");
  check(report, "switch:reload-live-state", await channel().getAttribute("aria-checked") === "false", relay().properties);
  await channel().click();
  await waitFor(() => relay().properties["1-sp"] === true);
  check(report, "switch:restore", relay().properties["1-sp"] === true && relay().properties["2-sp"] === false, relay().properties);

  await gotoDevice(page, baseUrl, "992204", "卫生间无线场景开关");
  check(report, "switch:wireless-readonly", await page.getByText("82%", { exact: true }).isVisible() && await page.getByText("4", { exact: true }).isVisible() && await page.getByRole("switch").count() === 0, "battery and button count are read-only");
}

async function runClimateFlow({ page, report, baseUrl, mockServer }) {
  const climate = () => device(mockServer, "992301");
  await gotoDevice(page, baseUrl, "992301", "主卧空调温控器");
  await page.getByRole("button", { name: "提高目标温度" }).click();
  await waitFor(() => climate().properties.actt === 25);
  await page.getByRole("button", { name: "降低目标温度" }).click();
  await waitFor(() => climate().properties.actt === 24);
  await page.getByRole("button", { name: "制冷" }).click();
  await waitFor(() => climate().properties.acm === 1);
  await page.getByRole("button", { name: "自动" }).click();
  await waitFor(() => climate().properties.acm === 8);
  await page.getByRole("button", { name: "高", exact: true }).click();
  await waitFor(() => climate().properties.acf === 4);
  await page.getByRole("button", { name: "中" }).click();
  await waitFor(() => climate().properties.acf === 2);
  const power = page.locator(".climate-controller .controller-power");
  await power.click();
  await waitFor(() => climate().properties.acp === false);
  await power.click();
  await waitFor(() => climate().properties.acp === true);
  check(report, "climate:write-and-restore", climate().properties.acp === true && climate().properties.actt === 24 && climate().properties.acm === 8 && climate().properties.acf === 2, climate().properties);
}

async function runSensorAndProtocolFlow({ page, report, baseUrl }) {
  const cases = [
    ["992401", "客厅温湿度传感器", ["24°C", "48%", "86%"]],
    ["992402", "玄关人体照度传感器", ["无人", "126 lx", "74%"]],
    ["992403", "阳台门磁", ["门窗", "正常"]],
    ["992404", "厨房水浸传感器", ["水浸", "正常"]],
    ["992405", "儿童房空气质量", ["PM2.5", "620 ppm", "VOC"]],
    ["992406", "设备间烟雾传感器", ["设备当前离线，以下为最近一次可信读数。", "19%", "烟雾"]],
  ];
  for (const [id, heading, texts] of cases) {
    await gotoDevice(page, baseUrl, id, heading);
    check(report, `sensor:${id}`, (await Promise.all(texts.map((text) => page.getByText(text, { exact: true }).count()))).every((count) => count > 0), texts);
  }
  await gotoDevice(page, baseUrl, "992010", "DALI客厅洗墙灯");
  check(report, "protocol:dali", await page.getByText("DALI", { exact: true }).isVisible(), "DALI is a fact, not a write grant");
  await gotoDevice(page, baseUrl, "992801", "客卧Matter灯");
  check(report, "protocol:matter-light", await page.getByText("MATTER", { exact: true }).isVisible(), "Matter light retains protocol fact");
  await gotoDevice(page, baseUrl, "992802", "客卧Matter门磁");
  check(report, "protocol:matter-sensor", await page.getByText("MATTER", { exact: true }).isVisible() && await page.getByText("异常", { exact: true }).isVisible(), "Matter contact is read-only");
  await gotoDevice(page, baseUrl, "992905", "设备间六路继电器");
  const switches = page.getByRole("switch");
  check(report, "terminal:version-mismatch", await page.getByText(/版本尚未证明/).isVisible() && await switches.count() === 6 && await allDisabled(switches), "six circuits remain visible but disabled");
}

function checkRequestContracts(report, mockServer) {
  const writes = mockServer.requestLog().filter((entry) => /\/w\/properties\//.test(entry.path));
  const successful = writes.filter((entry) => entry.status === 200);
  check(report, "api:strict-write-bodies", successful.length >= 14 && successful.every((entry) => Object.keys(entry.body || {}).join(",") === "value"), successful.map((entry) => ({ path: entry.path, body: entry.body })));
  check(report, "api:restored-baseline", device(mockServer, "992201").properties["1-sp"] === true && device(mockServer, "992101").properties.targetPosition === 65 && device(mockServer, "992301").properties.acp === true, "mutable devices restored");
}

async function gotoDevice(page, baseUrl, id, heading) {
  await page.goto(`${baseUrl}#devices/${id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: heading, exact: true }).waitFor();
  await page.locator(".device-controller").waitFor();
  await page.getByText("正在读取设备详情", { exact: true }).waitFor({ state: "hidden" });
}

async function inspectZoomTypography(page) {
  return page.evaluate(() => {
    const element = document.querySelector(".temperature-stepper > span");
    const controls = document.querySelector(".temperature-stepper > div");
    const rect = element?.getBoundingClientRect();
    const controlsRect = controls?.getBoundingClientRect();
    const lineHeight = element ? Number.parseFloat(getComputedStyle(element).lineHeight) : 0;
    const sameRow = Boolean(rect && controlsRect && controlsRect.top < rect.bottom && controlsRect.bottom > rect.top);
    const overlapsControls = Boolean(rect && controlsRect && rect.left < controlsRect.right && rect.right > controlsRect.left && rect.top < controlsRect.bottom && rect.bottom > controlsRect.top);
    const clearance = rect && controlsRect ? sameRow ? controlsRect.left - rect.right : controlsRect.top - rect.bottom : 0;
    return { temperatureLabel: { width: rect?.width || 0, height: rect?.height || 0, lines: lineHeight > 0 ? (rect?.height || 0) / lineHeight : 0, overlapsControls, clearance } };
  });
}

async function inspectCircuitLayout(page) {
  return page.locator(".switch-controller .circuit-row").evaluateAll((rows) => rows.map((row) => {
    const text = row.querySelector(":scope > span")?.getBoundingClientRect();
    const control = row.querySelector('button[role="switch"]')?.getBoundingClientRect();
    return { gap: text && control ? control.left - text.right : -1, centerDelta: text && control ? Math.abs((text.top + text.height / 2) - (control.top + control.height / 2)) : 999 };
  }));
}

function collectDiagnostics(page) {
  const diagnostics = { consoleMessages: [], pageErrors: [], failedRequests: [], httpErrors: [] };
  page.on("console", (message) => diagnostics.consoleMessages.push({ type: message.type(), text: message.text() }));
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("requestfailed", (request) => diagnostics.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || "unknown" }));
  page.on("response", (response) => { if (response.status() >= 400) diagnostics.httpErrors.push({ url: response.url(), status: response.status(), expected: false }); });
  return diagnostics;
}

async function bridgeRequest(origin, pathname) { const response = await requestBridgePath(origin, pathname); const text = await response.text(); let body = text; try { body = JSON.parse(text); } catch {} return { status: response.status, body }; }
function markLatestActionError(diagnostics) { const item = diagnostics.httpErrors.findLast((entry) => !entry.expected && entry.status === 502 && /^\/api\/actions\/a_[a-f0-9]+$/.test(new URL(entry.url).pathname)); if (item) item.expected = true; }

async function inspectLayout(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    interactive: [...document.querySelectorAll("button, a, input, select")].filter((element) => { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0; }).map((element) => { const rect = element.getBoundingClientRect(); return { tag: element.tagName.toLowerCase(), name: element.getAttribute("aria-label") || element.textContent?.trim() || "", width: rect.width, height: rect.height }; }),
    headings: [...document.querySelectorAll("h1, h2, h3")].map((heading) => ({ level: Number(heading.tagName.slice(1)), text: heading.textContent?.trim() || "" })),
  }));
}

function validHeadingOrder(headings) {
  return headings.length >= 3 && headings[0].level === 1 && headings.every((heading, index) => index === 0 || heading.level <= headings[index - 1].level + 1);
}

async function arm(mockServer, endpoint, body) {
  const response = await fetch(`${mockServer.origin}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`failed to arm mock behavior: ${endpoint}`);
}

async function allDisabled(locator) {
  const items = await locator.all();
  return items.length > 0 && (await Promise.all(items.map((item) => item.isDisabled()))).every(Boolean);
}

async function waitForLocatorState(locator, expected) {
  await locator.waitFor();
  const started = Date.now();
  while (Date.now() - started < 10000) {
    if (await locator.getAttribute("aria-checked") === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`timed out waiting for aria-checked=${expected}`);
}

function device(mockServer, id) {
  const found = mockServer.fixture.devices.find((item) => item.id === id);
  if (!found) throw new Error(`mock device is missing: ${id}`);
  return found;
}

function check(report, id, passed, detail) {
  report.checks.push({ id, status: passed ? "passed" : "failed", detail: detail && typeof detail === "object" ? structuredClone(detail) : detail });
}

async function waitFor(predicate, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error("timed out waiting for mock state change");
}

async function launchBrowser(chromium) {
  try { return await chromium.launch({ channel: process.env.YPA_PLAYWRIGHT_CHANNEL || "chrome", headless: true }); }
  catch (channelError) {
    try { return await chromium.launch({ headless: true }); }
    catch { throw new Error(`无法启动 Chromium。${channelError instanceof Error ? channelError.message : ""}`); }
  }
}
