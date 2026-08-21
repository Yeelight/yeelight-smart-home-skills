# Cinema lighting model

`Accent` and `Ambient` are musical roles. Either role may contain zero or many
lights. Discovery produces a stable device order (room, display name, handle),
deduplicates by Runtime identity, and assigns selected handles by a balanced
split. The assignment is immutable for the screening.

Audio energy drives brightness and attack. Hue and saturation move slowly from
the soundtrack palette and conservative lyric cues: fire, warmth, hope, cool,
and clarity. A lyric marker is a cue, not an inference about a singer or an
audience member. Silence freezes the last frame; it does not turn lights on.

For multiple lights, each role receives a deterministic phase offset and every
selected target receives one row in every frame. The phase/wave value changes
the look between frames; it is not a device rotation window. The compatibility
path executes the complete frame through at most twelve concurrent Runtime
workers. A Flow receipt is only `acknowledged`; physical verification requires
a separate Runtime state query. Single-light screenings use the full composite
signal rather than an empty second role.

Initialisation and termination may use `lighting.design.apply`, whose Runtime
contract writes and reads each property serially. Ticks use a capability-gated
Flow call or the bounded compatibility pool, never a serial all-target design
write. Stopping invalidates the generation before a 3.2 second fade, then
issues power-off and reads each frozen target. Any missing or timed-out row is
`uncertain`. The recovery journal records the full selected frame before its
first physical write, so an interrupted worker set remains recoverable.
