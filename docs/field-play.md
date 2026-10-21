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

## Validation notes

The native suite and focused three-surface/Session regressions are required.
The wider browser sweep also covered 164 unchanged screen baselines. The legacy
upstream app-loop suite still has 11 existing failures and terminates in a missing
MIDI-send mock; the same failures reproduce in the pre-Field checkout. Its result
is not represented as a passing test. Device acceptance remains outstanding.

## Output strips (HB 0.2.284 / Movy 206 candidate)

In Field Display set View to 1 (Outputs). Orientation 0 is Horizontal on every
surface; 1 is Vertical. Output Bank selects the starting group of four lanes.
Move shows four horizontal strips (eight positions); Launchpad X shows eight.
Vertical Move shows eight strips with four positions. Each lane keeps its sample
coordinates and range mapping. Bank changes only which lanes are visible.

Hold a pad to override its lane's normalized output; several lanes can be held.
The first pressure message anchors fine adjustment without a contact jump;
subsequent pressure offsets the base by up to half a pad interval. Knobs 1–8
control the bank's first eight lanes, including the four additional Launchpad
rows. Touch engages, turn fine-adjusts, release returns to the moving field.
Shift-turn is ten times finer. A knob adjusts the base while pad pressure remains
an offset. These are runtime gestures, not saved automation.

Jog turn changes the output bank. Jog press opens settings; normal jog clicks
navigate the existing hierarchy. Shift-jog press returns to Outputs. Pads keep
performing while settings are open. Mode, track, set and layout changes release
local holds; source disconnect releases that source. DSP leases expire after
1.5 seconds without renewal. Release glides toward the *current* noise output.

The green marker blends between adjacent positions. The dim neutral marker
shows the underlying noise during an override. Launchpad X uses RGB brightness;
Move approximates it with its fixed green palette. There is no temporal LED
flicker/dithering. Gamma 2.2 is an initial approximation, not a hardware-calibrated
response. Output precision is independent of LED quantization and 8 Hz snapshots.

HarmonyBus now ships a custom Schwung Remote UI (`web_ui.html`). Open HarmonyBus
under MIDI FX in Remote UI to use horizontal labeled sliders; orientation and
bank are shared, and 4/8 visible outputs is a remote display preference. Pointer
holds can operate several sliders; pointer cancel, blur and page hide release.
Arrow keys fine-adjust while held; Shift is finer. The existing Default view in
Schwung remains available for other HarmonyBus parameters. The Remote UI uses
the existing parameter bridge, with a separate lease from physical controls so
one surface's release cannot clear the other's held outputs.

Outputs currently correspond to operation lanes 1–16. Unmapped lanes still
show their field sample but have no audible destination. Shared named sample
buses, distribution presets and arbitrary synth destinations remain future work.

## Momentary and Latch (HB 0.2.285 / Movy 207)

Field Display adds Override: 0 Hold (Momentary), 1 Latch. Momentary remains the
default. The choice is saved; actual latched output values are temporary and
never recorded or saved. Each knob still controls its output strip. Jog behavior
is unchanged.

A normal pad/knob release commits the requested value in Latch mode, including
pressure fine adjustment. A glide finishes toward that requested value rather
than freezing midway. Multiple held controls on the same output retain ownership
until its last control releases. Touching/pressing again takes over the output.
Green continues to show the effective value; `L` beside the lane on the Move
screen and Remote UI identifies a latch. There is no blinking.

- Move: Shift+pad releases that strip. Shift+Back releases all field outputs.
- Launchpad X: hold the existing modifier (side button MIDI CC89) and press a pad
  to release its strip; modifier + rightmost top button releases all.
- Remote UI: each slider has Release, and the header has Release all plus the
  Momentary/Latch selector. Escape releases the focused slider.

Release one preserves other latches. Release all also cancels active holds;
held messages cannot silently reapply an output until the source releases and
presses again. Switching to Momentary clears existing latches. Clearing always
uses the existing glide back toward the *current* underlying field.

Latches survive Terrain/Outputs switches, layout/bank changes and leaving Field
Play. Set changes and DSP teardown clear them. Canceled gestures, disconnections,
page hiding, and expired input leases never create a latch. Previously committed
latches remain intentional state until cleared. Native finish/clear requests
retry under UI backpressure without allowing the release frame to overtake a
latch commit. The DSP rejects commits after a hold's lease has expired.

### Sample Spread (HB 0.2.286 / Movy hbclean.208)

In Field Play settings, open **Sample Spread** under Shared Noise Field. The
Remote UI exposes the same four controls in its Sample Spread disclosure.
The existing output strips, pressure, knobs, momentary/latch controls and
Launchpad mappings continue to operate on the resulting lane outputs.

- **Shape**: 0 Manual, 1 Ball (uniform volume), 2 Sphere (uniform surface),
  3 Gaussian (centered 3D cloud). The exact random distributions apply at
  Randomness 100%; intermediate values blend a regular layout into that layout.
- **Spread / 100**: radius for Ball/Sphere, expected RMS distance from center
  for fully random Gaussian. 100 means one field coordinate unit. Gaussian
  points can lie beyond that distance. Zero collapses all generated points.
- **Randomness %**: 0 regular placement, 100 seeded random placement.
- **Placement Seed**: rearranges points independently of the noise Seed.

All 16 output lanes receive stable coordinates, independent of surface, bank,
orientation, which lanes are enabled, and elapsed time. Generated layouts replace
manual XYZ coordinates while selected; switching to Manual restores the existing
per-lane XYZ values. Manual is the default for existing and new sets. These four
settings persist with the set; live output overrides remain unrecorded.

Spread relative to Feature Size influences spatial correlation, but does not
promise a particular correlation coefficient or anticorrelation. Invert a lane's
low/high mapping for a deliberate inverted response. Placement is cached and
recomputed only on placement-setting changes, never on animation reads or normal
audio-block advance. No new jog or track-button functions are introduced.
