impl Engine {
    /// Consume conductor-only native changes; followers never produce sc1.
    pub fn shared_capture(&mut self,message:&str){
        for field in message.split('|') {
            let Some((track,kind,value))=crate::shared_context::parse(field) else {continue;};
            if !self.recording || !self.playing || self.count_in_left>0 || self.rec_track!=track {continue;}
            let slot=self.tracks[track].active_clip;
            let mut position=self.tracks[track].pos_tick;
            if kind==0&&((value.c>>1)&255)>0 {
                if let Some(note)=self.rec_pending.iter().rev().find(|note|note.track==track&&note.pitch as i32==((value.c>>1)&255)-1&&note.start_tick>=0&&position.abs_diff(note.start_tick as u32)<=1){position=note.start_tick as u32;}
            }
            let clip=&mut self.tracks[track].clips[slot];
            if !clip.exists(){continue;}
            crate::shared_context::record(&mut clip.shared_events,crate::shared_context::Event{tick:position,kind,value});
            if kind==0 {self.key_playback[track].value=self.key_playback[track].sequence.apply(value);}
            self.dirty=true;
        }
    }
    /// Resolve a single track at its own (possibly scaled) musical position.
    fn shared_track(&mut self,track:usize,out:&mut Vec<OutEvent>){
        if self.recording&&self.rec_track==track{return;}
        for kind in 0..3 {
            let next=if self.playing {
                self.tracks[track].playing_slot.and_then(|slot|{
                    let clip=&self.tracks[track].clips[slot];
                    crate::shared_context::at(&clip.shared_events,kind as u8,self.tracks[track].pos_tick,clip.loop_start_ticks(),clip.length_ticks())
                        .map(|(event,age)|(slot,event,age))
                })
            }else{None};
            let signature=next.map(|(slot,event,_)|(slot,event));
            let previous=self.shared_seen[track][kind];
            // Same owner across wrap is not released/restarted. An explicit
            // event at this tick can reassert precedence on its next pass.
            let retrigger=next.is_some_and(|(_,_,age)|age==0)&&self.shared_tick_seen[track]!=self.master_tick;
            let mut key_changed=false;
            if kind==0 {
                if let Some((slot,_,_))=next {
                    let clip=&self.tracks[track].clips[slot];
                    key_changed=self.key_playback[track].resolve(&clip.shared_events,slot,self.tracks[track].pos_tick,clip.loop_start_ticks(),clip.length_ticks(),self.master_tick,self.tracks[track].cycle.max(1),previous!=signature);
                }else if self.key_playback[track].sequence.valid {self.key_playback[track].reset();key_changed=true;}
            }
            if previous!=signature||retrigger||key_changed||(self.master_tick<self.shared_tick_seen[track]&&signature.is_some()) {
                self.shared_seen[track][kind]=signature;
                let (mut value,age)=next.map_or((crate::shared_context::Value::default(),0),|(_,event,age)|(event.value,age));
                if kind==0 {
                    if next.is_some(){value=self.key_playback[track].value;}
                    out.push(OutEvent::SharedKeySequence{track:track as u8,state:self.key_playback[track].sequence});
                }
                // Preserve chronological priority when reconstructing from a
                // stopped or mid-loop playhead. Track index breaks exact ties.
                let age=next.map_or(age as u64,|(slot,_,_)|{let clip=&self.tracks[track].clips[slot];age as u64*clip.scale_den.max(1) as u64/clip.scale_num.max(1) as u64});
                let order=(self.master_tick.saturating_add(1<<24).saturating_sub(age))*16+track as u64;
                out.push(OutEvent::SharedContext{track:track as u8,kind:kind as u8,value,order});
            }
        }
        self.shared_tick_seen[track]=self.master_tick;
    }
    /// Also handles stop/clip removal when no sequencer ticks are forthcoming.
    pub fn shared_transport(&mut self,out:&mut Vec<OutEvent>){
        if self.shared_reset_needed {
            self.shared_reset_needed=false;out.push(OutEvent::SharedReset);
            for track in 0..self.tracks.len(){self.shared_track(track,out);}
        }
        let recording=if self.recording&&self.playing {Some(self.rec_track)}else{None};
        if recording!=self.shared_recording {
            if let Some(track)=self.shared_recording {
                // A momentary take ends here, just like its recorded note
                // gates. A persistent latch deliberately remains a setting.
                let slot=self.tracks[track].active_clip;
                let position=self.tracks[track].pos_tick;
                let clip=&mut self.tracks[track].clips[slot];
                if crate::shared_context::at(&clip.shared_events,1,position,clip.loop_start_ticks(),clip.length_ticks()).is_some_and(|(event,_)|event.value.on&&(event.value.c==1||event.value.c==3)) {
                    crate::shared_context::record(&mut clip.shared_events,crate::shared_context::Event{tick:position,kind:1,value:crate::shared_context::Value::default()});self.dirty=true;
                }
                out.push(OutEvent::SharedHandoff{track:track as u8});
                self.shared_seen[track]=[None;3];
                self.shared_track(track,out);
            }
            self.shared_recording=recording;
            out.push(OutEvent::SharedRecord{track:recording.map_or(-1,|track|track as i32)});
        }
        for track in 0..self.tracks.len(){
            if !self.playing||self.tracks[track].playing_slot.is_none(){self.shared_track(track,out);}
        }
    }
}
#[cfg(test)] mod shared_context_recording_tests {
    use super::*;
    use crate::shared_context::{Event,Value};
    fn setup()->Engine {
        let mut engine=Engine::new(48000,12000);
        engine.tracks[0].clips[0].length_steps=16;
        engine.tracks[0].playing_slot=Some(0);engine.playing=true;engine
    }
    #[test] fn records_only_selected_take_and_roundtrips_without_notes(){
        let mut engine=setup();engine.recording=true;engine.rec_track=0;engine.tracks[0].pos_tick=350;
        engine.shared_capture("fic1,0,1,0|hu1,0,0,0,1|sc1,0,1,1,2,0,0|sc1,1,1,1,3,0,0");
        engine.tracks[0].pos_tick=40;engine.shared_capture("fic1,0,1,0|sc1,0,1,0,2,0,0");
        assert_eq!(engine.tracks[0].clips[0].shared_events.len(),2);
        let saved=crate::persist::serialize(&engine);let mut restored=setup();
        assert!(crate::persist::load(&mut restored,&saved));
        assert_eq!(engine.tracks[0].clips[0].shared_events,restored.tracks[0].clips[0].shared_events);
        assert!(restored.tracks[1].clips[0].shared_events.is_empty());
    }
    #[test] fn wrap_retains_owner_release_removes_it_and_stop_clears(){
        let mut engine=setup();let on=Value{on:true,a:2,b:0,c:0};
        engine.tracks[0].clips[0].shared_events=vec![Event{tick:40,kind:1,value:Value::default()},Event{tick:350,kind:1,value:on}];
        let mut out=Vec::new();engine.tracks[0].pos_tick=350;engine.shared_track(0,&mut out);
        assert!(matches!(out.last(),Some(OutEvent::SharedContext{value,..}) if value.on));
        out.clear();engine.master_tick+=34;engine.tracks[0].pos_tick=0;engine.shared_track(0,&mut out);assert!(out.is_empty());
        engine.master_tick+=40;engine.tracks[0].pos_tick=40;engine.shared_track(0,&mut out);
        assert!(matches!(out.last(),Some(OutEvent::SharedContext{value,..}) if !value.on));
        engine.tracks[0].pos_tick=350;engine.shared_track(0,&mut out);out.clear();
        engine.playing=false;engine.shared_transport(&mut out);
        assert!(matches!(out.last(),Some(OutEvent::SharedContext{value,..}) if !value.on));
    }
    #[test] fn clip_switch_and_clear_remove_only_their_owner(){
        let mut engine=setup();let event=Event{tick:0,kind:0,value:Value{on:true,a:2,b:2774,c:0}};
        engine.tracks[0].clips[0].shared_events.push(event);
        engine.tracks[1].clips[0].length_steps=16;engine.tracks[1].playing_slot=Some(0);engine.tracks[1].clips[0].shared_events.push(event);
        let mut out=Vec::new();engine.shared_track(0,&mut out);engine.shared_track(1,&mut out);out.clear();engine.master_tick+=1;
        engine.tracks[0].playing_slot=None;engine.shared_transport(&mut out);
        assert_eq!(out.iter().filter(|event|matches!(event,OutEvent::SharedContext{..})).count(),1);assert!(matches!(out.last(),Some(OutEvent::SharedContext{track:0,value,..}) if !value.on));
        assert!(engine.shared_seen[1][0].is_some());
        engine.tracks[1].clips[0].clear();out.clear();engine.shared_track(1,&mut out);
        assert!(matches!(out.last(),Some(OutEvent::SharedContext{track:1,value,..}) if !value.on));
    }
    #[test] fn landing_intent_precedes_its_note_on_every_loop(){
        let mut engine=setup();engine.tracks[0].muted=false;
        let value=Value{on:true,a:2,b:2774|(2741<<16),c:126|(2741<<13)};
        engine.tracks[0].clips[0].shared_events.push(Event{tick:0,kind:0,value});
        engine.tracks[0].clips[0].add_note_raw(0,0,4,62,100);
        let mut out=Vec::new();
        for _ in 0..2 {
            out.clear();engine.tracks[0].pos_tick=0;engine.tracks[0].clips[0].release_pass_flags();engine.master_tick+=384;
            engine.step_tick(0,&mut out);
            let anchor=out.iter().position(|event|matches!(event,OutEvent::SharedAnchor{value:found,..} if *found==value)).unwrap();
            let note=out.iter().position(|event|matches!(event,OutEvent::NoteOn{pitch:62,..})).unwrap();
            assert!(anchor<note);
        }
    }

    #[test] fn recursive_loops_undo_and_transport_restart(){
        let mut engine=setup();let mut out=Vec::new();
        engine.tracks[0].clips[0].shared_events.push(Event{tick:0,kind:0,value:Value{on:true,a:13,b:2741,c:(2741<<13)|(1<<26)}});
        let snapshot=crate::persist::serialize(&engine);
        for tick in 0..800 {
            engine.master_tick=tick;engine.tracks[0].pos_tick=(tick%384) as u32;engine.tracks[0].cycle=(tick/384+1) as u32;
            out.clear();engine.shared_track(0,&mut out);
        }
        assert_eq!(engine.key_playback[0].value.a,3);
        assert_eq!(engine.key_playback[0].sequence.count,3);
        assert!(engine.undo_restore(&snapshot));out.clear();engine.shared_transport(&mut out);
        assert_eq!(engine.key_playback[0].value.a,3); // Unrelated clip Undo cannot rewind the cascade.
        engine.playing=false;engine.shared_transport(&mut out);assert!(!engine.key_playback[0].sequence.valid);
        engine.start_transport();engine.shared_track(0,&mut out);assert_eq!(engine.key_playback[0].value.a,1);
    }
    #[test] fn recursive_capture_roundtrip_and_absolute_payload_to_native(){
        let mut engine=setup();engine.recording=true;engine.rec_track=0;
        engine.shared_capture(&format!("sc1,0,0,1,13,2741,{}",(2741<<13)|(1<<26)));
        let saved=crate::persist::serialize(&engine);let mut restored=setup();assert!(crate::persist::load(&mut restored,&saved));
        restored.playing=true;restored.tracks[0].playing_slot=Some(0);let mut out=Vec::new();restored.shared_track(0,&mut out);
        assert!(out.iter().any(|event|matches!(event,OutEvent::SharedContext{kind:0,value,..} if value.a==1&&value.c>>26==0)));
        assert!(out.iter().any(|event|matches!(event,OutEvent::SharedKeySequence{state,..} if state.count==1&&state.depth==1)));
        // A history snapshot does not enlarge the existing note-action event payload.
        assert!(std::mem::size_of::<crate::shared_context::KeySequence>()<std::mem::size_of::<crate::recorded_actions::Actions>());
    }

    #[test] fn relaunch_of_same_clip_restarts_sequence_even_in_first_pass(){
        let mut engine=setup();let mut out=Vec::new();
        engine.tracks[0].clips[0].shared_events=vec![
            Event{tick:0,kind:0,value:Value{on:true,a:13,b:2741,c:(2741<<13)|(1<<26)}},
            Event{tick:100,kind:0,value:Value{on:true,a:13,b:2741,c:(2741<<13)|(1<<26)}}];
        engine.shared_track(0,&mut out);engine.master_tick=100;engine.tracks[0].pos_tick=100;engine.shared_track(0,&mut out);
        assert_eq!(engine.key_playback[0].value.a,2);
        engine.launch_clip(0,0);engine.master_tick=384;engine.service_tick(&mut out);
        assert_eq!(engine.key_playback[0].value.a,1);assert_eq!(engine.key_playback[0].sequence.count,1);
    }

}
