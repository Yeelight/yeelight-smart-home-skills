# Schema-driven architecture

The builder compiles a product rather than configuring a universal dashboard:

```text
request + choices + optional ThemeSpec -> ProductSpec v4 -> scoped Runtime discovery -> preview-only capability snapshot -> selected module graph -> generated app
```

The planning boundary is shared by all generation paths: `prepareBuild` produces the requested ProductSpec, inspection snapshot and one module availability report; `resolveEffectiveSpec` either preserves strict failure or applies explicit skip/partial choices; only then may the compiler receive an effective ProductSpec and a projected snapshot. Probe diagnostics remain generation-time data and are removed before `runtime.lock.json` and browser model persistence.

`--capability-report` stops after planning and emits one JSON document without creating output. `--skip-modules` is applied before discovery. `--allow-partial` is applied after inspection and must keep ProductSpec diagnostics, CLI summary and generation manifest omissions identical. Missing credentials, invalid ProductSpec, unknown rooms and other environment/schema failures are never converted into partial success.

The Builder-owned `reference-home-degraded` scenario is a schema-validated overlay on `reference-home`. Its base manifest and behavior each have a verified SHA-256; persistent failures match only allowlisted method/API-path/object combinations, and device overlays may only change approved state fields or remove declared optional properties. Degraded evidence proves failure handling and source closure only, never ideal write capability.

`run-mock-app.mjs` reserves both loopback ports before starting Mock API or npm. `auto` reservations are held together so Web and Bridge cannot select the same port. The runner releases reservations immediately before spawn, creates a dedicated npm process group, and on SIGINT/SIGTERM cleans up only that owned group, the Mock server and its temporary Runtime directory. It does not inspect or terminate external port owners.

Theme compilation validates ThemeSpec v1, resolves one of 24 presets under 12 structural families, and compiles controlled color, typography, density, shape, motion and mode dimensions into semantic CSS tokens. A ThemeSpec inherits a built-in structural preset and cannot supply layout recipes, CSS, code, URLs or fonts. Target compilation binds desktop to sidebar, tablet to adaptive rail, mobile to bottom tabs and wall displays to a touch rail. Invalid presets, dimensions or incompatible target/navigation pairs fail before Runtime discovery.

All public compiler entry points normalize ProductSpec first. ProductSpec v4 is the only generated format; ProductSpec v3 remains an audited input-only compatibility contract whose pack, palette and target density migrate deterministically through `legacy-aliases.json`. Theme input precedence is CLI fields, local ThemeSpec file, Agent choices, deterministic request inference, then default.

The theme catalog is the single source of truth:

- `families.json` defines fixed semantic surface recipes;
- `presets.json` defines the 24 user-facing themes and complete defaults;
- `typography.json`, `densities.json`, `shapes.json`, `motions.json` and `targets.json` define controlled dimensions;
- `coverage-matrix.json` records the 24 preset, 12 family and target verification status and must not claim a preset before real generated-app evidence passes;
- `packs.json`, `palettes.json` and `legacy-aliases.json` are input-only compatibility sources; new generation uses preset IDs or ThemeSpec files.

Theme and module selection remain generation-time concerns. Generated applications expose only runtime smart-home pages and controls; they never add a Theme Builder, template settings, CLI/Bridge internals, audit or validation page.

Module options preserve user intent independently from capability availability. `scene.launcher` compiles only list/execute by default; `options.management=true` is emitted only from the explicit `--scene-management` choice and then permits proven detail/create/update/test/delete operations. Capability presence alone must never widen a quick launcher into an editor. `installer.maintenance` never injects gateway or panel modules; it renders only the explicitly selected infrastructure models and requires at least one of `gateway.overview` or `panel.manager`.

Both public CLI entry points implement `--help` from the catalog source of truth. Legacy pack/palette flags are visibly deprecated, migrate through the same ThemeSpec pipeline and emit diagnostics; they do not form a second compiler path.

Generation-time AI interpretation belongs to the Skill caller. Generated applications are deterministic and contain no model runtime.

## Capability precedence

1. Successful instance `--preview-only` evidence.
2. Live instance detail/state/schema evidence.
3. Installed CLI intent schema and explain output.
4. Bundled fallback metadata.
5. Unsupported state.

A module cannot render a write control from family names or decorative defaults. A successful preview must contain `dryRun=true`, `persistentWrites=false`, and the expected `planned.intent`.

## Runtime boundary

Browser code calls only the loopback Bridge. The Bridge allowlists intents from `runtime.lock.json` and starts `yeelight-home` with argv `['invoke', '--stdin']`. It never enables a shell or embeds credentials.
