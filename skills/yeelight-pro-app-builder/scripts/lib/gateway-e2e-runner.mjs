import path from "node:path";

const viewports = [
  { id: "mobile-375", width: 375, height: 812 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "tablet-landscape-1024", width: 1024, height: 768 },
  { id: "desktop-1440", width: 1440, height: 1000 },
];

export async function runGatewayBrowserE2E({ chromium, baseUrl, bridgeOrigin, mockServer, evidenceDir }) {
  const report = { startedAt: new Date().toISOString(), baseUrl, bridgeOrigin, checks: [], viewports: [] };
  const browser = await launchBrowser(chromium);
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce", locale: "zh-CN" });
      const page = await context.newPage(); const diagnostics = collectDiagnostics(page);
      await page.goto(`${baseUrl}#gateways`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "网关与协议", exact: true }).waitFor();
      check(report, `${viewport.id}:directory`, await visibleTexts(page, ["全屋智能中枢", "户外协议中枢", "DALI总线网关", "全部网关", "协议类型"]), "gateway directory fields");
      check(report, `${viewport.id}:no-internal-ui`, await page.getByText(/intent|capability|endpoint|Bridge|CLI|operationId/).count() === 0, "no internal runtime vocabulary");
      const directoryLayout = await inspectLayout(page); recordLayoutChecks(report, `${viewport.id}:directory`, directoryLayout);
      const directoryShot = path.join(evidenceDir, `${viewport.id}-directory.png`); await page.screenshot({ path: directoryShot, fullPage: true });

      await page.getByRole("button", { name: /全屋智能中枢/ }).click();
      await page.getByRole("heading", { name: "全屋智能中枢", exact: true }).waitFor();
      check(report, `${viewport.id}:deep-link`, page.url().includes("#gateways/992900"), page.url());
      check(report, `${viewport.id}:detail`, await visibleTexts(page, ["身份与覆盖", "Thread 与协议", "情景关系", "运行诊断", "网关设置", "YL-GW-PRO-01", "2.8.4", "边界路由器"]), "gateway detail sections");
      check(report, `${viewport.id}:no-fabricated-actions`, await page.getByText(/健康分数|信号质量|拓扑图|升级固件|OTA|重启网关/).count() === 0, "no invented diagnostics or OTA");
      check(report, `${viewport.id}:no-installer-delete`, await page.getByText(/移除网关|确认移除网关|删除网关仅在安装维护应用中提供/).count() === 0, "household profile renders no delete surface");
      const detailLayout = await inspectLayout(page); recordLayoutChecks(report, `${viewport.id}:detail`, detailLayout);
      const detailShot = path.join(evidenceDir, `${viewport.id}-detail.png`); await page.screenshot({ path: detailShot, fullPage: true });

      if (viewport.id === "mobile-375") await runEditorFlows({ page, report, mockServer, diagnostics, evidenceDir });
      await page.getByRole("button", { name: "返回网关", exact: true }).click();
      await page.getByRole("heading", { name: "网关与协议", exact: true }).waitFor();
      if (viewport.id === "mobile-375") await runFailureFlows({ page, report, mockServer, diagnostics, evidenceDir });
      if (viewport.id === "mobile-375") await runTextScaleCheck({ page, report, evidenceDir });

      check(report, `${viewport.id}:page-errors`, diagnostics.pageErrors.length === 0, diagnostics.pageErrors);
      check(report, `${viewport.id}:request-failures`, diagnostics.failedRequests.length === 0, diagnostics.failedRequests);
      check(report, `${viewport.id}:http-errors`, diagnostics.httpErrors.filter((item) => !item.expected).length === 0, diagnostics.httpErrors);
      check(report, `${viewport.id}:console-errors`, diagnostics.consoleMessages.filter((item) => item.type === "error" && !item.text.includes("Failed to load resource")).length === 0, diagnostics.consoleMessages);
      report.viewports.push({ ...viewport, directoryScreenshot: path.basename(directoryShot), detailScreenshot: path.basename(detailShot), directoryLayout, detailLayout, ...diagnostics });
      await context.close();
    }
  } finally { await browser.close(); }
  const blocked = await fetch(`${bridgeOrigin}/api/actions/a_not_allowed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  check(report, "bridge:delete-blocked", blocked.status === 403 && (await blocked.json()).status === "blocked", blocked.status);
  const gatewayIds = new Set(mockServer.fixture.devices.filter((device) => device.family === "gateway").map((device) => String(device.id)));
  const genericReads = mockServer.requestLog().filter((entry) => {
    if (!/\/device\/[^/]+\/r\/detail|\/controll\/device\/[^/]+\/r\/properties/.test(entry.path)) return false;
    const deviceId = entry.path.match(/\/device\/([^/]+)/)?.[1] || "";
    return gatewayIds.has(deviceId);
  });
  check(report, "api:no-generic-device-reads", genericReads.length === 0, genericReads);
  report.finishedAt = new Date().toISOString(); report.status = report.checks.every((item) => item.status === "passed") ? "passed" : "failed";
  return report;
}

async function runEditorFlows({ page, report, mockServer, diagnostics, evidenceDir }) {
  const trigger = page.getByRole("button", { name: "编辑网关", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: /编辑 全屋智能中枢/ }); const input = dialog.getByLabel("网关名称");
  check(report, "editor:initial-focus", await input.evaluate((element) => element === document.activeElement), "name input focused");
  check(report, "editor:scroll-lock", await page.evaluate(() => document.body.style.overflow === "hidden"), "body locked");
  await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
  await waitForFocus(trigger);
  check(report, "editor:focus-restored", await trigger.evaluate((element) => element === document.activeElement), "edit trigger focused");

  await trigger.click(); await input.fill("中央网关");
  await dialog.getByRole("button", { name: "检查并保存" }).click();
  await page.getByRole("heading", { name: "中央网关", exact: true }).waitFor();
  const changedGateway = mockServer.fixture.devices.find((item) => item.id === "992900");
  check(report, "editor:write-readback", (changedGateway?.alias || changedGateway?.name) === "中央网关", changedGateway?.alias || changedGateway?.name);
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-configured.png"), fullPage: true });
  await fetch(`${mockServer.origin}/__mock/reset`, { method: "POST" }); await sync(page); await page.getByRole("heading", { name: "全屋智能中枢", exact: true }).waitFor();

  await page.getByRole("button", { name: "编辑网关", exact: true }).click();
  const failureDialog = page.getByRole("dialog", { name: /编辑 全屋智能中枢/ }); const failureInput = failureDialog.getByLabel("网关名称");
  await failureInput.fill("失败保留名称");
  await armFailure(mockServer, "POST", `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/gateway/992900/w/modify`);
  await failureDialog.getByRole("button", { name: "检查并保存" }).click();
  await failureDialog.getByRole("alert").waitFor();
  markLatestActionError(diagnostics);
  check(report, "editor:failure-retains-input", await failureInput.inputValue() === "失败保留名称", await failureInput.inputValue());
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-configure-failure.png"), fullPage: true });
  page.once("dialog", (nativeDialog) => nativeDialog.accept()); await failureDialog.getByRole("button", { name: "取消" }).click(); await failureDialog.waitFor({ state: "hidden" });
}

async function runFailureFlows({ page, report, mockServer, diagnostics, evidenceDir }) {
  const gateway = mockServer.fixture.devices.find((device) => device.id === "992900");
  gateway.online = false; await sync(page);
  const row = page.getByRole("button", { name: /全屋智能中枢/ });
  check(report, "state:offline", await row.getByText("离线", { exact: true }).isVisible(), "offline explicit");
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-offline.png"), fullPage: true });
  gateway.online = true; await sync(page); await row.getByText("在线", { exact: true }).waitFor();

  await armFailure(mockServer, "GET", `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/gateway/r/info/1/100`); await sync(page);
  const listAlert = page.locator(".gateway-error[role=alert]").filter({ hasText: "网关列表同步失败" }); await listAlert.waitFor();
  markLatestActionError(diagnostics);
  check(report, "failure:list-preserves-data", await page.getByText("全屋智能中枢", { exact: true }).isVisible(), await listAlert.innerText());
  await listAlert.getByRole("button", { name: "重试" }).click(); await listAlert.waitFor({ state: "hidden" }); await waitReady(page);

  await armFailure(mockServer, "POST", "/apis/iot/v1/scene/r/992900/related/sceneId");
  await page.getByRole("button", { name: /全屋智能中枢/ }).click(); await page.getByRole("heading", { name: "全屋智能中枢", exact: true }).waitFor();
  const relationAlert = page.locator(".gateway-error[role=alert]").filter({ hasText: "情景关系同步失败" }); await relationAlert.waitFor();
  markLatestActionError(diagnostics);
  check(report, "failure:relations-localized", await page.getByText("身份与覆盖", { exact: true }).isVisible(), await relationAlert.innerText());
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-relation-failure.png"), fullPage: true });
  await relationAlert.getByRole("button", { name: "重试" }).click(); await relationAlert.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "返回网关", exact: true }).click();
}

async function runTextScaleCheck({ page, report, evidenceDir }) {
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  const layout = await inspectLayout(page); check(report, "mobile-375:text-200-no-overflow", layout.scrollWidth <= layout.clientWidth + 1, layout);
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-text-200.png"), fullPage: true });
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
}

async function sync(page) { await page.getByRole("button", { name: "重新同步家庭状态" }).click(); await waitReady(page); }
async function waitReady(page) { await page.waitForFunction(() => !document.querySelector('button[aria-label="重新同步家庭状态"]')?.hasAttribute("disabled")); }
async function armFailure(server, method, apiPath) { const response = await fetch(`${server.origin}/__mock/fail-next`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method, path: apiPath, status: 503 }) }); if (!response.ok) throw new Error(`failed to arm ${method} ${apiPath}`); }
async function visibleTexts(page, values) { return (await Promise.all(values.map((value) => page.getByText(value, { exact: true }).first().isVisible()))).every(Boolean); }
async function waitForFocus(locator) { await locator.evaluate((element) => new Promise((resolve, reject) => { const started = Date.now(); const poll = () => { if (document.activeElement === element) return resolve(true); if (Date.now() - started > 1000) return reject(new Error("focus restoration timed out")); requestAnimationFrame(poll); }; poll(); })); }
function markLatestActionError(diagnostics) { const item = diagnostics.httpErrors.findLast((entry) => !entry.expected && entry.status === 502 && /^\/api\/actions\/a_[a-f0-9]+$/.test(new URL(entry.url).pathname)); if (item) item.expected = true; }
function collectDiagnostics(page) { const value = { consoleMessages: [], pageErrors: [], failedRequests: [], httpErrors: [] }; page.on("console", (message) => value.consoleMessages.push({ type: message.type(), text: message.text() })); page.on("pageerror", (error) => value.pageErrors.push(error.message)); page.on("requestfailed", (request) => value.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || "unknown" })); page.on("response", (response) => { if (response.status() >= 400) value.httpErrors.push({ url: response.url(), status: response.status(), expected: false }); }); return value; }
async function inspectLayout(page) { return page.evaluate(() => { const rgb = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number); const lum = (color) => color.map((part) => { const c = part / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, part, index) => sum + part * [0.2126, 0.7152, 0.0722][index], 0); const ratio = (foreground, background) => { const values = [lum(rgb(foreground)), lum(rgb(background))].sort((a, b) => b - a); return (values[0] + 0.05) / (values[1] + 0.05); }; const body = getComputedStyle(document.body); return { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, interactive: [...document.querySelectorAll("button, a, input, select")].filter((element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; }).map((element) => { const rect = element.getBoundingClientRect(); return { name: element.getAttribute("aria-label") || element.textContent?.trim() || "", width: rect.width, height: rect.height }; }), headings: [...document.querySelectorAll("h1, h2, h3")].map((heading) => ({ level: Number(heading.tagName.slice(1)), text: heading.textContent?.trim() || "" })), radii: [...document.querySelectorAll(".gateway-row, .gateway-section, .gateway-error, .gateway-dialog, button")].map((element) => parseFloat(getComputedStyle(element).borderRadius) || 0), contrast: [ratio(body.color, body.backgroundColor)] }; }); }
function recordLayoutChecks(report, viewport, layout) { check(report, `${viewport}:no-horizontal-overflow`, layout.scrollWidth <= layout.clientWidth + 1, layout); check(report, `${viewport}:touch-targets`, layout.interactive.every((item) => item.width >= 44 && item.height >= 44), layout.interactive); check(report, `${viewport}:heading-order`, layout.headings[0]?.level === 1 && layout.headings.every((item, index) => index === 0 || item.level <= layout.headings[index - 1].level + 1), layout.headings); check(report, `${viewport}:radius-contract`, layout.radii.every((radius) => radius <= 8), layout.radii); check(report, `${viewport}:contrast`, layout.contrast.every((value) => value >= 4.5), layout.contrast); }
function check(report, id, passed, detail) { report.checks.push({ id, status: passed ? "passed" : "failed", detail: detail && typeof detail === "object" ? structuredClone(detail) : detail }); }
async function launchBrowser(chromium) { try { return await chromium.launch({ channel: process.env.YPA_PLAYWRIGHT_CHANNEL || "chrome", headless: true }); } catch (channelError) { try { return await chromium.launch({ headless: true }); } catch { throw new Error(`无法启动 Chromium。${channelError instanceof Error ? channelError.message : ""}`); } } }
