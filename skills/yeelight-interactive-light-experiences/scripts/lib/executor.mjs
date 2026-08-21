import crypto from "node:crypto";
import { aggregatePlan, assertTopologyReady, createTopology } from "./topology.mjs";
import { LOGICAL_SLOTS, redactedExecution, validateExperiencePlan } from "./contracts.mjs";
import { DEFAULT_MAX_PARALLEL_TARGETS, normalizeParallelTargets } from "./command-adapter.mjs";
import { compilePhasesToFlowTuples } from "./plans.mjs";

const DEFAULT_RECOVERY_TTL_MS = 10 * 60 * 1000;

export class ExperienceExecutor {
  #tail = Promise.resolve();
  #ledger = [];
  #states = new Map();
  #restoreSnapshot = null;
  #recoveryTimer = null;
  #commandAdapter;
  #recoveryTtlMs;
  #maxParallelTargets;
  #sleep;

  constructor({ topologyFactory = createTopology, commandAdapter = null, recoveryTtlMs = DEFAULT_RECOVERY_TTL_MS, maxParallelTargets = process.env.YEELIGHT_INTERACTIVE_MAX_PARALLEL_TARGETS, sleep = delay } = {}) {
    this.topologyFactory = topologyFactory;
    this.#commandAdapter = commandAdapter;
    this.#recoveryTtlMs = Number.isFinite(recoveryTtlMs) && recoveryTtlMs > 0 ? Math.round(recoveryTtlMs) : DEFAULT_RECOVERY_TTL_MS;
    this.#maxParallelTargets = normalizeParallelTargets(maxParallelTargets, DEFAULT_MAX_PARALLEL_TARGETS);
    this.#sleep = sleep;
  }

  get ledger() { return this.#ledger.map((item) => ({ ...item })); }

  recoveryStatus() {
    const record = this.#currentRecovery();
    if (!record) return { available: false };
    return { available: true, owner: { ...record.owner }, topologyMode: record.topologyMode, currentDigest: record.currentDigest || "" };
  }

  recoverySummary() {
    const record = this.#currentRecovery();
    if (!record) return { available: false };
    const topology = this.#fallbackTopology(record.topologyMode, "online");
    return {
      available: true,
      recoveryRef: record.recoveryRef,
      mode: record.topologyMode,
      physicalCount: topology.physicalCount || topology.targets?.length || 0,
      logicalCount: topology.logicalCount || LOGICAL_SLOTS.length,
      affectedCount: record.affectedAliases.length,
      restoreScope: record.affectedAliases.length === topology.targets?.length ? "all" : "affected",
    };
  }

  recoveryContext(recoveryRef) {
    const record = this.#currentRecovery();
    if (!record || typeof recoveryRef !== "string" || recoveryRef !== record.recoveryRef) return null;
    return { owner: { ...record.owner }, recoveryRef: record.recoveryRef, restoreAliases: [...record.affectedAliases] };
  }

  clearRecovery(sessionId = "") {
    const record = this.#currentRecovery();
    if (!record || sessionId && record.owner.sessionId !== sessionId) return false;
    this.#dropRecovery();
    return true;
  }

  async readSnapshot({ mode = "live-proxy-4", scenario = "online", requestId = "live-preflight", signal } = {}) {
    let topology;
    try {
      topology = this.topologyFactory(mode, scenario);
    } catch {
      return { ok: false, reason: "live_topology_unavailable" };
    }
    if (!topology?.mode?.startsWith("live")) return { ok: false, reason: "live_topology_required" };
    const readback = await this.#freshRead(topology, requestId, signal);
    const snapshot = this.#snapshotForTopology(topology, readback);
    if (!readback.ok || !snapshot) return { ok: false, reason: readback.reason || "pre_state_unavailable" };
    return {
      ok: true,
      stateDigest: snapshotDigest(topology, snapshot),
      states: topology.targets.map((target) => ({ alias: target.alias, ...snapshot.get(target.alias) })),
    };
  }

  async inspectState({ mode = "mock-18", scenario = "online", requestId = "state-inspection", signal } = {}) {
    if (String(mode).startsWith("live")) {
      let topology;
      try { topology = this.topologyFactory(mode, "online"); } catch { return { ok: false, reason: "live_topology_unavailable" }; }
      const representatives = observationRepresentatives(topology);
      if (!representatives.ok) return representatives;
      if (!this.#commandAdapter || typeof this.#commandAdapter.observeState !== "function") return { ok: false, reason: "observation_api_unavailable" };
      const observed = await this.#commandAdapter.observeState({ requestId, targetIds: representatives.targets.map((target) => target.id), signal });
      if (!observed?.ok || !Array.isArray(observed.states) || observed.states.length !== representatives.targets.length) return { ok: false, reason: observed?.reason || "state_query_failed" };
      return {
        ok: true,
        states: observed.states.map((state, index) => ({ alias: representatives.targets[index].alias, ...state })),
        source: "bounded_observation",
        sampleCoverage: {
          sampledCount: representatives.targets.length,
          totalTargets: topology.targets.length,
          scope: representatives.scope,
        },
      };
    }
    let topology;
    try { topology = this.topologyFactory(mode, scenario); } catch { return { ok: false, reason: "topology_unavailable" }; }
    if (!topology?.targets?.length) return { ok: false, reason: "topology_unavailable" };
    const states = topology.targets.map((target) => ({
      alias: target.alias,
      ...(this.#states.get(target.alias) || { hue: 188, saturation: 54, brightness: 48 }),
      online: target.online !== false,
    }));
    return { ok: true, states, source: "state.query" };
  }

  execute(plan, options = {}) {
    const run = () => this.#execute(plan, options);
    const queued = this.#tail.then(run, run);
    this.#tail = queued.catch(() => undefined);
    return queued;
  }

  async #execute(plan, { sessionId = "", requestId = "", generation = "", mode = "mock-18", scenario = "online", signal, isCurrent = () => true, expectedPreStateDigest = "", verifyLive = true } = {}) {
    const current = () => !signal?.aborted && isCurrent();
    const validated = validateExperiencePlan(plan, plan?.experienceId);
    if (!validated.ok) return redactedExecution({ status: "blocked", mode, userMessage: "The light plan was rejected." });
    if (!current()) return redactedExecution(this.#recovery(mode, scenario, [], "cancelled", null, null, false, false));
    this.#dropRecovery();

    let topology;
    try {
      topology = this.topologyFactory(mode, scenario);
    } catch {
      return redactedExecution(this.#recovery(mode, scenario, [], "topology_unavailable", null, null, false, false));
    }
    const ready = assertTopologyReady(topology, { rgb: true, brightness: true, flow: scenario === "unsupported-capability" });
    if (!ready.ok) return redactedExecution(this.#recovery(mode, scenario, [], ready.reason, topology, null, !topology.mode.startsWith("live"), false));
    const liveVerification = topology.mode.startsWith("live") && verifyLive !== false;
    const compiled = aggregatePlan(plan, topology);
    let preState = new Map(this.#states);
    let preStateTrusted = !topology.mode.startsWith("live");
    const recoveryOwner = () => ({ sessionId, requestId, generation, signal, isCurrent, preStateTrusted, verifyLive: liveVerification });

    if (liveVerification) {
      const initialRead = await this.#freshRead(topology, requestId, signal);
      if (!current()) return redactedExecution(this.#recovery(mode, scenario, [], "cancelled", topology, compiled, false, false, recoveryOwner()));
      preState = this.#snapshotForTopology(topology, initialRead);
      preStateTrusted = Boolean(initialRead?.ok && preState);
      if (!preStateTrusted) return redactedExecution(this.#recovery(mode, scenario, [], "pre_state_unavailable", topology, compiled, Boolean(initialRead?.ok && initialRead?.states), false, recoveryOwner()));
      if (expectedPreStateDigest && snapshotDigest(topology, preState) !== expectedPreStateDigest) {
        return redactedExecution({ status: "blocked", mode, evidence: evidence(topology), physicalResults: [], logicalStates: [], recovery: { needed: false, freshRead: true, restoreAvailable: false }, userMessage: "The live state changed during this run. Start the experience again." });
      }
    } else if (topology.mode.startsWith("live") && expectedPreStateDigest) {
      return redactedExecution({ status: "blocked", mode, evidence: evidence(topology), physicalResults: [], logicalStates: [], recovery: { needed: false, freshRead: false, restoreAvailable: false }, userMessage: "This live action requires state verification and cannot use the fast path." });
    }

    const affected = new Set();
    const isLive = topology.mode.startsWith("live");
    // Keep capability discovery separate from Flow admission: a shared Flow
    // exists even when the plan is too long for Runtime's six-tuple limit.
    const commonFlowCapabilityName = isLive ? commonFlowName(topology) : "";
    const flowName = isLive && compiled.phases.length <= 6 ? commonFlowCapabilityName : "";
    // A device without Flow support still needs to see the complete plan. The
    // local executor owns the phase clock in this case, so intermediate phases
    // are written in order and held for their declared duration instead of
    // being silently collapsed to the final frame.
    const executionPhases = compiled.phases;
    if (flowName && typeof this.#commandAdapter?.invokeFlowBatch === "function") {
      const entries = topology.targets.map((target) => {
        affected.add(target.alias);
        const final = compiled.phases.at(-1).targets.find((item) => item.alias === target.alias);
        const entry = { sessionId, requestId, phase: "flow", alias: target.alias, hue: final?.hue, saturation: final?.saturation, brightness: final?.brightness, status: "flow_dispatched" };
        this.#ledger.push(entry);
        return { target, entry };
      });
      if (!current()) return this.#recover(mode, topology, compiled, affected, preState, "cancelled", recoveryOwner());
      const write = await this.#writeFlow(compiled, entries.map(({ target }) => target), flowName, requestId, signal);
      if (write.flowDispatched && !write.flowSettled && Number.isFinite(write.flowWindowMs)) await this.#sleep(write.flowWindowMs);
      if (!current()) return this.#recover(mode, topology, compiled, affected, preState, "cancelled", recoveryOwner());
      if (!write.ok) {
        for (const { entry } of entries) entry.status = write.reason || "runtime_error";
        return this.#recover(mode, topology, compiled, affected, preState, write.reason || "runtime_error", recoveryOwner());
      }
      for (const { target, entry } of entries) {
        entry.status = "flow_acknowledged";
        const final = compiled.phases.at(-1).targets.find((item) => item.alias === target.alias);
        this.#states.set(target.alias, { hue: final.hue, saturation: final.saturation, brightness: final.brightness });
      }
    } else {
      for (let phaseIndex = 0; phaseIndex < executionPhases.length; phaseIndex += 1) {
        if (!current()) return this.#recover(mode, topology, compiled, affected, preState, "cancelled", recoveryOwner());
        const phase = executionPhases[phaseIndex];
        if (topology.mode.startsWith("live")) {
          const entries = phase.targets.map((target) => {
            affected.add(target.alias);
            const entry = { sessionId, requestId, phase: phase.phaseId, alias: target.alias, hue: target.hue, saturation: target.saturation, brightness: target.brightness, status: "dispatched" };
            this.#ledger.push(entry);
            return { target, entry };
          });
          if (!current()) return this.#recover(mode, topology, compiled, affected, preState, "cancelled", recoveryOwner());
          const write = await this.#writePhase(entries.map(({ target }) => target), requestId, signal, { confirmEventual: liveVerification });
          if (!current()) return this.#recover(mode, topology, compiled, affected, preState, "cancelled", recoveryOwner());
          if (!write.ok) {
            for (const { entry } of entries) entry.status = write.reason || "runtime_error";
            return this.#recover(mode, topology, compiled, affected, preState, write.reason || "runtime_error", recoveryOwner());
          }
          const dispatchedUnverified = write.status === "dispatched_unverified";
          for (const { target, entry } of entries) {
            entry.status = dispatchedUnverified ? "dispatched_unverified" : "written";
            if (!dispatchedUnverified) this.#states.set(target.alias, { hue: target.hue, saturation: target.saturation, brightness: target.brightness });
          }
          if (isLive && !flowName && phaseIndex < executionPhases.length - 1) {
            try {
              await this.#sleep(phase.durationMs, signal);
            } catch {
              return this.#recover(mode, topology, compiled, affected, preState, "cancelled", recoveryOwner());
            }
          }
          continue;
        }
        for (const target of phase.targets) {
          if (!current()) return this.#recover(mode, topology, compiled, affected, preState, "cancelled", recoveryOwner());
          affected.add(target.alias);
          const failure = topology.mode.startsWith("live") ? null : fixtureFailure(scenario, target.alias, phaseIndex);
          this.#ledger.push({ sessionId, requestId, phase: phase.phaseId, alias: target.alias, hue: target.hue, saturation: target.saturation, brightness: target.brightness, status: failure || "written" });
          if (failure) return this.#recover(mode, topology, compiled, affected, preState, failure, { sessionId, requestId, generation, signal, isCurrent, preStateTrusted });
          this.#states.set(target.alias, { hue: target.hue, saturation: target.saturation, brightness: target.brightness });
        }
      }
    }

    if (liveVerification) {
      const readback = await this.#freshRead(topology, requestId, signal);
      if (!current()) return this.#recover(mode, topology, compiled, affected, preState, "cancelled", recoveryOwner());
      if (!readback.ok) return this.#recover(mode, topology, compiled, affected, preState, readback.reason, recoveryOwner());
      const postState = this.#snapshotForTopology(topology, readback);
      if (!postState || !this.#matchesPlan(topology, compiled, postState)) return this.#recover(mode, topology, compiled, affected, preState, "readback_unverified", recoveryOwner());
      this.#states = postState;
      if (flowName) for (const entry of this.#ledger.filter((item) => item.requestId === requestId && item.phase === "flow")) entry.status = "flow_verified";
    }

    const acknowledged = topology.mode.startsWith("live") && !liveVerification;
    return redactedExecution({ status: acknowledged ? "acknowledged" : "success", verification: acknowledged ? "write_acknowledged" : topology.mode.startsWith("live") ? "readback_verified" : "deterministic", mode, evidence: evidence(topology, acknowledged ? acknowledgedEvidenceLabel(topology) : undefined), physicalResults: topology.targets.map((target) => ({ alias: target.alias, status: acknowledged ? "acknowledged" : "applied", phase: "complete" })), logicalStates: compiled.derivedSlots.map((item) => ({ slot: item.slot, status: acknowledged ? "acknowledged" : "applied", source: item.source })), userMessage: acknowledged ? "Light command accepted by the live Runtime." : "Light plan applied." });
  }

  async #recover(mode, topology, compiled, affected, preState, reason, owner) {
    // Reconcile live state after cancellation with an independent read. The
    // visitor request is terminal, but a trustworthy state receipt lets the
    // owning visitor session offer a bounded restore when it is safe.
    const reconcile = topology.mode.startsWith("live") && owner.verifyLive !== false || topology.mode.startsWith("live") && affected.size > 0;
    const readback = reconcile ? await this.#freshRead(topology, owner.requestId) : { ok: true };
    const freshState = readback.ok ? this.#snapshotForTopology(topology, readback) : null;
    const freshRead = topology.mode.startsWith("live") ? Boolean(reconcile && readback.ok && freshState) : true;
    const restoreAvailable = topology.scenario !== "readback-mismatch" && owner.preStateTrusted !== false && freshRead && owner.isCurrent?.() !== false;
    if (restoreAvailable) this.#storeRecovery({
      snapshot: new Map(preState),
      owner: { sessionId: owner.sessionId, requestId: owner.requestId, generation: owner.generation, bindingRevision: topology.bindingRevision || "" },
      topologyMode: topology.mode,
      currentDigest: freshState ? snapshotDigest(topology, freshState) : "",
      affectedAliases: [...affected].sort(),
      recoveryRef: crypto.randomBytes(18).toString("base64url"),
      expiresAt: Date.now() + this.#recoveryTtlMs,
      trusted: true,
    });
    else this.#dropRecovery();
    const result = this.#recovery(mode, topology.scenario, [...affected], reason, topology, compiled, freshRead, restoreAvailable);
    return redactedExecution(result);
  }

  #recovery(mode, scenario, aliases, reason, topology = null, compiled = null, freshRead = false, restoreAvailable = false) {
    const source = topology || this.#fallbackTopology(mode, scenario);
    const states = compiled?.derivedSlots || LOGICAL_SLOTS.map((slot) => ({ slot, alias: slot, source: "physical" }));
    const bad = new Set(aliases);
    return { status: reason.includes("offline") || reason.includes("unsupported") ? "blocked" : "partial", mode, evidence: evidence(source), physicalResults: source.targets.map((target) => ({ alias: target.alias, status: bad.has(target.alias) ? reason : "not-run", phase: "recovery" })), logicalStates: states.map((item) => ({ slot: item.slot, status: bad.has(item.alias) ? classify(reason) : "unknown", source: item.source })), recovery: { needed: true, freshRead, restoreAvailable, message: freshRead ? "Execution stopped; fresh read completed before any optional restore." : "Execution stopped; a trusted fresh read was unavailable." }, userMessage: "Light plan stopped before completion." };
  }

  async #writeFlow(compiled, targets, flowName, requestId, signal) {
    try {
      const flows = targets.map((target) => ({
        targetId: target.id,
        flow: compilePhasesToFlowTuples(compiled.phases.map((phase) => ({ ...phase, targets: [phase.targets.find((item) => item.alias === target.alias)] })), flowName),
      }));
      return await this.#commandAdapter.invokeFlowBatch({
        requestId,
        intent: "lighting.flow.execute",
        targets: targets.map((target) => ({ id: target.id })),
        parameters: { flows },
      }, { signal });
    } catch {
      return { ok: false, reason: "runtime_error" };
    }
  }

  async #writeTarget(target, requestId, signal, { confirmEventual = true } = {}) {
    if (!this.#commandAdapter) return { ok: false, reason: "runtime_adapter_unavailable" };
    return this.#commandAdapter.invoke({ requestId, intent: "lighting.design.apply", targets: [{ id: target.id }], parameters: { hue: target.hue, saturation: target.saturation, brightness: target.brightness, power: typeof target.power === "boolean" ? target.power : true } }, { signal, confirmEventual });
  }

  async #writePhase(targets, requestId, signal, { confirmEventual = true } = {}) {
    if (!this.#commandAdapter) return { ok: false, reason: "runtime_adapter_unavailable" };
    if (typeof this.#commandAdapter.invokeBatch === "function") {
      try {
        const request = {
          requestId,
          intent: "lighting.design.apply",
          targets: targets.map((target) => ({ id: target.id })),
          parameters: { actions: targets.map((target) => ({ targetType: "device", targetId: target.id, set: { power: true, brightness: target.brightness, color: hsvToRgb(target.hue, target.saturation, target.brightness) } })) },
        };
        if (!confirmEventual && typeof this.#commandAdapter.invokeVisitorBatch === "function") {
          return await this.#commandAdapter.invokeVisitorBatch(request, { signal });
        }
        return await this.#commandAdapter.invokeBatch(request, { signal, confirmEventual });
      } catch {
        return { ok: false, reason: "runtime_error" };
      }
    }

    // Test adapters and older local adapters may only expose invoke(). Keep
    // the same phase semantics with the configured worker count and no new
    // dispatch after the first failure; all already-started writes settle
    // before the caller enters the recovery read.
    const results = new Array(targets.length);
    let cursor = 0;
    let stopped = false;
    const worker = async () => {
      while (!stopped) {
        const index = cursor;
        cursor += 1;
        if (index >= targets.length) return;
        try {
          const result = await this.#writeTarget(targets[index], requestId, signal, { confirmEventual });
          results[index] = result;
          if (!result?.ok) stopped = true;
        } catch {
          results[index] = { ok: false, reason: "runtime_error" };
          stopped = true;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.#maxParallelTargets, targets.length) }, worker));
    const failed = results.find((result) => result && !result.ok);
    return failed || results.some((result) => !result) ? { ok: false, reason: failed?.reason || (signal?.aborted ? "runtime_cancelled" : "runtime_error") } : { ok: true, status: "success" };
  }

  async #writeSnapshot(topology, targets, snapshot, requestId, signal) {
    if (typeof this.#commandAdapter?.invokeBatch === "function") {
      const actions = targets.map((target) => {
        const state = snapshot.get(target.alias);
        if (!state) return null;
        return {
          targetType: "device",
          targetId: target.id,
          set: {
            power: typeof state.power === "boolean" ? state.power : true,
            brightness: state.brightness,
            color: hsvToRgb(state.hue, state.saturation, state.brightness),
          },
        };
      });
      if (actions.some((action) => !action)) return { ok: false, reason: "runtime_snapshot_invalid" };
      try {
        return await this.#commandAdapter.invokeBatch({
          requestId,
          intent: "lighting.design.apply",
          targets: targets.map((target) => ({ id: target.id })),
          parameters: { actions },
        }, { signal, confirmEventual: true });
      } catch {
        return { ok: false, reason: "runtime_error" };
      }
    }
    for (const target of targets) {
      if (signal?.aborted) return { ok: false, reason: "runtime_cancelled" };
      const state = snapshot.get(target.alias);
      if (!state) return { ok: false, reason: "runtime_snapshot_invalid" };
      const write = await this.#writeTarget({ ...target, ...state }, requestId, signal);
      if (!write.ok) return write;
    }
    return { ok: true, status: "success" };
  }

  async #freshRead(topology, requestId, signal) {
    if (!this.#commandAdapter) return { ok: false, reason: "runtime_adapter_unavailable" };
    const request = { requestId, intent: "state.query", targets: topology.targets.map((target) => ({ id: target.id })), parameters: { allProperties: true } };
    // Runtime state.query returns one entity result per invocation. Prefer the
    // adapter's read path, which serializes bounded single-target reads and
    // returns a complete snapshot for every physical target.
    if (typeof this.#commandAdapter.invokeRead === "function") return this.#commandAdapter.invokeRead(request, { signal });
    return this.#commandAdapter.invoke(request, { signal });
  }

  async restore(snapshot = null, { mode = "mock-18", scenario = "online", sessionId = "", requestId = "", generation = "", signal, isCurrent = () => true, expectedCurrentDigest = "", recoveryRef = "", restoreAliases = null } = {}) {
    const run = async () => {
      const record = snapshot instanceof Map ? { snapshot, owner: null } : (snapshot || this.#currentRecovery());
      const topology = this.topologyFactory(mode, scenario);
      const recoverySignal = record?.recoveryController?.signal;
      const restoreSignal = combineAbortSignals(signal, recoverySignal);
      const restoreStillAvailable = () => this.#restoreSnapshot === record && (!record.expiresAt || record.expiresAt > Date.now()) && !recoverySignal?.aborted && !restoreSignal?.aborted && isCurrent?.() !== false;
      if (!record?.snapshot || !(record.snapshot instanceof Map) || scenario === "readback-mismatch" || !record.owner || !record.trusted || mode.startsWith("live") && !recoveryRef || recoveryRef && record.recoveryRef !== recoveryRef || record.owner.sessionId !== sessionId || record.owner.requestId !== requestId || record.owner.generation !== generation || record.owner.bindingRevision && record.owner.bindingRevision !== (topology.bindingRevision || "") || signal?.aborted || isCurrent?.() === false || mode.startsWith("live") && !restoreStillAvailable()) return redactedExecution({ status: "blocked", mode, userMessage: "Restore is unavailable." });
      const requestedAliases = Array.isArray(restoreAliases) ? restoreAliases : record.affectedAliases;
      const aliases = [...new Set(requestedAliases.filter((alias) => topology.targets.some((target) => target.alias === alias)))];
      if (!aliases.length || aliases.some((alias) => !record.affectedAliases?.includes(alias))) return redactedExecution({ status: "blocked", mode, userMessage: "Restore is unavailable." });
      if (mode.startsWith("live")) {
        if (!restoreStillAvailable()) return redactedExecution({ status: "partial", mode, userMessage: "Restore could not be verified." });
        const restoreTargets = topology.targets.filter((item) => aliases.includes(item.alias));
        const write = await this.#writeSnapshot(topology, restoreTargets, record.snapshot, requestId, restoreSignal);
        if (!restoreStillAvailable() || !write.ok) return redactedExecution({ status: "partial", mode, userMessage: "Restore could not be verified." });
        if (!restoreStillAvailable()) return redactedExecution({ status: "partial", mode, userMessage: "Restore could not be verified." });
        const readback = await this.#freshRead(topology, requestId, restoreSignal);
        if (!restoreStillAvailable()) return redactedExecution({ status: "partial", mode, userMessage: "Restore could not be verified." });
        const restoredState = this.#snapshotForTopology(topology, readback);
        if (!readback.ok || !restoredState || !this.#matchesSnapshot(topology, record.snapshot, restoredState, aliases)) return redactedExecution({ status: "partial", mode, userMessage: "Restore could not be verified." });
        this.#states = restoredState;
      } else {
        this.#states = new Map(record.snapshot);
      }
      this.#dropRecovery();
      return redactedExecution({ status: "success", mode, evidence: evidence(topology), userMessage: "Previous verified light state restored." });
    };
    const queued = this.#tail.then(run, run);
    this.#tail = queued.catch(() => undefined);
    return queued;
  }

  #snapshotForTopology(topology, readback) {
    if (!Array.isArray(readback?.states)) return null;
    const byId = new Map(readback.states.filter((state) => state && typeof state.id === "string").map((state) => [state.id, state]));
    const snapshot = new Map();
    for (const target of topology.targets) {
      const state = normalizeState(byId.get(target.id));
      if (!state) return null;
      snapshot.set(target.alias, state);
    }
    return snapshot;
  }

  #currentRecovery() {
    const record = this.#restoreSnapshot;
    if (!record) return null;
    if (record.expiresAt && record.expiresAt <= Date.now()) {
      this.#dropRecovery();
      return null;
    }
    return record;
  }

  #storeRecovery(record) {
    this.#dropRecovery();
    const stored = { ...record, recoveryController: new AbortController() };
    this.#restoreSnapshot = stored;
    this.#recoveryTimer = setTimeout(() => {
      if (this.#restoreSnapshot === stored) {
        stored.recoveryController.abort("recovery_expired");
        this.#dropRecovery(stored);
      }
    }, this.#recoveryTtlMs);
    this.#recoveryTimer.unref?.();
  }

  #dropRecovery(expected = null) {
    if (expected && this.#restoreSnapshot !== expected) return false;
    const record = this.#restoreSnapshot;
    if (this.#recoveryTimer) clearTimeout(this.#recoveryTimer);
    this.#recoveryTimer = null;
    this.#restoreSnapshot = null;
    if (record?.recoveryController && !record.recoveryController.signal.aborted) record.recoveryController.abort("recovery_cleared");
    return Boolean(record);
  }

  #matchesPlan(topology, compiled, actual) {
    const finalPhase = compiled?.phases?.[compiled.phases.length - 1];
    return Boolean(finalPhase && topology.targets.every((target) => {
      const expected = finalPhase.targets.find((item) => item.alias === target.alias);
      const received = actual.get(target.alias);
      return expected && received && closeHue(expected.hue, received.hue) && closeEnough(expected.saturation, received.saturation) && closeEnough(expected.brightness, received.brightness);
    }));
  }

  #matchesSnapshot(topology, expected, actual, aliases = topology.targets.map((target) => target.alias)) {
    return topology.targets.filter((target) => aliases.includes(target.alias)).every((target) => {
      const before = expected.get(target.alias);
      const after = actual.get(target.alias);
      return before && after && closeHue(before.hue, after.hue) && closeEnough(before.saturation, after.saturation) && closeEnough(before.brightness, after.brightness) && (before.power === undefined || before.power === after.power);
    });
  }

  #fallbackTopology(mode, scenario) {
    try { return this.topologyFactory(mode, scenario); } catch {
      if (String(mode).startsWith("live")) return { mode, reduced: mode === "live-proxy-4", physicalCount: 0, logicalCount: LOGICAL_SLOTS.length, gateway: { alias: "IFA Gateway", online: false }, targets: [], evidenceLabel: "Live topology unavailable", scenario, provenance: "unavailable", bindingRevision: "" };
      return this.topologyFactory(String(mode).replace(/^live-/, ""), scenario);
    }
  }
}

function observationRepresentatives(topology) {
  if (!topology?.mode?.startsWith("live") || !Array.isArray(topology.targets)) return { ok: false, reason: "live_topology_unavailable" };
  const aliases = topology.mode === "live-proxy-4" ? ["L-upper", "L-lower"] : topology.mode === "live-18" ? ["L1", "L6"] : [];
  if (!aliases.length) return { ok: false, reason: "observation_topology_unsupported" };
  const targets = aliases.map((alias) => topology.targets.find((target) => target?.alias === alias || target?.slot === alias));
  if (targets.some((target) => !target?.id) || new Set(targets.map((target) => target.id)).size !== aliases.length) return { ok: false, reason: "observation_representatives_unavailable" };
  return { ok: true, targets, scope: topology.mode === "live-proxy-4" ? "left-bank quadrant representatives" : "left-bank representative slots" };
}

function fixtureFailure(scenario, alias, phaseIndex) {
  if (scenario === "timeout" && alias === "R-upper") return "timeout";
  if (scenario === "partial-write" && alias === "R-upper" && phaseIndex === 0) return "partial_write";
  if (scenario === "readback-mismatch" && alias === "R-lower") return "readback_mismatch";
  return null;
}

function combineAbortSignals(...signals) {
  const active = signals.filter((signal) => signal && typeof signal.aborted === "boolean");
  if (!active.length) return undefined;
  if (active.length === 1) return active[0];
  if (typeof AbortSignal.any === "function") return AbortSignal.any(active);
  const controller = new AbortController();
  const abort = (signal) => controller.abort(signal.reason);
  for (const signal of active) {
    if (signal.aborted) {
      abort(signal);
      break;
    }
    signal.addEventListener("abort", () => abort(signal), { once: true });
  }
  return controller.signal;
}

function commonFlowName(topology) {
  const lists = topology.targets.map((target) => {
    if (target.capabilities?.flow !== true || !Array.isArray(target.capabilities?.flowNames)) return new Map();
    return new Map(target.capabilities.flowNames
      .map((name) => String(name).trim())
      .filter((name) => /^[A-Za-z0-9._:-]{1,64}$/.test(name))
      .map((name) => [name.toLowerCase(), name]));
  });
  if (!lists.length || lists.some((list) => !list.size)) return "";
  const [first, ...rest] = lists;
  for (const [normalized, original] of first) if (rest.every((list) => list.has(normalized))) return original;
  return "";
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.round(milliseconds))));
}

function classify(reason) { if (reason.includes("offline")) return "offline"; if (reason.includes("unsupported")) return "unsupported"; if (reason === "partial_write") return "partial"; return "unknown"; }
function evidence(topology, label = undefined) { return { label: label || topology.evidenceLabel, physicalCount: topology.physicalCount, logicalCount: topology.logicalCount, reduced: topology.reduced }; }

function acknowledgedEvidenceLabel(topology) {
  return topology.reduced
    ? "EU 4-light quadrant-proxy command acknowledged"
    : "Live light command acknowledged; physical state not verified";
}

function snapshotDigest(topology, snapshot) {
  const payload = topology.targets.map((target) => ({ alias: target.alias, state: snapshot.get(target.alias) || null }));
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);
}

function normalizeState(state) {
  if (!state || !Number.isFinite(Number(state.brightness))) return null;
  let hue = Number(state.hue);
  let saturation = Number(state.saturation);
  if ((!Number.isFinite(hue) || !Number.isFinite(saturation)) && Number.isFinite(Number(state.color))) {
    const converted = rgbToHsv(Number(state.color));
    hue = converted.hue;
    saturation = converted.saturation;
  }
  if (!Number.isFinite(hue) || !Number.isFinite(saturation)) return null;
  return { hue: ((Math.round(hue) % 360) + 360) % 360, saturation: Math.max(0, Math.min(100, Math.round(saturation))), brightness: Math.max(1, Math.min(100, Math.round(Number(state.brightness)))), ...(typeof state.power === "boolean" ? { power: state.power } : {}) };
}

function rgbToHsv(color) {
  const r = ((Math.round(color) >> 16) & 0xff) / 255;
  const g = ((Math.round(color) >> 8) & 0xff) / 255;
  const b = (Math.round(color) & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta) hue = max === r ? 60 * (((g - b) / delta) % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4);
  return { hue: (hue + 360) % 360, saturation: max ? (delta / max) * 100 : 0 };
}

function closeEnough(expected, actual) { return Math.abs(Number(expected) - Number(actual)) <= 2; }
function closeHue(expected, actual) { const delta = Math.abs(Number(expected) - Number(actual)); return Math.min(delta, 360 - delta) <= 2; }

function hsvToRgb(hue, saturation, brightness) {
  const s = saturation / 100;
  const v = brightness / 100;
  const chroma = v * s;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const [r, g, b] = segment < 1 ? [chroma, x, 0] : segment < 2 ? [x, chroma, 0] : segment < 3 ? [0, chroma, x] : segment < 4 ? [0, x, chroma] : segment < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const m = v - chroma;
  return ((Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255));
}
