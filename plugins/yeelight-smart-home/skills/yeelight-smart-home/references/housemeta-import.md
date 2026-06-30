# HouseMeta Import

Use this reference for `lighting.design.import` and `device.slot.create` payloads. These intents materialize a HouseMeta design through `/v1/meta/import`.

## Runtime Boundary

- The Skill should generate standard HouseMeta with long keys.
- Runtime may do small deterministic corrections: reference validation, compact short-key expansion, small defaults, product backfill from explicit `materialCode`, params compaction, submit, status wait, and verification.
- Runtime must not be relied on for subjective product choice, grouping strategy, scene design, automation intent, or mood interpretation.
- Do not send `quantity`, `autoGroup`, fuzzy slots, old natural `rooms/items/groups`, `clearAll`, `overwrite`, `future-*` ids, or cloud ids in HouseMeta import action rows.

## Top-Level Shape

```json
{
  "houseId": "optional when selected elsewhere",
  "tempId": "hm1",
  "name": "家庭或设计名",
  "version": 2,
  "gateway": {},
  "areaList": [],
  "sceneList": [],
  "automationList": []
}
```

`gateway`:

```json
{
  "tempId": "gw1",
  "name": "默认网关",
  "pid": 17000001,
  "gatewayDeviceId": "optional existing gateway id",
  "roomList": []
}
```

`gateway.roomList[]`:

```json
{
  "tempId": "rm1",
  "name": "客厅",
  "icon": "room_1",
  "deviceList": [],
  "groupList": []
}
```

## Design Slots

```json
{
  "tempId": "dv1",
  "name": "黑色格栅灯1",
  "pid": 198666,
  "roomTempId": "rm1",
  "extraMeta": {
    "materialCode": "1-000002044",
    "productName": "已选产品名",
    "notes": "选择原因或安装假设"
  }
}
```

- Expand quantities into explicit `deviceList[]` rows.
- Use imported slot tempIds for future groups/scenes/automations.
- Design slots are not paired online devices and are not evidence that a device is controllable.
- Runtime may move explicit product fields such as `materialCode`, `productName`, `productSku`, `productSpu`, `modelNo`, `productSeries`, `productStatusName`, and `notes` into `extraMeta`. The Skill should still supply them when useful.

## Groups

```json
{
  "tempId": "gp1",
  "name": "客厅格栅灯组",
  "componentId": 4,
  "deviceTempIdList": ["dv1", "dv2"]
}
```

- Author groups in the Skill layer as explicit room-local `groupList[]` rows.
- Use selected product evidence to choose `componentId`.
- Only group same-room compatible slots unless the user explicitly asks for cross-room or whole-home control.
- Create same-type groups only for quantity >= 2; do not create one-member groups.

## Areas

```json
{
  "tempId": "ar1",
  "name": "公共区",
  "icon": "area_1",
  "roomTempIdList": ["rm1", "rm2"]
}
```

## Short Keys

Runtime accepts compact keys for compatibility, but new SkillRequest JSON should prefer long keys.

- Core: `tid=tempId`, `n=name`, `rl=roomList`, `dl=deviceList`, `gl=groupList`, `al=areaList`, `sl=sceneList`, `atl=automationList`.
- References: `rtids=roomTempIdList`, `dtids=deviceTempIdList`, `cid=componentId`.
- Actions: `as=actions`, `ds=details`, `tpid=typeId`, `rn=resName`, `ap=params`, `rk=rank`.
- Automation: `st=startTime`, `et=endTime`, `rt=repeatType`, `rv=repeatValue`, `ps=params`, `tp=type`, `cs=conditions`, `c=clock`.
- Light params: `s=set`, `i=index`, `v=value`.

## Full Example

For a multi-room example with groups, scenes, and automations, load `assets/examples/housemeta-full-home-lighting-design.json`.
