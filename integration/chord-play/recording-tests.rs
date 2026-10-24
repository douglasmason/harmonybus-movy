#[cfg(test)] mod chord_selection_recording_tests {
    use super::*;
    #[test] fn silent_conductor_selections_record_save_copy_and_replay_before_notes(){
        let mut engine=Engine::new(48000,12000);
        engine.tracks[0].clips[0].set_loop(0,4);engine.tracks[0].playing_slot=Some(0);
        engine.playing=true;engine.recording=true;engine.rec_track=0;
        let mut actions=[0;crate::recorded_actions::LANES+1];actions[0]=0xc858001f00000000|0x91|(0xab5<<12);
        engine.recorded_action(0,&format!("ra4,{}",crate::recorded_actions::payload(70,actions)));
        engine.live_note_on(0,70,100);let mut output=Vec::new();
        for _ in 0..24 {engine.step_tick(0,&mut output);}engine.live_note_off(0,70);
        assert_eq!(engine.tracks[0].clips[0].notes[0].actions,Some(actions));
        let saved=crate::persist::serialize(&engine);assert!(crate::persist::load(&mut engine,&saved));
        assert_eq!(engine.tracks[0].clips[0].notes[0].actions,Some(actions));
        engine.recording=false;engine.playing=true;engine.tracks[0].playing_slot=Some(0);engine.tracks[0].pos_tick=0;
        output.clear();engine.step_tick(0,&mut output);
        let snapshot=output.iter().position(|event|matches!(event,OutEvent::RecordedActions{track:0,actions:Some(value),..} if *value==actions)).unwrap();
        let onset=output.iter().position(|event|matches!(event,OutEvent::NoteOn{track:0,pitch:70,..})).unwrap();assert!(snapshot<onset);
        engine.tracks[0].clips[0].double_loop();assert!(engine.tracks[0].clips[0].notes.iter().all(|note|note.actions==Some(actions)));
    }
}
