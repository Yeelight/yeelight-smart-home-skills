import path from "node:path";
import { browserActionPath, classifyExpectedFailures, probeBrowserBoundary } from "./e2e-browser-boundary.mjs";
import { runSpaceFailureE2E } from "./space-e2e-failure-runner.mjs";

const viewports = [
  { id: "mobile-375", width: 375, height: 812 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "tablet-landscape-1024", width: 1024, height: 768 },
  { id: "desktop-1440", width: 1440, height: 1000 },
];

export async function runSpaceBrowserE2E({ chromium, baseUrl, largeBaseUrl, bridgeOrigin, mockServer, evidenceDir }) {
  const report = { startedAt: new Date().toISOString(), baseUrl, bridgeOrigin, checks: [], viewports: [] };
  const browser = await launchBrowser(chromium);
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce", locale: "zh-CN" });
      const page = await context.newPage();
      const diagnostics = collectDiagnostics(page);

      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "重新同步家庭状态" }).waitFor();
      await page.getByText("家庭在线", { exact: true }).waitFor();

      check(report, `${viewport.id}:initial-sync-complete`, await page.getByRole("button", { name: "重新同步家庭状态" }).isEnabled(), "initial Runtime entity.list completed");
      const expected = fixtureSummary(mockServer.fixture);
      check(report, `${viewport.id}:space-summary`, await page.getByText(String(expected.rooms), { exact: true }).count() >= 1 && await page.getByText(String(expected.devices), { exact: true }).count() >= 1 && await page.getByText(String(expected.online), { exact: true }).count() >= 1, expected);

      await page.goto(`${baseUrl}#devices`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /客厅全光谱吸顶灯/ }).waitFor();

      const layout = await inspectLayout(page);
      check(report, `${viewport.id}:no-horizontal-overflow`, layout.scrollWidth <= layout.clientWidth + 1, layout);
      check(report, `${viewport.id}:touch-targets`, layout.interactive.every((item) => item.width >= 44 && item.height >= 44), layout.interactive);
      check(report, `${viewport.id}:heading-order`, layout.headings.map((item) => item.level).join(",") === "1,2", layout.headings);
      if (viewport.id === "mobile-375") {
        check(report, `${viewport.id}:adaptive-bottom-navigation`, layout.visibleNavigation === "mobile-navigation", layout);
        const headingFitsViewport = layout.primaryHeading.visible
          && layout.primaryHeading.left >= 0
          && layout.primaryHeading.right <= layout.clientWidth + 1
          && layout.primaryHeading.scrollWidth <= layout.primaryHeading.clientWidth + 1
          && layout.primaryHeading.height >= 24
          && layout.primaryHeading.height <= 72;
        check(report, `${viewport.id}:usable-content-width`, layout.contentWidth >= 347 && headingFitsViewport, layout);
      }

      const screenshot = path.join(evidenceDir, `${viewport.id}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      if (viewport.id === "mobile-375") {
        await runPrimaryFlow({ page, report, bridgeOrigin, mockServer, evidenceDir });
      }

      const classifiedDiagnostics = classifyExpectedFailures(diagnostics, {
        expectedHttpErrorPaths: viewport.id === "mobile-375"
          ? [browserActionPath("entity.list")]
          : [],
      });
      const { expectedHttpErrors, unexpectedHttpErrors, consoleErrors, unexpectedConsoleErrors } = classifiedDiagnostics;

      check(report, `${viewport.id}:page-errors`, diagnostics.pageErrors.length === 0, diagnostics.pageErrors);
      check(report, `${viewport.id}:request-failures`, diagnostics.failedRequests.length === 0, diagnostics.failedRequests);
      check(report, `${viewport.id}:http-errors`, unexpectedHttpErrors.length === 0, { expectedHttpErrors, unexpectedHttpErrors });
      check(report, `${viewport.id}:console-errors`, unexpectedConsoleErrors.length === 0, { expectedHttpErrors, consoleErrors });
      report.viewports.push({ ...viewport, screenshot: path.basename(screenshot), layout, ...diagnostics });
      await context.close();
    }
    const failureReport = await runSpaceFailureE2E({ browser, baseUrl, mockServer, evidenceDir });
    report.checks.push(...failureReport.checks);
    report.failureFlows = failureReport;
    if (largeBaseUrl) await runLargeListFlow({ browser, baseUrl: largeBaseUrl, report, evidenceDir });
  } finally {
    await browser.close();
  }
  report.finishedAt = new Date().toISOString();
  report.status = report.checks.every((item) => item.status === "passed") ? "passed" : "failed";
  return report;
}

async function runLargeListFlow({ browser, baseUrl, report, evidenceDir }) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: "reduce", locale: "zh-CN" });
  const page = await context.newPage();
  await page.goto(`${baseUrl}#devices`, { waitUntil: "domcontentloaded" });
  await page.getByText("108 台设备", { exact: true }).waitFor();
  const rows = page.locator(".managed-device-row");
  check(report, "large-list:initial-window", await rows.count() === 24, await rows.count());
  check(report, "large-list:load-more-visible", await page.getByRole("button", { name: "加载更多" }).isVisible(), "108 devices remain bounded through Runtime");
  await page.getByRole("button", { name: "加载更多" }).click();
  check(report, "large-list:incremental-window", await rows.count() === 48, await rows.count());
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-large-list.png"), fullPage: true });
  await context.close();
}

async function runPrimaryFlow({ page, report, bridgeOrigin, mockServer, evidenceDir }) {
  const rows = page.locator(".managed-device-row");
  const search = page.getByRole("searchbox", { name: "搜索设备" });
  const areaFilter = page.getByRole("combobox", { name: "区域" });
  const roomFilter = page.getByRole("combobox", { name: "房间" });
  const familyFilter = page.getByRole("combobox", { name: "类型" });
  const protocolFilter = page.getByRole("combobox", { name: "协议" });
  const statusFilter = page.getByRole("combobox", { name: "状态" });

  await search.fill("吸顶");
  await waitForUrlParam(page, "q", "吸顶");
  check(report, "search:match", await rows.count() >= 1 && await rows.allInnerTexts().then((values) => values.some((value) => value.includes("客厅全光谱吸顶灯"))), page.url());
  await search.fill("不存在");
  await page.getByText("没有匹配的设备", { exact: true }).waitFor();
  check(report, "search:empty", await rows.count() === 0, page.url());
  await search.fill("");
  await rows.first().waitFor();
  await waitForUrlParam(page, "q", null);
  check(report, "search:clear", await rows.count() === Math.min(24, mockServer.fixture.devices.length), page.url());

  await roomFilter.selectOption({ label: "客厅" });
  await waitForUrlParam(page, "room", "991001");
  check(report, "filter:room", await rows.count() === mockServer.fixture.devices.filter((item) => item.roomId === "991001").length, page.url());
  await familyFilter.selectOption("sensor");
  await waitForUrlParam(page, "family", "sensor");
  check(report, "filter:family-and-room", await rows.count() === 1 && await rows.first().innerText().then((value) => value.includes("客厅温湿度传感器")), page.url());
  await roomFilter.selectOption("all");
  await familyFilter.selectOption("all");
  await waitForUrlParam(page, "room", null);
  await waitForUrlParam(page, "family", null);

  await areaFilter.selectOption({ label: "公共区域" });
  await waitForUrlParam(page, "area", "990101");
  check(report, "filter:area", await rows.count() === Math.min(24, mockServer.fixture.devices.filter((item) => room(mockServer, item.roomId)?.areaId === "990101").length), page.url());
  await areaFilter.selectOption("all");
  await waitForUrlParam(page, "area", null);

  for (const protocol of ["matter", "dali"]) {
    await protocolFilter.selectOption(protocol);
    await waitForUrlParam(page, "protocol", protocol);
    const expectedCount = mockServer.fixture.devices.filter((item) => fixtureProtocols(item).includes(protocol)).length;
    check(report, `filter:protocol-${protocol}`, await rows.count() === expectedCount, { expectedCount, url: page.url() });
  }
  await protocolFilter.selectOption("all");
  await waitForUrlParam(page, "protocol", null);

  const statusCases = [
    ["offline", (item) => item.online === false],
    ["read-only", (item) => item.readOnly === true],
    ["version-mismatch", (item) => item.capabilityStatus === "version-mismatch"],
  ];
  for (const [status, predicate] of statusCases) {
    await statusFilter.selectOption(status);
    await waitForUrlParam(page, "status", status);
    const expectedCount = mockServer.fixture.devices.filter(predicate).length;
    check(report, `filter:status-${status}`, expectedCount > 0 && await rows.count() === expectedCount, { expectedCount, url: page.url(), rows: await rows.allInnerTexts() });
  }
  await statusFilter.selectOption("all");
  await waitForUrlParam(page, "status", null);

  const navigation = visibleNavigation(page);
  check(report, "navigation:devices-active", await navigation.getByRole("link", { name: "设备" }).getAttribute("aria-current") === "page" && new URL(page.url()).hash === "#devices", page.url());
  await navigation.getByRole("link", { name: "总览" }).click();
  check(report, "navigation:overview-active", await navigation.getByRole("link", { name: "总览" }).getAttribute("aria-current") === "page" && new URL(page.url()).hash === "#overview", page.url());
  await page.getByRole("button", { name: /公共区域/ }).first().click();
  await page.getByRole("heading", { name: "公共区域", exact: true }).waitFor();
  check(report, "hierarchy:home-to-area", new URL(page.url()).hash === "#spaces/areas/990101", page.url());
  await page.getByRole("button", { name: /客厅/ }).first().click();
  await page.getByRole("heading", { name: "客厅", exact: true }).waitFor();
  check(report, "hierarchy:area-to-room", new URL(page.url()).hash === "#spaces/rooms/991001", page.url());
  await page.getByRole("button", { name: /客厅全光谱吸顶灯/ }).click();
  await page.getByRole("heading", { name: "客厅全光谱吸顶灯", exact: true }).waitFor();
  check(report, "hierarchy:room-to-device", new URL(page.url()).hash === "#devices/992001", page.url());
  await page.getByRole("button", { name: "返回上一级" }).click();
  await rows.first().waitFor();

  const trigger = page.getByRole("button", { name: /客厅全光谱吸顶灯/ });
  await trigger.click();
  await page.getByRole("heading", { name: "客厅全光谱吸顶灯" }).waitFor();
  check(report, "device-detail:route", new URL(page.url()).hash.startsWith("#devices/992001"), page.url());
  await waitFor(() => mockServer.requestLog().some((entry) => entry.path.includes("/device/992001/r/detail")));
  check(report, "device-detail:lazy-read", true, "device.detail.get reached strict mock through CLI");
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-device-detail.png"), fullPage: true });
  await page.goBack();
  await trigger.waitFor();
  const focusRestored = await page.waitForFunction(() => document.activeElement?.id === "device-row-992001", undefined, { timeout: 1500 }).then(() => true, () => false);
  check(report, "device-detail:back-focus", focusRestored, "back restores the device trigger");

  await trigger.click();
  await page.getByRole("heading", { name: "客厅全光谱吸顶灯" }).waitFor();
  await page.getByRole("button", { name: "重命名" }).click();
  const nameInput = page.getByRole("textbox", { name: "设备名称" });
  await nameInput.fill("客厅阅读主灯");
  await page.getByRole("button", { name: "保存" }).click();
  await waitFor(() => device(mockServer).name === "客厅阅读主灯");
  await page.getByText("设备信息已更新并完成回读确认。", { exact: true }).waitFor();
  check(report, "write:rename-readback", device(mockServer).name === "客厅阅读主灯" && await page.getByRole("heading", { name: "客厅阅读主灯" }).isVisible(), device(mockServer));

  await page.getByRole("button", { name: "关闭设备管理" }).click();
  await page.getByRole("button", { name: "重命名" }).click();
  await page.getByRole("textbox", { name: "设备名称" }).fill("客厅全光谱吸顶灯");
  await page.getByRole("button", { name: "保存" }).click();
  await waitFor(() => device(mockServer).name === "客厅全光谱吸顶灯");
  check(report, "write:rename-restore", device(mockServer).name === "客厅全光谱吸顶灯", device(mockServer));

  await page.getByRole("button", { name: "关闭设备管理" }).click();
  await page.getByRole("button", { name: "移动房间" }).click();
  await page.getByRole("combobox", { name: "目标房间" }).selectOption({ label: "书房" });
  await page.getByRole("button", { name: "保存" }).click();
  await waitFor(() => device(mockServer).roomId === "991004");
  await page.getByText("设备信息已更新并完成回读确认。", { exact: true }).waitFor();
  await page.getByText("休息区域 · 书房", { exact: true }).waitFor();
  check(report, "write:move-readback", device(mockServer).roomId === "991004" && await page.getByText("休息区域 · 书房", { exact: true }).isVisible(), device(mockServer));

  await page.getByRole("button", { name: "关闭设备管理" }).click();
  await page.getByRole("button", { name: "移动房间" }).click();
  await page.getByRole("combobox", { name: "目标房间" }).selectOption({ label: "客厅" });
  await page.getByRole("button", { name: "保存" }).click();
  await waitFor(() => device(mockServer).roomId === "991001");
  check(report, "write:move-restore", device(mockServer).roomId === "991001", device(mockServer));
  await page.getByRole("button", { name: "关闭设备管理" }).click();
  await page.getByRole("button", { name: "返回上一级" }).click();
  await rows.first().waitFor();

  const boundary = await probeBrowserBoundary(bridgeOrigin, "scene.run");
  check(report, "bridge:semantic-route-404", boundary.semanticRoute.status === 404, boundary.semanticRoute);
  check(report, "bridge:unknown-action-403", boundary.unknownAction.status === 403 && boundary.unknownAction.body.status === "blocked", boundary.unknownAction);

  const failPath = `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/area/r/info/1/100`;
  await fetch(`${mockServer.origin}/__mock/fail-next`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "GET", path: failPath, status: 503 }) });
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  await page.getByRole("alert").waitFor();
  check(report, "failure:sync-visible", await page.getByText("部分家庭数据同步失败", { exact: true }).isVisible(), await page.getByRole("alert").innerText());
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-sync-failure.png"), fullPage: true });
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  await page.getByText("家庭在线", { exact: true }).waitFor();
  check(report, "failure:sync-recovered", await page.getByRole("alert").count() === 0 && await rows.count() === Math.min(24, mockServer.fixture.devices.length), "one-shot entity.list failure consumed");

  const deepLink = `${page.url().split(/[?#]/)[0]}#devices?q=${encodeURIComponent("传感器")}&room=991001&family=sensor`;
  await page.goto(deepLink, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /客厅温湿度传感器/ }).waitFor();
  const deepLinkState = await page.evaluate(() => {
    const selects = [...document.querySelectorAll("select")];
    const current = [...document.querySelectorAll('.shell-navigation [aria-current="page"]')].find((element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; });
    return { query: document.querySelector('input[type="search"]')?.value || "", values: selects.map((element) => element.value), rows: document.querySelectorAll(".managed-device-row").length, current: current?.textContent?.trim() || "" };
  });
  const deepLinkRestored = deepLinkState.query === "传感器" && deepLinkState.values.includes("991001") && deepLinkState.values.includes("sensor") && deepLinkState.rows === 1 && deepLinkState.current.includes("设备");
  check(report, "deep-link:restored", deepLinkRestored, { url: page.url(), ...deepLinkState });
}

function fixtureSummary(fixture) {
  return {
    rooms: fixture.rooms.length,
    devices: fixture.devices.length,
    online: fixture.devices.filter((device) => device.online !== false).length,
  };
}

function visibleNavigation(page) {
  return page.locator(".shell-navigation nav:visible");
}

function collectDiagnostics(page) {
  const diagnostics = { consoleMessages: [], pageErrors: [], failedRequests: [], httpErrors: [] };
  page.on("console", (message) => diagnostics.consoleMessages.push({ type: message.type(), text: message.text() }));
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("requestfailed", (request) => diagnostics.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || "unknown" }));
  page.on("response", (response) => { if (response.status() >= 400) diagnostics.httpErrors.push({ url: response.url(), status: response.status() }); });
  return diagnostics;
}

async function inspectLayout(locator) {
  if (typeof locator.url === "function") {
    return locator.evaluate(() => {
      const interactive = [...document.querySelectorAll("button, a, input, select")].filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      }).map((element) => {
        const rect = element.getBoundingClientRect();
        return { tag: element.tagName.toLowerCase(), name: element.getAttribute("aria-label") || element.textContent?.trim() || element.getAttribute("placeholder") || "", width: rect.width, height: rect.height };
      });
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        contentWidth: document.querySelector(".shell-content")?.getBoundingClientRect().width || 0,
        visibleNavigation: [...document.querySelectorAll(".shell-navigation nav")].find((element) => element instanceof HTMLElement && element.offsetParent !== null)?.classList.contains("mobile-navigation") ? "mobile-navigation" : "desktop-navigation",
        primaryHeading: (() => {
          const heading = document.querySelector(".shell-topbar h1");
          const rect = heading?.getBoundingClientRect();
          return {
            width: rect?.width || 0,
            height: rect?.height || 0,
            left: rect?.left || 0,
            right: rect?.right || 0,
            scrollWidth: heading?.scrollWidth || 0,
            clientWidth: heading?.clientWidth || 0,
            visible: Boolean(rect && rect.width > 0 && rect.height > 0),
          };
        })(),
        interactive,
        headings: [...document.querySelectorAll("h1, h2, h3")].map((heading) => ({ level: Number(heading.tagName.slice(1)), text: heading.textContent?.trim() || "" })),
      };
    });
  }
  return locator.evaluate((root) => {
    const interactive = [...root.querySelectorAll("button, a, input, select")].filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    }).map((element) => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName.toLowerCase(), name: element.getAttribute("aria-label") || element.textContent?.trim() || element.getAttribute("placeholder") || "", width: rect.width, height: rect.height };
    });
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      interactive,
      headings: [...root.querySelectorAll("h1, h2, h3")].map((heading) => ({ level: Number(heading.tagName.slice(1)), text: heading.textContent?.trim() || "" })),
    };
  });
}

async function waitForUrlParam(page, key, value) {
  await page.waitForFunction(([param, expected]) => {
    const hashQuery = window.location.hash.split("?")[1] || "";
    const current = new URLSearchParams(hashQuery).get(param);
    return expected === null ? current === null : current === expected;
  }, [key, value]);
}

function check(report, id, passed, detail) {
  report.checks.push({ id, status: passed ? "passed" : "failed", detail: cloneDetail(detail) });
}

function cloneDetail(detail) {
  if (detail === undefined || detail === null || typeof detail !== "object") return detail;
  return structuredClone(detail);
}

function device(mockServer) {
  const found = mockServer.fixture.devices.find((item) => item.id === "992001");
  if (!found) throw new Error("mock living-room light 992001 is missing");
  return found;
}

function room(mockServer, roomId) {
  return mockServer.fixture.rooms.find((item) => item.id === roomId);
}

function fixtureProtocols(device) {
  return [...new Set([
    ...(device.protocols || []).map((value) => value.id),
    ...(device.properties?.matterLinked === true ? ["matter"] : []),
    ...(device.properties?.daliVersion || device.properties?.daliDeviceType !== undefined || device.properties?.daliSwitchType !== undefined ? ["dali"] : []),
  ].filter(Boolean))];
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
  try {
    return await chromium.launch({ channel: process.env.YPA_PLAYWRIGHT_CHANNEL || "chrome", headless: true });
  } catch (channelError) {
    try { return await chromium.launch({ headless: true }); } catch {
      throw new Error(`无法启动 Chromium。请运行 npx playwright install chromium。${channelError instanceof Error ? channelError.message : ""}`);
    }
  }
}
