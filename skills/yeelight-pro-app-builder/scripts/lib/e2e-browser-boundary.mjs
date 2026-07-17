import { opaqueActionId } from "./browser-boundary.mjs";

const e2eWebOrigin = "http://127.0.0.1:5173";
const sessionByOrigin = new Map();

export function browserActionPath(intent) {
  return `/api/actions/${opaqueActionId(intent)}`;
}

export function browserActionPaths(intents) {
  return intents.map(browserActionPath);
}

export function classifyExpectedFailures(diagnostics, { expectedHttpErrorPaths = [] } = {}) {
  const expectedPaths = new Set(expectedHttpErrorPaths);
  const expectedHttpErrors = diagnostics.httpErrors.filter((item) => expectedPaths.has(new URL(item.url).pathname));
  const unexpectedHttpErrors = diagnostics.httpErrors.filter((item) => !expectedHttpErrors.includes(item));
  const consoleErrors = diagnostics.consoleMessages.filter((item) => item.type === "error");
  let expectedResourceErrorsRemaining = expectedHttpErrors.length;
  const unexpectedConsoleErrors = consoleErrors.filter((item) => {
    if (expectedResourceErrorsRemaining > 0 && item.text.includes("Failed to load resource")) {
      expectedResourceErrorsRemaining -= 1;
      return false;
    }
    return true;
  });
  return { expectedHttpErrors, unexpectedHttpErrors, consoleErrors, unexpectedConsoleErrors };
}

export async function probeBrowserBoundary(bridgeOrigin, semanticIntent) {
  const semanticResponse = await requestBridgePath(bridgeOrigin, `/api/operations/${semanticIntent}`, {});
  const unknownResponse = await requestBridgePath(bridgeOrigin, "/api/actions/a_000000000000", {});
  return {
    semanticRoute: { status: semanticResponse.status },
    unknownAction: { status: unknownResponse.status, body: await unknownResponse.json() },
  };
}

export function requestBrowserAction(bridgeOrigin, intent, payload) {
  return requestBridgePath(bridgeOrigin, browserActionPath(intent), payload);
}

export async function requestBridgePath(bridgeOrigin, pathname, payload = {}) {
  const token = await bridgeSession(bridgeOrigin);
  return fetch(`${bridgeOrigin}${pathname}`, requestOptions(payload, token));
}

export async function routeNavigationIsValid(page, label) {
  const navigation = page.locator(".shell-navigation nav:visible");
  if (await navigation.count() === 0) return true;
  const directLink = navigation.getByRole("link", { name: label, exact: true });
  if (await directLink.count() > 0) return await directLink.getAttribute("aria-current") === "page";
  const moreButton = navigation.getByRole("button", { name: "更多", exact: true });
  return await moreButton.count() > 0 && await moreButton.getAttribute("aria-current") === "page";
}

async function bridgeSession(bridgeOrigin) {
  let pending = sessionByOrigin.get(bridgeOrigin);
  if (!pending) {
    pending = fetch(`${bridgeOrigin}/api/session`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Origin: e2eWebOrigin }, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || typeof body.sessionToken !== "string" || !body.sessionToken) throw new Error("E2E Bridge session failed");
        return body.sessionToken;
      })
      .catch((error) => {
        sessionByOrigin.delete(bridgeOrigin);
        throw error;
      });
    sessionByOrigin.set(bridgeOrigin, pending);
  }
  return pending;
}

function requestOptions(payload, token) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: e2eWebOrigin, "X-Yeelight-App-Session": token },
    body: JSON.stringify(payload),
  };
}
