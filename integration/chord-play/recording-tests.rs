#[cfg(test)] mod chord_selection_recording_tests {
    use super::*;
    #[test] fn activation_joins_existing_take_and_replaces_only_playing_conductor() {
        let mut engine=Engine::new(48000,12000);
        for track in [0,3] {
            engine.tracks[track].clips[0].set_loop(0,4);
            engine.tracks[track].clips[0].add_note_raw(0,0,48,60,90);
            engine.tracks[track].clips[2].set_loop(0,4);
            engine.tracks[track].clips[2].add_note_raw(0,0,48,65,80);
            engine.tracks[track].playing_slot=Some(0);
            engine.tracks[track].active_clip=2;
        }
        let mut output=Vec::new();
        engine.playing=true;engine.rec_track=3;
        engine.record_chord_activation(0,&mut output);
        assert_eq!(engine.joint_overwrite_mask,0); // Record is required.
        engine.recording=true;
        engine.record_chord_activation(0,&mut output);
        assert!(engine.tracks[0].clips[0].notes.is_empty());
        assert_eq!(engine.tracks[0].clips[2].notes[0].pitch,65);
        assert_eq!(engine.tracks[3].clips[0].notes[0].pitch,60);
        assert_eq!(engine.rec_track,3);assert_eq!(engine.joint_record_mask,0);
        assert!(engine.records_track(0)&&engine.records_track(3)&&!engine.records_track(1));
        engine.live_note_on(0,70,100);engine.live_note_on(3,72,90);
        assert_eq!(engine.rec_pending[0].slot,0);
        assert_eq!(engine.rec_pending[1].slot,2); // Existing ordinary take keeps its slot policy.
        engine.tracks[0].pos_tick=12;engine.tracks[3].pos_tick=12;
        engine.live_note_off(0,70);engine.live_note_off(3,72);
        assert_eq!(engine.tracks[0].clips[0].notes[0].pitch,70);
        assert_eq!(engine.tracks[3].clips[2].notes.len(),2);
        engine.live_note_on(0,71,100);engine.tracks[0].pos_tick=24;
        engine.live_note_on(3,75,90);
        engine.tracks[0].queued_slot=Some(1);engine.tracks[3].queued_slot=Some(1);engine.joint_before_launch();
        assert_eq!(engine.rec_pending.len(),1); // Close only the conductor before launch.
        assert_eq!(engine.rec_pending[0].track,3); // Preserve ordinary recording's held tail.
        engine.toggle_record(3);engine.toggle_record(3);
        assert_eq!(engine.joint_overwrite_mask,0); // A later take starts clean.
    }
    #[test] fn silent_conductor_selections_record_save_copy_and_replay_before_notes(){
        for descriptor in [0xc858001f00000000u64|0x91|(0xab5<<12),0xc859001f00000000u64|0x491|(0xab5<<12)|(2<<37)|(5<<41)] {
        let mut engine=Engine::new(48000,12000);
        engine.tracks[0].clips[0].set_loop(0,4);engine.tracks[0].playing_slot=Some(0);
        engine.playing=true;engine.recording=true;engine.rec_track=0;
        let mut actions=[0;crate::recorded_actions::LANES+1];actions[0]=descriptor;
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
    #[test] fn selections_only_write_after_record_and_replace_conductor_interval(){
        let mut engine=Engine::new(48000,12000);engine.link_enabled=false;
        engine.tracks[0].clips[0].set_loop(0,4);engine.tracks[0].playing_slot=Some(0);engine.playing=true;
        engine.tracks[0].clips[0].add_note_raw(0,0,24,60,90);
        let mut actions=[0;crate::recorded_actions::LANES+1];actions[0]=0xc858001f00000000u64|0x91|(0xab5<<12);
        let message=format!("ra4,{}",crate::recorded_actions::payload(70,actions));
        engine.recorded_action(0,&message);engine.live_note_on(0,70,100);engine.live_note_off(0,70);
        assert_eq!(engine.tracks[0].clips[0].notes.len(),1);
        assert_eq!(engine.tracks[0].clips[0].notes[0].pitch,60);
        assert!(!engine.recording&&!engine.pending_rec);
        engine.toggle_joint_record(9,1);
        let mut output=Vec::new();engine.joint_erase_tick(0,0,&mut output);
        assert!(engine.tracks[0].clips[0].notes.is_empty());
        engine.recorded_action(0,&message);engine.live_note_on(0,70,100);
        for _ in 0..24{engine.step_tick(0,&mut output);}engine.live_note_off(0,70);
        assert_eq!(engine.tracks[0].clips[0].notes.len(),1);
        assert_eq!(engine.tracks[0].clips[0].notes[0].actions,Some(actions));
    }
}
