---
name: yeelight-cinema-director
description: Direct a local private cinema by pairing a selected film and soundtrack with browser audio analysis, lyrics-aware choreography, and explicitly selected Yeelight lights.
---

# Yeelight Cinema Director

## When to use

Use this Skill when a user asks for a film-themed light show, soundtrack
visualisation, or a private screening with Yeelight lights. It is a local,
single-user experience; it never starts a public server, performs a cloud
login, or asks the user to run a shell command.

## Host workflow

The AI host owns service lifecycle. Execute the wrapper itself, parse its single
JSON-line response, reuse only a healthy instance with the requested mode and
Runtime context, and open the returned `openUrl` with the host browser tool.
Never tell the user to run a command, paste `localhost`, choose a port, or edit
an environment variable. The following are host-internal actions, not user
instructions:

```sh
# mock preview (the default for "预览/模拟/先看看")
sh scripts/invoke.sh start
# explicit live preflight (only after the user names a protected context)
sh scripts/invoke.sh start --mode live --profile <profile> --region <cn|sg|us|eu> --house-id <house-id>
# prefer the household gateway when protected Runtime metadata provides it
sh scripts/invoke.sh start --mode live --profile <profile> --region <cn|sg|us|eu> --house-id <house-id> --control-mode local-preferred --gateway-ip <private-gateway-ip>
```

The wrapper emits one JSON line with `status`, `serviceStatus`, `mode`,
`openUrl`, and `healthUrl`. PowerShell hosts use `scripts/invoke.ps1` with the
same actions. If a running service has a different mode or live context, the
host runs `stop` and then the requested `start`; it does not silently reuse the
wrong instance. `YEELIGHT_CINEMA_MODE=live` and the active/default profile are
never enough to enable live mode.

Classify natural-language requests before starting:

1. **Mock preview**: requests such as “预览、模拟、先看看效果” use the default
   mock start. It never calls the Yeelight Runtime and may be opened
   immediately.
2. **Live preflight**: requests such as “真实、实体、EU 家庭” require an
   explicit profile, region, and house selected by the host from protected
   local Runtime metadata. The host must verify the requested region/profile,
   discover the complete device list, and show the user the exact candidate
   names, room, count, online/capability evidence, and read-only pre-state.
3. **Live execution**: never begin a physical write from an ambiguous request.
   Present the exact target set and recovery plan, then require the user to
   confirm the scoped test in the conversation. After the exact confirmation,
   the host uses the internal host-validation wrapper to prepare and consume a
   one-time grant. The page proof alone cannot prepare or run a physical test.
   A missing, stale, duplicated, offline, or capability-unknown target is a
   hard stop.

The host must keep the returned URL and service state in its own tool context;
the user only interacts with the opened page. `status` and `stop` are host
actions for health/recovery, not commands to copy into chat.

The first page runs in deterministic mock mode, so catalog, audio, lighting,
stop, and error states are safe to explore without hardware. A live run is
opt-in and fails closed unless the installed `yeelight-home` Runtime passes a
read-only preflight with an explicit profile/region/house. The only production
path is:

```text
browser -> loopback service -> semantic Runtime request -> yeelight-home invoke --stdin
```

The browser does not receive Runtime identities, credentials, request payloads,
headers, house/profile/region values, or artwork URLs. A session receives
opaque display handles for the user's current device selection. Handles are
bound to one immutable target snapshot and cannot be reused after stop,
replacement, timeout, or service restart.

## Directing a screening

1. Search for a film and choose an official poster and exactly one soundtrack.
   YouTube results are optional audio sources, not a second soundtrack; the
   selected catalog track is enough to prepare.
2. Select one or more discovered lights. Every selected light is assigned once
   to `Accent` or `Ambient`; those names describe musical roles, not bulb
   counts. A single light still receives the complete composite track.
3. Open at most one permitted YouTube candidate in a separate tab, or choose local audio.
   When sharing a tab, use the browser's native audio-share picker; the page
   cannot choose a tab on the user's behalf.
4. Prepare the console to capture a read-only target snapshot, then start it. In
   live mode, Prepare remains read-only before host validation; Start stays blocked
   until the bounded physical validation succeeds. The console shows live spectrum, conservative lyric cues, target
   roles, dispatch acknowledgements, and per-target results.
5. Pause, replace, clear, or stop at any time. Stop invalidates the generation
   first, fades the frozen target snapshot, briefly powers it off, restores the
   recorded live pre-state, and reads back each target. A partial, timed-out,
   or restore-mismatched result is reported as `uncertain`.

The browser sends only one live frame request at a time. A `busy` or cadence
skip means no new physical write was accepted and does not create a recovery
queue. Every live frame covers the complete frozen selected set, regardless of
whether the user selected one, four, eighteen, or another supported number of
lights. Runtime writes use a bounded pool of eight workers, so a large home is
parallel without creating an unbounded process burst. The recovery journal is
persisted once for the complete frame before any worker writes; a fatal error or
cancellation stops new work and drains already-started workers before Stop or
restore begins. Live Stop queries the frozen target set before writing: only
targets with in-session write evidence and a known non-pre-state are
faded/off/restored, while unchanged or conflicting targets remain untouched
and recoverable.

A live `partial` or `uncertain` result is recorded and the next frame continues
when every failed row is retryable: either an exact target-bound verification
mismatch or a Runtime response explicitly marked `safeToRetry`. This also
applies when every selected light in the frame fails, so a flaky light or a
short-lived backend issue cannot strand the remaining frame loop. The page
labels the failure class, and affected targets remain pending in the screening
journal until Stop verifies their pre-state. Consecutive all-failed frames have
a bounded 300-frame grace budget (about 3 minutes at the default cadence); when
it is exhausted, playback stops and keeps the touched scope recoverable.
Explicit Runtime timeout, unavailable, process-exit, or malformed-response
failures are recorded as failed rows and continue with the next frame within
that budget. They may represent a write whose result is unknown, so they never
claim physical verification and Stop/readback remains authoritative. A
cancellation, journal/recovery, validation, session, or unknown/unbound failure
remains terminal. The current POST is never replayed. A browser request with no
HTTP response is treated as a lost connection: the page waits and sends the
next frame so a completed server-side tick does not strand the session. Parsed
HTTP errors remain terminal.

Flow receipts mean that a semantic request was acknowledged. They do not claim
that a physical light has changed. `lighting.design.apply` is reserved for
low-frequency initialisation and termination because Runtime applies and reads
back its attributes serially. High-frequency frames use a capability-gated
single-target Flow call or a bounded eight-worker compatibility pool over the
complete selected set.

When protected Runtime metadata includes a household gateway, pass
`controlMode=local-preferred` with either `gatewayIp` or a validated
`lanEndpoint`. The service strips ambient LAN settings, then supplies only the
explicit context to the Runtime child. `local-preferred` lets `yeelight-home`
fall back according to its own policy; `local-only` is available when cloud
fallback is not acceptable. LAN endpoints must be local/private or link-local
HTTP(S) `/mcp` URLs without credentials, queries, or fragments. The browser
never selects or receives this endpoint.

## Boundaries

- The service listens only on `127.0.0.1`, rejects foreign Host/Origin and
  cross-site POSTs, uses a short-lived page proof, and returns no CORS grant.
- Requests are JSON with bounded size and closed fields/enums. User text is
  rendered as text, not executable markup. The parent page has a fixed local
  script policy; YouTube is limited to a validated iframe or external tab.
- Artwork is fetched only from the server's signed opaque handle and exact
  HTTPS host allowlist. Redirects, private DNS, oversized responses, and raw
  upstream errors are rejected.
- No QR login, token profile, raw URL, raw header, MCP session, or arbitrary
  Runtime intent is part of this Skill. A YouTube Data API key is optional and
  remains process-local. Without a key, the service uses a fixed server-side
  YouTube Web JSON search fallback; it never scrapes HTML or sends browser
  cookies/login state. This fallback is an undocumented public web contract and
  may return no candidates when YouTube changes or blocks it; local audio remains
  the reliable fallback.
- The Skill does not call OpenAI, Anthropic, Gemini, or the host model from the
  browser. AI capability comes from the host AI reading this Skill, classifying
  the user's natural language, running the local wrapper, opening the page, and
  presenting Runtime results. The page itself uses browser `AudioContext`,
  fixed catalog adapters, deterministic hue/lyric rules, and loopback HTTP
  only. Deterministic catalog fixtures exist only in tests and are never
  loaded by the production launcher.
- Live context is host-owned and explicit: `profile`, `region`, `house-id`, and
  optional local gateway fields are passed only to the local Runtime process.
  They are never accepted from browser JSON, returned as page data, or placed
  in logs. Live startup rejects `dev`, missing context, ambient API-base
  overrides, and gateway endpoints that are not local/private `/mcp` URLs.
- The initial defensive limit is 160 selected lights per screening. It is a
  resource guard, not a topology or room assumption; 161 is rejected before
  any Runtime call. Every frame still covers all selected lights under this
  limit.

## Real-light validation gate

The first physical run is a separate, bounded verification rather than an
ordinary high-frequency screening. The host must:

1. Run read-only `auth status`, `home list`, `entity.list`, and the dedicated
   exact-target `state.batch.query` preflight through the protected Runtime
   context. Use a single-target state read only for later readback/recovery;
   the protected adapter may use the exact-target batch wrapper for that one
   target, but it keeps the same conservative query/write/query ordering.
   Do not change the active profile or write credentials.
2. Bind the exact upcoming screening scope by display name/room and Runtime
   evidence (18 lights here, or any other explicitly selected N). Choose four
   distinct lights from that bound scope as the physical sample. The number
   four is a test scope, not a product limit; never infer “the first four
   devices” when discovery returns more.
3. Record a redacted, per-target pre-state containing power, brightness, color,
   color temperature, online status, and capability evidence. If any field is
   missing or a target is not independently confirmed as a light, stop.
4. Ask for the explicit conversational confirmation
   **“确认执行上述 4 盏灯短时验证”**. Before asking, use the host-only
   validation wrapper with the four opaque handles and keep its short-lived
   ASCII grant in host context. Only after the user confirms, call the host-only
   run action with that grant. The server caps brightness at 10% and runs one
   bounded validation sequence per target in series. A sequence may use
   separate semantic brightness and power writes; it never replays the design
   step, and a power-only fallback is limited to one additional direct power
   call after trusted readback. The server reads each target back immediately,
   stops on the first
   failure/conflict, fades/off briefly, and restores the recorded state. The
   The host wrapper receives both the four sample handles and the full
   `scopeHandles` set; success authorizes only that exact set. The
   conversational Chinese phrase is checked by the host wrapper and is never
   copied into a request header. Do not use the ordinary high-frequency page Start
   control for this first run; live Start stays blocked until validation succeeds.
5. Report each target's write receipt, readback, restore result, and any
   `partial`/`uncertain` state. A failed restore is not success; stop further
   writes and keep the remaining recovery list visible to the host. A formally
   bound partial Runtime receipt is accepted only after exact verified
   readback; a power-only mismatch may use one direct power fallback only
   after the phase brightness is confirmed, and never retries a design write.

See `references/lighting-model.md`, `references/runtime-execution.md`, and
`references/setup.md` and `references/live-validation.md` for the detailed
contracts.
