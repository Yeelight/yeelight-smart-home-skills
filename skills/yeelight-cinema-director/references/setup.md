# Local setup

The AI host runs `sh scripts/invoke.sh start` (or `scripts/invoke.ps1 start`)
and opens its returned `openUrl`; the user does not run or paste this command.
The default is offline mock mode and does not need a key, login, cloud endpoint,
or light. For physical validation the host must use an explicit live context:

```text
start --mode live --profile <profile> --region <cn|sg|us|eu> --house-id <house-id>
# when the protected home metadata exposes a gateway
start --mode live --profile <profile> --region <cn|sg|us|eu> --house-id <house-id> --control-mode local-preferred --gateway-ip <private-gateway-ip>
```

The wrapper rejects missing/invalid live context and ignores ambient live-mode
environment flags. When `gatewayIp` or `lanEndpoint` is supplied, the default
control mode is `local-preferred`; use `local-only` when cloud fallback is not
allowed. The endpoint must be a private or link-local HTTP(S) `/mcp` URL without
credentials, query parameters, or fragments. Apple Music candidates are the
primary playback entry and open in one reusable, resizable top-level browser
window; clicking the entry for a new selected track navigates that existing
window so an authenticated subscription context is not placed inside a
third-party iframe. YouTube is shown
only as a secondary fallback when the
selected soundtrack has no official Apple Music link. If the soundtrack should
drive the lights, the browser's native display-media dialog must explicitly
share the tab or window that is playing it and enable audio; the Skill cannot
select a tab or bypass this permission. The first open uses the draggable
companion's current position as a best-effort anchor. After the window loads,
the companion remains independent and never closes or restarts a playing
cross-origin window just to follow a drag; an always-on-top guarantee is not
possible.
The page's draggable lower-right Apple Music companion is a same-window
control surface, not a second player: it keeps the selected track and window
state in sync with the panel button and can reopen or refocus the reusable
window after the page regains focus.
A YouTube
Data API key is optional. When configured by an operator, it stays in the
service process environment and is never returned to the page or logs. When no
key is configured, the service uses a fixed server-side YouTube Web JSON search
request and projects only validated video links. That endpoint is an
undocumented public web contract and may be temporarily unavailable; the
browser's local-audio path does not depend on it. Do not add the key to tracked
files, browser requests, page proof, or Skill fixtures.

For a bounded local shutdown wait, `stop --stop-timeout-ms <milliseconds>`
accepts only `0` through `120000`; the default is `4000`. A timeout reports
`stopping` and keeps the instance state until the port is confirmed closed.

For a live read-only preflight, install `yeelight-home` and let the host's
normal authentication flow establish its protected credential store. Do not
copy credentials into this package. The host must verify the explicit profile,
region, and house, then capture per-target power, brightness, color,
color-temperature, online, and capability evidence. Every live frame covers all
selected targets through a bounded twelve-worker pool; the recovery journal is
persisted once for the complete frame before any physical write. Real light writes require
the exact conversational confirmation in `references/live-validation.md`, a
short-lived server grant, and a recovery plan; mock evidence does not establish
physical verification. The confirmation phrase is conversation-level text, not
an HTTP header.
