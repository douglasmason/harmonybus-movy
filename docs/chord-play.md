# Chord banks and performance context

Chord Play has three banks of seven chords: Home, Parallel (major/natural minor swapped), and Blues Dominants (I7, II7, flat III7, IV7, V7, flat VI7, flat VII7). Defaults resolve from the shared parent key. Manual definitions are shared across melody tracks within the Set, and Reset Chords restores the relative defaults without changing track routing. Existing saved definitions are retained until reset.

Knob 8 is Harmony Off on every Chord Play panel. Selecting the active chord again retriggers it. The step row mirrors two banks of seven chords plus Off: the current bank, then the following bank, wrapping after Blues. Selecting another bank changes this mapping. Setup contains routing, color choice, and Reset Chords. One Chord Editor owns Edit Chord; its Scale Context panel edits that same chord. Chord Enabled controls whether its chord button can trigger. Scale Operations resurfaces the existing conductor key, parallel, and dominant controls.

Harmony Overview is a read-only Core panel with full-width status lines and a visible K8:Off reminder. Sounds and Key come from the selected melody actor's native effective harmony, including its lookahead rules. Live shows whether the conductor has a manual override. Next shows the recorded next chord only while the transport runs. Return shows Next event during a live performance override, or Off button for a stopped override; it is not a countdown or a promise that recorded data exists. The next recorded event releases the override; knob 8 can always release it explicitly. These reads do not change recording, routing, comping or voicing.

Each chord-bank footer identifies the bank starting at step 1, the bank starting at step 9, and OFF on steps 8/16. The page title identifies the knob bank. Home pairs with Parallel, Parallel with Blues, and Blues with Home. Other settings pages retain the default Home/Parallel step mapping. Chord Editor and Chord Scale Context share an editing breadcrumb such as P2 Am7 (parallel bank, second chord); H and B identify Home and Blues. Selecting a chord updates that editing focus. Editing Chord in the overview repeats the same identity, independently of the sounding harmony. Touch help and category menus keep their normal footer.

Requires HarmonyBus 0.2.294. A manual chord replaces only current harmony; playing recorded harmony retains its next-chord lookahead. A stopped manual chord has no lookahead. The recorded boundary ends the live override and closes its recording gate. Existing conductor voicing, arp, rhythm and Render routing remain authoritative. Recording still requires Record explicitly.

Mode changes sweep all instrument pads, with rejected frames retried. Chord Play paints pads before competing control feedback. Native output membership clears old green highlights, and conductor-driven chord-button feedback refreshes while playing.

Clips keeps its special performance view and navigation. Setup uses the shared knob value boxes and clip-specific help. A filled slot number identifies the selected drum clip; a play triangle and Q identify playing and queued clips separately. Extended-settings selectors return to their entry panel when jogging left; jogging right cycles categories and click enters. The category-scoped bank bar remains stable during knob touches.

Session single tap opens the mode selector; double tap within 350 ms opens Clips. Back retains previous-view navigation.

Validation includes browser/controller and framebuffer checks, accepted/rejected pad delivery, parent-relative native bank tests, live/current/next and stopped/Off tests, native sequencer/DSP regressions, production-chain MIDI/audio checks, and ARM packaging. Hardware verification remains necessary after installation.
