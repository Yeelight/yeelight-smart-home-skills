# Runtime execution boundary

The only Yeelight path is the fixed local wrapper command:

```text
yeelight-home invoke --stdin
```

The adapter starts it with `shell: false`, a fixed executable argument list,
and a bounded timeout. The request contains only semantic intent data created
by the server. Browser messages never include Runtime targets, command names,
profiles, regions, house context, credentials, or headers.

Read-only discovery uses `entity.list`; Prepare and Live Stop prefer one formal
`state.batch.query` request containing one exact `items[]` entry per target and
the capability-scoped property list, with strict exact-set validation. This
avoids one Runtime process per property without weakening the write fence.
Batch-capable Stop reuses that entry snapshot for fade/off/restore and performs
one final batch read. It does not spend another state query immediately before
restore; the final batch read is the authoritative physical result. The same
entry snapshot is reused for adapters without batch support, so compatibility
fallbacks do not add phase queries. Explicit recovery writes each journaled
pre-state directly and reads it back only after the restore write. Low-frequency
setup and termination can use `lighting.design.apply`.
High-frequency work first checks whether
`lighting.flow.execute` is available. Because the Runtime resolves one target
per Flow request, the adapter sends one request per target through a bounded
twelve-worker pool and aggregates every receipt. Each live frame includes the
complete frozen selected set; it is not a four-target rotation. It never labels
an aggregate as physical verification.

Before the pool starts, the service persists one durable screening-journal
record containing every frame target and its next known state. Fatal errors and
cancellation stop new workers and wait for already-started workers to settle
before finalization, Stop, or restore can run. The journal scope is
conservative, but live finalization uses the entry snapshot and in-session
write evidence to choose its writable set. The complete frozen target set is
queried once after restore; unknown or mismatched rows remain pending for
explicit recovery.

Live mode is opt-in and fail-closed. Missing capability, unknown handle, stale
generation, journal failure, cancellation, validation failure, and unbound or
unknown Runtime failures remain terminal structured results with no raw
upstream detail. A target-bound verification mismatch is recorded as a
retryable failed row and the next complete frame continues, including a frame
where all selected targets fail. A Runtime response explicitly marked
`safeToRetry`, or an explicit `runtime_timeout`, `runtime_unavailable`,
`runtime_failed`, or `runtime_protocol` failure from the local Runtime
process, follows the same row-level retry path. The last two codes mean that
the process or its response was not trustworthy; they do not mean the light
did not change.
These rows never claim `acknowledged` or physical verification: the current
POST is not replayed, the next frame is attempted, and the journal keeps the
target pending for Stop/recovery readback. Consecutive all-failed windows are
capped by a 300-window grace budget (about 3 minutes at the default cadence);
exhaustion ends the session. Cancellation, journal/recovery, validation,
session, and unknown/unbound errors remain terminal. If the browser loses a
tick response before
receiving HTTP, it schedules the next frame without replaying the unknown POST;
parsed HTTP errors still follow their terminal or stale-session paths. The
final Stop still performs full fade/off/restore/readback.
Cadence and busy skips are not physical failures. They are the only normal
`skipped` responses; a live frame receipt itself contains every selected target
and does not omit a rotation remainder. The browser keeps one frame request in
flight. A non-acknowledged target does not claim physical verification, and its
durable touched scope remains pending until Stop or explicit host recovery
verifies restoration.

If the protected Runtime context provides a household gateway, set
`controlMode` to `local-preferred` (or `local-only`) and pass the matching
private `gatewayIp` or `/mcp` `lanEndpoint`. The service validates and forwards
these values only to the Runtime child, so local gateway routing is preferred
without exposing endpoints or credentials to the page.
