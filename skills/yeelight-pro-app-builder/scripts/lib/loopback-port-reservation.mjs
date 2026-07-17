import net from "node:net";

export async function reserveLoopbackPorts({ webValue, bridgeValue, defaultWebPort = 5173, defaultBridgePort = 8787 }) {
  let web;
  let bridge;
  try {
    web = await reservePort(webValue, defaultWebPort, "web");
    bridge = await reservePort(bridgeValue, defaultBridgePort, "bridge");
    let released = false;
    return {
      webPort: web.port,
      bridgePort: bridge.port,
      async release() {
        if (released) return;
        released = true;
        await Promise.all([closeServer(web.server), closeServer(bridge.server)]);
      },
    };
  } catch (error) {
    await Promise.all([closeServer(web?.server), closeServer(bridge?.server)]);
    throw error;
  }
}

async function reservePort(value, fallback, label) {
  const auto = String(value || "").toLowerCase() === "auto";
  const port = auto ? 0 : parsePort(value, fallback, label);
  const server = net.createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
  } catch (error) {
    if (error?.code === "EADDRINUSE") throw portError(`${label} port ${port} is already in use. Try --${label}-port auto.`);
    throw error;
  }
  const address = server.address();
  return { port: typeof address === "object" && address ? address.port : port, server };
}

function parsePort(value, fallback, label) {
  const port = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw portError(`Invalid ${label} port: ${value}`);
  return port;
}

function portError(message) {
  return Object.assign(new Error(message), { code: "YPA_PORT_INVALID", exitCode: 2 });
}

function closeServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
