"""Separate queued chord ownership from Chord Play/Joint UI visibility.

Native HarmonyBus already owns one conductor queue. Keep it until explicit Off,
a genuinely new conductor performance, or Set lifetime end.
"""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_chord_queue_ownership(root: Path) -> None:
    """Patch the final composed controller and Rust bridge, not base chord assets."""
    path: Path = root / 'src/seq/chord-play.ts'
    source: str = path.read_text()
    source = replace_once(source,
        '    endChordStepEntry();releaseChordTouches();harmonyOff();',
        '''    endChordStepEntry();releaseChordTouches();
    // Merely choosing Joint's chord-knob conductor never cancels a
    // running queue. A new chord-entry command replaces it through the
    // existing native single-owner bridge.''')
    source = replace_once(source,
        """    endChordStepEntry();releaseChordTouches();resetBank();resetKnobLedCache();if(!value&&bankKnobs){for(let knob=0;knob<8;knob++){cachedSetAnimLED(knob,0,0,0);cachedSetAnimLED(71+knob,0,0,0,true);}bankKnobs=false;}send('chord_select','off');enabled=value;activeSlot=-1;route='';
    if(value&&[setup.conductor,setup.comp,setup.bass].includes(appState.activeTrack.index))selectTrack(Array.from({length:16},(_,index)=>(index+3)%16).find(track=>![setup.conductor,setup.comp,setup.bass].includes(track))!);
    if(!value)send('chord_route','off');""",
        """    // Native ownership decides whether there is a queue to retain; the
    // UI preference or a delayed display snapshot cannot decide this safely.
    endChordStepEntry();releaseChordTouches();resetBank();resetKnobLedCache();
    if(!value&&bankKnobs){for(let knob=0;knob<8;knob++){cachedSetAnimLED(knob,0,0,0);cachedSetAnimLED(71+knob,0,0,0,true);}bankKnobs=false;}
    if(!value)send('chord_select','leave');
    enabled=value;activeSlot=-1;route='';
    if(value&&[setup.conductor,setup.comp,setup.bass].includes(appState.activeTrack.index))
        selectTrack(Array.from({length:16},(_,index)=>(index+3)%16).find(track=>![setup.conductor,setup.comp,setup.bass].includes(track))!);""")
    source = replace_once(source,
        "            releaseChordTouches();send('chord_select','off');activeSlot=-1;",
        '''            releaseChordTouches();
            // Release an unqueued audition, but retain a native queue.
            send('chord_select','leave');
            activeSlot=-1;''')
    source = replace_once(source, "'Hold ':'Fill '", "'Hold ':'Queue '")
    path.write_text(source)

    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source = path.read_text()
    source = replace_once(source,
        '''            "chord_select" => {
                if val=="off" {self.clear_chord_queue();self.release_chord_selection();}''',
        '''            "chord_select" => {
                if val=="leave" {
                    // Process navigation after preceding chord commands, using
                    // the actual owner rather than an asynchronous UI snapshot.
                    if self.chord_queue.is_none(){
                        self.release_chord_selection();self.set_param("chord_route","off");
                    }
                }
                else if val=="off" {self.clear_chord_queue();self.release_chord_selection();}''')
    source = replace_once(source,
        'if next!=self.chord_joint {self.clear_chord_queue();self.release_chord_selection();self.chord_joint=next;}',
        '''if next!=self.chord_joint {
                    // Surface ownership is not native conductor ownership.
                    // Do not drop a playing queue because Joint knobs change.
                    if self.chord_queue.is_none(){self.release_chord_selection();}
                    self.chord_joint=next;
                }''')
    path.write_text(source)
