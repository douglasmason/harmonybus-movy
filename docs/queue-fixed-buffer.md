# Movy 0.34.1-hbclean.296

Queue servicing now reuses the chain's fixed-buffer parameter API. Previously,
each service tick allocated a C parameter key and an owned response string,
even for the `--` response between chord changes. The new reader uses a static
key and an eight-byte stack buffer for the native `--`, `off`, or MIDI-pitch
reply. No extra timer, polling, response cache or scheduler is introduced.

Each service still performs exactly one consumptive read. Repeated identical
pitches remain separate events, and activation uses the same MIDI/recording
path. Invalid or truncated replies are ignored without a retry that could
consume another chord. Pause/resume behavior from .294 is preserved.

The allocation regression exercises 40,000 production-reader calls covering
idle, chord activation and queue-off replies, with zero Rust heap allocations.
Protocol tests cover every MIDI pitch, repeated events, invalid UTF-8 and
truncation. The production-chain suite covers loop timing, silent pause,
restart, queue feedback membership and Harmony Off.

This removes avoidable work from the audio thread; it does not establish that
all physical-device crackles are resolved. The saved Audio-page diagnostic
check from .294 remains available if they persist. The live-control and font
improvements from .295 are included.

Install with `douglasmason/harmonybus-movy` after the verified installer pointer
advances to this version.
