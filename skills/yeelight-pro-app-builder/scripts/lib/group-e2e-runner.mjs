import path from "node:path";
import { browserActionPaths, classifyExpectedFailures, probeBrowserBoundary, routeNavigationIsValid } from "./e2e-browser-boundary.mjs";

const viewports = [
  { id: "mobile-375", width: 375, height: 812 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "tablet-landscape-1024", width: 1024, height: 768 },
  { id: "desktop-1440", width: 1440, height: 1000 },
];

export async function runGroupBrowserE2E({ chromium, baseUrl, bridgeOrigin, mockServer, evidenceDir }) {
  const report = { startedAt: new Date().toISOString(), baseUrl, bridgeOrigin, checks: [], viewports: [] };
  const browser = await launchBrowser(chromium);
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce", locale: "zh-CN" });
      const page = await context.newPage();
      const diagnostics = collectDiagnostics(page);
      await page.goto(`${baseUrl}#groups`, { waitUntil: "domcontentloaded" });
      await page.getByText("家庭在线", { exact: true }).waitFor();
      await page.getByText("客厅灯光组", { exact: true }).waitFor();

      check(report, `${viewport.id}:navigation-contract`, await routeNavigationIsValid(page, "设备组"), page.url());
      check(report, `${viewport.id}:group-list`, await groupNamesVisible(page), "all Runtime groups are visible");
      check(report, `${viewport.id}:proven-actions`, await page.getByRole("button", { name: "管理成员" }).count() === mockServer.fixture.groups.length, "every group action is preview-proven");
      check(report, `${viewport.id}:full-management-entry`, await page.getByRole("button", { name: "新建设备组" }).count() === 1, "create entry is capability-proven");
      const layout = await inspectLayout(page);
      recordLayoutChecks(report, viewport.id, layout, "page");
      const screenshot = path.join(evidenceDir, `${viewport.id}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });

      const opener = groupRow(page, "客厅灯光组").getByRole("button", { name: "管理成员" });
      await opener.click();
      const dialog = page.getByRole("dialog", { name: "客厅灯光组" });
      await dialog.waitFor();
      await page.waitForFunction(() => document.activeElement?.matches('.group-dialog input[type="checkbox"]'));
      check(report, `${viewport.id}:dialog-candidates`, await dialog.getByRole("checkbox").count() === eligibleGroupDevices(mockServer, "993001").length, "only Runtime-proven light members are rendered");
      check(report, `${viewport.id}:dialog-first-focus`, await dialog.getByRole("checkbox").first().evaluate((element) => element === document.activeElement), "first member receives focus");
      check(report, `${viewport.id}:dialog-scroll-lock`, await page.evaluate(() => document.body.style.overflow === "hidden"), "background scroll is locked");
      const memberDialogLayout = await inspectMemberDialog(dialog);
      check(report, `${viewport.id}:dialog-contained`, memberDialogLayout.dialogInsideViewport && memberDialogLayout.footerInsideDialog, memberDialogLayout);
      check(report, `${viewport.id}:dialog-actions-visible`, memberDialogLayout.actionsVisible && memberDialogLayout.actionsUnobstructed, memberDialogLayout);
      check(report, `${viewport.id}:dialog-member-scroll`, memberDialogLayout.memberOverflowY === "auto" && memberDialogLayout.memberScrollable, memberDialogLayout);
      const closeButton = dialog.getByRole("button", { name: "关闭成员设置" });
      const cancelButton = dialog.getByRole("button", { name: "取消" });
      await closeButton.focus();
      await page.keyboard.press("Shift+Tab");
      const wrapsBackward = await cancelButton.evaluate((element) => element === document.activeElement);
      await page.keyboard.press("Tab");
      const wrapsForward = await closeButton.evaluate((element) => element === document.activeElement);
      check(report, `${viewport.id}:dialog-focus-trap`, wrapsBackward && wrapsForward, { wrapsBackward, wrapsForward });
      const dialogLayout = await inspectLayout(page);
      recordLayoutChecks(report, viewport.id, dialogLayout, "dialog");
      await page.screenshot({ path: path.join(evidenceDir, `${viewport.id}-dialog.png`), fullPage: true });
      if (viewport.id === "mobile-375") {
        await runPrimaryFlow({ page, dialog, opener, report, bridgeOrigin, mockServer, evidenceDir });
      } else {
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        check(report, `${viewport.id}:escape-close`, await opener.evaluate((element) => element === document.activeElement), "Escape closes and restores opener focus");
      }

      const expected = browserActionPaths(["entity.list", "group.list", "group.detail.get", "group.create", "group.update", "group.members.update", "group.delete", "scene.execute"]);
      const classified = classifyExpectedFailures(diagnostics, { expectedHttpErrorPaths: expected });
      const unexpectedHttp = classified.unexpectedHttpErrors;
      const unexpectedConsole = classified.unexpectedConsoleErrors;
      check(report, `${viewport.id}:page-errors`, diagnostics.pageErrors.length === 0, diagnostics.pageErrors);
      check(report, `${viewport.id}:request-failures`, diagnostics.failedRequests.length === 0, diagnostics.failedRequests);
      check(report, `${viewport.id}:http-errors`, unexpectedHttp.length === 0, unexpectedHttp);
      check(report, `${viewport.id}:console-errors`, unexpectedConsole.length === 0, unexpectedConsole);
      report.viewports.push({ ...viewport, screenshot: path.basename(screenshot), layout, dialogLayout, ...diagnostics });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  report.finishedAt = new Date().toISOString();
  report.status = report.checks.every((item) => item.status === "passed") ? "passed" : "failed";
  return report;
}

async function runPrimaryFlow({ page, dialog, opener, report, bridgeOrigin, mockServer, evidenceDir }) {
  const originalMembers = [...members(mockServer, "993001")];
  const dining = dialog.getByRole("checkbox", { name: /餐厅色温吊灯/ });
  check(report, "dialog:initial-members", await dialog.getByRole("checkbox", { name: /客厅全光谱吸顶灯/ }).isChecked() && !await dining.isChecked(), originalMembers);
  await dining.check();
  await dialog.getByRole("button", { name: "保存成员" }).click();
  await waitFor(() => members(mockServer, "993001").includes("992002"));
  await dialog.waitFor({ state: "hidden" });
  check(report, "write:add-verified", await groupRow(page, "客厅灯光组").getByText(`${originalMembers.length + 1} 个成员`, { exact: false }).isVisible(), members(mockServer, "993001"));

  await opener.click();
  const retryDialog = page.getByRole("dialog", { name: "客厅灯光组" });
  await retryDialog.getByRole("checkbox", { name: /餐厅色温吊灯/ }).uncheck();
  await armFailure(mockServer, "POST", `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/group/993001/w/devices`);
  await retryDialog.getByRole("button", { name: "保存成员" }).click();
  const writeAlert = retryDialog.getByRole("alert");
  await writeAlert.waitFor();
  check(report, "failure:write-stays-open", members(mockServer, "993001").includes("992002") && await retryDialog.isVisible(), await writeAlert.innerText());
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-write-failure.png"), fullPage: true });
  const retrySave = retryDialog.getByRole("button", { name: "保存成员" });
  await retrySave.evaluate((element) => element.scrollIntoView({ block: "center" }));
  check(report, "failure:write-retry-visible", await inspectActionVisibility(retrySave), await retrySave.boundingBox());
  await retrySave.click();
  await waitFor(() => !members(mockServer, "993001").includes("992002"));
  await retryDialog.waitFor({ state: "hidden" });
  check(report, "failure:member-retry-readback", JSON.stringify(members(mockServer, "993001")) === JSON.stringify(originalMembers), members(mockServer, "993001"));

  await opener.click();
  const mismatchDialog = page.getByRole("dialog", { name: "客厅灯光组" });
  await mismatchDialog.getByRole("checkbox", { name: /餐厅色温吊灯/ }).check();
  const memberWritePath = `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/group/993001/w/devices`;
  await armNoop(mockServer, "POST", memberWritePath);
  const mismatchSave = mismatchDialog.getByRole("button", { name: "保存成员" });
  const mismatchWriteCount = requestCount(mockServer, "POST", memberWritePath);
  await mismatchSave.click();
  await waitFor(() => requestCount(mockServer, "POST", memberWritePath) > mismatchWriteCount);
  const mismatchAlert = mismatchDialog.getByRole("alert");
  await mismatchAlert.waitFor();
  check(report, "mismatch:member-preserves-selection", !members(mockServer, "993001").includes("992002") && await mismatchDialog.getByRole("checkbox", { name: /餐厅色温吊灯/ }).isChecked(), await mismatchAlert.innerText());
  const mismatchRetryCount = requestCount(mockServer, "POST", memberWritePath);
  await mismatchSave.click();
  await waitFor(() => requestCount(mockServer, "POST", memberWritePath) > mismatchRetryCount);
  await waitFor(() => members(mockServer, "993001").includes("992002"));
  await mismatchDialog.waitFor({ state: "hidden" });
  check(report, "mismatch:member-retry-readback", members(mockServer, "993001").includes("992002"), members(mockServer, "993001"));

  await opener.click();
  const timeoutDialog = page.getByRole("dialog", { name: "客厅灯光组" });
  await timeoutDialog.getByRole("checkbox", { name: /餐厅色温吊灯/ }).uncheck();
  await armFailure(mockServer, "POST", memberWritePath, { delayMs: 5000 });
  const timeoutStarted = Date.now();
  await timeoutDialog.getByRole("button", { name: "保存成员" }).click();
  const timeoutAlert = timeoutDialog.getByRole("alert");
  await timeoutAlert.waitFor();
  check(report, "timeout:member-preserves-selection", Date.now() - timeoutStarted >= 4500 && members(mockServer, "993001").includes("992002") && !await timeoutDialog.getByRole("checkbox", { name: /餐厅色温吊灯/ }).isChecked(), await timeoutAlert.innerText());
  await waitFor(() => mockServer.requestLog().some((entry) => entry.path === memberWritePath && entry.status === 503), 3000);
  const timeoutRetryCount = requestCount(mockServer, "POST", memberWritePath);
  await timeoutDialog.getByRole("button", { name: "保存成员" }).click();
  await waitFor(() => requestCount(mockServer, "POST", memberWritePath) > timeoutRetryCount);
  await waitFor(() => !members(mockServer, "993001").includes("992002"));
  await timeoutDialog.waitFor({ state: "hidden" });
  check(report, "restore:original-members", JSON.stringify(members(mockServer, "993001")) === JSON.stringify(originalMembers), members(mockServer, "993001"));

  await opener.click();
  const closeDialog = page.getByRole("dialog", { name: "客厅灯光组" });
  await closeDialog.getByRole("button", { name: "取消" }).click();
  await closeDialog.waitFor({ state: "hidden" });
  check(report, "dialog:cancel-restores-focus", await opener.evaluate((element) => element === document.activeElement), "cancel restores opener focus");

  await armFailure(mockServer, "GET", `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/group/993002/r/info`);
  await groupRow(page, "公共区域照明").locator(".group-row-main").click();
  const detailAlert = page.getByRole("alert").filter({ has: page.getByRole("button", { name: "重试详情" }) });
  await detailAlert.waitFor();
  check(report, "failure:detail-preserves-groups", await groupNamesVisible(page), await detailAlert.innerText());
  await detailAlert.getByRole("button", { name: "重试详情" }).click();
  await detailAlert.waitFor({ state: "hidden" });
  check(report, "failure:detail-recovered", await groupNamesVisible(page), "group details restored");
  await page.getByRole("button", { name: "返回设备组" }).click();

  await armFailure(mockServer, "GET", `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/group/r/info/1/100`);
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  const listAlert = page.getByRole("alert").filter({ hasText: /家庭服务暂时无法同步设备组|部分家庭数据同步失败/ }).first();
  await listAlert.waitFor();
  check(report, "failure:list-preserves-groups", await groupNamesVisible(page), await listAlert.innerText());
  const listRetry = listAlert.getByRole("button", { name: "重新同步" });
  check(report, "failure:list-retry-visible", await inspectActionVisibility(listRetry), await listRetry.boundingBox());
  await listRetry.click();
  await listAlert.waitFor({ state: "hidden" });
  check(report, "failure:list-recovered", await groupNamesVisible(page), "group list restored");

  await runCrudFlow({ page, report, mockServer, evidenceDir });
  await verifyCandidateMatrix({ page, report, mockServer });

  const writes = mockServer.requestLog().filter((entry) => /\/group\/993001\/w\/devices$/.test(entry.path));
  check(report, "api:strict-member-delta", writes.length === 7 && writes.every(validGroupWrite), writes.map((entry) => ({ status: entry.status, body: entry.body })));
  const finalSuccess = writes.findLast((entry) => entry.status === 200);
  check(report, "api:restore-delta", JSON.stringify(finalSuccess?.body?.removeDeviceList) === "[992002]" && finalSuccess?.body?.addDeviceList?.length === 0, finalSuccess?.body);
  const detailReadsAfterWrites = mockServer.requestLog().filter((entry) => /\/group\/993001\/r\/info$/.test(entry.path));
  check(report, "api:read-after-write-verification", detailReadsAfterWrites.length >= 4, detailReadsAfterWrites.length);
  const boundary = await probeBrowserBoundary(bridgeOrigin, "scene.execute");
  check(report, "bridge:semantic-route-404", boundary.semanticRoute.status === 404, boundary.semanticRoute);
  check(report, "bridge:unknown-action-403", boundary.unknownAction.status === 403 && boundary.unknownAction.body.status === "blocked", boundary.unknownAction);
  await fetch(`${mockServer.origin}/__mock/reset`, { method: "POST" });
  check(report, "restore:deterministic", mockServer.fixture.groups.length === 8 && members(mockServer, "993001").join(",") === originalMembers.join(","), mockServer.fixture.groups);
}

async function verifyCandidateMatrix({ page, report, mockServer }) {
  for (const groupId of ["993005", "993006", "993007", "993008"]) {
    const group = mockServer.fixture.groups.find((item) => item.id === groupId);
    const expected = eligibleGroupDevices(mockServer, groupId);
    const row = groupRow(page, group.name);
    await row.getByRole("button", { name: "管理成员" }).click();
    const dialog = page.getByRole("dialog", { name: group.name });
    await dialog.waitFor();
    const labels = await dialog.locator(".group-candidates label strong").allTextContents();
    check(report, `compatibility:${group.groupCapability}-${groupId}`, labels.length === expected.length && expected.every((device) => labels.includes(presentableDeviceName(device))), { expected: expected.map((device) => device.id), labels });
    await dialog.getByRole("button", { name: "关闭成员设置" }).click();
    await dialog.waitFor({ state: "hidden" });
  }
}

async function runCrudFlow({ page, report, mockServer, evidenceDir }) {
  const createdName = "E2E灯光设备组"; const updatedName = "E2E灯光设备组已更新";
  await page.getByRole("button", { name: "新建设备组" }).click();
  check(report, "create:route", page.url().endsWith("#groups/new"), page.url());
  await page.getByRole("textbox", { name: "设备组名称" }).fill(createdName);
  await page.getByRole("textbox", { name: "描述" }).fill("E2E 创建与删除闭环");
  await page.getByRole("button", { name: /下一步/ }).click();
  await page.getByRole("checkbox", { name: /客厅全光谱吸顶灯/ }).check();
  await page.getByRole("button", { name: /下一步/ }).click();
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-group-editor-review.png"), fullPage: true });
  const createPath = `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/group/w/create`;
  await armFailure(mockServer, "PUT", createPath, { delayMs: 5000 });
  const createStarted = Date.now();
  await page.getByRole("button", { name: "预览并保存" }).click();
  const createAlert = page.getByRole("alert"); await createAlert.waitFor();
  check(report, "create:timeout-preserves-draft", Date.now() - createStarted >= 4500 && await page.getByRole("heading", { name: createdName, level: 2 }).isVisible() && !/Runtime|Bridge|endpoint/i.test(await createAlert.innerText()), await createAlert.innerText());
  await waitFor(() => mockServer.requestLog().some((entry) => entry.path === createPath && entry.status === 503), 3000);
  await page.getByRole("button", { name: "预览并保存" }).click();
  await page.waitForFunction(() => window.location.hash.startsWith("#groups/") && window.location.hash !== "#groups/new");
  await page.getByRole("heading", { name: createdName, level: 3 }).waitFor();
  const createdId = page.url().split("#groups/")[1]?.split(/[/?]/)[0] || "";
  check(report, "create:readback", Boolean(createdId) && mockServer.fixture.groups.some((group) => group.id === createdId) && mockServer.fixture.groups.length === 9, { createdId });

  await page.getByRole("button", { name: "编辑设备组" }).click();
  await page.getByRole("textbox", { name: "设备组名称" }).fill(updatedName);
  await page.getByRole("button", { name: /下一步/ }).click(); await page.getByRole("button", { name: /下一步/ }).click();
  await armFailure(mockServer, "POST", `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/group/${createdId}/w/modify`);
  await page.getByRole("button", { name: "预览并保存" }).click();
  const updateAlert = page.getByRole("alert"); await updateAlert.waitFor();
  check(report, "update:failure-preserves-draft", await page.getByRole("heading", { name: updatedName, level: 2 }).isVisible() && mockServer.fixture.groups.find((group) => group.id === createdId)?.name === createdName, await updateAlert.innerText());
  await armNoop(mockServer, "POST", `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/group/${createdId}/w/modify`);
  const updateSave = page.getByRole("button", { name: "预览并保存" });
  const updatePath = `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/group/${createdId}/w/modify`;
  const updateWriteCount = requestCount(mockServer, "POST", updatePath);
  const previousUpdateError = await updateAlert.innerText();
  await updateSave.click();
  await waitFor(() => requestCount(mockServer, "POST", updatePath) > updateWriteCount);
  await waitFor(async () => await updateAlert.innerText() !== previousUpdateError);
  check(report, "update:mismatch-preserves-draft", mockServer.fixture.groups.find((group) => group.id === createdId)?.name === createdName && await page.getByRole("heading", { name: updatedName, level: 2 }).isVisible(), await updateAlert.innerText());
  const updateRetryCount = requestCount(mockServer, "POST", updatePath);
  await page.getByRole("button", { name: "预览并保存" }).click();
  await waitFor(() => requestCount(mockServer, "POST", updatePath) > updateRetryCount);
  await page.waitForFunction((id) => window.location.hash === "#groups/" + id, createdId);
  await page.getByRole("heading", { name: updatedName, level: 3 }).waitFor();
  check(report, "update:readback", mockServer.fixture.groups.find((group) => group.id === createdId)?.name === updatedName, { createdId });

  await page.getByRole("button", { name: "删除设备组" }).click();
  const deleteDialog = page.getByRole("dialog", { name: `删除 ${updatedName}` });
  await deleteDialog.getByRole("textbox", { name: "输入设备组名称以确认" }).fill(updatedName);
  await armFailure(mockServer, "DELETE", `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/group/${createdId}/w/info`);
  await deleteDialog.getByRole("button", { name: "确认删除" }).click();
  await page.getByRole("status").filter({ hasText: /删除失败|暂时无法/ }).waitFor();
  check(report, "delete:failure-preserves-resource", mockServer.fixture.groups.some((group) => group.id === createdId) && await deleteDialog.isVisible(), { createdId });
  await deleteDialog.getByRole("button", { name: "确认删除" }).click();
  await deleteDialog.waitFor({ state: "hidden" });
  check(report, "delete:absence-verification", !mockServer.fixture.groups.some((group) => group.id === createdId) && page.url().endsWith("#groups"), mockServer.fixture.groups);
}

function groupRow(page, name) { return page.locator(".group-row").filter({ hasText: name }); }
function members(server, id) { return [...(server.fixture.groups.find((group) => group.id === id)?.deviceIds || [])]; }
function eligibleGroupDevices(server, groupId) {
  const group = server.fixture.groups.find((item) => item.id === groupId);
  const current = new Set(group.deviceIds);
  return server.fixture.devices.filter((device) => {
    if (current.has(device.id)) return true;
    if (device.readOnly === true || device.capabilityStatus === "version-mismatch" || !groupFamilyMatches(group.groupCapability, device.family)) return false;
    return server.fixture.groups.some((item) => item.componentId === group.componentId && item.deviceIds.includes(device.id));
  });
}
function groupFamilyMatches(capability, family) { return capability === "infrastructure" ? ["gateway", "bridge", "infrastructure"].includes(family) : capability === family; }
function presentableDeviceName(device) { const raw = String(device.name || device.alias || device.typeName || "未命名设备"); const withoutFamily = raw.replace(/^(light|curtain|sensor|panel|gateway|knob|climate|switch|other)-/i, ""); return withoutFamily.replace(/-\d{6,}-\d{2}$/i, "").trim() || raw; }
function requestCount(server, method, path) { return server.requestLog().filter((entry) => entry.method === method && entry.path === path).length; }
async function groupNamesVisible(page) { return (await Promise.all(["客厅灯光组", "公共区域照明"].map(async (name) => await groupRow(page, name).count() === 1 && await groupRow(page, name).isVisible()))).every(Boolean); }
async function waitForRefreshReady(page) { await page.waitForFunction(() => !document.querySelector('button[aria-label="重新同步家庭状态"]')?.hasAttribute("disabled")); }
function validGroupWrite(entry) { const body = entry.body || {}; return entry.method === "POST" && String(body.houseId) === "990001" && String(body.groupId) === "993001" && Array.isArray(body.addDeviceList) && Array.isArray(body.removeDeviceList) && Object.keys(body).sort().join(",") === "addDeviceList,groupId,houseId,removeDeviceList"; }
async function armFailure(server, method, apiPath, options = {}) { const response = await fetch(`${server.origin}/__mock/fail-next`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method, path: apiPath, status: options.status || 503, delayMs: options.delayMs || 0 }) }); if (!response.ok) throw new Error(`failed to arm ${method} ${apiPath}`); }
async function armNoop(server, method, apiPath) { const response = await fetch(`${server.origin}/__mock/succeed-without-mutation-next`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method, path: apiPath }) }); if (!response.ok) throw new Error(`failed to arm noop ${method} ${apiPath}`); }
function collectDiagnostics(page) { const value = { consoleMessages: [], pageErrors: [], failedRequests: [], httpErrors: [] }; page.on("console", (message) => value.consoleMessages.push({ type: message.type(), text: message.text() })); page.on("pageerror", (error) => value.pageErrors.push(error.message)); page.on("requestfailed", (request) => value.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || "unknown" })); page.on("response", (response) => { if (response.status() >= 400) value.httpErrors.push({ url: response.url(), status: response.status() }); }); return value; }
async function inspectLayout(page) { return page.evaluate(() => { const rgb = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number); const lum = (color) => color.map((part) => { const c = part / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, part, index) => sum + part * [0.2126, 0.7152, 0.0722][index], 0); const ratio = (foreground, background) => { const values = [lum(rgb(foreground)), lum(rgb(background))].sort((a, b) => b - a); return (values[0] + 0.05) / (values[1] + 0.05); }; const body = getComputedStyle(document.body); const muted = document.querySelector(".group-copy span"); return { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, interactive: [...document.querySelectorAll("button, a, input, select")].filter((element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden"; }).map((element) => { const target = element instanceof HTMLInputElement && element.type === "checkbox" ? element.closest("label") || element : element; const rect = target.getBoundingClientRect(); return { name: element.getAttribute("aria-label") || element.textContent?.trim() || element.getAttribute("type") || "", width: rect.width, height: rect.height }; }), groupCopyWidths: [...document.querySelectorAll(".group-copy")].map((element) => element.getBoundingClientRect().width), headings: [...document.querySelectorAll("h1, h2, h3")].map((heading) => ({ level: Number(heading.tagName.slice(1)), text: heading.textContent?.trim() || "" })), radii: [...document.querySelectorAll(".group-row, .group-dialog, .group-manage-button, .primary-button, .secondary-button")].map((element) => parseFloat(getComputedStyle(element).borderRadius) || 0), contrast: [ratio(body.color, body.backgroundColor), ...(muted ? [ratio(getComputedStyle(muted).color, body.backgroundColor)] : [])] }; }); }
async function inspectMemberDialog(dialog) { return dialog.evaluate((element) => { const footer = element.querySelector("footer"); const candidates = element.querySelector(".group-candidates"); const actions = [...(footer?.querySelectorAll("button") || [])]; const dialogRect = element.getBoundingClientRect(); const footerRect = footer?.getBoundingClientRect(); const actionRects = actions.map((action) => action.getBoundingClientRect()); const unobstructed = actions.every((action, index) => { const rect = actionRects[index]; const probe = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2); return probe === action || action.contains(probe); }); return { dialogInsideViewport: dialogRect.top >= 0 && dialogRect.bottom <= window.innerHeight, footerInsideDialog: Boolean(footerRect) && footerRect.top >= dialogRect.top && footerRect.bottom <= dialogRect.bottom, actionsVisible: actionRects.length === 2 && actionRects.every((rect) => rect.width >= 44 && rect.height >= 44 && rect.top >= 0 && rect.bottom <= window.innerHeight), actionsUnobstructed: unobstructed, memberOverflowY: candidates ? getComputedStyle(candidates).overflowY : "", memberScrollable: Boolean(candidates) && candidates.scrollHeight > candidates.clientHeight }; }); }
function recordLayoutChecks(report, viewport, layout, state) { check(report, `${viewport}:${state}-no-horizontal-overflow`, layout.scrollWidth <= layout.clientWidth + 1, layout); check(report, `${viewport}:${state}-touch-targets`, layout.interactive.every((item) => item.width >= 44 && item.height >= 44), layout.interactive); check(report, `${viewport}:${state}-readable-group-copy`, layout.groupCopyWidths.every((width) => width >= 80), layout.groupCopyWidths); check(report, `${viewport}:${state}-heading-order`, layout.headings.every((item, index) => index === 0 || item.level - layout.headings[index - 1].level <= 1), layout.headings); check(report, `${viewport}:${state}-radius-contract`, layout.radii.every((radius) => radius <= 8), layout.radii); check(report, `${viewport}:${state}-contrast`, layout.contrast.every((ratio) => ratio >= 4.5), layout.contrast); }
function check(report, id, passed, detail) { report.checks.push({ id, status: passed ? "passed" : "failed", detail: detail && typeof detail === "object" ? structuredClone(detail) : detail }); }
async function inspectActionVisibility(locator) { return locator.evaluate((element) => { const rect = element.getBoundingClientRect(); const probe = document.elementFromPoint(rect.left + rect.width / 2, rect.bottom - 4); return rect.width >= 44 && rect.height >= 44 && rect.top >= 0 && rect.bottom <= window.innerHeight && (probe === element || element.contains(probe)); }); }
async function waitFor(predicate, timeoutMs = 12000) { const started = Date.now(); while (Date.now() - started < timeoutMs) { if (await predicate()) return; await new Promise((resolve) => setTimeout(resolve, 80)); } throw new Error("timed out waiting for group state change"); }
async function launchBrowser(chromium) { try { return await chromium.launch({ channel: process.env.YPA_PLAYWRIGHT_CHANNEL || "chrome", headless: true }); } catch (channelError) { try { return await chromium.launch({ headless: true }); } catch { throw new Error(`无法启动 Chromium。${channelError instanceof Error ? channelError.message : ""}`); } } }
