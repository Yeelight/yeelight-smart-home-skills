#!/usr/bin/env node
import assert from "node:assert/strict";
import { createInteractiveServer } from "./server.mjs";
import { buildDeterministicPlan } from "./lib/plans.mjs";

// The mock contract must stay offline even when the exhibition computer has a
// persisted provider configuration for the live demo.
const provider = {
  load: async () => undefined,
  configRevision: () => 0,
  status: () => ({ configured: false }),
  interpret: async ({ experienceId, input }) => ({
    status: "fallback",
    plan: buildDeterministicPlan(experienceId, input, "fallback"),
  }),
};
const app = createInteractiveServer({ port: 0, mode: "mock-18", scenario: "online", provider });
await app.ready;
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const port = app.server.address().port;
const base = `http://127.0.0.1:${port}`;
const json = async (pathname, options = {}) => {
  const response = await fetch(base + pathname, {
    ...options,
    headers: { "content-type": "application/json", origin: base, ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
};

try {
  const catalog = (await json("/api/catalog")).body.experiences;
  assert.equal(catalog.length, 12);
  const runs = [];
  for (const mode of ["mock-18", "proxy-4"]) {
    app.runtime.mode = mode;
    app.runtime.scenario = "online";
    const session = (await json("/api/session", { method: "POST", body: "{}" })).body;
    for (const item of catalog) {
      const input = item.id === "fortune-light"
        ? { date: "1990-01-01", city: "Berlin" }
        : item.id === "memory-capsule"
          ? { text: "A warm room and rain", mood: "steady" }
          : item.id === "shared-breath"
            ? { cadence: "medium-even" }
        : item.id === "no-shared-prompt"
          ? { intent: "Invite warmth", inspectState: true }
        : item.id === "light-dna"
          ? { rounds: ["Ember", "A wide field", "Balanced", "Measured"], intensity: [52, 52, 52, 52] }
            : { choices: ["Balanced"] };
      let result;
      if (["shared-breath", "common-ground", "light-game-arena"].includes(item.id)) {
        const startInput = item.id === "light-game-arena" ? { rounds: ["Cyan - silver - cyan", "Violet - amber - mint"] } : input;
        const started = await json(`/api/experience/${item.id}/turn/start`, { method: "POST", body: JSON.stringify({ sessionId: session.sessionId, input: startInput }) });
        assert.equal(started.response.status, 201, `${mode}/${item.id}/turn-start`);
        const nextInput = item.id === "light-game-arena" ? { rounds: ["R"] } : item.id === "common-ground" ? { choice: "More focus" } : { cadence: "slow-even" };
        result = await json(`/api/experience/${item.id}/run`, { method: "POST", body: JSON.stringify({ sessionId: session.sessionId, turnReceipt: started.body.turn.receipt, input: nextInput }) });
      } else {
        result = await json(`/api/experience/${item.id}/run`, { method: "POST", body: JSON.stringify({ sessionId: session.sessionId, input }) });
      }
      assert.equal(result.response.status, 200, `${mode}/${item.id}`);
      assert.equal(result.body.execution.evidence.logicalCount, 18);
      runs.push({ mode, id: item.id, status: result.body.execution.status, evidence: result.body.execution.evidence.label });
    }
    await json("/api/session/finish", { method: "POST", body: JSON.stringify({ sessionId: session.sessionId }) });
  }
  for (const scenario of ["offline", "timeout", "partial-write", "readback-mismatch"]) {
    app.runtime.mode = "proxy-4";
    app.runtime.scenario = scenario;
    const session = (await json("/api/session", { method: "POST", body: "{}" })).body;
    const result = await json("/api/experience/fortune-light/run", { method: "POST", body: JSON.stringify({ sessionId: session.sessionId, input: { date: "1990-01-01", city: "Berlin" } }) });
    assert.equal(result.response.status, 200, scenario);
    assert.notEqual(result.body.execution.status, "success", scenario);
    assert.equal(result.body.execution.recovery.freshRead, true, scenario);
    runs.push({ mode: "proxy-4", scenario, status: result.body.execution.status, evidence: result.body.execution.evidence.label });
  }
  console.log(JSON.stringify({ ok: true, runs }, null, 2));
} finally {
  app.server.close();
}
