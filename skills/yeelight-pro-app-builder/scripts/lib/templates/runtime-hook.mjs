export { homeModelHookSource } from "./home-runtime-hook.mjs";

export function lightDevicesHookSource(spec) {
  const houseId = JSON.stringify(String(spec?.scope?.homeIds?.[0] || ""));
  return `import { useCallback, useEffect, useState } from "react";
import runtimeLock from "../generated/runtime-lock.json";
import { requestAction } from "./request";

export type LightDevice = {
  id: string;
  name: string;
  displayName?: string;
  roomName: string;
  family: "light";
  state: Record<string, unknown>;
  controls: Array<{ id: string; intent: string; evidence: string }>;
};

const initialDevices = Object.values(runtimeLock.entities as Record<string, LightDevice>).filter((entity) => entity.family === "light");

export function useLightDevices() {
  const [devices, setDevices] = useState<LightDevice[]>(initialDevices);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await Promise.all(initialDevices.map(async (device) => {
        const response = await requestAction("state.query", { locale: "zh-CN", utterance: "同步" + (device.displayName || device.name) + "状态", parameters: { houseId: ${houseId}, deviceId: device.id } });
        const body = await response.json();
        if (!response.ok || !["success", "partial"].includes(String(body.status || ""))) throw new Error(body.userMessage || "设备状态同步失败。");
        const properties = body?.result?.properties;
        return properties && typeof properties === "object" ? { ...device, state: { ...device.state, ...properties } } : device;
      }));
      setDevices(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "家庭状态同步失败。");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { devices, loading, error, refresh };
}

`;
}

export function curtainDevicesHookSource(spec) {
  const houseId = JSON.stringify(String(spec?.scope?.homeIds?.[0] || ""));
  return `import { useCallback, useEffect, useState } from "react";
import runtimeLock from "../generated/runtime-lock.json";
import { requestAction } from "./request";

export type CurtainDevice = {
  id: string;
  name: string;
  displayName?: string;
  roomName: string;
  family: "curtain";
  readOnly?: boolean;
  capabilityStatus?: string;
  state: Record<string, unknown>;
  controls: Array<{ id: string; intent: string; property?: string; evidence: string }>;
};

const initialDevices = Object.values(runtimeLock.entities as Record<string, CurtainDevice>).filter((entity) => entity.family === "curtain");

export function useCurtainDevices() {
  const [devices, setDevices] = useState<CurtainDevice[]>(initialDevices);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await Promise.all(initialDevices.map(async (device) => {
        const response = await requestAction("state.query", { locale: "zh-CN", utterance: "同步" + (device.displayName || device.name) + "状态", parameters: { houseId: ${houseId}, deviceId: device.id } });
        const body = await response.json();
        if (!response.ok || !["success", "partial"].includes(String(body.status || ""))) throw new Error(body.userMessage || "窗帘状态同步失败。");
        const properties = body?.result?.properties;
        const propertyOnline = properties?.online;
        const online = typeof propertyOnline === "boolean" ? propertyOnline : body?.result?.entity?.online;
        return properties && typeof properties === "object" ? { ...device, state: { ...device.state, ...properties, ...(typeof online === "boolean" ? { online } : {}) } } : device;
      }));
      setDevices(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "窗帘状态同步失败。");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const updatePosition = useCallback((id: string, position: number) => setDevices((items) => items.map((device) => device.id === id ? { ...device, state: { ...device.state, position, targetPosition: position, runState: "stopped" } } : device)), []);
  return { devices, loading, error, refresh, updatePosition };
}
`;
}

export function switchDevicesHookSource(spec) {
  const houseId = JSON.stringify(String(spec?.scope?.homeIds?.[0] || ""));
  return `import { useCallback, useEffect, useState } from "react";
import runtimeLock from "../generated/runtime-lock.json";
import { requestAction } from "./request";

export type SwitchControl = { id: string; intent: string; property: string; channel: number; evidence: string };
export type SwitchDevice = {
  id: string;
  name: string;
  displayName?: string;
  roomName: string;
  family: "switch-relay";
  readOnly?: boolean;
  capabilityStatus?: string;
  state: Record<string, unknown>;
  controls: SwitchControl[];
};

const initialDevices = Object.values(runtimeLock.entities as unknown as Record<string, SwitchDevice>).filter((entity) => entity.family === "switch-relay");

export function useSwitchDevices() {
  const [devices, setDevices] = useState<SwitchDevice[]>(initialDevices);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await Promise.all(initialDevices.map(async (device) => {
        const response = await requestAction("state.query", { locale: "zh-CN", utterance: "同步" + (device.displayName || device.name) + "状态", parameters: { houseId: ${houseId}, deviceId: device.id } });
        const body = await response.json();
        if (!response.ok || !["success", "partial"].includes(String(body.status || ""))) throw new Error(body.userMessage || "开关状态同步失败。");
        const properties = body?.result?.properties;
        const propertyOnline = properties?.online;
        const online = typeof propertyOnline === "boolean" ? propertyOnline : body?.result?.entity?.online;
        return properties && typeof properties === "object" ? { ...device, state: { ...device.state, ...properties, ...(typeof online === "boolean" ? { online } : {}) } } : device;
      }));
      setDevices(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "开关状态同步失败。");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const updateProperty = useCallback((id: string, property: string, value: boolean) => setDevices((items) => items.map((device) => {
    if (device.id !== id) return device;
    const state = { ...device.state, [property]: value };
    if (property === "0-sp") {
      for (const control of device.controls) if (/^[1-6]-sp$/.test(control.property)) state[control.property] = value;
    } else if (/^[1-6]-sp$/.test(property)) {
      state["0-sp"] = device.controls.filter((control) => /^[1-6]-sp$/.test(control.property)).some((control) => Boolean(state[control.property]));
    }
    return { ...device, state };
  })), []);
  return { devices, loading, error, refresh, updateProperty };
}
`;
}

export function climateDevicesHookSource(spec) {
  const houseId = JSON.stringify(String(spec?.scope?.homeIds?.[0] || ""));
  return `import { useCallback, useEffect, useState } from "react";
import runtimeLock from "../generated/runtime-lock.json";
import { requestAction } from "./request";

export type ClimateControl = { id: string; intent: string; property: string; evidence: string };
export type ClimateDevice = { id: string; name: string; displayName?: string; roomName: string; family: "climate"; state: Record<string, unknown>; controls: ClimateControl[] };
const initialDevices = Object.values(runtimeLock.entities as unknown as Record<string, ClimateDevice>).filter((entity) => entity.family === "climate");

export function useClimateDevices() {
  const [devices, setDevices] = useState<ClimateDevice[]>(initialDevices);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const next = await Promise.all(initialDevices.map(async (device) => {
        const response = await requestAction("state.query", { locale: "zh-CN", utterance: "同步" + (device.displayName || device.name) + "状态", parameters: { houseId: ${houseId}, deviceId: device.id } });
        const body = await response.json();
        if (!response.ok || !["success", "partial"].includes(String(body.status || ""))) throw new Error(body.userMessage || "温控状态同步失败。");
        const properties = body?.result?.properties;
        return properties && typeof properties === "object" ? { ...device, state: { ...device.state, ...properties } } : device;
      }));
      setDevices(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "温控状态同步失败。"); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const updateProperty = useCallback((id: string, property: string, value: boolean | number) => setDevices((items) => items.map((device) => device.id === id ? { ...device, state: { ...device.state, [property]: value } } : device)), []);
  return { devices, loading, error, refresh, updateProperty };
}
`;
}

export function sensorEnvironmentHookSource(spec) {
  const houseId = JSON.stringify(String(spec?.scope?.homeIds?.[0] || ""));
  return `import { useCallback, useEffect, useState } from "react";
import runtimeLock from "../generated/runtime-lock.json";
import { requestAction } from "./request";

export type SensorEvent = { eventId?: string; sensorId?: string; deviceId?: string; name?: string; status?: string; valid?: boolean };
export type SensorDevice = {
  id: string;
  name: string;
  displayName?: string;
  roomName: string;
  family: "sensor";
  state: Record<string, unknown>;
  readingKeys: string[];
  controls: never[];
};
type RuntimeEntity = {
  id: string | number;
  name?: unknown;
  displayName?: unknown;
  roomName?: unknown;
  family?: string;
  state?: Record<string, unknown>;
};

const knownReadingKeys = ["currentTemperature", "humidity", "occupancyDetected", "motionDetected", "luminance", "environmentalBrightnessLevel", "batteryLevel"];
const initialDevices: SensorDevice[] = Object.values(runtimeLock.entities as Record<string, RuntimeEntity>)
  .filter((entity) => entity.family === "sensor")
  .map((entity) => {
    const state: Record<string, unknown> = { ...(entity.state || {}) };
    return {
      id: String(entity.id),
      name: String(entity.name),
      displayName: "displayName" in entity ? String(entity.displayName || "") : undefined,
      roomName: String(entity.roomName || ""),
      family: "sensor",
      state,
      readingKeys: knownReadingKeys.filter((key) => key in state),
      controls: [],
    };
  });
const initialEvents = (runtimeLock.sensorEvents || []) as SensorEvent[];
const eventsEnabled = runtimeLock.intents?.["sensor.event.list"]?.status === "proven";

export function useSensorEnvironment() {
  const [devices, setDevices] = useState<SensorDevice[]>(initialDevices);
  const [events, setEvents] = useState<SensorEvent[]>(initialEvents);
  const [loading, setLoading] = useState(true);
  const [stateError, setStateError] = useState("");
  const [eventError, setEventError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    setStateError("");
    setEventError("");
    try {
      const next = await Promise.all(initialDevices.map(async (device) => {
        const response = await requestAction("state.query", { locale: "zh-CN", utterance: "同步" + (device.displayName || device.name) + "当前读数", parameters: { houseId: ${houseId}, deviceId: device.id } });
        const body = await response.json();
        if (!response.ok || !["success", "partial"].includes(String(body.status || ""))) throw new Error(body.userMessage || "当前读数同步失败。");
        const properties = body?.result?.properties;
        if (!properties || typeof properties !== "object" || Array.isArray(properties)) return device;
        const entityOnline = body?.result?.entity?.online;
        const state = { ...properties, ...(typeof entityOnline === "boolean" && !("online" in properties) ? { online: entityOnline } : {}) };
        return { ...device, state };
      }));
      setDevices(next);
    } catch (cause) {
      setStateError(cause instanceof Error ? cause.message : "传感器状态同步失败。");
    }
    if (eventsEnabled) {
      try {
        const response = await requestAction("sensor.event.list", { locale: "zh-CN", utterance: "同步传感器事件定义", parameters: { houseId: ${houseId} } });
        const body = await response.json();
        if (!response.ok || body.status !== "success") throw new Error(body.userMessage || "事件定义同步失败。");
        const candidates = [body?.result?.data?.events, body?.result?.events, body?.result?.data];
        setEvents(candidates.find(Array.isArray) || []);
      } catch (cause) {
        setEventError(cause instanceof Error ? cause.message : "传感器事件定义同步失败。");
      }
    }
    setLoading(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { devices, events, loading, stateError, eventError, refresh };
}
`;
}
