# Motif pitch material and generated rhythm

Use HarmonyBus 0.2.279 with Movy hbclean.201. Existing Joint Play actor panels write the corresponding track settings; no target-track selector or new rhythm bank is added. Operator, motif and user rhythm banks remain shared.

## Bass line from a motif

1. Select the bass track in the chosen four-track unit.
2. Choose a motif and capture its target using the existing motif controls.
3. Choose a rhythm pattern and span. Fill Notes = Motif cycles through its playable events; Fill Notes = Target repeats the target. Source rests/ties do not consume rhythm attacks.
4. Use Motif to Clip to preview and write the result with the existing Write/Replace/Append/Overdub and Undo controls.
5. Set Joint Play Bass Source to Clip. The ordinary clip loop repeats the line; bass track follower and travel settings determine its harmonic rendering.

## Comping while playing melody

With Comp Source = Follow and a generated rhythm enabled on comp, a melody change updates the next comp attack. The current gate retains its original pitch. Melody release finishes that gate and stops subsequent attacks unless the comp track latch retains the input. Clear/stop releases immediately.

With Comp Source = Clip + Guide, the backing clip supplies attacks and note lengths. Melody guides the next clip attack; pressure and note-off remain paired with the pitch that sounded. Melody release does not stop the backing clip.

## Arp on a rhythm-filled clip

Arp uses the track's existing pitch order, range and start policy. Each written attack advances the ordering through its rendered chord. The clip supplies note-offs and rests, including when Rhythm Generate is subsequently turned off. There is no extra arp clock between written attacks. Live pads on the same track keep their own generated rhythm.
