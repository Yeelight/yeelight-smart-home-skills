import path from "node:path";
import { browserActionPaths, classifyExpectedFailures, probeBrowserBoundary } from "./e2e-browser-boundary.mjs";

const viewports = [
  { id: "mobile-375", width: 375, height: 812 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "tablet-landscape-1024", width: 1024, height: 768 },
  { id: "desktop-1440", width: 1440, height: 1000 },
];

export async function runCurtainBrowserE2E({ chromium, baseUrl, bridgeOrigin, mockServer, evidenceDir }) {
  const report = { startedAt: new Date().toISOString(), baseUrl, bridgeOrigin, checks: [], viewports: [] };
  const browser = await launchBrowser(chromium);
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce", locale: "zh-CN" });
      const page = await context.newPage();
      const diagnostics = collectDiagnostics(page);
      await page.goto(`${baseUrl}#curtains`, { waitUntil: "domcontentloaded" });
      const positionOutput = page.getByLabel("客厅电动窗帘当前位置");
      await positionOutput.waitFor();
      await page.getByText("家庭在线", { exact: true }).waitFor();

      check(report, `${viewport.id}:initial-position`, await positionOutput.textContent() === "65%", await positionOutput.textContent());
      check(report, `${viewport.id}:position-slider`, await page.getByRole("slider", { name: "客厅电动窗帘目标位置" }).inputValue() === "65", "native range reflects Runtime position");
      check(report, `${viewport.id}:no-stop-control`, await page.getByRole("button", { name: /暂停|停止/ }).count() === 0, "Runtime exposes no stop action");
      const readonlyCard = page.getByRole("article").filter({ hasText: "影音室只读幕布" });
      if (await readonlyCard.count() > 0) {
        check(report, `${viewport.id}:readonly-explicit`, await readonlyCard.getByText("当前家庭仅支持查看此窗帘状态。", { exact: true }).isVisible(), "read-only curtain has an explicit boundary");
        check(report, `${viewport.id}:readonly-controls-disabled`, await readonlyCard.getByRole("button", { name: "全关" }).isDisabled() && await readonlyCard.getByRole("button", { name: "一半" }).isDisabled() && await readonlyCard.getByRole("button", { name: "全开" }).isDisabled() && await readonlyCard.getByRole("slider").isDisabled(), "read-only curtain cannot initiate writes");
      }
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
  const curtain = () => mockServer.fixture.devices.find((device) => device.id === "992101");
  const targetCard = page.getByRole("article").filter({ hasText: "客厅电动窗帘" });
  const positionOutput = targetCard.getByLabel("客厅电动窗帘当前位置");
  const slider = targetCard.getByRole("slider", { name: "客厅电动窗帘目标位置" });

  await targetCard.getByRole("button", { name: "全关" }).click();
  await waitFor(() => curtain().properties.position === 0);
  check(report, "write:close", await positionOutput.textContent() === "0%" && curtain().properties.targetPosition === 0, curtain().properties);

  await targetCard.getByRole("button", { name: "一半" }).click();
  await waitFor(() => curtain().properties.position === 50);
  check(report, "write:half", await positionOutput.textContent() === "50%", curtain().properties);

  await targetCard.getByRole("button", { name: "全开" }).click();
  await waitFor(() => curtain().properties.position === 100);
  check(report, "write:open", await positionOutput.textContent() === "100%", curtain().properties);

  await slider.fill("35");
  await slider.dispatchEvent("pointerup");
  await waitFor(() => curtain().properties.position === 35);
  check(report, "write:slider", await slider.inputValue() === "35" && await positionOutput.textContent() === "35%", curtain().properties);

  const writePath = `/apis/iot/v1/controll/device/2/${curtain().id}/w/properties/tp`;
  await fetch(`${mockServer.origin}/__mock/fail-next`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "POST", path: writePath, status: 503 }) });
  await targetCard.getByRole("button", { name: "一半" }).click();
  const alert = page.getByRole("alert");
  await alert.waitFor();
  check(report, "failure:write-visible", await alert.getByText(/控制失败|调用失败|连接/).count() >= 1 && curtain().properties.position === 35, await alert.innerText());
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-write-failure.png"), fullPage: true });
  const retryButton = page.getByRole("button", { name: "重新尝试" });
  await retryButton.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const retryLayout = await inspectActionVisibility(retryButton);
  check(report, "failure:retry-action-visible", retryLayout.height >= 44 && retryLayout.fullyVisible && retryLayout.unobstructed, retryLayout);
  await retryButton.click();
  await waitFor(() => curtain().properties.position === 50);
  check(report, "failure:write-recovered", await page.getByText("窗帘已调整到 50% 。", { exact: true }).isVisible(), curtain().properties);

  curtain().online = false;
  curtain().properties.o = false;
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  await targetCard.getByText("设备当前离线，恢复连接后可继续调整位置。", { exact: true }).waitFor();
  check(report, "offline:controls-disabled", await targetCard.getByRole("button", { name: "全关" }).isDisabled() && await slider.isDisabled(), "offline state disables writes");
  curtain().online = true;
  curtain().properties.o = true;
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  await page.getByText("家庭在线", { exact: true }).waitFor();
  check(report, "offline:recovered", await targetCard.getByRole("button", { name: "全关" }).isEnabled() && await slider.isEnabled(), "online state restores controls");

  const statePath = `/apis/iot/v1/controll/device/${curtain().id}/r/properties/position`;
  await fetch(`${mockServer.origin}/__mock/fail-next`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "POST", path: statePath, status: 503 }) });
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  await page.getByRole("alert").waitFor();
  check(report, "failure:sync-visible", await page.getByText("部分家庭数据同步失败", { exact: true }).isVisible(), await page.getByRole("alert").innerText());
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  await page.getByText("家庭在线", { exact: true }).waitFor();
  check(report, "failure:sync-recovered", await page.getByRole("alert").count() === 0, "one-shot state failure consumed");

  await slider.fill("65");
  await slider.dispatchEvent("pointerup");
  await waitFor(() => curtain().properties.position === 65);
  check(report, "write:restore", await positionOutput.textContent() === "65%" && curtain().properties.targetPosition === 65, curtain().properties);

  const writes = mockServer.requestLog().filter((entry) => entry.path === writePath && entry.status === 200);
  check(report, "api:exact-write-contract", writes.length >= 6 && writes.every((entry) => Object.keys(entry.body || {}).join(",") === "value" && Number.isInteger(entry.body.value)), writes.map((entry) => entry.body));
  const readonlyWrites = mockServer.requestLog().filter((entry) => entry.path.includes("992104") && /\/w\//.test(entry.path));
  check(report, "readonly:no-write", readonlyWrites.length === 0, readonlyWrites);
  const verifies = mockServer.requestLog().filter((entry) => entry.path === `/apis/iot/v1/controll/device/${curtain().id}/r/properties/tp` && entry.status === 200);
  check(report, "api:write-verification", verifies.length >= 6, verifies.length);

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
  report.checks.push({ id, status: passed ? "passed" : "failed", detail: cloneDetail(detail) });
}

function cloneDetail(detail) {
  if (detail === undefined || detail === null || typeof detail !== "object") return detail;
  return structuredClone(detail);
}

async function inspectActionVisibility(locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const probe = document.elementFromPoint(rect.left + rect.width / 2, rect.bottom - 4);
    return {
      width: rect.width,
      height: rect.height,
      top: rect.top,
      bottom: rect.bottom,
      fullyVisible: rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth,
      unobstructed: probe === element || element.contains(probe),
      probeTag: probe?.tagName.toLowerCase() || "",
      probeClass: probe?.className || "",
    };
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
