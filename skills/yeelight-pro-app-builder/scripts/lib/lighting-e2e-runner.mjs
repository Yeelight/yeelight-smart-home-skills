import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { browserActionPath, classifyExpectedFailures, probeBrowserBoundary } from "./e2e-browser-boundary.mjs";

const viewports = [
  { id: "mobile-375", width: 375, height: 812 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "tablet-landscape-1024", width: 1024, height: 768 },
  { id: "desktop-1440", width: 1440, height: 1000 },
];

export async function runLightingBrowserE2E({ chromium, baseUrl, bridgeOrigin, mockServer, evidenceDir }) {
  const report = { startedAt: new Date().toISOString(), baseUrl, bridgeOrigin, checks: [], viewports: [] };
  const browser = await launchBrowser(chromium);
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce", locale: "zh-CN" });
      const page = await context.newPage();
      const consoleMessages = [];
      const pageErrors = [];
      const failedRequests = [];
      const httpErrors = [];
      page.on("console", (message) => consoleMessages.push({ type: message.type(), text: message.text() }));
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || "unknown" }));
      page.on("response", (response) => {
        if (response.status() >= 400) httpErrors.push({ url: response.url(), status: response.status() });
      });
      await page.goto(`${baseUrl}#lights`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "重新同步家庭状态" }).waitFor();
      await page.getByRole("article").first().waitFor();
      await page.getByText("家庭在线", { exact: true }).waitFor();
      check(report, `${viewport.id}:initial-sync-complete`, await page.getByRole("button", { name: "重新同步家庭状态" }).isEnabled(), "initial Runtime state query completed");

      const layout = await page.evaluate(() => {
        const interactive = [...document.querySelectorAll("button, a, input")].filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
        }).map((element) => {
          const rect = element.getBoundingClientRect();
          return { tag: element.tagName.toLowerCase(), name: element.getAttribute("aria-label") || element.textContent?.trim() || element.getAttribute("placeholder") || "", width: rect.width, height: rect.height };
        });
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          interactive,
          headings: [...document.querySelectorAll("h1, h2, h3")].map((element) => ({ level: Number(element.tagName.slice(1)), text: element.textContent?.trim() || "" })),
        };
      });
      check(report, `${viewport.id}:no-horizontal-overflow`, layout.scrollWidth <= layout.clientWidth + 1, layout);
      check(report, `${viewport.id}:touch-targets`, layout.interactive.every((item) => item.width >= 44 && item.height >= 44), layout.interactive);
      check(report, `${viewport.id}:heading-order`, layout.headings.map((item) => item.level).join(",") === "1,2", layout.headings);

      const screenshot = path.join(evidenceDir, `${viewport.id}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      if (viewport.id === "mobile-375") {
        await runPrimaryFlow({ page, report, bridgeOrigin, mockServer, evidenceDir });
      }
      const { expectedHttpErrors, unexpectedHttpErrors, consoleErrors, unexpectedConsoleErrors } = classifyExpectedFailures({ httpErrors, consoleMessages }, {
        expectedHttpErrorPaths: viewport.id === "mobile-375" ? [browserActionPath("state.query")] : [],
      });
      check(report, `${viewport.id}:page-errors`, pageErrors.length === 0, pageErrors);
      check(report, `${viewport.id}:request-failures`, failedRequests.length === 0, failedRequests);
      check(report, `${viewport.id}:http-errors`, unexpectedHttpErrors.length === 0, { expectedHttpErrors, unexpectedHttpErrors });
      check(report, `${viewport.id}:console-errors`, unexpectedConsoleErrors.length === 0, { expectedHttpErrors, consoleErrors });
      report.viewports.push({ ...viewport, screenshot: path.basename(screenshot), layout, consoleMessages, pageErrors, failedRequests, httpErrors });
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
  const search = page.getByRole("searchbox", { name: "搜索灯具" });
  await search.fill("全光谱");
  check(report, "search:match", await page.getByRole("article").count() === 1 && new URL(page.url()).searchParams.get("q") === "全光谱", page.url());
  await search.fill("不存在");
  check(report, "search:empty", await page.getByText("没有匹配的灯具", { exact: true }).isVisible() && await page.getByRole("article").count() === 0, page.url());
  await search.fill("");
  await page.getByRole("article").first().waitFor();
  check(report, "search:clear", !new URL(page.url()).searchParams.has("q"), page.url());

  const navigation = visibleNavigation(page);
  check(report, "navigation:lights-active", await navigation.getByRole("link", { name: "灯光" }).getAttribute("aria-current") === "page" && new URL(page.url()).hash === "#lights", page.url());
  await navigation.getByRole("link", { name: "总览" }).click();
  check(report, "navigation:overview-active", await navigation.getByRole("link", { name: "总览" }).getAttribute("aria-current") === "page" && new URL(page.url()).hash === "#overview", page.url());
  await navigation.getByRole("link", { name: "灯光" }).click();
  await search.waitFor();

  const powerOff = page.getByRole("button", { name: "关闭客厅全光谱吸顶灯" });
  await powerOff.click();
  await waitFor(() => device(mockServer).properties.p === false);
  check(report, "write:power-off", device(mockServer).properties.p === false, device(mockServer).properties);
  await page.getByRole("button", { name: "开启客厅全光谱吸顶灯" }).click();
  await waitFor(() => device(mockServer).properties.p === true);
  check(report, "write:power-restore", device(mockServer).properties.p === true, device(mockServer).properties);

  const brightness = page.getByRole("slider", { name: "调整客厅全光谱吸顶灯亮度" });
  await brightness.press("ArrowLeft");
  await waitFor(() => device(mockServer).properties.l === 71);
  check(report, "write:brightness-down", device(mockServer).properties.l === 71, device(mockServer).properties);
  await brightness.press("ArrowRight");
  await waitFor(() => device(mockServer).properties.l === 72);
  check(report, "write:brightness-restore", device(mockServer).properties.l === 72, device(mockServer).properties);

  const colorTemperature = page.getByRole("slider", { name: "调整客厅全光谱吸顶灯色温" });
  await colorTemperature.press("ArrowRight");
  await waitFor(() => device(mockServer).properties.ct === 3900);
  check(report, "write:color-temperature-up", device(mockServer).properties.ct === 3900, device(mockServer).properties);
  await colorTemperature.press("ArrowLeft");
  await waitFor(() => device(mockServer).properties.ct === 3800);
  check(report, "write:color-temperature-restore", device(mockServer).properties.ct === 3800, device(mockServer).properties);

  const boundary = await probeBrowserBoundary(bridgeOrigin, "scene.run");
  check(report, "bridge:semantic-route-404", boundary.semanticRoute.status === 404, boundary.semanticRoute);
  check(report, "bridge:unknown-action-403", boundary.unknownAction.status === 403 && boundary.unknownAction.body.status === "blocked", boundary.unknownAction);

  const failPath = `/apis/iot/v1/controll/device/${device(mockServer).id}/r/properties/p`;
  await fetch(`${mockServer.origin}/__mock/fail-next`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "POST", path: failPath, status: 503 }) });
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  await page.getByRole("alert").waitFor();
  check(report, "failure:sync-visible", await page.getByText("部分家庭数据同步失败", { exact: true }).isVisible(), await page.getByRole("alert").innerText());
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-sync-failure.png"), fullPage: true });
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  await page.getByText("家庭在线", { exact: true }).waitFor();
  check(report, "failure:sync-recovered", await page.getByRole("alert").count() === 0, "one-shot failure consumed");

  await page.goto(`${page.url().split(/[?#]/)[0]}?q=${encodeURIComponent("全光谱")}#lights`, { waitUntil: "domcontentloaded" });
  await page.getByRole("article").waitFor();
  check(report, "deep-link:restored", await page.getByRole("searchbox", { name: "搜索灯具" }).inputValue() === "全光谱" && await visibleNavigation(page).getByRole("link", { name: "灯光" }).getAttribute("aria-current") === "page", page.url());
}

function visibleNavigation(page) {
  return page.locator(".shell-navigation nav:visible");
}

export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd, env: { ...process.env, ...(options.env || {}) }, encoding: "utf8", timeout: options.timeoutMs || 180000, maxBuffer: 32 * 1024 * 1024 });
  return { command: [command, ...args], status: result.status ?? 1, stdout: result.stdout || "", stderr: result.stderr || "" };
}

export function startProcess(command, args, options = {}) {
  const logs = [];
  const child = spawn(command, args, { cwd: options.cwd, env: { ...process.env, ...(options.env || {}) }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));
  return { child, logs };
}

export async function stopProcess(processRecord) {
  if (!processRecord?.child || processRecord.child.exitCode !== null) return;
  processRecord.child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => processRecord.child.once("close", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (processRecord.child.exitCode === null) processRecord.child.kill("SIGKILL");
}

export async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

export async function waitForUrl(url, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`service did not become ready: ${url}`);
}

function check(report, id, passed, detail) {
  report.checks.push({ id, status: passed ? "passed" : "failed", detail: cloneDetail(detail) });
}

function cloneDetail(detail) {
  if (detail === undefined || detail === null || typeof detail !== "object") return detail;
  return structuredClone(detail);
}

function device(mockServer) {
  const found = mockServer.fixture.devices.find((item) => item.id === "992001");
  if (!found) throw new Error("mock living-room light 992001 is missing");
  return found;
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
