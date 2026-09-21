#[cfg(test)] mod recorded_operation_tests {
    use super::*;
    fn fixture()->Engine {
        let mut engine=Engine::new(48000,12000);
        engine.tracks[0].clips[0].set_loop(0,4);
        engine.tracks[0].playing_slot=Some(0);engine.playing=true;engine.recording=true;engine.rec_track=0;
        engine
    }
    fn actions()->crate::recorded_actions::Actions {
        let mut actions=[1u64<<63;17];actions[0]|=3u64<<32|1000;actions[16]=1;actions
    }
    #[test] fn note_actions_survive_timing_order_storage_and_reassignment(){
        for late in [false,true] {
            let mut engine=fixture();let original=actions();
            let message=format!("ra1,{}",crate::recorded_actions::payload(60,original));
            if !late{engine.recorded_action(0,&message);}
            engine.live_note_on(0,60,100);
            if late{engine.recorded_action(0,&message);}
            let mut output=Vec::new();for _ in 0..12{engine.step_tick(0,&mut output);}
            engine.live_note_off(0,60);
            assert_eq!(engine.tracks[0].clips[0].notes[0].actions,Some(original));
            assert_eq!(engine.tracks[0].clips[0].notes[0].pitch,60);
            let saved=crate::persist::serialize(&engine);
            assert!(crate::persist::load(&mut engine,&saved));
            assert_eq!(engine.tracks[0].clips[0].notes[0].actions,Some(original));
            engine.recording=false;engine.playing=true;engine.tracks[0].playing_slot=Some(0);engine.tracks[0].pos_tick=0;
            output.clear();engine.step_tick(0,&mut output);
            let action=output.iter().position(|event|matches!(event,OutEvent::RecordedActions{actions:Some(value),..} if *value==original)).unwrap();
            let note=output.iter().position(|event|matches!(event,OutEvent::NoteOn{pitch:60,..})).unwrap();
            assert!(action<note);
            engine.tracks[0].clips[0].double_loop();
            assert!(engine.tracks[0].clips[0].notes.iter().all(|note|note.actions==Some(original)));
        }
    }
    #[test] fn timed_operations_record_and_loop_without_rewriting_notes(){
        let mut engine=fixture();engine.tracks[0].clips[0].toggle_step(0,&[(60,100)]);
        let original=engine.tracks[0].clips[0].notes[0].pitch;
        let mut output=Vec::new();
        engine.hb_perform(0,2,true,12,1,0);
        for _ in 0..14{engine.step_tick(0,&mut output);}
        engine.hb_perform(0,2,false,0,0,0);
        engine.step_tick(0,&mut output);
        let intervals=engine.tracks[0].clips[0].operation_intervals.clone();
        assert_eq!(intervals.len(),1);assert_eq!(intervals[0].length,14);
        assert_eq!(engine.tracks[0].clips[0].notes[0].pitch,original);
        let saved=crate::persist::serialize(&engine);assert!(crate::persist::load(&mut engine,&saved));
        assert_eq!(engine.tracks[0].clips[0].operation_intervals,intervals);
        assert!(intervals[0].window(13,0,0,96).is_some());assert!(intervals[0].window(14,0,0,96).is_none());
        engine.tracks[0].clips[0].double_loop();assert_eq!(engine.tracks[0].clips[0].operation_intervals.len(),2);
        engine.tracks[0].clips[0].clear();assert!(engine.tracks[0].clips[0].operation_intervals.is_empty());
    }
}
