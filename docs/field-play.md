# Field Play candidate

Field Play is the sixth Session-button mode, after Grid Sequencer. It performs
the shared noise field; pads do not emit notes, launch clips, or move individual
sample coordinates. Existing clips, arps, and operations continue playing.

## Controls

The eight columns apply speed multipliers: -4, -2, -1, 0, 1, 1.5, 2, 4.
The central pair is Stop and Normal. Rows apply feature-size multipliers from
0.25 at the bottom to 4 at the top. Move has four rows; Launchpad X has eight.
A held pad momentarily controls both values. Last press wins across surfaces;
release restores another held pad or baseline. Baseline resumes at the current
field position, without snapping back to a timeline. Glide smooths the gesture.
A 1.5-second DSP lease restores baseline if UI/controller communication fails.

Knobs: bars per field unit, XY direction (eight 45-degree directions), Z travel,
noise detail (1–5 octaves), roughness, feature size, seed, and glide milliseconds.
The hierarchy links Field Display (animation on/off) and Field Lane Mapping.

## First audible test

1. In an existing operation lane choose Velocity or Gate and enable Auto.
2. Open Field Lane Mapping; select the same lane.
3. Set Field target to 1 (Probability) and Low/High to 20/85. Alternatively use
   target 2 (Amount) with an appropriate range for the operation.
4. Set fixed sample X/Y/Z; these use hundredths of a field unit.
5. Enter Field Play and play/loop the existing musical content. Hold Stop,
   then reverse, then accelerate. Release returns to normal travel.

Clip Weave and the other clip-reader operations receive an in-process field
snapshot at up to 20 Hz. Their existing phrase decision samples that overlay;
changes do not cancel an already accepted window or reset the donor phase.

## Surfaces and display

Native pads and Launchpad X use the same gesture controller, with height-scaled
vertical mapping. The existing Remote UI mirror uses native input and screen
rendering. A larger remote surface can call `fieldPad('remote', index, down, 8, 8)`;
`fieldSnapshot()` returns a read-only 8×8 terrain slice and effective speed/scale.
Call `releaseFieldSource('remote')` on disconnect/cancel. These functions are
exported in the Movy UI runtime; they are not a new HTTP endpoint.

Noise preview reads are limited to 8 Hz and never advance field time. LED
updates use existing changed-value caches, packet budgets and backpressure.
Z travel changes the displayed slice. The screen shows the actual speed and
feature-size multiplier. Display animation can be turned off independently.

## Candidate scope and device acceptance

This increment implements Field Play and numeric operation-lane mappings.
Sample points are edited individually. Distribution presets (ball/sphere/Gaussian),
weighted categorical choices, exact looping, and arbitrary synth/granular
parameter assignment are not included yet. No new granular synthesis engine is
introduced. Field configuration/mappings are saved; transient gestures and travel
position are not recorded or restored.

Before relying on it live: verify ordinary modes, hold/release on all surfaces,
mode switching during holds, disconnect recovery, save/reload, Clip Weave phase,
and audio/LED latency with animation enabled versus disabled. ARM packaging and
software tests do not substitute for this hardware check. No device was deployed.
