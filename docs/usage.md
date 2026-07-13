# Usage

[简体中文](usage.zh-CN.md)

## Yeelight Smart Home

Use the direct-control Skill for smart-home queries, control, diagnostics, organization, design, and product knowledge.

Examples:

```text
Use yeelight-smart-home to show every offline device and group the results by room.
```

```text
Use yeelight-smart-home to set the living-room lights to a warm 40% brightness for reading.
```

```text
Use yeelight-smart-home to diagnose why the hallway automation did not run today.
```

```text
Use yeelight-smart-home to propose a whole-home evening lighting design. Preview persistent changes before applying them.
```

The Skill converts the request into one structured Runtime invocation. When the Runtime returns `clarification_required`, answer the smallest question it provides. Destructive, permission-sensitive, unlinking, transfer, overwrite, or clear-all operations require explicit agreement.

## Yeelight PRO App Builder

Use Builder when you need a focused application rather than an agent conversation. State the rooms, device types, target screen, desired functions, and visual direction.

```text
Use yeelight-pro-app-builder to generate a compact wall-panel app for first-floor lights, curtains, climate, scenes, and energy sensors. Use a dark high-contrast theme and large touch targets.
```

Builder generates only selected modules and proven Runtime capabilities. It does not add configuration, audit, or CLI pages to the production application.

After generation:

```sh
node scripts/validate-app.mjs /absolute/path/to/generated-app
npm install --prefix /absolute/path/to/generated-app
npm run build --prefix /absolute/path/to/generated-app
npm run dev --prefix /absolute/path/to/generated-app
```

Run installation and build sequentially so the build does not observe a partially installed workspace.

## Runtime Commands

```sh
yeelight-home auth status --json
yeelight-home doctor --json --online
yeelight-home home list --json
```

The Runtime owns credentials, policy enforcement, device access, and structured write confirmation. The Skills should not bypass it or fall back to raw cloud APIs.

## Troubleshooting

- `runtime_missing`: install `yeelight-home` or set `YEELIGHT_HOME_BIN` to its absolute path.
- `auth_required`: run `yeelight-home auth login --qr` in your own terminal.
- `clarification_required`: answer the returned question; do not guess internal IDs.
- `blocked` or `not_supported`: follow the Runtime-provided safe alternative.
- Builder validation failure: keep the generated app and validation output, fix the reported contract, then rerun `validate-app.mjs` before starting the dev server.
