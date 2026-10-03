# Movy pad settings and trails

Shift + Step 9 has four jog-dial-selectable pages: Set Parameters, Pad Colors, Pad Trails and Trail Decay. The main page shows `1/4 >` and `MORE / JOG DIAL`. Chord Forms remains grouped as before. Settings persist with the Set; onset history is transient per HB track instance.

The native renderer stores resolved single-target onsets in fixed 128-pitch history. Chord voices and arp repeats do not refresh that input's history. Delayed rhythm output carries its target through the MIDI queues. Motif steps stamp their target at emission. Past sounding pitches never remap after a key change; visible pads query history using their resolved displayed-context targets. A phrase pad previews its first scheduled target.

Choose exact Pitch (default) or Pitch Class; Infinite, Rolling Beats, Current Chord, or Previous + Current history. Decay is independent of the window: None, Linear, or Exponential. Linear duration reaches zero. Exponential uses `2 ** -((age / halfLife) ** exponent)` with shape 0.5, 1, 2, or 4. Every shape is 50% at its half-life. Infinite imposes no cutoff; numeric/palette quantization eventually hides faint values.

One final color path applies trail over the existing harmony/pulse background, then played-note highlight, then approach-row dimming. History and target data travel in the existing 50 ms pad snapshot. Age/pulse animation performs no native mapping or reads.

Copy-mode replanning reuses cached metadata and releases physical momentary holds without a blanket performance reset. Explicit reset retains cleanup. Hardware crackle resolution is not claimed by desktop tests.

Trail defaults: Current Chord, no decay, 100% strength, pulse off and pure Move blue (palette 125). Approach Rows can independently hide trails on approach pads; enabled trails retain final row dimming. Touch any option knob to peek its list while turning. The pages use the hosted Schwung widgets.

Build 157 consolidates rolling durations into History Window. Fade defaults to Dim Trail (fade toward black); Blend into Background remains available. Decay Time is in beats, and is a half-life for exponential decay. Curve previews sample the same function as trail intensity. Clear is a tap-trigger button. Old rolling-window selections migrate to the equivalent combined choice. Approach Harmony and Secondary live in Copy-tap Harm Play mode, while Chords, Chord Forms and Arp remain common setup panels.

Dim Trail uses a 50% brightness floor, like next-harmony pulsing. The floor is relative to Trail Strength, followed by approach-row dimming. Window expiry still clears history. Exponential half-life halves the remaining distance to the floor; graphs include the floor.
