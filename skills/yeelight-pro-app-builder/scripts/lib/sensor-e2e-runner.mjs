import path from "node:path";
import { browserActionPaths, classifyExpectedFailures, probeBrowserBoundary, routeNavigationIsValid } from "./e2e-browser-boundary.mjs";

const viewports = [
  { id: "mobile-375", width: 375, height: 812 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "tablet-landscape-1024", width: 1024, height: 768 },
  { id: "desktop-1440", width: 1440, height: 1000 },
];

export async function runSensorBrowserE2E({ chromium, baseUrl, bridgeOrigin, mockServer, evidenceDir }) {
  const report = { startedAt: new Date().toISOString(), baseUrl, bridgeOrigin, checks: [], viewports: [] };
  const browser = await launchBrowser(chromium);
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce", locale: "zh-CN" });
      const page = await context.newPage();
      const diagnostics = collectDiagnostics(page);
      await page.goto(`${baseUrl}#environment`, { waitUntil: "domcontentloaded" });
      await page.getByText("家庭在线", { exact: true }).waitFor();
      await page.getByText("客厅温湿度传感器", { exact: true }).waitFor();

      check(report, `${viewport.id}:navigation-contract`, await routeNavigationIsValid(page, "环境"), page.url());
      check(report, `${viewport.id}:environment-readings`, await page.getByText("24℃", { exact: true }).isVisible() && await page.getByText("48%", { exact: true }).isVisible() && await page.getByText("86%", { exact: true }).isVisible(), "temperature, humidity and battery are visible");
      check(report, `${viewport.id}:presence-readings`, await page.getByText("无人", { exact: true }).isVisible() && await page.getByText("126 lx", { exact: true }).isVisible() && await page.getByText("74%", { exact: true }).isVisible(), "presence, luminance and battery are visible");
      check(report, `${viewport.id}:event-definitions`, await page.getByText("温度过高", { exact: true }).isVisible() && await page.getByText("检测到有人", { exact: true }).isVisible(), "real Runtime event definitions are visible");
      check(report, `${viewport.id}:history-boundary`, await page.getByText("当前 Runtime 未提供时间序列历史", { exact: true }).isVisible(), "history boundary is explicit");
      check(report, `${viewport.id}:read-only`, await page.locator(".sensor-card button, .sensor-card input, .sensor-card select").count() === 0, "sensor cards expose no write controls");
      const layout = await inspectLayout(page);
      check(report, `${viewport.id}:no-horizontal-overflow`, layout.scrollWidth <= layout.clientWidth + 1, layout);
      check(report, `${viewport.id}:touch-targets`, layout.interactive.every((item) => item.width >= 44 && item.height >= 44), layout.interactive);
      check(report, `${viewport.id}:heading-order`, validHeadingOrder(layout.headings), layout.headings);
      check(report, `${viewport.id}:radius-contract`, layout.radii.every((radius) => radius <= 8), layout.radii);
      check(report, `${viewport.id}:contrast`, layout.contrast.every((ratio) => ratio >= 4.5), layout.contrast);
      const screenshot = path.join(evidenceDir, `${viewport.id}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      if (viewport.id === "mobile-375") await runPrimaryFlow({ page, report, bridgeOrigin, mockServer, evidenceDir });

      const expectedPaths = browserActionPaths(["state.query", "sensor.event.list", "device.property.set"]);
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
  const environment = () => mockServer.fixture.devices.find((device) => device.id === "992401");
  const presence = () => mockServer.fixture.devices.find((device) => device.id === "992402");
  const environmentCard = page.locator(".sensor-card").filter({ hasText: "客厅温湿度传感器" });
  const requests = () => mockServer.requestLog();
  const stateProperties = new Set(requests().filter((entry) => /\/r\/properties\//.test(entry.path)).map((entry) => entry.path.split("/").at(-1)));
  check(report, "api:raw-sensor-properties", ["t", "h", "bl", "o", "oc", "luminance"].every((property) => stateProperties.has(property)), [...stateProperties]);
  const eventCalls = requests().filter((entry) => entry.path === "/apis/iot/v1/sensor/r/events");
  check(report, "api:event-read-contract", eventCalls.length >= 1 && eventCalls.every((entry) => entry.method === "POST" && Object.keys(entry.body || {}).join(",") === "houseId"), eventCalls);
  check(report, "api:zero-writes", requests().every((entry) => !entry.path.includes("/w/")), requests().filter((entry) => entry.path.includes("/w/")));

  const boundary = await probeBrowserBoundary(bridgeOrigin, "device.property.set");
  check(report, "bridge:semantic-route-404", boundary.semanticRoute.status === 404, boundary.semanticRoute);
  check(report, "bridge:unknown-action-403", boundary.unknownAction.status === 403 && boundary.unknownAction.body.status === "blocked", boundary.unknownAction);

  environment().properties.o = false;
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  await environmentCard.getByText("设备离线", { exact: true }).waitFor();
  check(report, "offline:visible", await environmentCard.getByText("等待设备恢复连接", { exact: true }).isVisible(), environment().properties);
  environment().properties.o = true;
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  await environmentCard.getByText("设备离线", { exact: true }).waitFor({ state: "hidden" });

  delete environment().properties.t;
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  await environmentCard.getByText("暂无数据", { exact: true }).waitFor();
  check(report, "missing-reading:explicit", await environmentCard.getByText("48%", { exact: true }).isVisible(), "humidity remains while temperature is unavailable");
  environment().properties.t = 24;
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  await environmentCard.getByText("24℃", { exact: true }).waitFor();

  const stateFailurePath = `/apis/iot/v1/controll/device/${environment().id}/r/properties/t`;
  await armFailure(mockServer, stateFailurePath);
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  const stateAlert = page.getByRole("alert").filter({ hasText: "部分家庭数据同步失败" });
  await stateAlert.waitFor();
  check(report, "failure:state-visible", await environmentCard.getByText("24℃", { exact: true }).isVisible(), await stateAlert.innerText());
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-state-failure.png"), fullPage: true });
  const stateRetry = stateAlert.getByRole("button", { name: "重新同步" });
  await stateRetry.evaluate((element) => element.scrollIntoView({ block: "center" }));
  check(report, "failure:state-retry-visible", await inspectActionVisibility(stateRetry), await stateRetry.boundingBox());
  await stateRetry.click();
  await stateAlert.waitFor({ state: "hidden" });
  await page.getByText("家庭在线", { exact: true }).waitFor();
  check(report, "failure:state-recovered", await environmentCard.getByText("24℃", { exact: true }).isVisible(), environment().properties);

  await armFailure(mockServer, "/apis/iot/v1/sensor/r/events");
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  const eventAlert = page.getByRole("alert").filter({ hasText: "事件定义同步失败" });
  await eventAlert.waitFor();
  check(report, "failure:event-visible", await page.getByText("126 lx", { exact: true }).isVisible(), await eventAlert.innerText());
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-event-failure.png"), fullPage: true });
  const eventRetry = eventAlert.getByRole("button", { name: "重新尝试" });
  await eventRetry.evaluate((element) => element.scrollIntoView({ block: "center" }));
  check(report, "failure:event-retry-visible", await inspectActionVisibility(eventRetry), await eventRetry.boundingBox());
  await eventRetry.click();
  await eventAlert.waitFor({ state: "hidden" });
  await page.getByText("家庭在线", { exact: true }).waitFor();
  check(report, "failure:event-recovered", await page.getByText("温度过高", { exact: true }).isVisible(), presence().properties);
  check(report, "restore:deterministic", environment().properties.t === 24 && environment().properties.o === true && presence().properties.oc === false, { environment: environment().properties, presence: presence().properties });
}

async function armFailure(mockServer, apiPath) {
  const response = await fetch(`${mockServer.origin}/__mock/fail-next`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "POST", path: apiPath, status: 503 }) });
  if (!response.ok) throw new Error(`failed to arm ${apiPath}`);
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
  return page.evaluate(() => {
    const rgb = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const luminance = (color) => color.map((part) => { const channel = part / 255; return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; }).reduce((sum, part, index) => sum + part * [0.2126, 0.7152, 0.0722][index], 0);
    const ratio = (foreground, background) => { const values = [luminance(rgb(foreground)), luminance(rgb(background))].sort((a, b) => b - a); return (values[0] + 0.05) / (values[1] + 0.05); };
    const rootStyle = getComputedStyle(document.body);
    const muted = document.querySelector(".history-boundary small");
    return {
      scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
      interactive: [...document.querySelectorAll("button, a, input, select")].filter((element) => { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0; }).map((element) => { const rect = element.getBoundingClientRect(); return { name: element.getAttribute("aria-label") || element.textContent?.trim() || "", width: rect.width, height: rect.height }; }),
      headings: [...document.querySelectorAll("h1, h2, h3")].map((heading) => ({ level: Number(heading.tagName.slice(1)), text: heading.textContent?.trim() || "" })),
      radii: [...document.querySelectorAll(".sensor-card, .sensor-reading, .sensor-event-list li")].map((element) => parseFloat(getComputedStyle(element).borderRadius) || 0),
      contrast: [ratio(rootStyle.color, rootStyle.backgroundColor), ...(muted ? [ratio(getComputedStyle(muted).color, getComputedStyle(muted).backgroundColor === "rgba(0, 0, 0, 0)" ? rootStyle.backgroundColor : getComputedStyle(muted).backgroundColor)] : [])],
    };
  });
}

function validHeadingOrder(headings) { return headings[0]?.level === 1 && headings.every((heading, index) => index === 0 || heading.level <= headings[index - 1].level + 1); }
function check(report, id, passed, detail) { report.checks.push({ id, status: passed ? "passed" : "failed", detail: detail && typeof detail === "object" ? structuredClone(detail) : detail }); }
async function inspectActionVisibility(locator) { return locator.evaluate((element) => { const rect = element.getBoundingClientRect(); const probe = document.elementFromPoint(rect.left + rect.width / 2, rect.bottom - 4); return rect.width >= 44 && rect.height >= 44 && rect.top >= 0 && rect.bottom <= window.innerHeight && (probe === element || element.contains(probe)); }); }
async function launchBrowser(chromium) { try { return await chromium.launch({ channel: process.env.YPA_PLAYWRIGHT_CHANNEL || "chrome", headless: true }); } catch (channelError) { try { return await chromium.launch({ headless: true }); } catch { throw new Error(`无法启动 Chromium。${channelError instanceof Error ? channelError.message : ""}`); } } }
