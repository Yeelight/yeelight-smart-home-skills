import { randomUUID } from "node:crypto";

export function createMockDevices(count) {
  if (!Number.isInteger(count) || count < 1 || count > 160) throw new Error("mock_target_limit");
  return Array.from({ length: count }, (_, index) => ({
    runtimeId: `mock-device-${String(index + 1).padStart(3, "0")}`,
    name: `Cinema Light ${index + 1}`,
    room: `Room ${Math.floor(index / 8) + 1}`,
    online: true,
    capabilities: { brightness: true, color: index % 3 !== 0, temperature: index % 4 === 0, flow: index % 2 === 0 },
  }));
}

export class MockRuntimeAdapter {
  constructor(options = {}) {
    this.devices = options.devices || createMockDevices(options.count || 2);
    this.calls = [];
    this.failHandles = new Set(options.failHandles || []);
    this.delayMs = options.delayMs || 0;
    this.queryFailure = options.queryFailure === true;
    this.state = new Map(this.devices.map((device) => [device.runtimeId, { power: false, brightness: 1 }]));
    this.inFlight = 0;
    this.maxConcurrent = 0;
  }

  async discover() {
    this.calls.push({ intent: "entity.list" });
    return this.devices.map((device) => ({ ...device, capabilities: { ...device.capabilities } }));
  }

  async executeFlow(row, signal) {
    this.calls.push({ intent: "lighting.flow.execute", runtimeId: row.runtimeId, set: { ...row.set } });
    this.inFlight += 1;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.inFlight);
    try {
      await delay(this.delayMs, signal);
      if (this.failHandles.has(row.handle)) return { status: "failed", handle: row.handle, code: "mock_failure" };
      this.state.set(row.runtimeId, { ...this.state.get(row.runtimeId), ...row.set });
      return { status: "acknowledged", handle: row.handle, receiptId: randomUUID() };
    } finally { this.inFlight -= 1; }
  }

  async applyDesign(rows, signal) {
    this.calls.push({ intent: "lighting.design.apply", count: rows.length });
    await delay(this.delayMs, signal);
    for (const row of rows) if (!this.failHandles.has(row.handle)) this.state.set(row.runtimeId, { ...this.state.get(row.runtimeId), ...row.set });
    const failed = rows.filter((row) => this.failHandles.has(row.handle));
    const results = rows.flatMap((row) => Object.entries(row.set || {}).map(([property, expectedValue]) => ({
      entity: { id: row.runtimeId, entityType: "device" },
      property,
      expectedValue,
      verifiedValue: this.failHandles.has(row.handle) ? this.state.get(row.runtimeId)?.[property] : expectedValue,
      verified: !this.failHandles.has(row.handle),
    })));
    return {
      status: failed.length ? "partial" : "success",
      result: { capability: "lighting.design.apply", persistentWrites: true, createdArtifacts: [], actionCount: results.length, verified: failed.length === 0, results },
      rows: rows.map((row) => ({ handle: row.handle, status: this.failHandles.has(row.handle) ? "failed" : "acknowledged" })),
    };
  }

  async setPower(target, power, signal) {
    return this.applyDesign([{ handle: target.handle, runtimeId: target.runtimeId, set: { power: power === true } }], signal);
  }

  async queryState(targets) {
    this.calls.push({ intent: "state.query", count: targets.length });
    if (this.queryFailure) throw new Error("mock_query_failure");
    return targets.map((target) => ({ runtimeId: target.runtimeId, verified: true, simulated: true, ...this.state.get(target.runtimeId) }));
  }
}

function delay(ms, signal) {
  if (!ms) {
    if (signal?.aborted) return Promise.reject(new Error("mock_cancelled"));
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const abort = () => { clearTimeout(timer); reject(new Error("mock_cancelled")); };
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
  });
}
