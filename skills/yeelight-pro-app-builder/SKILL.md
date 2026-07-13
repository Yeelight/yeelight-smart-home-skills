---
name: yeelight-pro-app-builder
description: Generate a unique modular Yeelight smart-home application from one request, structured choices, and proven yeelight-home CLI capabilities.
---

# Yeelight PRO App Builder

Generate a deterministic local smart-home application. Interpret the user's request before generation; do not add AI/chat behavior to the generated app.

## Core Contract

- Convert one natural-language request plus optional choices to ProductSpec v3.
- Inspect only the Runtime capabilities needed by selected modules.
- Use read-only CLI calls and `--preview-only` probes. Preview probes must report `persistentWrites=false`.
- Generate only selected modules, device families, routes and dialogs.
- Browser controls call a loopback Bridge. The Bridge invokes `yeelight-home invoke --stdin` with argv.
- Never fall back to an all-in-one application when the request is unclear.
- Never expose builder configuration, CLI details, capability audits or validation pages inside the generated production app.

## Build Workflow

1. Confirm the request contains a product scope, target form factor and desired functions. Ask only for missing decisions that materially change the app.
2. Build directly from the request:

```bash
node scripts/build-app.mjs \
  --request "只要客厅灯光控制，移动端，简洁明亮，蓝绿色。" \
  --title "我的客厅灯光" \
  --home-id 200171 \
  --region dev \
  --out /absolute/output/path
```

3. Validate the generated application:

```bash
node scripts/validate-app.mjs /absolute/output/path
```

4. Install and run the generated app:

```bash
npm install --prefix /absolute/output/path
npm run build --prefix /absolute/output/path
npm run dev --prefix /absolute/output/path
```

Wait for `npm install` to finish successfully before starting `npm run build`, then start the development server only after the build passes. Never run the install and build commands concurrently; the build can otherwise observe a partially populated workspace and report false missing-module errors.

For deterministic design and E2E work, generate against the Builder-owned comprehensive mock home while still exercising the real installed CLI:

```bash
node scripts/build-app.mjs \
  --request "只要客厅灯光控制，移动端，简洁明亮，蓝绿色。" \
  --room "客厅" \
  --mock-home comprehensive \
  --out /absolute/output/path

npm install --prefix /absolute/output/path
npm run build --prefix /absolute/output/path
node scripts/run-mock-app.mjs --app /absolute/output/path --mock-home comprehensive
```

The mock path injects only supported Runtime environment overrides and serves strict Yeelight API envelopes from loopback. Generated production source does not contain mock fixture data.
Before expanding a module, read `assets/mock-home/coverage-matrix.json`. A fixture entity does not prove its API contract, CLI capability or generated-app E2E.
Theme and responsive target coverage is tracked separately in `assets/themes/coverage-matrix.json`.

Run the production browser gates for the completed vertical slices before changing shared compiler or theme code:

```bash
node scripts/validate-lighting-slice.mjs --evidence-dir /absolute/lighting-evidence
node scripts/validate-space-slice.mjs --evidence-dir /absolute/space-evidence
node scripts/validate-curtain-slice.mjs --evidence-dir /absolute/curtain-evidence
node scripts/validate-switch-slice.mjs --evidence-dir /absolute/switch-evidence
node scripts/validate-climate-slice.mjs --evidence-dir /absolute/climate-evidence
node scripts/validate-sensor-slice.mjs --evidence-dir /absolute/sensor-evidence
node scripts/validate-scene-slice.mjs --evidence-dir /absolute/scene-evidence
node scripts/validate-automation-slice.mjs --evidence-dir /absolute/automation-evidence
node scripts/validate-group-slice.mjs --evidence-dir /absolute/group-evidence
node scripts/validate-gateway-slice.mjs --evidence-dir /absolute/gateway-evidence
node scripts/validate-panel-slice.mjs --evidence-dir /absolute/panel-evidence
node scripts/validate-management-suite.mjs --evidence-dir /absolute/management-evidence
node scripts/validate-theme-target-matrix.mjs --evidence-dir /absolute/theme-target-evidence
```

These gates generate fresh applications through `build-app.mjs`, exercise the installed or workspace-built `yeelight-home` CLI against the strict mock API boundary, build the generated TypeScript projects, run the loopback Bridge, and test real browser workflows. The Theme/Target gate additionally proves four structural themes, palettes, density packs, adaptive navigation contracts, dark mode contrast, visible keyboard focus, reduced motion and overflow-free target layouts.

## Structured Choices

Explicit choices override natural-language inference:

- `--form-factor desktop|tablet|mobile|wall`
- `--navigation sidebar|adaptive-rail|bottom-tabs|touch-rail`
- `--density comfortable|compact|touch`
- `--modules <comma-separated-module-ids>`
- `--device-families <comma-separated-family-ids>`
- `--room <room-name>` (repeatable through comma-separated input)
- `--theme-pack <theme-id>`
- `--palette <palette-id>`
- `--mode light|dark|auto`

## Safety

- Default operations used during generation are read-only or preview-only.
- Do not run real cloud writes without explicit user confirmation.
- Do not place credentials, raw cloud hosts, headers or arbitrary CLI commands in generated browser code.
- Keep `access=single-user`, local Bridge and LAN-disabled defaults.

Read [references/architecture.md](references/architecture.md) for the compiler flow and [references/module-contract.md](references/module-contract.md) before adding a module.
