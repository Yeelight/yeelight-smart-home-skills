# Schema-driven architecture

The builder compiles a product rather than configuring a universal dashboard:

```text
request + choices -> ProductSpec -> scoped Runtime discovery -> preview-only capability snapshot -> selected module graph -> generated app
```

Theme compilation resolves structural pack, palette, mode and density from JSON assets into semantic CSS tokens. Target compilation binds desktop to sidebar, tablet to adaptive rail, mobile to bottom tabs and wall displays to a touch rail. Invalid packs, palettes, densities or incompatible target/navigation pairs fail during ProductSpec compilation.

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
