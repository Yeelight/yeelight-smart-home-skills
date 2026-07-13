import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const wholeHomeRoutes = [
  "overview", "spaces", "devices", "lights", "curtains", "switches", "climate",
  "environment", "scenes", "automations", "groups", "gateways", "panels",
];
const installerRoutes = ["maintenance", "issues", "diagnostics", "gateways", "panels"];

export const galleryProfiles = {
  "whole-home-desktop": { routes: wholeHomeRoutes, viewport: { width: 1440, height: 1000 }, minimumTarget: 36 },
  "whole-home-mobile": { routes: wholeHomeRoutes, viewport: { width: 375, height: 812 }, minimumTarget: 44 },
  installer: { routes: installerRoutes, viewport: { width: 1440, height: 900 }, minimumTarget: 36 },
};

export async function runCompositionGalleryBrowserE2E({ chromium, baseUrl, profileId, evidenceDir }) {
  const profile = galleryProfiles[profileId];
  if (!profile) throw new Error(`未知 gallery profile：${profileId}`);
  const report = { schemaVersion: 1, profileId, viewport: profile.viewport, startedAt: new Date().toISOString(), checks: [], screenshots: [] };
  const browser = await launchBrowser(chromium);
  try {
    const context = await browser.newContext({ viewport: profile.viewport, reducedMotion: "reduce", locale: "zh-CN" });
    const page = await context.newPage();
    const diagnostics = collectDiagnostics(page);
    for (const route of profile.routes) await captureRoute({ page, report, baseUrl, route, evidenceDir, profile });
    if (profileId === "whole-home-mobile") await captureMobileMoreSheet({ page, report, baseUrl, evidenceDir });
    if (profileId === "whole-home-desktop") await captureWholeHomeStates({ page, report, baseUrl, evidenceDir });
    if (profileId === "installer") await captureInstallerStates({ page, report, baseUrl, evidenceDir });
    check(report, "page-errors", diagnostics.pageErrors.length === 0, diagnostics.pageErrors);
    check(report, "request-failures", diagnostics.failedRequests.length === 0, diagnostics.failedRequests);
    check(report, "http-errors", diagnostics.httpErrors.length === 0, diagnostics.httpErrors);
    check(report, "console-errors", diagnostics.consoleErrors.length === 0, diagnostics.consoleErrors);
    report.diagnostics = diagnostics;
    await context.close();
  } finally {
    await browser.close();
  }
  report.finishedAt = new Date().toISOString();
  report.status = report.checks.every(({ status }) => status === "passed") ? "passed" : "failed";
  return report;
}

async function captureRoute({ page, report, baseUrl, route, evidenceDir, profile }) {
  await page.goto(`${baseUrl}#${route}`, { waitUntil: "networkidle" });
  await waitReady(page);
  await page.locator(`[data-page="${route}"]`).waitFor();
  await resetShellScroll(page);
  const audit = await inspectSurface(page, profile.minimumTarget);
  check(report, `route:${route}:identity`, new URL(page.url()).hash === `#${route}` && audit.headingCount > 0, audit);
  check(report, `route:${route}:overflow`, audit.scrollWidth <= audit.clientWidth + 1 && audit.clipped.length === 0, audit);
  check(report, `route:${route}:targets`, audit.smallTargets.length === 0, audit.smallTargets);
  await capture(page, report, evidenceDir, `route-${route}`, "route", route, audit);
}

async function captureMobileMoreSheet({ page, report, baseUrl, evidenceDir }) {
  await page.goto(`${baseUrl}#overview`, { waitUntil: "networkidle" });
  await waitReady(page);
  await resetShellScroll(page);
  const trigger = page.locator(".mobile-navigation").getByRole("button", { name: "更多", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "更多" });
  await dialog.waitFor();
  await captureOverlay(page, report, evidenceDir, "mobile-more-sheet", dialog, "sheet");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
}

async function captureWholeHomeStates({ page, report, baseUrl, evidenceDir }) {
  await openDialog(page, report, evidenceDir, `${baseUrl}#devices/992001`, "重命名", "device-rename-dialog");
  await openDialog(page, report, evidenceDir, `${baseUrl}#groups`, "管理成员", "group-members-dialog", /客厅灯光组/);

  await page.goto(`${baseUrl}#scenes/994012`, { waitUntil: "networkidle" });
  await waitReady(page); await page.getByRole("button", { name: "编辑情景" }).click();
  await page.waitForURL((url) => url.hash === "#scenes/994012/edit");
  await capture(page, report, evidenceDir, "scene-editor", "editor", "scenes/994012/edit", await inspectSurface(page, 36));

  await page.goto(`${baseUrl}#automations`, { waitUntil: "networkidle" });
  await waitReady(page); await page.locator(".automation-open-button").first().click();
  await page.getByRole("button", { name: "编辑自动化" }).click();
  await page.waitForURL((url) => url.hash.endsWith("/edit"));
  await capture(page, report, evidenceDir, "automation-editor", "editor", new URL(page.url()).hash.slice(1), await inspectSurface(page, 36));

  await openDialog(page, report, evidenceDir, `${baseUrl}#gateways/992900`, "编辑网关", "gateway-edit-dialog");
  await openDialog(page, report, evidenceDir, `${baseUrl}#panels/992501`, "编辑别名", "panel-alias-dialog", "编辑别名");
  await openDialog(page, report, evidenceDir, `${baseUrl}#panels/knobs/992601`, "编辑配置", "knob-configure-dialog", "编辑配置");
  await openDialog(page, report, evidenceDir, `${baseUrl}#panels/knobs/992601`, "重置此路", "knob-reset-dialog", "重置此路");
}

async function captureInstallerStates({ page, report, baseUrl, evidenceDir }) {
  await openDialog(page, report, evidenceDir, `${baseUrl}#gateways/992902`, "移除网关", "installer-gateway-delete-dialog", "移除 DALI总线网关");
}

async function openDialog(page, report, evidenceDir, url, buttonName, id, dialogName) {
  await page.goto(url, { waitUntil: "networkidle" });
  await waitReady(page);
  await page.getByRole("button", { name: buttonName, exact: true }).first().click();
  const dialog = dialogName ? page.getByRole("dialog", { name: dialogName }) : page.getByRole("dialog");
  await dialog.waitFor();
  await waitForDialogFocus(dialog);
  await captureOverlay(page, report, evidenceDir, id, dialog, "dialog");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
}

async function captureOverlay(page, report, evidenceDir, id, dialog, kind) {
  const audit = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height, focused: element.contains(document.activeElement), bodyOverflow: document.body.style.overflow, label: element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || "" };
  });
  check(report, `${id}:visible`, audit.width > 0 && audit.height > 0, audit);
  check(report, `${id}:focus-and-scroll-lock`, audit.focused && audit.bodyOverflow === "hidden", audit);
  await capture(page, report, evidenceDir, id, kind, new URL(page.url()).hash.slice(1), audit);
}

async function capture(page, report, evidenceDir, id, kind, route, audit) {
  const file = `${id}.png`;
  const absolutePath = path.join(evidenceDir, file);
  await page.screenshot({ path: absolutePath, fullPage: true });
  report.screenshots.push({ id, kind, route, file, sha256: sha256(absolutePath), audit, reviewStatus: "pending" });
}

async function inspectSurface(page, minimumTarget) {
  return page.evaluate((minimum) => {
    const visible = (element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden"; };
    const clipped = [...document.querySelectorAll("h1,h2,h3,p,small,strong,label,button,a,span")].filter((element) => visible(element) && !element.querySelector('input[type="range"]') && (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1)).map((element) => ({ tag: element.tagName.toLowerCase(), text: element.textContent?.trim().slice(0, 80), clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
    const smallTargets = [...document.querySelectorAll("button,a,select,input:not([type=checkbox]):not([type=radio]):not([type=range])")].filter(visible).map((element) => { const rect = element.getBoundingClientRect(); return { name: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 80) || element.getAttribute("type") || "", width: rect.width, height: rect.height }; }).filter(({ width, height }) => width < minimum || height < minimum);
    return { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, headingCount: [...document.querySelectorAll("h1,h2,h3")].filter(visible).length, clipped, smallTargets };
  }, minimumTarget);
}

async function waitReady(page) {
  await page.getByText("家庭在线", { exact: true }).waitFor();
  await page.locator(".spin").waitFor({ state: "hidden" }).catch(() => {});
}

async function resetShellScroll(page) {
  await page.locator(".shell-content").evaluate((element) => { element.scrollTop = 0; });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function waitForDialogFocus(dialog) {
  await dialog.evaluate((element) => new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      if (element.contains(document.activeElement)) return resolve(true);
      if (Date.now() - started > 1500) return reject(new Error("弹框未在时限内接管焦点"));
      requestAnimationFrame(poll);
    };
    poll();
  }));
}

function collectDiagnostics(page) {
  const value = { consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [] };
  page.on("console", (message) => { if (message.type() === "error") value.consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => value.pageErrors.push(error.message));
  page.on("requestfailed", (request) => value.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || "unknown" }));
  page.on("response", (response) => { if (response.status() >= 400) value.httpErrors.push({ url: response.url(), status: response.status() }); });
  return value;
}

function check(report, id, passed, detail) { report.checks.push({ id, status: passed ? "passed" : "failed", detail }); }
function sha256(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
async function launchBrowser(chromium) {
  try { return await chromium.launch({ channel: process.env.YPA_PLAYWRIGHT_CHANNEL || "chrome", headless: true }); }
  catch (channelError) { try { return await chromium.launch({ headless: true }); } catch { throw channelError; } }
}
