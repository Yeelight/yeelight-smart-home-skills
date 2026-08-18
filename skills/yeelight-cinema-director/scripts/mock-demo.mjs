#!/usr/bin/env node
import { createMockDevices, MockRuntimeAdapter } from "./lib/mock.mjs";
import { compileLightingFrame, normalizeTargets } from "./lib/contracts.mjs";
import { createLightingPlan, mergeReceipts, stopPlan } from "./lib/lighting.mjs";

const matrix = [1, 2, 18, 32, 160];
const results = [];
for (const count of matrix) {
  const runtime = new MockRuntimeAdapter({ devices: createMockDevices(count) });
  const targets = normalizeTargets(await runtime.discover());
  const frame = { energy: 0.74, hue: 24, saturation: 78, brightness: 76, lyricCue: "fire" };
  const plan = createLightingPlan(targets, frame, 0);
  const receipts = [];
  for (const row of plan.rows) receipts.push({ handle: row.handle, ...(await runtime.executeFlow({ ...row, runtimeId: targets.find((target) => target.handle === row.handle).runtimeId })) });
  const tick = mergeReceipts(targets, receipts);
  const stopRows = stopPlan(targets);
  const stopReceipts = stopRows.map((row) => ({ handle: row.handle, status: "acknowledged" }));
  const stop = mergeReceipts(targets, stopReceipts, "stop");
  results.push({ count, targets: targets.length, tick: tick.status, stop: stop.status, calls: runtime.calls.length });
}
let rejected = false;
try { createMockDevices(161); } catch { rejected = true; }
const output = { status: rejected && results.every((item) => item.targets === item.count && item.tick === "acknowledged" && item.stop === "acknowledged") ? "ok" : "failed", matrix: results, rejected161: rejected, physicalVerification: "mock-only; no hardware was contacted" };
console.log(JSON.stringify(output, null, 2));
if (output.status !== "ok") process.exitCode = 1;
