
#[cfg(test)]
mod hb_clip_engine_tests {
    use super::*;
    fn fixture() -> Engine {
        let mut engine = Engine::new(48000,12000);
        engine.tracks[0].clips[0].set_loop(0,4);
        for (step,pitch) in [(0,60),(1,62),(2,64),(3,65)] {
            engine.tracks[0].clips[0].toggle_step(step,&[(pitch,100)]);
        }
        engine.tracks[0].playing_slot=Some(0);engine.playing=true;
        engine
    }
    #[test]
    fn playback_gestures_do_not_edit_clip_or_transport_and_release() {
        let mut engine=fixture();let saved=crate::persist::serialize(&engine);
        let mut output=Vec::new();
        engine.hb_perform(0,15,true,12,1,2); // repeat the first sixteenth
        for _ in 0..72 {engine.step_tick(0,&mut output);}
        let pitches:Vec<_>=output.iter().filter_map(|event|if let OutEvent::NoteOn{pitch,..}=event{Some(*pitch)}else{None}).collect();
        assert_eq!(pitches,vec![60,60,60]);assert_eq!(engine.tracks[0].pos_tick,72);
        engine.hb_perform(0,15,false,0,0,0);output.clear();engine.step_tick(0,&mut output);
        assert!(output.contains(&OutEvent::NoteOn{track:0,pitch:65,vel:100}));
        assert_eq!(crate::persist::serialize(&engine),saved);
        engine.stop(&mut output);assert!(engine.gates.is_empty());
        assert!(engine.hb_performance[0].slots.iter().all(Option::is_none));
    }
    #[test]
    fn recording_preserves_clip_gestures_and_restore_forgets_holds() {
        let mut engine=fixture();let saved=crate::persist::serialize(&engine);
        engine.recording=true;engine.rec_track=0;
        engine.hb_perform(0,0,true,13,1,0);
        assert!(engine.hb_performance[0].slots[0].is_some());
        let mut output=Vec::new();engine.step_tick(0,&mut output);
        assert_eq!(engine.tracks[0].clips[0].operation_intervals.len(),1);
        engine.recording=false;engine.hb_perform(0,0,true,13,1,0);
        assert!(engine.hb_performance[0].slots[0].is_some());
        assert!(crate::persist::load(&mut engine,&saved));
        assert!(engine.hb_performance[0].slots[0].is_none());
    }
    #[test]
    fn speed_retrigger_cannot_leave_an_old_note_off_to_cut_the_new_note() {
        let mut engine=fixture();engine.tracks[0].clips[0].notes[0].gate=120;
        engine.hb_perform(0,0,true,12,1,0);let mut output=Vec::new();
        for _ in 0..7 {engine.step_tick(0,&mut output);}
        let notes:Vec<_>=output.iter().filter(|event|matches!(event,OutEvent::NoteOn{..}|OutEvent::NoteOff{..})).collect();
        assert_eq!(notes,vec![&OutEvent::NoteOn{track:0,pitch:60,vel:100},&OutEvent::NoteOff{track:0,pitch:60},&OutEvent::NoteOn{track:0,pitch:60,vel:100}]);
        engine.stop(&mut output);assert!(engine.gates.is_empty());
    }
    #[test]
    fn automatic_windows_preserve_clip_and_stop_and_skip_recording() {
        let mut engine=fixture();
        engine.tracks[0].clips[0].set_clip_length(4);
        let saved=crate::persist::serialize(&engine);let mut output=Vec::new();
        engine.hb_auto_config(0,"mca1;0,12,1,0,1,2,2,2,100,0");
        for tick in 0..192 {engine.master_tick=tick+1;engine.step_tick(0,&mut output);}
        let pitches:Vec<_>=output.iter().filter_map(|event|if let OutEvent::NoteOn{pitch,..}=event{Some(*pitch)}else{None}).collect();
        let mut expected=vec![60,62,64,65];expected.extend([60;16]);assert_eq!(pitches,expected);
        assert_eq!(crate::persist::serialize(&engine),saved);
        engine.stop(&mut output);assert!(engine.gates.is_empty());assert!(engine.hb_auto[0][0].is_some());
        assert!(crate::persist::load(&mut engine,&saved));assert!(engine.hb_auto[0].iter().all(Option::is_none));
        engine.hb_auto_config(0,"mca1;0,12,1,0,1,1,1,1,100,0");
        engine.playing=true;engine.tracks[0].playing_slot=Some(0);engine.recording=true;engine.rec_track=0;
        output.clear();for tick in 0..96 {engine.master_tick=tick+1;engine.step_tick(0,&mut output);}
        let pitches:Vec<_>=output.iter().filter_map(|event|if let OutEvent::NoteOn{pitch,..}=event{Some(*pitch)}else{None}).collect();
        assert_eq!(pitches,vec![60,62,64,65]);
    }

}
