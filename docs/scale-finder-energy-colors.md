# Scale Finder energy colors — luminance ordered (.313)

The Scale Finder microphone's five intensity tiers now **increase in
calculated sRGB relative luminance** from dim yellow to bright red. Black
means no detected energy (below the low-noise display threshold), even on
the previous Family layout. A colored blank pad cannot masquerade as
pitch evidence.

| Normalized microphone evidence | Move RGB index | Schwung color | sRGB hex |
| --- | ---: | --- | --- |
| below 0.07 | 0 | Black | `#000000` |
| 0.07–0.199… | 78 | Very Dark Yellow | `#201C07` |
| 0.20–0.399… | 77 | Dark Yellow | `#645817` |
| 0.40–0.599… | 28 | Burnt Orange | `#995628` |
| 0.60–0.799… | 3 | Bright Orange | `#C93C00` |
| 0.80–1.00 | 1 | **Bright Red** | `#FF4032` |

These exact values are taken from the pinned Schwung RGB palette in
`src/shared/constants.mjs`. The nominal sRGB relative luminances are
approximately 0, 0.0115, 0.0975, 0.1358, 0.1565, and **0.2516**.
The fully saturated `#FF0000` red has lower calculated luminance
(0.2126), while vivid yellow `#FADC3B` is much higher (0.7183).
Therefore a full-intensity yellow would be a **visually incorrect**
midpoint for a ramp intended to end at its brightest red.

The browser Studio pitch-class meters use the *same five sRGB colors*
and black for no signal, with a visual legend. It retains a normalized
scalar `value`; this is a quantized color ramp, not a second pitch
detector. The existing Goertzel/harmonic suppression and evidence
accumulator remain unchanged. Pad LED updates still flow through the
existing cached per-frame writer.

**Priority:** tonic = white, manually required/latched notes = green,
manually excluded notes = the existing exclusion color, selected Family
pad = green. Only otherwise unselected pads use the microphone energy
heatmap. Family identities continue to be shown on the on-device screen
and K1–K4 LEDs; they no longer falsely illuminate pads without energy.

The unit regressions check the color tiers, black silence, priority
rules and strictly increasing calculated sRGB luminance. That is not
a photometric measurement of the physical Move RGB LEDs: real output
depends on LED drive/current/gamma, diffusion and visual perception.
If the hardware looks uneven, calibrate against real photos or a light
meter rather than assuming nominal RGB math equals physical brightness.

No change to native mic capture, pitch detection, chord queue, recording,
physical microphone routing or key Copy semantics is included here.
