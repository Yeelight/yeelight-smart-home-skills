# Device Control

Use this reference for home summary, entity lists, entity details, capability checks, state query, temporary light control, and scene execution.

## Fast Direct Control

For ordinary user goals such as "打开孩子屋吸顶灯", "把客厅主灯调到 60%", "执行晚安情景", or "启用主卧 9 点自动化", send one final semantic Runtime request. Do not first call `entity.list`, `entity.get`, `entity.capabilities`, room list, or device detail only to discover IDs.

Runtime maintains a short-lived topology cache and resolves targets from names, room qualifiers, IDs, and candidates. Give Runtime the user's target words:

- Device control/state:
  ```json
  {
    "intent": "light.power.set",
    "parameters": {
      "houseId": "known-or-selected-house-id",
      "roomName": "孩子屋",
      "deviceName": "吸顶灯",
      "on": true
    }
  }
  ```
- Scene execution:
  ```json
  {
    "intent": "scene.execute",
    "parameters": {
      "houseId": "known-or-selected-house-id",
      "sceneName": "晚安"
    }
  }
  ```
- When the user provides multiple target hints, pass them together instead of choosing one:
  ```json
  {
    "intent": "light.brightness.set",
    "targets": [
      {"entityType": "room", "name": "客厅"},
      {"entityType": "device", "name": "主灯"}
    ],
    "parameters": {"brightness": 60}
  }
  ```

Only ask the user after Runtime returns `clarification_required`. If Runtime returns candidates, ask the smallest disambiguation question from those candidates. Use `entity.list` when the user asks to browse inventory, compare devices, audit topology, or when Runtime explicitly asks for a read step after a complex payload rejection.

- Use `home.summary` for a user asking what homes are available.
- Use `entity.list` for mixed home-scoped entity inventory across areas, rooms, devices, groups, scenes, and automations.
- Use `entity.get` when the user names a specific entity and asks what it is.
- Use `device.list` when the user asks for device candidates in one home or a device-affecting plan needs a safer preflight list with room/gateway ownership evidence.
- Use `device.virtual_count.get` when the user asks how many virtual devices exist in the selected home or a capacity/diagnostic flow needs that count.
- Use `device.detail.get` for device metadata details when the user asks for device identity, placement, model, or configuration evidence.
- Use `device.attr.list` when the user asks for device attribute evidence before a diagnosis or persistent change.
- Use `sensor.list` when the user asks which sensors exist in the home.
- Use `sensor.event.list` when the user asks for sensor event definitions or sensor-trigger evidence.
- Use `device.energy.summary` when the user asks for device electricity or energy usage.
- Use `device.weather.get` when the user asks for weather context tied to a device.
- Use `meshgroup.detail.get` when the user asks for a Mesh group, its member devices, or group detail evidence.
- Use `node.sorted_device.list` when the user asks for devices under a known room, device, or home node with their saved order. Provide `resType` and `resId`; do not guess them from a display name without Runtime evidence.
- Use `entity.capabilities` before claiming a device, group, scene, or automation supports a property or action.
- Use product-level `thing.schema.*` intents only for product model questions; do not substitute them for `entity.capabilities` on installed devices.
- Use `product.pedia.search` for product consultation, manuals, FAQ candidates, SKU/material-code resources, and product attachments.
- Use `device.slot.create` when the user explicitly asks to add or reserve not-yet-installed lighting device positions in a home. This creates HouseMeta design slots through Runtime semantic execution; it is not device pairing, not network onboarding, and not evidence that the device is online. Product selection and quantity expansion belong in the Skill layer before the Runtime call.
- Use `thing.product.info.batch_get` for v2 product definitions when the user provides product ids.
- Use `thing.product.info.v3.batch_get` when the user provides product ids and a product definition version.
- Use `thing.product.list.v3` when the user asks for the versioned product list, not for installed home devices.
- Use `node.property_config.get` when the user asks for installed-node property configuration evidence for a known node id and node type.
- Use `state.query` for current device state. Pass `parameters.deviceId` when known, or `deviceName` plus room qualifiers when the user names the target.
- Use `entity.rename.batch` when the user explicitly asks to batch rename devices and scenes. Keep every item explicit and let Runtime resolve/validate targets; Runtime accepts device and scene resources, caps one request at 20 items, and verifies names with `entity.list`.
- Use `device.remove` only when the user explicitly asks to delete a device record from the home. This is R3 high impact: confirm in chat first, then call Runtime; Runtime verifies the device disappeared from `entity.list`.
- Use `device.unbind` only when the user explicitly asks to unbind a device from the current account/home. This is R3 high impact: confirm in chat first, then call Runtime. Runtime accepts only `clearMac` and `unbindRelDevices` as options and verifies the device disappeared from `entity.list`.
- Use light-specific intents for power, brightness, color temperature, and RGB color when the user asks for direct lighting control. Prefer `light.power.set`, `light.brightness.set`, `light.color_temperature.set`, and `light.color.set`.
- Use `scene.execute` for running an existing scene.
- Avoid `lighting.design.apply` for a large temporary action array when the same user goal can run an existing scene or a small set of direct `light.*` calls. If Runtime returns an execution-size or apply failure, prefer `scene.execute` or individual light-property intents instead of repeatedly retrying the same large apply payload.
- Never invent property names, ranges, device IDs, current states, or success.

## Direct Light Intent Shapes

Use these shapes for direct single-device control. In SkillRequest JSON, include `houseId` in `parameters` or `homeRef` when known; in traditional shell usage the CLI may also accept `--house-id`.

Power:
```json
{
  "intent": "light.power.set",
  "parameters": {
    "houseId": "known-or-selected-house-id",
    "roomName": "孩子屋",
    "deviceName": "吸顶灯",
    "power": true
  }
}
```

Brightness:
```json
{
  "intent": "light.brightness.set",
  "parameters": {
    "houseId": "known-or-selected-house-id",
    "roomName": "客厅",
    "deviceName": "主灯",
    "value": 60
  }
}
```

Color temperature:
```json
{
  "intent": "light.color_temperature.set",
  "parameters": {
    "houseId": "known-or-selected-house-id",
    "roomName": "孩子屋",
    "deviceName": "吸顶灯",
    "value": 3000
  }
}
```
