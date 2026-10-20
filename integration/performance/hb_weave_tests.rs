
#[cfg(test)]
mod hb_weave_tests {
    use super::*;
    fn fixture() -> Engine {
        let mut engine=Engine::new(48000,12000);
        for track in 0..2 { engine.tracks[track].clips[0].set_loop(0,4); engine.tracks[track].playing_slot=Some(0); }
        engine.tracks[0].clips[0].toggle_step(0,&[(60,100),(64,90)]);
        engine.tracks[0].clips[0].toggle_step(1,&[(67,80)]);
        engine.tracks[1].clips[0].toggle_step(0,&[(36,100),(40,100)]);
        engine.tracks[1].clips[0].toggle_step(2,&[(38,100)]);
        for note in &mut engine.tracks[1].clips[0].notes {note.gate=6;}
        engine.playing=true; engine
    }
    fn attacks(output: &[OutEvent]) -> Vec<u8> {
        output.iter().filter_map(|event|if let OutEvent::NoteOn{track:0,pitch,..}=event {Some(*pitch)} else {None}).collect()
    }
    #[test]
    fn donor_attacks_keep_destination_chords_gates_and_storage() {
        let mut engine=fixture();
        let mut actions=[0u64;crate::recorded_actions::LANES+1]; actions[0]=1;
        engine.tracks[0].clips[0].notes[0].actions=Some(actions);
        let saved=crate::persist::serialize(&engine);
        engine.hb_perform(0,0,true,65,2,0);
        let mut output=Vec::new();
        for tick in 0..96 {
            output.clear(); engine.step_tick(0,&mut output);
            assert_eq!(attacks(&output),match tick {0=>vec![60,64],48=>vec![67],_=>vec![]},"tick {tick}");
            if tick==0 {assert!(output.iter().any(|event|matches!(event,OutEvent::RecordedActions{track:0,pitch:60,actions:Some(value)} if *value==actions)));}
            if tick==6 {assert!(output.contains(&OutEvent::NoteOff{track:0,pitch:60}));}
        }
        assert_eq!(crate::persist::serialize(&engine),saved);
        engine.hb_perform(0,0,false,0,0,0);
        output.clear(); engine.step_tick(0,&mut output);
        engine.stop(&mut output); assert!(engine.gates.is_empty());
    }
    #[test]
    fn alternate_bar_conditions_and_manual_priority_reuse_existing_reader() {
        let mut engine=fixture();
        engine.hb_auto_config(0,"mca1;0,65,2,0,3,2,2,2,100,0");
        let mut output=Vec::new();
        for tick in 0..800 {
            engine.master_tick=tick+1; output.clear();
            if tick==400 {engine.hb_perform(0,1,true,12,1,0);}
            if tick==410 {engine.hb_perform(0,1,false,0,0,0);}
            engine.step_tick(0,&mut output);
            if tick==24 || tick==792 {assert_eq!(attacks(&output),vec![67]);}
            if tick==384 {assert_eq!(attacks(&output),vec![60,64]);}
            if tick==408 {assert!(attacks(&output).is_empty());}
            if tick==458 {assert_eq!(attacks(&output),vec![67]);} // auto resumes with fresh snapshot at 410
        }
    }
    #[test]
    fn unavailable_donor_and_recording_fall_back_without_recording_weave() {
        for donor in [0,3,17] {
            let mut engine=fixture(); engine.hb_perform(0,0,true,65,donor,0);
            let mut output=Vec::new(); engine.step_tick(0,&mut output);
            assert_eq!(attacks(&output),vec![60,64]);
        }
        let mut engine=fixture();engine.recording=true;engine.rec_track=0;
        engine.hb_perform(0,0,true,65,2,0);
        assert!(engine.hb_performance[0].slots[0].is_none());
        let mut output=Vec::new();engine.step_tick(0,&mut output);
        assert!(engine.tracks[0].clips[0].operation_intervals.is_empty());
    }
    #[test]
    fn donor_slot_change_and_reciprocal_borrowing_read_original_material() {
        let mut engine=fixture(); engine.hb_perform(0,0,true,65,2,0);engine.hb_perform(1,0,true,65,1,0);
        let mut output=Vec::new();
        for tick in 0..49 {
            output.clear();engine.step_tick(0,&mut output);engine.step_tick(1,&mut output);
            if tick==24 {assert!(output.contains(&OutEvent::NoteOn{track:1,pitch:38,vel:100}));assert!(attacks(&output).is_empty());}
            if tick==48 {assert_eq!(attacks(&output),vec![67]);}
        }
        engine.tracks[1].playing_slot=None;
        output.clear();engine.tracks[0].pos_tick=24;engine.tracks[0].clips[0].notes.iter_mut().for_each(|note|note.fired=false);
        engine.step_tick(0,&mut output);assert_eq!(attacks(&output),vec![67]);
    }
}
