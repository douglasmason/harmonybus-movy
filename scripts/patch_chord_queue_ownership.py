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
        'export const chordActive=():boolean=>enabled&&!seqState.sessionMode;',
        '''export const chordActive=():boolean=>enabled&&!seqState.sessionMode;
/** The native conductor loop owns its own lifetime, not the active input view. */
export function chordQueueOwned():boolean {
    return (portFor(conductorTrack()).getParam('midi_fx1:hb_chord_queue_status')??'').startsWith('cq1|');
}''')
    if '    endChordStepEntry();releaseChordTouches();harmonyOff(false);' not in source:
        owner_start = source.find('export function setJointChordConductor')
        raise AssertionError('Joint owner seam: '+repr(source[owner_start:owner_start+800]))
    source = replace_once(source,
        '    endChordStepEntry();releaseChordTouches();harmonyOff(false);',
        '''    endChordStepEntry();releaseChordTouches();
    // Switching Joint's knob surface is not a Harmony Off gesture.
    if(!chordQueueOwned())harmonyOff(false);''')
    source = replace_once(source,
        """    endChordStepEntry();releaseChordTouches();resetBank();resetKnobLedCache();if(!value&&bankKnobs){for(let knob=0;knob<8;knob++){cachedSetAnimLED(knob,0,0,0);cachedSetAnimLED(71+knob,0,0,0,true);}bankKnobs=false;}send('chord_select','off');enabled=value;activeSlot=-1;route='';
    if(value&&[setup.conductor,setup.comp,setup.bass].includes(appState.activeTrack.index))selectTrack(Array.from({length:16},(_,index)=>(index+3)%16).find(track=>![setup.conductor,setup.comp,setup.bass].includes(track))!);
    if(!value)send('chord_route','off');""",
        """    // Only an explicit musical action can cancel an owned live queue.
    // Ordinary mode/track navigation relinquishes the controller only.
    const preserving=!value&&(setup.playMode===1||chordQueueOwned());
    endChordStepEntry();releaseChordTouches();resetBank();resetKnobLedCache();
    if(!value&&bankKnobs){for(let knob=0;knob<8;knob++){cachedSetAnimLED(knob,0,0,0);cachedSetAnimLED(71+knob,0,0,0,true);}bankKnobs=false;}
    if(!value&&!preserving)send('chord_select','off');
    enabled=value;activeSlot=-1;route='';
    if(value&&[setup.conductor,setup.comp,setup.bass].includes(appState.activeTrack.index))
        selectTrack(Array.from({length:16},(_,index)=>(index+3)%16).find(track=>![setup.conductor,setup.comp,setup.bass].includes(track))!);
    if(!value&&!preserving)send('chord_route','off');""")
    source = replace_once(source,
        "            releaseChordTouches();send('chord_select','off');activeSlot=-1;",
        '''            releaseChordTouches();
            // Reassigning a melody or staging another conductor does not
            // itself start a competing loop. The native queue bridge switches
            // owners on the new conductor's first accepted chord.
            if(setup.playMode!==1&&!chordQueueOwned())send('chord_select','off');
            activeSlot=-1;''')
    source = replace_once(source, "'Hold ':'Fill '", "'Hold ':'Queue '")
    path.write_text(source)

    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source = path.read_text()
    source = replace_once(source,
        'if next!=self.chord_joint {self.clear_chord_queue();self.release_chord_selection();self.chord_joint=next;}',
        '''if next!=self.chord_joint {
                    // Surface ownership is not native conductor ownership.
                    // Do not drop a playing queue because Joint knobs change.
                    if self.chord_queue.is_none(){self.release_chord_selection();}
                    self.chord_joint=next;
                }''')
    path.write_text(source)
