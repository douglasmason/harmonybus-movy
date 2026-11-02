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
    # Queue status caching was extracted by the UI overhead patch; update the
    # canonical raw snapshot rather than the earlier inline parse.
    source = replace_once(source,
        "    if(setup.playMode)queueStatus();",
        "    queueStatus();")
    source = replace_once(source,
        "const raw=setup.playMode?(conductor.getParam('midi_fx1:hb_chord_queue_status')??''):'';",
        """const raw=conductor.getParam('midi_fx1:hb_chord_queue_status')??'';
        const present=raw.startsWith('cq1|');
        const override=present&&conductor.getParam('midi_fx1:hb_chord_queue_override')==='On';
        const loop=conductor.getParam('midi_fx1:chord_queue_end')==='Loop';
        if(buttonQueuePresent!==present||buttonQueueOverride!==override||buttonQueueLoop!==loop)
            appState.dirty=true;
        buttonQueuePresent=present;buttonQueueOverride=override;buttonQueueLoop=loop;""")
    source = replace_once(source,
        "export function harmonyOff():void{",
        """export function harmonyOff():void{
    buttonQueuePresent=false;buttonQueueOverride=false;buttonQueueLoop=true;""")
    # Apply after Joint's composed step and knob painter, not to the base
    # render assets. Only chord slots pulse white; clip/motif launch controls
    # retain their own separate feedback.
    source = replace_once(source,
        "cachedSetAnimLED(16+index,color,chordSlotQueued(slot)?0:color,chordSlotQueued(slot)?ANIM_PULSE_SLOW:0);",
        "cachedSetAnimLED(16+index,color,(!contentKey&&color===120||chordSlotQueued(slot))?0:color,(!contentKey&&color===120||chordSlotQueued(slot))?ANIM_PULSE_SLOW:0);")
    source = replace_once(source,
        "cachedSetAnimLED(knob,color,chordSlotQueued(index)?0:color,chordSlotQueued(index)?ANIM_PULSE_SLOW:0);",
        "cachedSetAnimLED(knob,color,(/^cp_slot_/.test(keys[knob]??'')&&color===120||chordSlotQueued(index))?0:color,(/^cp_slot_/.test(keys[knob]??'')&&color===120||chordSlotQueued(index))?ANIM_PULSE_SLOW:0);")
    source = replace_once(source,
        "cachedSetAnimLED(71+knob,color,chordSlotQueued(index)?0:color,chordSlotQueued(index)?ANIM_PULSE_SLOW:0,true);",
        "cachedSetAnimLED(71+knob,color,(/^cp_slot_/.test(keys[knob]??'')&&color===120||chordSlotQueued(index))?0:color,(/^cp_slot_/.test(keys[knob]??'')&&color===120||chordSlotQueued(index))?ANIM_PULSE_SLOW:0,true);")
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
                                // Loop bypass clears the subordinate output mute.
                                self.chains.set_param(track,"midi_fx1:hb_chord_queue_mute","Off");
                                self.chains.set_param(track,"midi_fx1:hb_chord_queue_override","Off");
                                self.release_chord_selection();
                            } else if action=="on" {
                                self.chains.set_param(track,"midi_fx1:hb_chord_queue_mute","Off");
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
                                    if self.chains.get_param(track,"midi_fx1:hb_chord_queue_override").as_deref()==Some("On") {
                                        self.chains.set_param(track,"midi_fx1:hb_chord_queue_mute","On");
                                        self.release_chord_selection();
                                    }
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
            "chord_queue" => {
                if val=="retrigger" {
                    if let Some(track)=self.chord_queue {
                        self.release_chord_selection();
                        self.chains.set_param(track,"midi_fx1:hb_chord_queue","retrigger");
                        self.chord_queue_tick=None;
                        self.tick_chord_queue();
                    }
                } else''')
    source = replace_once(source,
        'if next!=self.chord_joint {self.clear_chord_queue();self.release_chord_selection();self.chord_joint=next;}',
        '''if next!=self.chord_joint {
                    // Surface ownership is not native conductor ownership.
                    // Do not drop a playing queue because Joint knobs change.
                    if self.chord_queue.is_none(){self.release_chord_selection();}
                    self.chord_joint=next;
                }''')
    path.write_text(source)
