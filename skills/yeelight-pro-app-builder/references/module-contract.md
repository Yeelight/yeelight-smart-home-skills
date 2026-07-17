# Module contract

Every production module must define:

- semantic product purpose;
- supported form factors;
- scope and entity selectors;
- required and optional Runtime intents;
- route and navigation entry;
- normalized model;
- components and dialogs;
- loading, empty, offline, unsupported and error states;
- contract, browser, live-read and applicable preview/write tests.

The compiler copies only selected modules. Do not add a branch to a universal page switch.

Module presence and management depth are separate contracts. A selected `scene.launcher` is an execution surface unless ProductSpec records `options.management=true`. `installer.maintenance` is compositional presentation and must not add `gateway.overview` or `panel.manager`; the ProductSpec must select the intended infrastructure modules explicitly.

## Completion rule

A module is not implemented when its page merely renders. Its primary workflow must be runnable with proven capabilities or end in a clear unsupported state. E2E may not skip every unavailable primary action and still pass.

For multi-channel switches and relays, capability is instance- and property-specific. Each visible circuit requires its own successful `device.property.set --preview-only` proof, and writes must preserve the API property name and boolean body exactly. A scene switch or button without write evidence stays visibly read-only; device family and display name never imply writability.

For air-conditioner climate devices, visible controls use Runtime public property names and require independent instance previews: `airConditionerPower`, `airConditionerTargetTemperature`, `airConditionerMode`, and `airConditionerFanSpeed`. The API adapter maps these to `acp`, `actt`, `acm`, and `acf`. Target temperature is an integer from 16 through 32; modes are cooling `1`, fan `4`, and heating `8`; fan speeds are high `1`, medium `2`, and low `4`. `airConditionerCurrentTemperature` / `acct` and `airConditionerOnline` / `aco` are read-only.
