import { opaqueActionId } from "./browser-boundary.mjs";

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
  const semanticResponse = await fetch(`${bridgeOrigin}/api/operations/${semanticIntent}`, requestOptions({}));
  const unknownResponse = await fetch(`${bridgeOrigin}/api/actions/a_000000000000`, requestOptions({}));
  return {
    semanticRoute: { status: semanticResponse.status },
    unknownAction: { status: unknownResponse.status, body: await unknownResponse.json() },
  };
}

export function requestBrowserAction(bridgeOrigin, intent, payload) {
  return fetch(`${bridgeOrigin}${browserActionPath(intent)}`, requestOptions(payload));
}

export async function routeNavigationIsValid(page, label) {
  const navigation = page.locator(".shell-navigation nav:visible");
  if (await navigation.count() === 0) return true;
  const directLink = navigation.getByRole("link", { name: label, exact: true });
  if (await directLink.count() > 0) return await directLink.getAttribute("aria-current") === "page";
  const moreButton = navigation.getByRole("button", { name: "更多", exact: true });
  return await moreButton.count() > 0 && await moreButton.getAttribute("aria-current") === "page";
}

function requestOptions(payload) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}
