import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const managementModules = new Set(["room.device-management", "automation.manager", "group.manager", "panel.manager"]);
const safeEditorTrigger = /^(?:新建|编辑|配置|重命名|移动|管理)/;
const loadingLabelPattern = "^正在(?:加载|载入)";
export const clippedTextSelector = "button, a, h1, h2, h3, label > span, label > strong, label > small";

export function journeyViewport(journey) {
  const { formFactor, density } = journey.resolution.choices;
  const viewport = {
    mobile: { width: 390, height: 844 },
    tablet: { width: 1024, height: 768 },
    wall: { width: 1280, height: 800 },
    desktop: { width: 1440, height: 1000 },
  }[formFactor];
  return { ...viewport, minimumTarget: formFactor === "mobile" || formFactor === "wall" || density === "touch" ? 44 : 36 };
}

export function auditLayoutSnapshot(snapshot, { minimumTarget }) {
  return [
    check("layout:no-horizontal-overflow", snapshot.scrollWidth <= snapshot.clientWidth + 1, { scrollWidth: snapshot.scrollWidth, clientWidth: snapshot.clientWidth }),
    check("layout:touch-targets", snapshot.interactive.every((item) => item.width + 0.5 >= minimumTarget && item.height + 0.5 >= minimumTarget), snapshot.interactive.filter((item) => item.width + 0.5 < minimumTarget || item.height + 0.5 < minimumTarget)),
    check("layout:text-not-clipped", snapshot.clippedText.length === 0, snapshot.clippedText),
    check("layout:heading-order", !hasSkippedHeading(snapshot.headings), snapshot.headings),
  ];
}

export function summarizeBrowserDiagnostics(diagnostics, { allowLiveDegraded = false } = {}) {
  const expectedHttp = allowLiveDegraded ? diagnostics.httpErrors.filter(isExpectedLiveServiceError) : [];
  const expectedConsole = allowLiveDegraded && expectedHttp.length > 0
    ? diagnostics.consoleMessages.filter(({ type, text }) => type === "error" && /Failed to load resource.*(?:502|503|504)/i.test(text))
    : [];
  const dimensions = {
    console: diagnostics.consoleMessages.filter(({ type }) => type === "error").filter((item) => !expectedConsole.includes(item)),
    page: diagnostics.pageErrors,
    request: diagnostics.failedRequests,
    http: diagnostics.httpErrors.filter((item) => !expectedHttp.includes(item)),
  };
  const failedDimensions = Object.entries(dimensions).filter(([, values]) => values.length > 0).map(([id]) => id);
  return {
    status: failedDimensions.length === 0 ? "passed" : "failed",
    failedDimensions,
    dimensions,
    expectedLiveDegraded: { console: expectedConsole, http: expectedHttp },
  };
}

export function isLoadingLabel(value) {
  return new RegExp(loadingLabelPattern).test(String(value || "").trim());
}

export async function runJourneyBrowserAudit({ chromium, journey, baseUrl, routes, evidenceDir }) {
  const viewport = journeyViewport(journey);
  const browser = await launchBrowser(chromium);
  const report = { schemaVersion: 1, journeyId: journey.id, viewport, routes: [], checks: [], interaction: { status: "not-applicable" } };
  const screenshotDir = path.join(evidenceDir, "screenshots");
  fs.mkdirSync(screenshotDir, { recursive: true });
  try {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce", locale: "zh-CN" });
    const page = await context.newPage();
    const diagnostics = collectDiagnostics(page);
    let representativeVisible = false;
    let liveDegradedVisible = false;
    for (const route of routes) {
      await page.goto(`${baseUrl}#${route}`, { waitUntil: "domcontentloaded" });
      await page.locator("main").waitFor({ state: "visible" });
      const contentReady = await waitForRouteContent(page);
      report.checks.push(check(`${route}:content-ready`, contentReady, "visible loading state cleared"));
      liveDegradedVisible ||= await anyVisible(page.getByText(/部分家庭数据同步失败|家庭连接不可用|部分失败/, { exact: false }));
      const snapshot = await captureLayout(page);
      const layoutChecks = auditLayoutSnapshot(snapshot, viewport).map((item) => ({ ...item, id: `${route}:${item.id}` }));
      report.checks.push(...layoutChecks);
      if (journey.browser.representativeControl) {
        const locator = page.getByText(journey.browser.representativeControl, { exact: false });
        representativeVisible ||= await anyVisible(locator);
      }
      if (report.interaction.status === "not-applicable" && requiresManagementInteraction(journey)) {
        const interaction = await auditSafeInteraction(page, baseUrl);
        if (interaction.status !== "not-found") report.interaction = interaction;
      }
      const screenshot = path.join(screenshotDir, `${journey.id}-${safeName(route)}.png`);
      const screenshotResult = await capturePageScreenshot(page, screenshot);
      report.checks.push(check(`${route}:screenshot`, screenshotResult.status === "passed", screenshotResult));
      report.routes.push({
        route,
        screenshot: screenshotResult.status === "passed" ? path.relative(evidenceDir, screenshot) : "",
        sha256: screenshotResult.status === "passed" ? fileDigest(screenshot) : "",
        layout: snapshot,
      });
    }
    report.checks.push(check("routes:complete", routes.length > 0 && report.routes.length === routes.length, { expected: routes, actual: report.routes.map(({ route }) => route) }));
    report.checks.push(check("control:representative-visible", representativeVisible || !journey.browser.representativeControl, journey.browser.representativeControl));
    if (requiresManagementInteraction(journey)) {
      if (report.interaction.status === "not-applicable") report.interaction = { status: "failed", reason: "no safe management editor trigger found" };
      report.checks.push(check("interaction:management-surface", report.interaction.status === "passed", report.interaction));
    }
    report.diagnostics = summarizeBrowserDiagnostics(diagnostics, { allowLiveDegraded: journey.runtime.mode === "live-readonly" && liveDegradedVisible });
    if (report.diagnostics.expectedLiveDegraded.http.length > 0) report.checks.push(check("live:degraded-state-visible", liveDegradedVisible, report.diagnostics.expectedLiveDegraded));
    report.checks.push(check("diagnostics:browser-clean", report.diagnostics.status === "passed", report.diagnostics));
    await context.close();
  } finally {
    await browser.close();
  }
  report.status = report.checks.every(({ status }) => status === "passed") ? "passed" : "failed";
  return report;
}

function isExpectedLiveServiceError(item) {
  return [502, 503, 504].includes(item.status) && /^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/api\/actions\//.test(item.url);
}

export async function capturePageScreenshot(page, screenshot) {
  try {
    await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled", caret: "hide", timeout: 60000 });
    return { status: "passed" };
  } catch (error) {
    return { status: "failed", error: String(error instanceof Error ? error.message : error).split("\n")[0].slice(0, 240) };
  }
}

async function auditSafeInteraction(page, baseUrl) {
  const direct = await findSafeEditorTrigger(page);
  if (direct) return exerciseSafeEditor(page, baseUrl, direct);

  const directoryRow = page.locator(".managed-device-row, .panel-row").first();
  if (await directoryRow.count() > 0 && await directoryRow.isVisible()) {
    await directoryRow.click();
    await page.locator("main").waitFor({ state: "visible" });
    const nested = await findSafeEditorTrigger(page);
    if (nested) return exerciseSafeEditor(page, baseUrl, nested);
  }
  return { status: "not-found" };
}

async function findSafeEditorTrigger(page) {
  const buttons = page.getByRole("button");
  for (let index = 0; index < await buttons.count(); index += 1) {
    const button = buttons.nth(index);
    if (!await button.isVisible() || await button.isDisabled()) continue;
    const name = (await button.getAttribute("aria-label")) || (await button.innerText()).trim();
    if (!safeEditorTrigger.test(name)) continue;
    return { button, name };
  }
  return undefined;
}

async function exerciseSafeEditor(page, baseUrl, trigger) {
  const before = page.url();
  await trigger.button.click();
  await page.waitForTimeout(120);
  const dialog = page.getByRole("dialog");
  if (await dialog.count() > 0 && await dialog.first().isVisible()) {
    const focusInside = await dialog.first().evaluate((element) => element.contains(document.activeElement));
    const bodyLocked = await page.evaluate(() => getComputedStyle(document.body).overflow === "hidden");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);
    const closed = await page.getByRole("dialog").count() === 0;
    return { status: focusInside && bodyLocked && closed ? "passed" : "failed", type: "dialog", trigger: trigger.name, focusInside, bodyLocked, closed };
  }
  if (page.url() !== before && page.url().startsWith(baseUrl)) {
    const formVisible = await page.locator("form, input, select, textarea").count() > 0;
    await page.goBack({ waitUntil: "domcontentloaded" });
    return { status: formVisible ? "passed" : "failed", type: "editor-route", trigger: trigger.name, formVisible };
  }
  return { status: "failed", reason: "editor trigger did not open a dialog or route", trigger: trigger.name };
}

async function captureLayout(page) {
  return page.evaluate((textSelector) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const interactive = [...document.querySelectorAll("button, a, input, select, textarea")].filter(visible).map((element) => {
      const rect = element.getBoundingClientRect();
      return { name: element.getAttribute("aria-label") || element.textContent?.trim() || element.getAttribute("placeholder") || element.tagName, width: rect.width, height: rect.height };
    });
    const clippedText = [...document.querySelectorAll(textSelector)].filter(visible).filter((element) => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1).map((element) => ({ text: element.textContent?.trim() || element.getAttribute("aria-label") || "", clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      interactive,
      clippedText,
      headings: [...document.querySelectorAll("h1, h2, h3")].filter(visible).map((element) => ({ level: Number(element.tagName.slice(1)), text: element.textContent?.trim() || "" })),
    };
  }, clippedTextSelector);
}

function collectDiagnostics(page) {
  const diagnostics = { consoleMessages: [], pageErrors: [], failedRequests: [], httpErrors: [] };
  page.on("console", (message) => diagnostics.consoleMessages.push({ type: message.type(), text: message.text() }));
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("requestfailed", (request) => diagnostics.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || "unknown" }));
  page.on("response", (response) => { if (response.status() >= 400) diagnostics.httpErrors.push({ url: response.url(), status: response.status() }); });
  return diagnostics;
}

export function requiresManagementInteraction(journey) {
  return journey.runtime.mode === "reference" && journey.resolution.choices.modules.some((moduleId) => managementModules.has(moduleId));
}

async function waitForRouteContent(page) {
  try {
    await page.waitForFunction((pattern) => ![...document.querySelectorAll("main *")].some((element) => {
      const text = element.textContent?.trim() || "";
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return new RegExp(pattern).test(text) && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }), loadingLabelPattern, { timeout: 20000 });
    return true;
  } catch {
    return false;
  }
}

function hasSkippedHeading(headings) {
  let previous = 0;
  for (const { level } of headings) {
    if (previous > 0 && level > previous + 1) return true;
    previous = level;
  }
  return false;
}

async function anyVisible(locator) {
  for (let index = 0; index < await locator.count(); index += 1) if (await locator.nth(index).isVisible()) return true;
  return false;
}

async function launchBrowser(chromium) {
  try { return await chromium.launch({ channel: process.env.YPA_PLAYWRIGHT_CHANNEL || "chrome", headless: true }); }
  catch (channelError) {
    try { return await chromium.launch({ headless: true }); }
    catch { throw new Error(`cannot launch Chromium: ${channelError instanceof Error ? channelError.message : String(channelError)}`); }
  }
}

function check(id, passed, detail) {
  return { id, status: passed ? "passed" : "failed", detail };
}

function fileDigest(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function safeName(value) {
  return String(value || "route").replace(/[^a-z0-9-]+/gi, "-");
}
