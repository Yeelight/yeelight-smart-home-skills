---
name: yeelight-pro-app-builder
description: Generate or regenerate a modular Yeelight smart-home application from one request and explicit choices using proven yeelight-home capabilities; not for direct control or diagnosis.
---

# Yeelight PRO App Builder

Generate a deterministic local smart-home application. Interpret the user's request before generation; do not add AI/chat behavior to the generated app.

The Agent interprets natural language into explicit choices, ThemeSpec v1 and ProductSpec v4. Deterministic scripts validate and compile that structure; they do not provide a general-purpose NLU engine.

## Core Contract

- Convert one natural-language request plus optional choices to ProductSpec v4 with a normalized ThemeSpec v1.
- Inspect only the Runtime capabilities needed by selected modules.
- Use read-only CLI calls and `--preview-only` probes. Preview probes must report `persistentWrites=false`.
- Generate only selected modules, device families, routes and dialogs.
- Treat `scene.launcher` as execution-only by default. Enable scene detail/create/edit/test/delete only when the user explicitly asks to maintain scenes.
- Treat `installer.maintenance` as a workspace shell. Explicitly select `gateway.overview`, `panel.manager`, or both; never add either infrastructure module implicitly.
- Browser controls call a loopback Bridge. The Bridge invokes `yeelight-home invoke --stdin` with argv.
- Never fall back to an all-in-one application when the request is unclear.
- Never expose builder configuration, CLI details, capability audits or validation pages inside the generated production app.
- Never place CSS, JavaScript, HTML, URLs, local font files or remote font references in ThemeSpec.

## Build Workflow

1. Run the read-only environment doctor. Yeelight PRO App Builder requires `yeelight-home 0.1.21` or newer:

```bash
node scripts/doctor.mjs --json --output-dir /absolute/output/path
```

2. Confirm the request contains a product scope, target form factor and desired functions. Ask only for missing decisions that materially change the app.
3. Build directly from the request:

```bash
node scripts/build-app.mjs \
  --request "只要客厅灯光控制，移动端，简洁明亮，蓝绿色。" \
  --title "我的客厅灯光" \
  --home-id 200171 \
  --region dev \
  --out /absolute/output/path
```

Before a live build, use report mode when device coverage or Runtime stability is uncertain. It performs ProductSpec compilation, scoped discovery, read/preview inspection and module availability evaluation, prints one JSON document, and never creates the `--out` directory:

```bash
node scripts/build-app.mjs \
  --request "生成一楼墙屏，包含灯光、窗帘、空调、情景和传感器。" \
  --home-id 200171 \
  --region dev \
  --capability-report
```

Generation is strict by default. If any requested module is unavailable, stop and present the report's exact reasons and these explicit choices to the user:

- `--skip-modules <module-id>` excludes confirmed unwanted modules before discovery and probes.
- `--allow-partial` omits only unavailable modules after inspection and records every omission in ProductSpec, CLI summary and generation manifest.
- `--mock-home reference-home` generates a deterministic mock-backed application; it never proves the live home can provide the same capabilities.

Do not choose partial or Mock automatically. Do not generate an empty app. When capturing a command through a shell pipeline, enable `set -o pipefail` or read the `build-app.mjs` process exit code directly; otherwise a downstream formatter can hide a failed build.

4. Validate the generated application:

```bash
node scripts/validate-app.mjs /absolute/output/path
```

5. Install and run the generated app:

```bash
npm ci --prefix /absolute/output/path
npm run build --prefix /absolute/output/path
npm run dev --prefix /absolute/output/path
```

Wait for `npm ci` to finish successfully before starting `npm run build`, then start the development server only after the build passes. Never run the install and build commands concurrently; the build can otherwise observe a partially populated workspace and report false missing-module errors.

For deterministic design and E2E work, generate against the Builder-owned comprehensive mock home while still exercising the real installed CLI:

```bash
node scripts/build-app.mjs \
  --request "只要客厅灯光控制，移动端，简洁明亮，蓝绿色。" \
  --room "客厅" \
  --mock-home comprehensive \
  --out /absolute/output/path

npm ci --prefix /absolute/output/path
npm run build --prefix /absolute/output/path
node scripts/run-mock-app.mjs --app /absolute/output/path --mock-home comprehensive --web-port 5190 --bridge-port 8790
```

The mock path injects only supported Runtime environment overrides and serves strict Yeelight API envelopes from loopback. Generated production source does not contain mock fixture data.
Use `--web-port auto --bridge-port auto` when fixed local ports are not required. Numeric ports are checked before Mock API or npm starts; a conflict fails with an alternative command and never terminates the process already using that port. SIGINT/SIGTERM only clean up the runner's own npm process group, Mock API and temporary Runtime directory.

Use `--mock-home reference-home-degraded` only to verify strict failure, explicit partial generation and read-only template closure against deterministic climate business errors and unavailable Scene detail. It is a versioned overlay on `reference-home`, still exercises the real CLI, and must never promote a capability to `write-proven` or replace ideal-fixture module E2E.
Before expanding a module, read `assets/mock-home/coverage-matrix.json`. A fixture entity does not prove its API contract, CLI capability or generated-app E2E.
Theme and responsive target coverage is tracked separately in `assets/themes/coverage-matrix.json`.

### Theme selection

Choose a built-in preset by name or ID in the request, or use explicit options. Run `node scripts/build-app.mjs --help` to inspect all 12 families and 24 production presets from the current catalog.

| Direction | Presets |
|---|---|
| Yeelight PRO / minimal | `pro-daylight`, `pro-graphite`, `pure-canvas`, `quiet-mist` |
| Residential / natural | `linen-home`, `amber-evening`, `forest-air`, `stone-garden` |
| Night / immersive | `moonlight-home`, `low-light-cinema`, `obsidian-focus`, `carbon-signal` |
| Command / wall | `command-day`, `command-night`, `wall-day`, `wall-night` |
| Installer / accessible | `installer-precision`, `commissioning-dark`, `contrast-clear`, `contrast-night` |
| Architectural / multi-protocol | `architect-gallery`, `architect-theatre`, `universal-home`, `unified-fabric` |

```bash
node scripts/build-app.mjs \
  --request "生成客厅灯光和情景控制，使用易来日光主题，跟随系统明暗。" \
  --modules room.lighting-control,scene.launcher \
  --theme-preset pro-daylight \
  --mode auto \
  --out /absolute/output/path
```

The command above generates scene shortcuts only. When the user explicitly asks to create, edit, test or delete scenes, record that decision and add `--scene-management`. Do not enable it for requests that only say “run”, “quick control”, “common scenes” or list scene names.

For a custom brand theme, inherit one validated preset and override only controlled semantic fields:

```json
{
  "schemaVersion": 1,
  "preset": "pro-daylight",
  "mode": "auto",
  "density": "comfortable",
  "colors": { "brand": "#087F8C", "accent": "#1BA8A0" },
  "typography": "system-modern",
  "shape": "balanced",
  "motion": "standard"
}
```

```bash
node scripts/build-app.mjs \
  --request "生成全屋空间、设备、情景和自动化管理。" \
  --theme-file assets/themes/examples/pro-daylight.theme.json \
  --out /absolute/output/path
```

Theme input precedence is deterministic: explicit CLI fields, then `--theme-file`, Agent structured choices, natural-language inference, and finally `pro-daylight`. Validation errors must be fixed at the reported field; do not bypass them by injecting style source. The generated app records only normalized theme data and content digests, never the local ThemeSpec path.

The legacy `--theme-pack` and `--palette` flags remain accepted only for deterministic migration. New applications should use `--theme-preset` or `--theme-file`; legacy use emits deprecation diagnostics in ProductSpec v4.

Run one production browser gate or the full formal slice suite. The aggregator runs sequentially, stops at the first failure and writes `validation-summary.json` under the selected evidence root:

```bash
node scripts/validate-slice.mjs lighting --evidence-dir /absolute/slice-evidence
node scripts/validate-slice.mjs --all --evidence-dir /absolute/all-slice-evidence
```

The underlying validators remain independently callable. They generate fresh applications through `build-app.mjs`, exercise the installed or workspace-built `yeelight-home` CLI against the strict mock API boundary, build the generated TypeScript projects, run the loopback Bridge, and test real browser workflows.

## Structured Choices

Explicit choices override natural-language inference:

- `--form-factor desktop|tablet|mobile|wall`
- `--navigation sidebar|adaptive-rail|bottom-tabs|touch-rail`
- `--density comfortable|compact|touch`
- `--modules <comma-separated-module-ids>`
- `--scene-management` (explicit opt-in for scene detail/create/edit/test/delete; execution-only is the default)
- `--capability-report` (report only; creates no application output)
- `--skip-modules <comma-separated-module-ids>`
- `--allow-partial` (explicit opt-in; strict failure remains the default)
- `--device-families <comma-separated-family-ids>`
- `--room <room-name>` (repeatable through comma-separated input)
- `--theme-file <absolute-theme-spec.json>`
- `--theme-preset <preset-id>`
- `--brand-color <#RRGGBB>`
- `--accent-color <#RRGGBB>`
- `--typography system-modern|system-readable|system-technical|system-compact`
- `--shape sharp|precise|balanced|soft`
- `--motion reduced|precise|standard|expressive`
- `--mode light|dark|auto`
- `--theme-pack <legacy-theme-id>` (deprecated compatibility input)
- `--palette <legacy-palette-id>` (deprecated compatibility input)

## Safety

- Default operations used during generation are read-only or preview-only.
- Do not run real cloud writes without explicit user confirmation.
- Do not place credentials, raw cloud hosts, headers or arbitrary CLI commands in generated browser code.
- Keep `access=single-user`, local Bridge and LAN-disabled defaults.
- Use product language such as “家庭系统” in generated UI; never display Runtime, CLI, Bridge, capability or audit terminology to app users.

Read [references/architecture.md](references/architecture.md) for the compiler flow and [references/module-contract.md](references/module-contract.md) before adding a module.
