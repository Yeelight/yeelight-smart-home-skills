import path from "node:path";
import { browserActionPath } from "./e2e-browser-boundary.mjs";

const viewports = [
  { id: "mobile-375", width: 375, height: 812 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "desktop-1024", width: 1024, height: 900 },
  { id: "desktop-1440", width: 1440, height: 1000 },
];

const routes = [
  { route: "maintenance", heading: "维护总览", texts: ["需要优先处理", "离线设备", "协议关系"] },
  { route: "gateways", heading: "网关与协议", texts: ["全屋智能中枢", "户外协议中枢", "DALI总线网关"] },
  { route: "panels", heading: "墙面面板", texts: ["客厅智能面板", "书房旋钮", "影音室旋钮"] },
  { route: "issues", heading: "异常设备", texts: ["户外协议中枢", "网关离线"] },
  { route: "diagnostics", heading: "版本与诊断", texts: ["Thread", "Matter", "DALI", "DALI客厅洗墙灯", "客卧Matter灯", "关联设备", "所在房间 · 在线", "固件版本", "版本不匹配"] },
];

export async function runInstallerBrowserE2E({ chromium, baseUrl, mockServer, evidenceDir }) {
  const report = { schemaVersion: 1, startedAt: new Date().toISOString(), checks: [], viewports: [] };
  const browser = await launchBrowser(chromium);
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, locale: "zh-CN", reducedMotion: "reduce" });
      const page = await context.newPage();
      const diagnostics = collectDiagnostics(page);
      const screenshots = [];

      for (const route of routes) {
        await page.goto(`${baseUrl}#${route.route}`, { waitUntil: "networkidle" });
        await page.getByRole("heading", { name: route.heading, exact: true }).waitFor();
        await page.getByText("家庭在线", { exact: true }).waitFor();
        check(report, `${viewport.id}:${route.route}:content`, await visibleTexts(page, route.texts), route.texts);
        check(report, `${viewport.id}:${route.route}:deep-link`, page.url().endsWith(`#${route.route}`), page.url());
        recordLayout(report, `${viewport.id}:${route.route}`, await inspectLayout(page, viewport));

        const screenshot = path.join(evidenceDir, `${viewport.id}-${route.route}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });
        screenshots.push(path.basename(screenshot));
      }

      await checkTextScaling(page, report, viewport, evidenceDir, screenshots);
      if (viewport.id === "mobile-375") {
        await checkMoreSheet(page, report, evidenceDir, screenshots);
        await checkGatewayDetail(page, report, mockServer, diagnostics, baseUrl, evidenceDir, screenshots);
        await checkFailureRecovery(page, report, mockServer, diagnostics, baseUrl, evidenceDir, screenshots);
      }

      const bodyText = await page.locator("body").innerText();
      check(report, `${viewport.id}:sensitive-copy`, !/(Runtime|CLI|Bridge|intent|capability|Authorization|localToken)/i.test(bodyText), bodyText.match(/Runtime|CLI|Bridge|intent|capability|Authorization|localToken/gi) || []);
      check(report, `${viewport.id}:reduced-motion`, await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), "reduced motion active");
      check(report, `${viewport.id}:page-errors`, diagnostics.pageErrors.length === 0, diagnostics.pageErrors);
      check(report, `${viewport.id}:request-failures`, diagnostics.failedRequests.length === 0, diagnostics.failedRequests);
      check(report, `${viewport.id}:http-errors`, diagnostics.httpErrors.filter((item) => !item.expected).length === 0, diagnostics.httpErrors);
      check(report, `${viewport.id}:console-errors`, diagnostics.consoleMessages.filter((item) => item.type === "error" && !item.expected).length === 0, diagnostics.consoleMessages);
      report.viewports.push({ ...viewport, screenshots, diagnostics });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  report.finishedAt = new Date().toISOString();
  report.status = report.checks.every((item) => item.status === "passed") ? "passed" : "failed";
  return report;
}

async function checkTextScaling(page, report, viewport, evidenceDir, screenshots) {
  await page.goto(`${page.url().split("#")[0]}#diagnostics`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "版本与诊断", exact: true }).waitFor();
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  recordLayout(report, `${viewport.id}:text-200`, await inspectLayout(page, viewport));
  const screenshot = path.join(evidenceDir, `${viewport.id}-diagnostics-200-text.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  screenshots.push(path.basename(screenshot));
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
}

async function checkMoreSheet(page, report, evidenceDir, screenshots) {
  await page.goto(`${page.url().split("#")[0]}#maintenance`, { waitUntil: "networkidle" });
  const trigger = page.getByRole("button", { name: "更多", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "更多" });
  await dialog.waitFor();
  check(report, "mobile-375:more-sheet:focus", await dialog.evaluate((element) => element === document.activeElement), "sheet focused");
  check(report, "mobile-375:more-sheet:scroll-lock", await page.evaluate(() => document.body.style.overflow === "hidden"), "body locked");
  check(report, "mobile-375:more-sheet:secondary-route", await dialog.getByRole("button", { name: "版本与诊断" }).isVisible(), "fifth route available in More sheet");
  const screenshot = path.join(evidenceDir, "mobile-375-more-sheet.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  screenshots.push(path.basename(screenshot));
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  check(report, "mobile-375:more-sheet:focus-restored", await trigger.evaluate((element) => element === document.activeElement), "trigger focused");
  check(report, "mobile-375:more-sheet:scroll-restored", await page.evaluate(() => document.body.style.overflow === ""), "body unlocked");
}

async function checkGatewayDetail(page, report, mockServer, diagnostics, baseUrl, evidenceDir, screenshots) {
  await page.goto(`${baseUrl}#gateways/992902`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "DALI总线网关", exact: true }).waitFor();
  check(report, "mobile-375:gateway-detail:content", await visibleTexts(page, ["身份与覆盖", "Thread 与协议", "固件版本", "DALI"]), "gateway detail sections");
  recordLayout(report, "mobile-375:gateway-detail", await inspectLayout(page, viewports[0]));
  const screenshot = path.join(evidenceDir, "mobile-375-gateway-detail.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  screenshots.push(path.basename(screenshot));
  await checkGatewayDelete(page, report, mockServer, diagnostics, evidenceDir, screenshots);
}

async function checkGatewayDelete(page, report, mockServer, diagnostics, evidenceDir, screenshots) {
  const trigger = page.getByRole("button", { name: "移除网关", exact: true });
  await trigger.click();
  let dialog = page.getByRole("dialog", { name: "移除 DALI总线网关", exact: true });
  const confirmation = dialog.getByLabel(/输入网关名称以确认/);
  await dialog.waitFor();
  check(report, "mobile-375:gateway-delete:initial-focus", await confirmation.evaluate((element) => element === document.activeElement), "confirmation input focused");
  check(report, "mobile-375:gateway-delete:scroll-lock", await page.evaluate(() => document.body.style.overflow === "hidden"), "body locked");
  check(report, "mobile-375:gateway-delete:initially-disabled", await dialog.getByRole("button", { name: "确认移除网关" }).isDisabled(), "exact name required");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await waitForFocus(trigger);
  check(report, "mobile-375:gateway-delete:focus-restored", await trigger.evaluate((element) => element === document.activeElement), "delete trigger focused");

  await trigger.click();
  dialog = page.getByRole("dialog", { name: "移除 DALI总线网关", exact: true });
  const reopenedConfirmation = dialog.getByLabel(/输入网关名称以确认/);
  const submit = dialog.getByRole("button", { name: "确认移除网关" });
  await reopenedConfirmation.fill("DALI 网关");
  check(report, "mobile-375:gateway-delete:wrong-name-blocked", await submit.isDisabled(), await reopenedConfirmation.inputValue());
  await reopenedConfirmation.fill("DALI总线网关");
  check(report, "mobile-375:gateway-delete:exact-name-enabled", await submit.isEnabled(), await reopenedConfirmation.inputValue());
  recordLayout(report, "mobile-375:gateway-delete:dialog", await inspectLayout(page, viewports[0]));
  const confirmationShot = path.join(evidenceDir, "mobile-375-gateway-delete-confirmation.png");
  await page.screenshot({ path: confirmationShot, fullPage: true });
  screenshots.push(path.basename(confirmationShot));

  const deletePath = `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/gateway/992902/w/info`;
  const listPath = `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/gateway/r/info/1/100`;
  const callsBefore = mockServer.requestLog().length;
  await fetch(`${mockServer.origin}/__mock/fail-next`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "DELETE", path: deletePath, status: 503 }) });
  await submit.click();
  const error = dialog.getByRole("alert");
  await error.waitFor();
  markExpectedNetworkErrors(diagnostics, browserActionPath("gateway.delete"));
  check(report, "mobile-375:gateway-delete:failure-retains-name", await reopenedConfirmation.inputValue() === "DALI总线网关", await reopenedConfirmation.inputValue());
  check(report, "mobile-375:gateway-delete:failure-preserves-gateway", mockServer.fixture.devices.some((item) => item.id === "992902"), await error.innerText());
  const failureShot = path.join(evidenceDir, "mobile-375-gateway-delete-failure.png");
  await page.screenshot({ path: failureShot, fullPage: true });
  screenshots.push(path.basename(failureShot));
  await submit.click();
  await page.getByRole("heading", { name: "网关与协议", exact: true }).waitFor();
  check(report, "mobile-375:gateway-delete:removed-from-ui", await page.getByText("DALI总线网关", { exact: true }).count() === 0, "gateway absent after readback");
  check(report, "mobile-375:gateway-delete:mock-mutated", !mockServer.fixture.devices.some((item) => item.id === "992902"), "strict reference-home gateway removed");
  const calls = mockServer.requestLog().slice(callsBefore);
  const deleteIndex = calls.findIndex((entry) => entry.method === "DELETE" && entry.path === deletePath && entry.status === 200);
  const readbackIndex = calls.findIndex((entry, index) => index > deleteIndex && entry.method === "GET" && entry.path === listPath && entry.status === 200);
  check(report, "mobile-375:gateway-delete:strict-contract", deleteIndex >= 0, calls);
  check(report, "mobile-375:gateway-delete:readback-after-write", deleteIndex >= 0 && readbackIndex > deleteIndex, calls);
  const deletedShot = path.join(evidenceDir, "mobile-375-gateway-deleted.png");
  await page.screenshot({ path: deletedShot, fullPage: true });
  screenshots.push(path.basename(deletedShot));

  const reset = await fetch(`${mockServer.origin}/__mock/reset`, { method: "POST" });
  check(report, "mobile-375:gateway-delete:reset", reset.ok && mockServer.fixture.devices.some((item) => item.id === "992902"), reset.status);
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  await page.getByText("DALI总线网关", { exact: true }).waitFor();
  check(report, "mobile-375:gateway-delete:restored-readback", await page.getByText("DALI总线网关", { exact: true }).isVisible(), "gateway restored after reset and sync");
  const restoredShot = path.join(evidenceDir, "mobile-375-gateway-restored.png");
  await page.screenshot({ path: restoredShot, fullPage: true });
  screenshots.push(path.basename(restoredShot));
}

async function checkFailureRecovery(page, report, mockServer, diagnostics, baseUrl, evidenceDir, screenshots) {
  const failurePath = `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/gateway/r/info/1/100`;
  await page.goto(`${baseUrl}#maintenance`, { waitUntil: "networkidle" });
  await fetch(`${mockServer.origin}/__mock/fail-next`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "GET", path: failurePath, status: 503 }) });
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "部分家庭数据同步失败" });
  await alert.waitFor();
  markExpectedNetworkErrors(diagnostics, browserActionPath("gateway.list"));
  check(report, "mobile-375:partial-failure:retains-data", await page.getByText("户外协议中枢", { exact: true }).isVisible(), await alert.innerText());
  await page.getByRole("link", { name: "异常", exact: true }).click();
  await page.getByText("同步失败", { exact: true }).waitFor();
  check(report, "mobile-375:partial-failure:issues-surface", await page.getByText("局部同步 1", { exact: true }).isVisible(), "localized issue visible");
  const screenshot = path.join(evidenceDir, "mobile-375-partial-failure.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  screenshots.push(path.basename(screenshot));
  await page.getByRole("button", { name: "重新同步", exact: true }).click();
  await page.getByText("家庭在线", { exact: true }).waitFor();
  check(report, "mobile-375:partial-failure:retry", await page.getByRole("alert").count() === 0, "one-shot failure recovered");
}

async function inspectLayout(page, viewport) {
  return page.evaluate(({ width }) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const interactive = [...document.querySelectorAll("button, a, input, select")].filter(visible).map((element) => {
      const rect = element.getBoundingClientRect();
      return { name: element.getAttribute("aria-label") || element.textContent?.trim() || "", width: rect.width, height: rect.height };
    });
    const headings = [...document.querySelectorAll("h1, h2, h3")].filter(visible).map((element) => Number(element.tagName.slice(1)));
    return { viewportWidth: width, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, interactive, headings };
  }, viewport);
}

function recordLayout(report, id, audit) {
  const minimum = audit.viewportWidth < 1024 ? 44 : 36;
  check(report, `${id}:no-horizontal-overflow`, audit.scrollWidth <= audit.clientWidth + 1, audit);
  check(report, `${id}:target-size`, audit.interactive.every((item) => item.width >= minimum && item.height >= minimum), { minimum, failures: audit.interactive.filter((item) => item.width < minimum || item.height < minimum) });
  check(report, `${id}:heading-order`, audit.headings.every((level, index) => index === 0 || level <= audit.headings[index - 1] + 1), audit.headings);
}

async function visibleTexts(page, texts) {
  for (const text of texts) if (!await page.getByText(text, { exact: true }).first().isVisible()) return false;
  return true;
}

async function waitForFocus(locator) {
  await locator.evaluate((element) => new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      if (document.activeElement === element) return resolve(true);
      if (Date.now() - started > 1000) return reject(new Error("focus restoration timed out"));
      requestAnimationFrame(poll);
    };
    poll();
  }));
}

function markExpectedNetworkErrors(diagnostics, pathname) {
  diagnostics.httpErrors.forEach((item) => {
    const actualPath = new URL(item.url).pathname;
    if (item.status >= 500 && actualPath === pathname) item.expected = true;
  });
  diagnostics.consoleMessages.forEach((item) => { if (item.type === "error" && item.text.includes("Failed to load resource")) item.expected = true; });
}

function collectDiagnostics(page) {
  const value = { consoleMessages: [], pageErrors: [], failedRequests: [], httpErrors: [] };
  page.on("console", (message) => value.consoleMessages.push({ type: message.type(), text: message.text(), expected: false }));
  page.on("pageerror", (error) => value.pageErrors.push(error.message));
  page.on("requestfailed", (request) => value.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || "unknown" }));
  page.on("response", (response) => { if (response.status() >= 400) value.httpErrors.push({ url: response.url(), status: response.status(), expected: false }); });
  return value;
}

function check(report, id, passed, detail) {
  report.checks.push({ id, status: passed ? "passed" : "failed", detail: detail && typeof detail === "object" ? structuredClone(detail) : detail });
}

async function launchBrowser(chromium) {
  try { return await chromium.launch({ channel: process.env.YPA_PLAYWRIGHT_CHANNEL || "chrome", headless: true }); }
  catch (channelError) {
    try { return await chromium.launch({ headless: true }); }
    catch { throw new Error(`无法启动 Chromium。${channelError instanceof Error ? channelError.message : ""}`); }
  }
}
