export function sensorControllerSource() {
  return `import { Activity, AlertCircle, BatteryMedium, CloudSun, DoorOpen, Droplets, Eye, Gauge, ShieldAlert, Sun, Thermometer } from "lucide-react";
import { controllerMode, deviceProperties, type ControllerDevice, type RefreshDevice } from "./shared";

const readings = [
  ["currentTemperature", "温度", "°C", Thermometer], ["humidity", "湿度", "%", Droplets], ["occupancyDetected", "人体", "", Eye], ["occupancy", "人体", "", Eye], ["motionDetected", "移动", "", Eye], ["luminance", "照度", " lx", Sun], ["batteryLevel", "电量", "%", BatteryMedium], ["open", "门窗", "", DoorOpen], ["water", "水浸", "", Droplets], ["smoke", "烟雾", "", ShieldAlert], ["pm25", "PM2.5", "", CloudSun], ["co2", "CO₂", " ppm", Gauge], ["voc", "VOC", "", Activity],
] as const;
export function SensorController({ device }: { device: ControllerDevice; refreshDevice: RefreshDevice }) {
  const properties = deviceProperties(device); const mode = controllerMode(device); const visible = readings.filter(([property]) => Object.hasOwn(properties, property) && !(property === "occupancy" && Object.hasOwn(properties, "occupancyDetected")));
  const format = (property: string, value: unknown, unit: string) => typeof value === "boolean" ? (["occupancy", "occupancyDetected"].includes(property) ? value ? "有人" : "无人" : property === "motionDetected" ? value ? "检测到移动" : "无移动" : value ? "异常" : "正常") : String(value ?? "-") + unit;
  return <section className="device-controller sensor-controller" aria-labelledby="sensor-controller-title"><header className="controller-heading"><span className="controller-icon active"><Activity size={22} /></span><div><small>传感器</small><h3 id="sensor-controller-title">当前环境与安全状态</h3></div></header>{mode === "offline" && <p className="controller-terminal" role="status"><AlertCircle size={17} />设备当前离线，以下为最近一次可信读数。</p>}
    <div className="sensor-reading-grid">{visible.map(([property, label, unit, Icon]) => { const value = properties[property]; const alert = ["open", "water", "smoke"].includes(property) && value === true; return <div className={alert ? "sensor-reading alert" : "sensor-reading"} key={property}><Icon size={20} /><span>{label}</span><strong>{format(property, value, unit)}</strong></div>; })}</div>
    {!visible.length && <p className="controller-terminal"><AlertCircle size={17} />Runtime 未返回可识别的当前读数。</p>}
  </section>;
}
`;
}
