# Live validation contract

Use this reference only when a user asks for physical light verification. It
is deliberately narrower than a normal Cinema Director screening.

## Context

The host selects `profile`, `region`, and `house-id` from the local protected
Runtime configuration. For production validation, `region` must be `cn`, `sg`,
`us`, or `eu`; `dev` is never a physical-light context. Pass the values to the
wrapper's live start action. Do not copy credentials, change the active profile,
or put Runtime context in browser JSON.

## Read-only preflight

Run these through `yeelight-home` with explicit flags, retaining only redacted
results in the host context:

1. `auth status --json`
2. `home list --json`
3. `entity.list` for the selected house
4. `state.batch.query` with one exact `items[]` entry per proposed target;
   later failed-write readback may remain single-target, while restore recovery
   writes directly from the durable journal and reads back only afterward

The preflight must prove one house, one region, a non-empty online target set,
and enough capability evidence for brightness/color or temperature writes. A
missing `online`, capability, power, brightness, color, or color-temperature
field is `UNKNOWN`, not an implicit `true`.

## Four-light test

The host binds the exact upcoming screening scope first: the 18 (or other
explicitly selected N) opaque handles that the screening may control. Then
choose four distinct handles from that scope as the physical sample. Do not
use array position, a room-wide wildcard, or a hard-coded device ID. Before the
first write, report the sample and full-scope display names/rooms, a redacted
identity summary, and each sample pre-state. Use the host-only validation
wrapper with the four sample handles plus `--scope-handles` for the full
screening scope. It keeps the returned short-lived ASCII grant in host context
and requires the exact conversational confirmation:

```text
确认执行上述 4 盏灯短时验证
```

After confirmation, call the host-only validation run action with the four
opaque handles and the grant. The page proof alone cannot prepare or run the
physical test. The Chinese phrase is checked by the host wrapper, never copied
into an HTTP header. The server fixes the brightness ceiling at 10% and runs
one bounded validation sequence per target in series. A sequence may use
separate semantic brightness and power writes; it never replays the design
step, and a power-only fallback is limited to one additional direct power call
after trusted readback. Successful Runtime receipts are phase acknowledgements,
so successful writes do not pay for an immediate per-target query. Failed or
uncertain writes still perform a single-target readback and stop the remaining
test. Fade/off uses the same rule: successful receipts proceed without another
query. A target with a verified fade/off receipt is restored directly from the
recorded pre-state, without a pre-restore state query; one final batch read
confirms every touched target. This deliberately trades detection of a state
change between fade/off and restore for lower latency. A formally bound
`partial` Runtime receipt may be accepted only after a verified, online,
non-simulated readback proves the exact requested design properties; for a
power-only mismatch, the host may make at most one `light.power.set` fallback
after the same readback proves the phase brightness is already applied.
Unknown, malformed, timed-out, or conflicting receipts stop the remaining test
and are reported as `partial` or `uncertain`; a recovery reference remains
available for a failed restore. Pending recovery blocks new live sessions until
the recorded state is verified. An explicit recovery retry writes the
journaled pre-state directly and verifies it only after the restore; it does not
spend a state query before restore. An expired record is retained as
`manual_recovery_required` and additionally requires the explicit host
confirmation `确认恢复上述物理验证`.

This four-light procedure is a physical sample gate only. A successful grant
authorizes only the explicitly bound screening scope; a discovered light
outside that scope must be rejected. The product still supports any
runtime-discovered count up to its defensive resource limit when the user runs
an ordinary screening.
