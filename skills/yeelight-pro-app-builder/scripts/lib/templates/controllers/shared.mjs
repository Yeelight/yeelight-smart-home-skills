export function controllerSharedSource(spec) {
  return `import type { ManagedDevice, ManagedDeviceDetail } from "../../../runtime/use-home-model";
import { requestAction } from "../../../runtime/request";

export type ControllerDevice = ManagedDevice | ManagedDeviceDetail;
export type RefreshDevice = (id: string, statePatch?: Record<string, unknown>) => Promise<ManagedDeviceDetail | undefined>;

export function deviceProperties(device: ControllerDevice) {
  return "properties" in device && device.properties ? device.properties : device.state || {};
}

export function controllerMode(device: ControllerDevice) {
  if (!device.online) return "offline";
  if (device.access === "version-mismatch") return "version-mismatch";
  if (device.access === "read-only" || device.readOnly) return "readonly";
  return "write";
}

export function hasControl(device: ControllerDevice, intent: string, property?: string) {
  return device.controls.some((control) => control.intent === intent && control.evidence === "preview-only" && (!property || control.property === property));
}

export async function writeWithReadback({ device, intent, parameters, property, expected, refreshDevice }: { device: ControllerDevice; intent: string; parameters: Record<string, unknown>; property: string; expected: unknown; refreshDevice: RefreshDevice }) {
  const response = await requestAction(intent, { locale: "zh-CN", utterance: "控制家庭设备", parameters: { houseId: "${spec.scope.homeIds[0] || ""}", deviceId: device.id, ...parameters, confirmed: true } });
  const body = await response.json();
  if (!response.ok || !["success", "partial"].includes(String(body.status || ""))) throw new Error(safeMessage(body.userMessage));
  const verified = body?.result?.verified === true && body?.result?.verifiedValue === expected;
  const refreshed = await refreshDevice(device.id, verified ? { [property]: body.result.verifiedValue } : {});
  if (!refreshed) throw new Error("操作已提交，但暂时无法读取最新状态。已保留原有显示，请重新同步。");
  const actual = deviceProperties(refreshed)[property];
  if (actual !== expected) throw new Error("设备状态回读不一致，已恢复最近一次可信状态。请重新同步后再试。");
  return refreshed;
}

export function terminalMessage(mode: string) {
  if (mode === "offline") return "设备当前离线，恢复连接后才能控制。";
  if (mode === "version-mismatch") return "当前本地运行时版本尚未证明此设备的控制能力。";
  if (mode === "readonly") return "当前设备仅提供状态读取，不显示未经证明的控制。";
  return "";
}

function safeMessage(value: unknown) {
  const message = String(value || "");
  if (/write verification mismatch|未通过回读确认|回读不一致/i.test(message)) return "设备状态回读不一致，已恢复最近一次可信状态。";
  if (/家庭连接响应超时/.test(message)) return message;
  return /家庭连接不可用|invoke|endpoint|http|bridge|cli|token|operation/i.test(message) ? "设备操作没有完成，原有状态未改变。请稍后重试。" : message || "设备操作没有完成，原有状态未改变。";
}
`;
}
