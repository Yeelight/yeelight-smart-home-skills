export function controllerRegistrySource(selected) {
  const lighting = selected.includes("room.lighting-control");
  const curtain = selected.includes("device.curtain-control");
  const switches = selected.includes("device.switch-control");
  const climate = selected.includes("device.climate-control");
  const sensor = selected.includes("sensor.environment");
  const imports = [
    lighting && 'import { LightingController } from "./lighting";',
    curtain && 'import { CurtainController } from "./curtain";',
    switches && 'import { SwitchController } from "./switch";',
    climate && 'import { ClimateController } from "./climate";',
    sensor && 'import { SensorController } from "./sensor";',
  ].filter(Boolean).join("\n") + "\n";
  const branches = [
    lighting && '  if (device.family === "light") return <LightingController device={device} refreshDevice={refreshDevice} />;',
    curtain && '  if (device.family === "curtain") return <CurtainController device={device} refreshDevice={refreshDevice} />;',
    switches && '  if (["switch-relay", "wireless-switch"].includes(device.family)) return <SwitchController device={device} refreshDevice={refreshDevice} />;',
    climate && '  if (device.family === "climate") return <ClimateController device={device} refreshDevice={refreshDevice} />;',
    sensor && '  if (device.family === "sensor") return <SensorController device={device} refreshDevice={refreshDevice} />;',
  ].filter(Boolean).join("\n") + "\n";
  return `${imports}import type { ManagedDevice, ManagedDeviceDetail } from "../../../runtime/use-home-model";
import type { RefreshDevice } from "./shared";

export function DeviceControllerHost({ device, refreshDevice }: { device: ManagedDevice | ManagedDeviceDetail; refreshDevice: RefreshDevice }) {
${branches}  return null;
}
`;
}
