import http from "node:http";
import { routeSensorRequest } from "./mock-home-sensor-routes.mjs";
import { routeSceneRequest } from "./mock-home-scene-routes.mjs";
import { routeAutomationRequest } from "./mock-home-automation-routes.mjs";
import { routeGroupRequest } from "./mock-home-group-routes.mjs";
import { routeGatewayRequest } from "./mock-home-gateway-routes.mjs";
import { routePanelRequest } from "./mock-home-panel-routes.mjs";
import { createFailureInjector } from "./mock-home/failure-injector.mjs";
import { loadReferenceHomeFixture } from "./mock-home/fixture-loader.mjs";
import { readJSONBody, sendJSON } from "./mock-home/http-json.mjs";
import { createMockRequestLog } from "./mock-home/request-log.mjs";
import { createMockHomeState } from "./mock-home/state-store.mjs";
import { routeDeviceRequest } from "./mock-home/device-routes.mjs";
import { routeTopologyRequest } from "./mock-home/topology-routes.mjs";
export async function startMockHomeServer({ fixtureId = "comprehensive", host = "127.0.0.1", port = 0 } = {}) {
  const sourceFixture = loadFixture(fixtureId);
  const state = createMockHomeState(sourceFixture);
  const failures = createFailureInjector();
  const requestLog = createMockRequestLog();
  const credential = `ypa-${fixtureId}-token`;
  const authorizationScheme = "Bearer";

  const server = http.createServer(async (request, response) => {
    const body = await readJSONBody(request);
    const entry = requestLog.begin(request, body);
    const respond = (status, responseBody) => {
      requestLog.complete(entry, status, responseBody);
      sendJSON(response, status, responseBody);
    };
    try {
      const fixture = state.fixture;
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      const control = requestUrl.pathname;
      if (body?.__invalidJSON) {
        respond(400, { success: false, code: "mock_invalid_json", message: "request body must be valid JSON" });
        return;
      }
      if (request.method === "GET" && control === "/__mock/requests") {
        respond(200, { fixtureId: fixture.id, requests: requestLog.snapshot() });
        return;
      }
      if (request.method === "GET" && control === "/__mock/state") {
        respond(200, { fixtureId: fixture.id, homeId: fixture.home.id, devices: fixture.devices.map((device) => ({ id: device.id, name: device.name, roomId: device.roomId, family: device.family, properties: structuredClone(device.properties) })) });
        return;
      }
      if (request.method === "POST" && control === "/__mock/reset") {
        state.reset();
        failures.reset();
        respond(200, { fixtureId: state.fixture.id, homeId: state.fixture.home.id, reset: true });
        return;
      }
      if (request.method === "POST" && control === "/__mock/fail-next") {
        const failure = failures.arm(body);
        if (!failure) {
          respond(400, { success: false, code: "mock_invalid_failure", message: "fail-next requires method, API path and status 400-599" });
          return;
        }
        respond(200, { fixtureId: fixture.id, armed: true, failure });
        return;
      }
      if (request.method === "POST" && control === "/__mock/succeed-without-mutation-next") {
        const noop = failures.armNoop(body);
        if (!noop) {
          respond(400, { success: false, code: "mock_invalid_noop", message: "succeed-without-mutation-next requires method and API path" });
          return;
        }
        respond(200, { fixtureId: fixture.id, armed: true, noop });
        return;
      }
      const failure = await failures.take({ method: request.method || "GET", path: requestUrl.pathname, authorized: request.headers.authorization === `${authorizationScheme} ${credential}` });
      if (failure) {
        respond(failure.status, { success: false, code: "mock_injected_failure", message: `injected failure for ${failure.method} ${failure.path}` });
        return;
      }
      const noop = await failures.takeNoop({ method: request.method || "GET", path: requestUrl.pathname, authorized: request.headers.authorization === `${authorizationScheme} ${credential}` });
      if (noop) {
        respond(200, { success: true, code: "200", message: "success", data: { accepted: true } });
        return;
      }
      const result = routeRequest({ request, body, fixture, credential, authorizationScheme });
      respond(result.status, result.body);
    } catch (error) {
      respond(500, { success: false, code: "mock_internal_error", message: error instanceof Error ? error.message : String(error) });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const origin = `http://${host}:${actualPort}`;

  return {
    get fixture() { return state.fixture; },
    fixtureId,
    homeId: state.fixture.home.id,
    credential,
    origin,
    apiBaseUrl: `${origin}/apis/iot`,
    requestLog: () => requestLog.snapshot(),
    reset() {
      state.reset();
      failures.reset();
      requestLog.clear();
    },
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

export function loadMockHomeFixture(fixtureId = "comprehensive") {
  return loadFixture(fixtureId);
}

function routeRequest({ request, body, fixture, credential, authorizationScheme }) {
  const method = request.method || "GET";
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (method === "GET" && url.pathname === "/health") return ok({ fixtureId: fixture.id, homeId: fixture.home.id });
  if (!url.pathname.startsWith("/apis/iot/")) return notFound(method, url.pathname);
  if (request.headers.authorization !== `${authorizationScheme} ${credential}`) {
    return { status: 401, body: { success: false, code: "mock_unauthorized", message: "mock authorization header mismatch" } };
  }

  const apiPath = url.pathname.slice("/apis/iot".length);
  const topologyResult = routeTopologyRequest({ method, apiPath, body, fixture });
  if (topologyResult) return topologyResult;
  const automationResult = routeAutomationRequest({ method, apiPath, body, fixture });
  if (automationResult) return automationResult;
  const groupResult = routeGroupRequest({ method, apiPath, body, fixture });
  if (groupResult) return groupResult;
  const gatewayResult = routeGatewayRequest({ method, apiPath, body, fixture }); if (gatewayResult) return gatewayResult;
  const panelResult = routePanelRequest({ method, apiPath, body, fixture }); if (panelResult) return panelResult;
  const sceneResult = routeSceneRequest({ method, apiPath, body, fixture });
  if (sceneResult) return sceneResult;
  const sensorResult = routeSensorRequest({ method, apiPath, body, fixture });
  if (sensorResult) return sensorResult;
  const deviceResult = routeDeviceRequest({ method, apiPath, body, fixture });
  if (deviceResult) return deviceResult;
  return notFound(method, url.pathname);
}

function ok(data) {
  return { status: 200, body: { success: true, code: "200", message: "success", data } };
}

function notFound(method, pathname) {
  return { status: 404, body: { success: false, code: "mock_endpoint_not_implemented", message: `mock endpoint not implemented: ${method} ${pathname}` } };
}

function loadFixture(fixtureId) {
  return loadReferenceHomeFixture(fixtureId);
}
