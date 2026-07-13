import path from "node:path";

export async function runThemeTargetBrowserE2E({ chromium, baseUrl, target, evidenceDir }) {
  const report = { id: target.id, startedAt: new Date().toISOString(), checks: [] };
  const browser = await launchBrowser(chromium);
  try {
    const context = await browser.newContext({ viewport: target.viewport, reducedMotion: "reduce", locale: "zh-CN", colorScheme: target.mode === "dark" ? "dark" : "light" });
    const page = await context.newPage();
    const diagnostics = collectDiagnostics(page);
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.getByText("家庭在线", { exact: true }).waitFor();
    const mobileNavigation = page.locator(".mobile-navigation");
    const desktopNavigation = page.locator(".desktop-navigation");
    const navigation = await mobileNavigation.isVisible() ? mobileNavigation : desktopNavigation;
    const totalPages = await desktopNavigation.locator("a").count();
    const visibleItems = navigation.locator("a, button");
    const expectedNavigationItems = navigation === mobileNavigation ? Math.min(totalPages, 5) : totalPages;
    check(report, "navigation-count", await visibleItems.count() === expectedNavigationItems, { totalPages, expectedNavigationItems, text: await navigation.innerText() });
    const links = navigation.getByRole("link");
    const routeLink = links.nth(Math.min(1, Math.max(0, (await links.count()) - 1)));
    const expectedRoute = String(await routeLink.getAttribute("href") || "").replace(/^#/, "");
    await routeLink.click();
    await page.locator(`[data-page="${expectedRoute}"]`).waitFor();
    check(report, "navigation-route", new URL(page.url()).hash === `#${expectedRoute}`, page.url());
    const activeLink = navigation.locator('[aria-current="page"]');
    await page.waitForTimeout(80);
    await activeLink.focus();
    await page.keyboard.press("Tab");
    const audit = await page.evaluate(() => {
      const root = document.querySelector(".app-shell");
      const nav = root?.dataset.navigation === "bottom-tabs" ? document.querySelector(".mobile-navigation") : document.querySelector(".desktop-navigation");
      const main = document.querySelector("main");
      const current = nav?.querySelector('a[aria-current="page"]');
      if (!(root instanceof HTMLElement) || !(nav instanceof HTMLElement) || !(main instanceof HTMLElement) || !(current instanceof HTMLElement)) throw new Error("theme target shell is incomplete");
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement)) throw new Error("keyboard focus target is missing");
      const styles = getComputedStyle(root); const currentStyle = getComputedStyle(current); const focus = getComputedStyle(focused);
      const navRect = nav.getBoundingClientRect(); const mainRect = main.getBoundingClientRect();
      const linkRects = [...nav.querySelectorAll("a")].map((element) => { const rect = element.getBoundingClientRect(); return { width: rect.width, height: rect.height }; });
      return {
        attributes: { formFactor: root.dataset.formFactor, navigation: root.dataset.navigation, density: root.dataset.density, themePack: root.dataset.themePack, themeMode: root.dataset.themeMode },
        tokens: { background: styles.getPropertyValue("--color-background").trim(), surface: styles.getPropertyValue("--color-surface").trim(), foreground: styles.getPropertyValue("--color-foreground").trim(), primary: styles.getPropertyValue("--color-primary").trim(), onPrimary: styles.getPropertyValue("--color-on-primary").trim(), radius: styles.getPropertyValue("--card-radius").trim(), controlHeight: styles.getPropertyValue("--control-min-height").trim() },
        contrast: { text: contrast(styles.color, opaqueBackground(root)), active: contrast(currentStyle.color, opaqueBackground(current)), samples: textContrastSamples() },
        geometry: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, nav: rect(navRect), main: rect(mainRect), linkRects, reservedBottom: parseFloat(getComputedStyle(root).paddingBottom) || 0 },
        focus: { tag: focused.tagName.toLowerCase(), outlineStyle: focus.outlineStyle, outlineWidth: focus.outlineWidth },
        reducedMotion: getComputedStyle(document.querySelector(".spin") || current).animationName,
      };
      function rect(value) { return { top: value.top, right: value.right, bottom: value.bottom, left: value.left, width: value.width, height: value.height }; }
      function textContrastSamples() { return [...document.querySelectorAll("h1,h2,h3,p,small,strong,label,button,a,span")].filter((element) => { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return element.childNodes.length > 0 && [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) && style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0 && !(element instanceof HTMLButtonElement && element.disabled); }).map((element) => { const style = getComputedStyle(element); const ratio = contrast(style.color, opaqueBackground(element)); const size = Number.parseFloat(style.fontSize); const weight = Number.parseInt(style.fontWeight, 10) || 400; const threshold = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5; return { tag: element.tagName.toLowerCase(), text: element.textContent?.trim().slice(0, 80), ratio, threshold }; }); }
      function opaqueBackground(element) { let current = element; while (current instanceof HTMLElement) { const value = getComputedStyle(current).backgroundColor; if (alpha(value) > 0.01) return value; current = current.parentElement; } return getComputedStyle(document.body).backgroundColor; }
      function alpha(value) { const parts = value.match(/[\d.]+/g)?.map(Number) || []; return value.startsWith("rgba") ? parts[3] ?? 1 : value.startsWith("color(srgb") ? parts[3] ?? 1 : 1; }
      function contrast(foreground, background) { const a = luminance(rgb(foreground)); const b = luminance(rgb(background)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }
      function rgb(value) { const parts = value.match(/[\d.]+/g)?.slice(0, 3).map(Number); if (!parts || parts.length < 3) throw new Error(`unsupported color ${value}`); return value.startsWith("color(srgb") ? parts.map((part) => part * 255) : parts; }
      function luminance(parts) { return parts.map((value) => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0); }
    });
    check(report, "target-attributes", Object.entries(target.expected).every(([key, value]) => audit.attributes[key] === value), audit.attributes);
    check(report, "semantic-tokens", Object.values(audit.tokens).every(Boolean), audit.tokens);
    check(report, "no-horizontal-overflow", audit.geometry.scrollWidth <= audit.geometry.clientWidth + 1, audit.geometry);
    const separated = target.navigation === "bottom-tabs" ? audit.geometry.nav.bottom <= target.viewport.height && audit.geometry.reservedBottom >= audit.geometry.nav.height + 10 : audit.geometry.nav.right <= audit.geometry.main.left + 1;
    check(report, "adaptive-navigation-geometry", separated, audit.geometry);
    const minimumTargetSize = target.inputMode === "pointer" && target.density === "compact" ? 36 : 44;
    check(report, "navigation-target-size", audit.geometry.linkRects.every((item) => item.width >= minimumTargetSize && item.height >= minimumTargetSize), { minimumTargetSize, linkRects: audit.geometry.linkRects });
    check(report, "text-contrast", audit.contrast.text >= 4.5, audit.contrast);
    check(report, "active-navigation-contrast", audit.contrast.active >= 4.5, audit.contrast);
    const contrastFailures = audit.contrast.samples.filter((item) => item.ratio + 0.01 < item.threshold);
    check(report, "visible-text-contrast", contrastFailures.length === 0, contrastFailures.slice(0, 30));
    check(report, "visible-focus", audit.focus.outlineStyle !== "none" && Number.parseFloat(audit.focus.outlineWidth) >= 2, audit.focus);
    check(report, "reduced-motion", audit.reducedMotion === "none", audit.reducedMotion);
    const screenshot = path.join(evidenceDir, `${target.id}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    const moreButton = navigation.getByRole("button", { name: /更多/ });
    if (totalPages > 4 && await moreButton.count()) {
      await moreButton.focus();
      await moreButton.click();
      const dialog = page.getByRole("dialog", { name: "更多" });
      await dialog.waitFor();
      check(report, "more-sheet-scroll-lock", await page.evaluate(() => document.body.style.overflow === "hidden"), await page.evaluate(() => document.body.style.overflow));
      check(report, "more-sheet-initial-focus", await dialog.evaluate((element) => element.contains(document.activeElement)), await page.evaluate(() => document.activeElement?.outerHTML));
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      check(report, "more-sheet-focus-restore", await moreButton.evaluate((element) => document.activeElement === element), await page.evaluate(() => document.activeElement?.outerHTML));
    }
    const textScale = await page.evaluate(() => {
      for (const element of document.querySelectorAll("h1,h2,h3,p,small,strong,label,button,a,span,input,select,textarea")) {
        if (!(element instanceof HTMLElement)) continue;
        const size = Number.parseFloat(getComputedStyle(element).fontSize);
        if (Number.isFinite(size)) element.style.fontSize = `${size * 2}px`;
        element.style.lineHeight = "normal";
      }
      const clipped = [...document.querySelectorAll("h1,h2,h3,p,small,strong,label,button,a,span,input,select,textarea")].filter((element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = getComputedStyle(element);
        const hiddenX = ["hidden", "clip"].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 1;
        const hiddenY = ["hidden", "clip"].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
        return hiddenX || hiddenY;
      }).map((element) => ({ tag: element.tagName.toLowerCase(), text: element.textContent?.trim().slice(0, 80), clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
      return { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, clipped };
    });
    check(report, "dynamic-text-no-horizontal-overflow", textScale.scrollWidth <= textScale.clientWidth + 1, textScale);
    check(report, "dynamic-text-not-clipped", textScale.clipped.length === 0, textScale.clipped.slice(0, 30));
    const textScreenshot = path.join(evidenceDir, `${target.id}-text-200.png`);
    await page.screenshot({ path: textScreenshot, fullPage: true });
    check(report, "page-errors", diagnostics.pageErrors.length === 0, diagnostics.pageErrors);
    check(report, "request-failures", diagnostics.failedRequests.length === 0, diagnostics.failedRequests);
    check(report, "http-errors", diagnostics.httpErrors.length === 0, diagnostics.httpErrors);
    check(report, "console-errors", diagnostics.consoleMessages.filter((item) => item.type === "error").length === 0, diagnostics.consoleMessages);
    report.audit = audit; report.screenshot = path.basename(screenshot); report.dynamicTextScreenshot = path.basename(textScreenshot);
    await context.close();
  } finally { await browser.close(); }
  report.finishedAt = new Date().toISOString(); report.status = report.checks.every((item) => item.status === "passed") ? "passed" : "failed"; return report;
}

function collectDiagnostics(page) { const value = { consoleMessages: [], pageErrors: [], failedRequests: [], httpErrors: [] }; page.on("console", (message) => value.consoleMessages.push({ type: message.type(), text: message.text() })); page.on("pageerror", (error) => value.pageErrors.push(error.message)); page.on("requestfailed", (request) => value.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || "unknown" })); page.on("response", (response) => { if (response.status() >= 400) value.httpErrors.push({ url: response.url(), status: response.status() }); }); return value; }
function check(report, id, passed, detail) { report.checks.push({ id, status: passed ? "passed" : "failed", detail: detail && typeof detail === "object" ? structuredClone(detail) : detail }); }
async function launchBrowser(chromium) { try { return await chromium.launch({ channel: process.env.YPA_PLAYWRIGHT_CHANNEL || "chrome", headless: true }); } catch (channelError) { try { return await chromium.launch({ headless: true }); } catch { throw new Error(`无法启动 Chromium。${channelError instanceof Error ? channelError.message : ""}`); } } }
