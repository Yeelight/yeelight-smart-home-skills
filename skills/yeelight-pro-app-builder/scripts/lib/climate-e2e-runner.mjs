import path from "node:path";
import { browserActionPaths, classifyExpectedFailures, probeBrowserBoundary, routeNavigationIsValid } from "./e2e-browser-boundary.mjs";

const viewports = [
  { id: "mobile-375", width: 375, height: 812 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "tablet-landscape-1024", width: 1024, height: 768 },
  { id: "desktop-1440", width: 1440, height: 1000 },
];

export async function runClimateBrowserE2E({ chromium, baseUrl, bridgeOrigin, mockServer, evidenceDir }) {
  const report = { startedAt: new Date().toISOString(), baseUrl, bridgeOrigin, checks: [], viewports: [] };
  const browser = await launchBrowser(chromium);
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce", locale: "zh-CN" });
      const page = await context.newPage();
      const diagnostics = collectDiagnostics(page);
      await page.goto(`${baseUrl}#climate`, { waitUntil: "domcontentloaded" });
      await page.getByText("家庭在线", { exact: true }).waitFor();
      await page.getByText("主卧空调温控器", { exact: true }).waitFor();
      const targetCard = page.getByRole("article").filter({ hasText: "主卧空调温控器" });

      check(report, `${viewport.id}:navigation-contract`, await routeNavigationIsValid(page, "温控"), page.url());
      check(report, `${viewport.id}:temperature-state`, await targetCard.getByText("23℃", { exact: true }).isVisible() && await targetCard.getByText("24℃", { exact: true }).first().isVisible(), "current and target temperatures are visible");
      check(report, `${viewport.id}:proven-controls`, await targetCard.getByRole("button", { name: "关闭温控" }).isVisible() && await targetCard.getByRole("radio").count() === 6, "power, mode and fan controls are capability-backed");
      const layout = await inspectLayout(page);
      check(report, `${viewport.id}:no-horizontal-overflow`, layout.scrollWidth <= layout.clientWidth + 1, layout);
      check(report, `${viewport.id}:touch-targets`, layout.interactive.every((item) => item.width >= 44 && item.height >= 44), layout.interactive);
      check(report, `${viewport.id}:heading-order`, layout.headings.map((item) => item.level).join(",") === "1,2", layout.headings);
      const screenshot = path.join(evidenceDir, `${viewport.id}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      if (viewport.id === "mobile-375") await runPrimaryFlow({ page, report, bridgeOrigin, mockServer, evidenceDir });

      const expectedPaths = viewport.id === "mobile-375" ? browserActionPaths(["device.property.set", "state.query"]) : [];
      const { unexpectedHttpErrors, unexpectedConsoleErrors } = classifyExpectedFailures(diagnostics, { expectedHttpErrorPaths: expectedPaths });
      check(report, `${viewport.id}:page-errors`, diagnostics.pageErrors.length === 0, diagnostics.pageErrors);
      check(report, `${viewport.id}:request-failures`, diagnostics.failedRequests.length === 0, diagnostics.failedRequests);
      check(report, `${viewport.id}:http-errors`, unexpectedHttpErrors.length === 0, unexpectedHttpErrors);
      check(report, `${viewport.id}:console-errors`, unexpectedConsoleErrors.length === 0, unexpectedConsoleErrors);
      report.viewports.push({ ...viewport, screenshot: path.basename(screenshot), layout, ...diagnostics });
      await context.close();
    }
  } finally { await browser.close(); }
  report.finishedAt = new Date().toISOString();
  report.status = report.checks.every((item) => item.status === "passed") ? "passed" : "failed";
  return report;
}

async function runPrimaryFlow({ page, report, bridgeOrigin, mockServer, evidenceDir }) {
  const climate = () => mockServer.fixture.devices.find((device) => device.id === "992301");
  const targetCard = page.getByRole("article").filter({ hasText: "主卧空调温控器" });
  const plus = targetCard.getByRole("button", { name: "提高目标温度" });
  await plus.click();
  await waitFor(() => climate().properties.actt === 25);
  check(report, "write:target-temperature", await page.getByText("目标温度已设为 25℃。", { exact: true }).isVisible(), climate().properties);

  await targetCard.getByRole("radio", { name: "制冷" }).click();
  await waitFor(() => climate().properties.acm === 1);
  check(report, "write:mode", await targetCard.getByRole("radio", { name: "制冷" }).getAttribute("aria-checked") === "true", climate().properties);
  await targetCard.getByRole("radio", { name: "低风" }).click();
  await waitFor(() => climate().properties.acf === 4);
  check(report, "write:fan-speed", await targetCard.getByRole("radio", { name: "低风" }).getAttribute("aria-checked") === "true", climate().properties);

  await targetCard.getByRole("button", { name: "关闭温控" }).click();
  await waitFor(() => climate().properties.acp === false);
  check(report, "write:power-off", await targetCard.getByRole("button", { name: "开启温控" }).isVisible(), climate().properties);
  await targetCard.getByRole("button", { name: "开启温控" }).click();
  await waitFor(() => climate().properties.acp === true);

  const writePath = `/apis/iot/v1/controll/device/2/${climate().id}/w/properties/actt`;
  await fetch(`${mockServer.origin}/__mock/fail-next`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "POST", path: writePath, status: 503 }) });
  await targetCard.getByRole("button", { name: "降低目标温度" }).click();
  const alert = page.getByRole("alert");
  await alert.waitFor();
  check(report, "failure:write-visible", await alert.getByText("温控调整失败，请检查家庭连接后重新尝试。", { exact: true }).isVisible() && climate().properties.actt === 25, await alert.innerText());
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-write-failure.png"), fullPage: true });
  const retryButton = page.getByRole("button", { name: "重新尝试" });
  await retryButton.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const retryLayout = await inspectActionVisibility(retryButton);
  check(report, "failure:retry-action-visible", retryLayout.height >= 44 && retryLayout.fullyVisible && retryLayout.unobstructed, retryLayout);
  await retryButton.click();
  await waitFor(() => climate().properties.actt === 24);
  check(report, "failure:write-recovered", await page.getByText("目标温度已设为 24℃。", { exact: true }).isVisible(), climate().properties);

  climate().properties.aco = false;
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  await targetCard.getByText("设备当前离线，恢复连接后可继续控制。", { exact: true }).waitFor();
  check(report, "offline:controls-disabled", await allDisabled(targetCard.locator("button, input")), "offline state disables climate writes");
  climate().properties.aco = true;
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  await targetCard.getByText("设备当前离线，恢复连接后可继续控制。", { exact: true }).waitFor({ state: "hidden" });

  await targetCard.getByRole("radio", { name: "制热" }).click();
  await waitFor(() => climate().properties.acm === 8);
  await targetCard.getByRole("radio", { name: "中风" }).click();
  await waitFor(() => climate().properties.acf === 2);
  check(report, "write:restore", climate().properties.acp === true && climate().properties.actt === 24 && climate().properties.acm === 8 && climate().properties.acf === 2, climate().properties);

  const writes = mockServer.requestLog().filter((entry) => /\/w\/properties\/(?:acp|actt|acm|acf)$/.test(entry.path));
  const successfulWrites = writes.filter((entry) => entry.status === 200);
  check(report, "api:exact-write-contract", successfulWrites.length >= 8 && successfulWrites.every((entry) => Object.keys(entry.body || {}).join(",") === "value"), writes.map((entry) => ({ path: entry.path, status: entry.status, body: entry.body })));
  const verifies = mockServer.requestLog().filter((entry) => /\/r\/properties\/(?:acp|actt|acm|acf)$/.test(entry.path) && entry.status === 200);
  check(report, "api:write-verification", verifies.length >= successfulWrites.length, { writes: successfulWrites.length, verifies: verifies.length });
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

async function inspectLayout(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
    interactive: [...document.querySelectorAll("button, a, input, select")].filter((element) => { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0; }).map((element) => { const rect = element.getBoundingClientRect(); return { tag: element.tagName.toLowerCase(), name: element.getAttribute("aria-label") || element.textContent?.trim() || "", width: rect.width, height: rect.height }; }),
    headings: [...document.querySelectorAll("h1, h2, h3")].map((heading) => ({ level: Number(heading.tagName.slice(1)), text: heading.textContent?.trim() || "" })),
  }));
}

async function allDisabled(locator) { const items = await locator.all(); return items.length > 0 && (await Promise.all(items.map((item) => item.isDisabled()))).every(Boolean); }
function check(report, id, passed, detail) { report.checks.push({ id, status: passed ? "passed" : "failed", detail: detail && typeof detail === "object" ? structuredClone(detail) : detail }); }
async function inspectActionVisibility(locator) { return locator.evaluate((element) => { const rect = element.getBoundingClientRect(); const probe = document.elementFromPoint(rect.left + rect.width / 2, rect.bottom - 4); return { width: rect.width, height: rect.height, fullyVisible: rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth, unobstructed: probe === element || element.contains(probe) }; }); }
async function waitFor(predicate, timeoutMs = 10000) { const started = Date.now(); while (Date.now() - started < timeoutMs) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 80)); } throw new Error("timed out waiting for climate state change"); }
async function launchBrowser(chromium) { try { return await chromium.launch({ channel: process.env.YPA_PLAYWRIGHT_CHANNEL || "chrome", headless: true }); } catch (channelError) { try { return await chromium.launch({ headless: true }); } catch { throw new Error(`无法启动 Chromium。${channelError instanceof Error ? channelError.message : ""}`); } } }
