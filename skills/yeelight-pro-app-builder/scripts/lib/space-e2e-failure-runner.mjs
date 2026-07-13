import path from "node:path";

export async function runSpaceFailureE2E({ browser, baseUrl, mockServer, evidenceDir }) {
  const report = { checks: [] };
  await verifyDetailRecovery({ browser, baseUrl, mockServer, evidenceDir, report });
  await verifyNotFoundRoutes({ browser, baseUrl, report });
  await verifyWriteFailure({ browser, baseUrl, mockServer, report });
  await verifyWriteReadbackMismatch({ browser, baseUrl, mockServer, evidenceDir, report });
  await verifyTextScaleAndAccessibility({ browser, baseUrl, evidenceDir, report });
  return report;
}

async function verifyDetailRecovery({ browser, baseUrl, mockServer, evidenceDir, report }) {
  const cases = [
    { id: "area", route: "spaces/areas/990101", method: "GET", path: `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/area/990101/r/info`, message: "暂时无法读取区域详情。", retry: "重新读取" },
    { id: "room", route: "spaces/rooms/991001", method: "POST", path: "/apis/iot/v1/room/991001/r/detail", message: "暂时无法读取房间详情。", retry: "重新读取" },
    { id: "device-timeout", route: "devices/992001", method: "POST", path: "/apis/iot/v1/device/992001/r/detail", message: "暂时无法读取设备详情。", retry: "重新加载设备详情", delayMs: 1200, status: 504 },
  ];
  for (const item of cases) {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: "reduce", locale: "zh-CN" });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.getByText("家庭在线", { exact: true }).waitFor();
    await armFailure(mockServer, { method: item.method, path: item.path, status: item.status || 503, delayMs: item.delayMs || 0 });
    const started = Date.now();
    await page.evaluate((route) => { window.location.hash = route; }, item.route);
    await page.getByRole("alert").filter({ hasText: item.message }).waitFor();
    await page.screenshot({ path: path.join(evidenceDir, `failure-${item.id}.png`), fullPage: true });
    check(report, `failure:${item.id}-isolated`, item.delayMs ? Date.now() - started >= item.delayMs : true, { route: page.url(), elapsedMs: Date.now() - started });
    await page.getByRole("button", { name: item.retry, exact: true }).click();
    await page.waitForFunction((message) => ![...document.querySelectorAll('[role="alert"]')].some((element) => element.textContent?.includes(message)), item.message);
    check(report, `failure:${item.id}-recovered`, new URL(page.url()).hash === `#${item.route}`, page.url());
    await context.close();
  }
}

async function verifyNotFoundRoutes({ browser, baseUrl, report }) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: "zh-CN" });
  const page = await context.newPage();
  for (const [route, heading] of [["spaces/areas/missing", "未找到区域"], ["spaces/rooms/missing", "未找到房间"], ["devices/missing", "未找到设备"]]) {
    await page.goto(`${baseUrl}#${route}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    check(report, `not-found:${route.split("/")[1]}`, new URL(page.url()).hash === `#${route}`, page.url());
  }
  await context.close();
}

async function verifyWriteFailure({ browser, baseUrl, mockServer, report }) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: "zh-CN" });
  const page = await context.newPage();
  await page.goto(`${baseUrl}#devices/992001`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "客厅全光谱吸顶灯", exact: true }).waitFor();
  const original = mockServer.fixture.devices.find((item) => item.id === "992001")?.name;
  await armFailure(mockServer, { method: "POST", path: "/apis/iot/v1/device/992001/w/update", status: 503 });
  await page.getByRole("button", { name: "重命名", exact: true }).click();
  await page.getByRole("textbox", { name: "设备名称" }).fill("不应落库的名称");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.locator(".dialog-feedback.error").waitFor();
  const current = mockServer.fixture.devices.find((item) => item.id === "992001")?.name;
  check(report, "write:failure-keeps-trusted-state", current === original && await page.getByRole("heading", { name: "客厅全光谱吸顶灯", exact: true }).isVisible(), { original, current });
  await context.close();
}

async function verifyWriteReadbackMismatch({ browser, baseUrl, mockServer, evidenceDir, report }) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: "zh-CN" });
  const page = await context.newPage();
  await page.goto(`${baseUrl}#devices/992001`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "客厅全光谱吸顶灯", exact: true }).waitFor();
  const original = mockServer.fixture.devices.find((item) => item.id === "992001")?.name;
  await armNoop(mockServer, { method: "POST", path: "/apis/iot/v1/device/992001/w/update" });
  await page.getByRole("button", { name: "重命名", exact: true }).click();
  await page.getByRole("textbox", { name: "设备名称" }).fill("未通过回读确认的名称");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const feedback = page.locator(".dialog-feedback.error");
  await feedback.getByText("设备操作未通过回读确认，原有状态未改变。请重新同步后再试。", { exact: true }).waitFor();
  const sheet = await page.locator(".device-dialog").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { width: rect.width, bottom: rect.bottom, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, borderBottomLeftRadius: style.borderBottomLeftRadius };
  });
  const current = mockServer.fixture.devices.find((item) => item.id === "992001")?.name;
  check(report, "write:readback-mismatch-keeps-trusted-state", current === original && await page.getByRole("heading", { name: "客厅全光谱吸顶灯", exact: true }).isVisible(), { original, current });
  check(report, "mobile:management-bottom-sheet", sheet.width >= sheet.viewportWidth - 1 && sheet.bottom >= sheet.viewportHeight - 1 && sheet.borderBottomLeftRadius === "0px", sheet);
  await page.screenshot({ path: path.join(evidenceDir, "write-readback-mismatch.png"), fullPage: true });
  await context.close();
}

async function verifyTextScaleAndAccessibility({ browser, baseUrl, evidenceDir, report }) {
  const context = await browser.newContext({ viewport: { width: 720, height: 900 }, reducedMotion: "reduce", locale: "zh-CN" });
  const page = await context.newPage();
  await page.goto(`${baseUrl}#devices`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /客厅全光谱吸顶灯/ }).waitFor();
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  const audit = await page.evaluate(() => {
    const visible = [...document.querySelectorAll("button, a, input, select")].filter((element) => element instanceof HTMLElement && element.offsetParent !== null);
    const names = visible.map((element) => element.getAttribute("aria-label") || element.textContent?.trim() || element.getAttribute("placeholder") || "");
    const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      unnamedControls: names.filter((name) => !name).length,
      duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
      landmarks: {
        main: document.querySelectorAll("main").length,
        navigation: [...document.querySelectorAll('nav[aria-label="主导航"]')].filter((element) => element instanceof HTMLElement && element.offsetParent !== null).length,
        heading: document.querySelectorAll("h1").length,
      },
      routeHeadingOutline: getComputedStyle(document.querySelector('h2[tabindex="-1"]')).outlineStyle,
    };
  });
  check(report, "a11y:200-percent-text-no-overflow", audit.scrollWidth <= audit.clientWidth + 1, audit);
  check(report, "a11y:interactive-names", audit.unnamedControls === 0, audit);
  check(report, "a11y:unique-ids-and-landmarks", audit.duplicateIds.length === 0 && Object.values(audit.landmarks).every((count) => count === 1), audit);
  check(report, "a11y:programmatic-heading-focus-not-input-like", audit.routeHeadingOutline === "none", audit);
  await page.evaluate(() => {
    const scroller = document.querySelector(".shell-content");
    if (scroller instanceof HTMLElement) scroller.scrollTop = scroller.scrollHeight;
    else window.scrollTo({ top: document.documentElement.scrollHeight });
  });
  await page.waitForTimeout(50);
  const clearance = await page.evaluate(() => {
    const lastRow = [...document.querySelectorAll(".managed-device-row")].at(-1);
    const navigation = document.querySelector(".mobile-navigation");
    if (!(lastRow instanceof HTMLElement) || !(navigation instanceof HTMLElement)) return null;
    const row = lastRow.getBoundingClientRect(); const nav = navigation.getBoundingClientRect();
    return { rowBottom: row.bottom, navigationTop: nav.top, gap: nav.top - row.bottom };
  });
  check(report, "a11y:fixed-navigation-content-clearance", Boolean(clearance && clearance.gap >= 8), clearance);
  await page.screenshot({ path: path.join(evidenceDir, "text-scale-200.png"), fullPage: true });
  await context.close();
}

async function armFailure(mockServer, failure) {
  const response = await fetch(`${mockServer.origin}/__mock/fail-next`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(failure) });
  if (!response.ok) throw new Error(`failed to arm mock failure: ${response.status}`);
}

async function armNoop(mockServer, target) {
  const response = await fetch(`${mockServer.origin}/__mock/succeed-without-mutation-next`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(target) });
  if (!response.ok) throw new Error(`failed to arm mock no-op: ${response.status}`);
}

function check(report, id, passed, detail) {
  report.checks.push({ id, status: passed ? "passed" : "failed", detail: structuredClone(detail) });
}
