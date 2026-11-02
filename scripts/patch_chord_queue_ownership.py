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
    # Selection preference is not permission to destroy an existing queue.
    source = replace_once(source,
        "send('chord_queue','off');setup.playMode=selected;",
        "setup.playMode=selected;")
    # A queued progression outlives the Queued/Immediate preference. The LED
    # reflects actual native override authority, read only at existing 100ms
    # status refreshes rather than during LED painting.
    source = replace_once(source,
        "const queue=setup.playMode?(conductor.getParam('midi_fx1:hb_chord_queue_status')??'').split('|'):[];",
        "const queue=(conductor.getParam('midi_fx1:hb_chord_queue_status')??'').split('|');")
    source = replace_once(source,
        "const queued=queue[0]==='cq1',count=queued?Number(queue[1]):0;",
        """const queued=queue[0]==='cq1',count=queued?Number(queue[1]):0;
        buttonQueuePresent=queued;
        buttonQueueOverride=queued&&conductor.getParam('midi_fx1:hb_chord_queue_override')==='On';
        buttonQueueMute=buttonQueueOverride&&conductor.getParam('midi_fx1:hb_chord_queue_mute')==='On';""")
    source = replace_once(source,
        "export function harmonyOff():void{",
        """export function harmonyOff():void{
    buttonQueuePresent=false;buttonQueueOverride=false;buttonQueueMute=false;""")
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
    # The physical Loop button changes authority, not queue ownership.
    # Disabling releases the one live chord through the existing MIDI path.
    source = replace_once(source,
        '            "chord_queue" => {',
        '''            "chord_override" => {
                if let Some((owner,action))=val.split_once(',') {
                    if let Ok(track)=owner.parse::<usize>() {
                        if self.chord_queue==Some(track) {
                            if action=="off" {
                                self.chains.set_param(track,"midi_fx1:hb_chord_queue_override","Off");
                                self.release_chord_selection();
                            } else if action=="on" {
                                self.chains.set_param(track,"midi_fx1:hb_chord_queue_override","On");
                                self.chord_queue_tick=None;
                            }
                        }
                    }
                }
            }
            "chord_mute" => {
                if let Some((owner,action))=val.split_once(',') {
                    if let Ok(track)=owner.parse::<usize>() {
                        if self.chord_queue==Some(track) {
                            match action {
                                "on" => {
                                    self.chains.set_param(track,"midi_fx1:hb_chord_queue_mute","On");
                                    self.release_chord_selection();
                                },
                                "off" => {
                                    self.chains.set_param(track,"midi_fx1:hb_chord_queue_mute","Off");
                                    // Recovery adopts the current native chord without
                                    // restarting or advancing the queue.
                                    self.tick_chord_queue();
                                },
                                _ => {}
                            }
                        }
                    }
                }
            }
            "chord_queue" => {''')
    source = replace_once(source,
        'if next!=self.chord_joint {self.clear_chord_queue();self.release_chord_selection();self.chord_joint=next;}',
        '''if next!=self.chord_joint {
                    // Surface ownership is not native conductor ownership.
                    // Do not drop a playing queue because Joint knobs change.
                    if self.chord_queue.is_none(){self.release_chord_selection();}
                    self.chord_joint=next;
                }''')
    path.write_text(source)
