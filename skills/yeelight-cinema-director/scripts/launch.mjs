#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCinemaServer, shutdownCinemaServer } from "./server.mjs";

const port = Number(value("--port") || process.env.YEELIGHT_CINEMA_PORT || 8789);
const mode = value("--mode") === "live" ? "live" : "mock";
const context = { profile: value("--profile"), region: value("--region"), houseId: value("--house-id"), controlMode: value("--control-mode"), gatewayIp: value("--gateway-ip"), lanEndpoint: value("--lan-endpoint") };
const startupController = new AbortController();
let app;
let startupComplete = false;
let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  try { await shutdownCinemaServer(app); } finally {
    if (app?.server?.listening) app.server.close(() => process.exit(0));
    else process.exit(0);
  }
};
const handleSignal = () => { if (!startupComplete) startupController.abort(); else void shutdown(); };
process.on("SIGTERM", handleSignal);
process.on("SIGINT", handleSignal);

try {
  app = createCinemaServer({ port, mode, context, runtimeBin: process.env.YEELIGHT_HOME_BIN, hostToken: process.env.YEELIGHT_CINEMA_HOST_TOKEN, startupSignal: startupController.signal, instanceId: process.env.YEELIGHT_CINEMA_INSTANCE });
  await app.ready;
  startupComplete = true;
  await new Promise((resolve, reject) => {
    app.server.once("error", reject);
    app.server.listen(port, "127.0.0.1", resolve);
  });
  const actualPort = app.server.address().port;
  app.port = actualPort;
  process.stdout.write(JSON.stringify({ status: "ready", serviceId: "yeelight-cinema-director", port: actualPort, mode }) + "\n");
} catch {
  startupController.abort();
  process.exitCode = 1;
}

function value(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] || "" : ""; }

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  // The module is intentionally foreground-safe for the service manager.
}
