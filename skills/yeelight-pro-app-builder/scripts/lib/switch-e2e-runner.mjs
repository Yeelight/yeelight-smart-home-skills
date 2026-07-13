import path from "node:path";
import { browserActionPaths, classifyExpectedFailures, probeBrowserBoundary, routeNavigationIsValid } from "./e2e-browser-boundary.mjs";

const viewports = [
  { id: "mobile-375", width: 375, height: 812 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "tablet-landscape-1024", width: 1024, height: 768 },
  { id: "desktop-1440", width: 1440, height: 1000 },
];

export async function runSwitchBrowserE2E({ chromium, baseUrl, bridgeOrigin, mockServer, evidenceDir }) {
  const report = { startedAt: new Date().toISOString(), baseUrl, bridgeOrigin, checks: [], viewports: [] };
  const browser = await launchBrowser(chromium);
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce", locale: "zh-CN" });
      const page = await context.newPage();
      const diagnostics = collectDiagnostics(page);
      await page.goto(`${baseUrl}#switches`, { waitUntil: "domcontentloaded" });
      await page.getByText("家庭在线", { exact: true }).waitFor();
      await page.getByText("厨房双路继电器", { exact: true }).waitFor();

      const relayCard = page.getByRole("article").filter({ hasText: "厨房双路继电器" });
      const switches = relayCard.getByRole("switch");
      const controlCount = await switches.count();
      const physicalCircuitSummary = await page.getByText("厨房 · 2 个回路", { exact: true }).isVisible();
      check(report, `${viewport.id}:proven-control-and-circuit-count`, controlCount === 3 && physicalCircuitSummary, { controlCount, physicalCircuitCount: 2, includesMasterControl: true });
      check(report, `${viewport.id}:initial-circuit-state`, await switchStates(switches) === "true,true,false", await switchStates(switches));
      const readonlyCard = page.getByRole("article").filter({ hasText: "设备间六路继电器" });
      check(report, `${viewport.id}:readonly-device`, await readonlyCard.getByText("当前 Runtime 未证明此设备有可写回路，已保持只读。", { exact: true }).isVisible(), "version-mismatch relay is explicit read-only");
      check(report, `${viewport.id}:navigation-contract`, await routeNavigationIsValid(page, "开关"), page.url());
      const layout = await inspectLayout(page);
      check(report, `${viewport.id}:no-horizontal-overflow`, layout.scrollWidth <= layout.clientWidth + 1, layout);
      check(report, `${viewport.id}:touch-targets`, layout.interactive.every((item) => item.width >= 44 && item.height >= 44), layout.interactive);
      check(report, `${viewport.id}:heading-order`, layout.headings.map((item) => item.level).join(",") === "1,2", layout.headings);

      const screenshot = path.join(evidenceDir, `${viewport.id}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      if (viewport.id === "mobile-375") await runPrimaryFlow({ page, report, bridgeOrigin, mockServer, evidenceDir });

      const expectedPaths = viewport.id === "mobile-375" ? browserActionPaths(["device.property.set", "state.query"]) : [];
      const { unexpectedHttpErrors, consoleErrors, unexpectedConsoleErrors } = classifyExpectedFailures(diagnostics, { expectedHttpErrorPaths: expectedPaths });
      check(report, `${viewport.id}:page-errors`, diagnostics.pageErrors.length === 0, diagnostics.pageErrors);
      check(report, `${viewport.id}:request-failures`, diagnostics.failedRequests.length === 0, diagnostics.failedRequests);
      check(report, `${viewport.id}:http-errors`, unexpectedHttpErrors.length === 0, { expectedPaths, unexpectedHttpErrors });
      check(report, `${viewport.id}:console-errors`, unexpectedConsoleErrors.length === 0, consoleErrors);
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

async function runPrimaryFlow({ page, report, bridgeOrigin, mockServer, evidenceDir }) {
  const relay = () => mockServer.fixture.devices.find((device) => device.id === "992201");
  const relayCard = page.getByRole("article").filter({ hasText: "厨房双路继电器" });
  const channel1 = () => relayCard.getByRole("switch", { name: /回路 1/ });
  const channel2 = () => relayCard.getByRole("switch", { name: /回路 2/ });
  const allCircuits = () => relayCard.getByRole("switch", { name: /全部回路/ });

  await channel2().focus();
  await channel2().press("Space");
  await waitFor(() => relay().properties["2-sp"] === true);
  check(report, "write:keyboard-channel-on", await channel2().getAttribute("aria-checked") === "true", relay().properties);
  check(report, "write:success-feedback", await page.getByText("回路 2 已开启。", { exact: true }).isVisible(), "success is announced near the device");

  await channel1().click();
  await waitFor(() => relay().properties["1-sp"] === false);
  check(report, "write:channel-off", await channel1().getAttribute("aria-checked") === "false", relay().properties);

  await allCircuits().click();
  await waitFor(() => relay().properties["0-sp"] === false && relay().properties["1-sp"] === false && relay().properties["2-sp"] === false);
  check(report, "write:all-circuits-off", await switchStates(relayCard.getByRole("switch")) === "false,false,false", relay().properties);

  const channel1WritePath = `/apis/iot/v1/controll/device/2/${relay().id}/w/properties/1-sp`;
  await fetch(`${mockServer.origin}/__mock/fail-next`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "POST", path: channel1WritePath, status: 503 }) });
  await channel1().click();
  const alert = page.getByRole("alert");
  await alert.waitFor();
  check(report, "failure:write-visible", await alert.getByText("开关控制失败，请检查家庭连接后重新尝试。", { exact: true }).isVisible() && relay().properties["1-sp"] === false, await alert.innerText());
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-write-failure.png"), fullPage: true });
  const retryButton = page.getByRole("button", { name: "重新尝试" });
  await retryButton.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const retryLayout = await inspectActionVisibility(retryButton);
  check(report, "failure:retry-action-visible", retryLayout.height >= 44 && retryLayout.fullyVisible && retryLayout.unobstructed, retryLayout);
  await retryButton.click();
  await waitFor(() => relay().properties["1-sp"] === true);
  check(report, "failure:write-recovered", await page.getByText("回路 1 已开启。", { exact: true }).isVisible(), relay().properties);

  relay().online = false;
  relay().properties.o = false;
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  const relayOfflineNote = relayCard.getByText("设备当前离线，恢复连接后可继续控制。", { exact: true });
  await relayOfflineNote.waitFor();
  check(report, "offline:controls-disabled", await allDisabled(relayCard.getByRole("switch")), "offline state disables all proven writes");
  relay().online = true;
  relay().properties.o = true;
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  await relayOfflineNote.waitFor({ state: "hidden" });
  check(report, "offline:recovered", await allEnabled(relayCard.getByRole("switch")), "online state restores controls");

  const statePath = `/apis/iot/v1/controll/device/${relay().id}/r/properties/0-sp`;
  await fetch(`${mockServer.origin}/__mock/fail-next`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "POST", path: statePath, status: 503 }) });
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  await page.getByRole("alert").waitFor();
  check(report, "failure:sync-visible", await page.getByText("部分家庭数据同步失败", { exact: true }).isVisible(), await page.getByRole("alert").innerText());
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  await page.getByText("家庭在线", { exact: true }).waitFor();
  check(report, "failure:sync-recovered", await page.getByRole("alert").count() === 0, "one-shot state failure consumed");

  check(report, "write:restore", relay().properties["0-sp"] === true && relay().properties["1-sp"] === true && relay().properties["2-sp"] === false && await switchStates(relayCard.getByRole("switch")) === "true,true,false", relay().properties);
  const writes = mockServer.requestLog().filter((entry) => /\/w\/properties\/(?:0|1|2)-sp$/.test(entry.path));
  const successfulWrites = writes.filter((entry) => entry.status === 200);
  check(report, "api:exact-write-contract", successfulWrites.length >= 4 && successfulWrites.every((entry) => Object.keys(entry.body || {}).join(",") === "value" && typeof entry.body.value === "boolean"), writes.map((entry) => ({ path: entry.path, status: entry.status, body: entry.body })));
  const verifies = mockServer.requestLog().filter((entry) => /\/r\/properties\/(?:0|1|2)-sp$/.test(entry.path) && entry.status === 200);
  check(report, "api:write-verification", verifies.length >= successfulWrites.length, { writes: successfulWrites.length, verifies: verifies.length });
  const readonlyWrites = writes.filter((entry) => ["992204", "992905"].some((deviceId) => entry.path.includes(deviceId)));
  check(report, "readonly:no-write", readonlyWrites.length === 0, readonlyWrites);

  const boundary = await probeBrowserBoundary(bridgeOrigin, "scene.run");
  check(report, "bridge:semantic-route-404", boundary.semanticRoute.status === 404, boundary.semanticRoute);
  check(report, "bridge:unknown-action-403", boundary.unknownAction.status === 403 && boundary.unknownAction.body.status === "blocked", boundary.unknownAction);
}

function collectDiagnostics(page) {
  const diagnostics = { consoleMessages: [], pageErrors: [], failedRequests: [], httpErrors: [] };
  page.on("console", (message) => diagnostics.consoleMessages.push({ type: message.type(), text: message.text() }));
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("requestfailed", (request) => diagnostics.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || "unknown" }));
  page.on("response", (response) => { if (response.status() >= 400) diagnostics.httpErrors.push({ url: response.url(), status: response.status() }); });
  return diagnostics;
}

async function switchStates(locator) {
  return (await locator.evaluateAll((items) => items.map((item) => item.getAttribute("aria-checked")))).join(",");
}

async function allDisabled(locator) {
  const items = await locator.all();
  return items.length > 0 && (await Promise.all(items.map((item) => item.isDisabled()))).every(Boolean);
}

async function allEnabled(locator) {
  const items = await locator.all();
  return items.length > 0 && (await Promise.all(items.map((item) => item.isEnabled()))).every(Boolean);
}

async function inspectLayout(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    interactive: [...document.querySelectorAll("button, a, input, select")].filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    }).map((element) => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName.toLowerCase(), name: element.getAttribute("aria-label") || element.textContent?.trim() || "", width: rect.width, height: rect.height };
    }),
    headings: [...document.querySelectorAll("h1, h2, h3")].map((heading) => ({ level: Number(heading.tagName.slice(1)), text: heading.textContent?.trim() || "" })),
  }));
}

function check(report, id, passed, detail) {
  report.checks.push({ id, status: passed ? "passed" : "failed", detail: detail && typeof detail === "object" ? structuredClone(detail) : detail });
}

async function inspectActionVisibility(locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const probe = document.elementFromPoint(rect.left + rect.width / 2, rect.bottom - 4);
    return { width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom, fullyVisible: rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth, unobstructed: probe === element || element.contains(probe), probeTag: probe?.tagName.toLowerCase() || "", probeClass: probe?.className || "" };
  });
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
