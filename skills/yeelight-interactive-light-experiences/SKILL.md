---
name: yeelight-interactive-light-experiences
description: Run the Yeelight IFA collection of AI-guided interactive light games and scenes through an automatically managed local loopback service.
---

# Yeelight Interactive Light Experiences

This Skill runs a loopback-only exhibition collection for two Yeelight light
banks. It exposes twelve dedicated visitor experiences, beginning with Fortune
Light, through a local browser application.

The visitor homepage intentionally presents two simple capabilities:

- **Interactive Light Experiences Skills**: Fortune Light, Light Game Arena,
  and Cinema Director. The remaining experiences stay available through their
  direct hash routes for staff and demonstrations, but are not part of the
  high-throughput IFA home screen.
- **Smart Home Skill**: four one-tap room intents, Relax, Focus, Movie, and
  Party. Each preset is compiled locally into the same canonical 18-slot plan
  and uses the existing executor, so the four-light development proxy and the
  full IFA installation share one control path.

The AI Host starts the service and opens the local page. Visitors do not need
to start a process or configure a model on the homepage; the Smart Home cards
are ready as soon as the same-origin preset catalog is healthy.

## Host Launch Contract

This is an executable Skill experience, not a page that visitors start by hand.
When the Skill is invoked to run the collection, the AI Host must execute the
local wrapper and open the returned URL:

```sh
sh scripts/invoke.sh start
```

The wrapper returns one JSON line. Read `openUrl` and open it in the exhibition
computer's browser; use `healthUrl` for a readiness check. `start` reuses a
healthy matching service, so repeated Skill invocations do not create a second
executor or ask the visitor to start anything. Use `status` only for an explicit
health check and `stop` only when the Host is intentionally shutting down the
collection. PowerShell Hosts use `scripts/invoke.ps1` with the same actions.

Do not ask the user to run `node scripts/launch.mjs`, paste a localhost URL, or
configure a mode. If startup returns an error, report the structured error and
keep the existing service untouched. The direct `launch.mjs` command below is
only a developer debugging fallback and is not part of the visitor workflow.

## Launch

The service uses the fixed loopback endpoint `http://127.0.0.1:8787/` by
default. If no protected IFA binding exists, it starts deterministic offline
`mock-18`; it never calls a provider or a real device. If the protected binding
exists, it starts `live-auto`, verifies the fixed `ifa-eu` EU context and bound
devices before listening, and resolves to either `live-proxy-4` or `live-18`.
An invalid binding or failed live verification stops startup; it never silently
downgrades to mock mode.

For local developer debugging only, `node scripts/launch.mjs` remains available
as a foreground process. It does not provide service reuse and should not be
used as the AI Host entrypoint.

Staff can open the unlinked `http://127.0.0.1:<port>/staff` route on the
exhibition computer. The setup page accepts an OpenAI-compatible Base URL, API
Key, Model, and Responses/Chat Completions mode. It tests the candidate first,
then persists only a protected local ProviderConfig file. There is deliberately
no setup code, operator code, or visitor approval step in the trusted local
exhibition profile. Visitor pages never see the key or provider origin.

For live hardware, an operator creates the protected binding once with
`scripts/live-bind.mjs`, either for the four named quadrant proxies
(`live-proxy-4`) or all eighteen named slots (`live-18`) in the fixed EU
exhibition home. The Host then starts the wrapper normally; it automatically
uses `live-auto`. The auto mode is only a startup resolver: it revalidates the persisted binding
and uses its concrete topology. It does not scan by device count, select
unbound devices, rebind another home, or silently downgrade to mock mode. A
binding mismatch or failed device check stops startup before any visitor write.
The canonical full layout is `L1..L9` and `R1..R9`. The four-light proxy maps
`L-upper`/`L-lower` to `L1..L5`/`L6..L9` and the right bank the same way. A
previous `live-16` binding is rejected as stale and must be explicitly rebound
with all eighteen aliases; it is never reinterpreted as an 18-light binding.

Use `node scripts/validate.mjs` for package and closed-plan checks, and
`node scripts/mock-demo.mjs` for the complete twelve-route `mock-18` / `proxy-4`
and failure-matrix smoke.

## Visitor Boundary

The visitor page calls only same-origin public `/api` routes. It accepts bounded
experience choices and shows sanitized plan, execution, topology, mode, and
evidence results. It never accepts or displays credentials, device identifiers,
Runtime intents, shell commands, or model prompts. Browser storage, cookies, and
URL-embedded visitor data are forbidden. Finish, Home, reload, timeout, error,
and staff reset clear the active in-memory visitor session.

The supported sequence is `browser -> loopback server -> validated plan -> local
executor -> yeelight-home invoke --stdin`. In live visitor mode, the server
selects a fixed command-acknowledged fast path: a successful control skips the
extra executor pre-state and final-state reads and is labelled as acknowledged,
not physically read-back verified. The live command adapter expands each
validated physical action into direct light-property requests (`light.power.set`,
`light.brightness.set`, `light.color.set`, or the bounded color-temperature
variant) and runs them through the existing bounded worker pool. Each cloud
receipt is bound to its generated request, target, property, expected value,
source, and intent-specific trace; the generic `node.properties.set`
acknowledgement is deliberately not used because it can be accepted without
changing a light. A write failure, timeout, or cancellation
after dispatch still triggers one independent reconciliation read; no restore is
offered because the fast path has no trusted pre-state snapshot. The browser,
Provider, and model cannot select this policy. The `No Shared Prompt` server-side
state inspection remains a separate MCP input step. In live mode it uses only the
server-selected left-bank representatives (`L-upper`/`L-lower` for the quadrant
proxy, `L1`/`L6` for eighteen lights) and fixed Runtime `brightness` and `color`
reads. It projects only brightness, color, responsiveness bands, and explicit
sample coverage; it is never a claim about the full installation. If that closed
observation API is unavailable, the experience stops before provider or light
execution and does not fall back to a full snapshot. Mock evidence must remain
labelled `18-light deterministic mock parity validated`; it is not live
installation validation. The adapter may also treat a Runtime
`lighting.design.apply` response as `dispatched_unverified` only when the
response is a complete `write_verification_mismatch` receipt: every expanded
action has a matching target/property/expected value row, `persistentWrites` is
true, and the Runtime has returned its post-write query rows. The verified/
compatibility adapter path uses this shortcut; the visitor fast path does not
use that generic design receipt and instead uses the direct light-property
receipt contract above. Generic or mixed partials, timeouts, cancellations, and
Flow failures remain on the normal reconciliation path.

Before topology aggregation, the local canonical-plan policy raises every
visitor brightness below the fixed exhibition floor (36) to 36 while preserving
the provider's hue, saturation, phase timing, and upper bound (85). The policy
also applies to deterministic and fallback plans so mock and live paths stay
visibly comparable. Recovery writes bypass this policy and restore the exact
trusted pre-state brightness.

Provider compact phases use four independent `q` values in `L-upper`,
`L-lower`, `R-upper`, `R-lower` order. The local compiler keeps non-uniform
provider colors unchanged; only equal or near-equal quadrant colors receive a
small deterministic hue/saturation (and, when brightness headroom exists,
brightness) variation before canonical 18-slot expansion. This prevents the
four-light proxy from collapsing into one visual output without moving the
spatial policy into the topology or Runtime write layer.

## Experience Set

Fortune Light, Light DNA, Shared Breath, Sensory Translator, Close the Day,
Light Game Arena, Luma / Light Spirit, Memory Capsule, Intention Garden, Common
Ground, No Shared Prompt, and Impossible Light are complete routes. Sequential
experiences use the same screen and an explicit private handoff, never a phone or
LAN participant endpoint.

## Safety

Do not add provider keys, direct model traffic, raw device identifiers, Runtime
requests, or arbitrary prompts to visitor-facing files. Real lighting execution
is enabled by the selected launch mode and remains bounded by the local executor
and capability checks. Keep the loopback Host and same-origin POST checks, the
fixed EU live context, closed plan schema, single active visitor session, and
read-back evidence. Do not represent a four-light proxy or mock result as
eighteen-light live validation.
