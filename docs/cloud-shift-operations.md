# Cloud Shift X/Y operations

Assign **Cloud Shift X** or **Cloud Shift Y** to an operation slot in the Cloud group. Start Cloud exploration on the same track and capture a cloud with manual Hold or the independent Cloud Hold operation. Shift moves held emitters; it does not capture or start a cloud.

The signed amount is a percentage of the full axis: -100 to +100, default +25. Pressure uses the shared mapping from zero to that target. Existing mapping direction and response controls apply. Two active slots on one axis add together, bounded to ±100% after summing.

Use the existing momentary, tap-to-arm one-shot, or persistent-latch gestures on Move, Launchpad and Remote UI. An armed one-shot starts with the next cloud contact and ends when the last overlapping contact releases or expires. Ordinary MIDI notes do not consume it. Auto is disabled.

Operation offsets are separate from the captured shape and manual position. Releasing an operation removes only its contribution, preserving manual edits made while it was active. The existing clamp/wrap choice applies to the combined offset. Center resets the manual position; an active operation can still shift it. Shift does not own Hold, so releasing Shift never drops a manually held cloud.

Remote UI contacts and manual movement retain 14-bit X/Y precision. Move and Launchpad use their existing pad geometry and pressure controls. New deposits and trails reflect the effective position; previously emitted trails remain where they were played. Recording stores resolved deposits, so replay and Bake reproduce the take without requiring the operation to stay latched.

Stop, Clear, Set loading and generator cancellation clear transient state. HarmonyBus bypass cancels operation contributions while preserving an independent manual capture. Assignments persist; active offsets do not.

Requires the paired Movy release advertising `movy-clip-v5`. Older hosts cannot activate Shift. The small `motion_cloud_transform` reply carries Hold ownership plus two signed 14-bit offsets; manual `cloud_hold_state_N` remains manual-only to prevent UI drag feedback. `cloud_operation_shift_N` reports the transient offsets separately.

Validation includes native pressure/gesture/capability checks, precise cloud sampling and recording/replay, shared UI assignment, production DSP integration and compiled browser tests. Hardware feel and latency still require a Move/Launchpad audition.
