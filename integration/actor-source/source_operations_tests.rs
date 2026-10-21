#[cfg(test)]
mod source_operations_tests {
    use super::*;
    fn actions(amount:u64)->crate::recorded_actions::Actions {
        let mut words=[1u64<<63;crate::recorded_actions::LANES+1];
        words[0]|=3u64<<32|amount;words[crate::recorded_actions::LANES]=0;words
    }
    fn setup(donor:usize)->Engine {
        let mut engine=Engine::new(48000,12000);engine.playing=true;
        for track in [1,2,3,donor] {engine.tracks[track].playing_slot=Some(0);engine.tracks[track].clips[0].set_loop(0,16);}
        engine.tracks[1].clips[0].add_note_raw(0,0,48,60,100);
        engine.tracks[1].clips[0].add_note_raw(0,0,48,64,100);
        engine.tracks[2].clips[0].add_note_raw(0,0,48,36,100);
        engine.tracks[2].clips[0].add_note_raw(1,24,48,36,100);
        engine.tracks[3].clips[0].add_note_raw(0,0,48,70,77);
        engine.tracks[3].clips[0].notes[0].actions=Some(actions(1000));
        engine.tracks[donor].clips[0].add_note_raw(0,0,24,90,22);
        engine.tracks[donor].clips[0].notes[0].actions=Some(actions(2000));
        engine.source_route_set(&format!("3 1 1 0 2 0 0 -1 -1 -1 -1 -1 -1 {donor} 0"));engine
    }
    fn tick(engine:&mut Engine)->Vec<OutEvent>{let mut output=Vec::new();engine.advance_block(250,&mut output);output}
    fn assert_actions(output:&[OutEvent],expected:Option<crate::recorded_actions::Actions>) {
        let events:Vec<_>=output.iter().filter_map(|event|if let OutEvent::RecordedActions{track:3,actions,..}=event{Some(*actions)}else{None}).collect();
        assert_eq!(events,vec![expected;2]);
    }
    #[test]
    fn raw_note_operations_precede_each_chord_voice_and_keep_destination_expression() {
        for donor in [0,4] {
            let mut engine=setup(donor);
            // Donor's own Source route is not followed recursively.
            engine.source_route_set(&format!("{donor} 1 3 0 -1 -1 0"));
            let output=tick(&mut engine);assert_actions(&output,Some(actions(2000)));
            for pitch in [60,64] {
                let operation=output.iter().position(|event|matches!(event,OutEvent::RecordedActions{track:3,pitch:value,..} if *value==pitch)).unwrap();
                let attack=output.iter().position(|event|*event==OutEvent::NoteOn{track:3,pitch,vel:77}).unwrap();assert!(operation<attack);
            }
        }
    }
    #[test]
    fn independent_phase_wrap_and_chord_tie_are_stable_across_track_order() {
        for donor in [0,4] {
            let mut engine=setup(donor);let clip=&mut engine.tracks[donor].clips[0];
            clip.set_clip_length(4);clip.scale_num=2;
            clip.add_note_raw(2,48,24,91,55);clip.notes[1].actions=Some(actions(3000));
            clip.add_note_raw(2,48,24,92,55);clip.notes[2].actions=Some(actions(4000));
            engine.tracks[donor].pos_tick=47;
            assert_actions(&tick(&mut engine),Some(actions(2000)));
            for _ in 1..24 {tick(&mut engine);}
            assert_actions(&tick(&mut engine),Some(actions(4000)));
        }
    }
    #[test]
    fn missing_muted_stopped_donor_falls_back_and_empty_donor_clears_recorded_override() {
        for condition in 0..4 {
            let mut engine=setup(0);
            match condition {0=>engine.tracks[0].muted=true,1=>engine.tracks[0].playing_slot=None,
                2=>engine.tracks[0].clips[0].clear(),_=>engine.tracks[0].clips[0].notes.clear()}
            assert_actions(&tick(&mut engine),if condition==3 {None}else{Some(actions(1000))});
        }
    }
    #[test]
    fn route_changes_preserve_gates_pressure_and_held_grid_owner() {
        let mut engine=setup(0);
        engine.tracks[3].clips[0].notes[0].pressure=vec![(2,66)];
        engine.tracks[0].clips[0].grid_gates.push(crate::grid::Gate{start:0,end:48,lane:1});
        engine.tracks[3].clips[0].grid_gates.push(crate::grid::Gate{start:0,end:48,lane:0});
        tick(&mut engine);
        engine.source_route_set("3 1 1 0 2 0 0 -1 -1 -1 -1 -1 -1 -1 -1");
        let output=tick(&mut engine);assert!(!output.iter().any(|event|matches!(event,OutEvent::NoteOff{track:3,..})));
        let output=tick(&mut engine);assert!(output.contains(&OutEvent::PolyPressure{track:3,pitch:60,value:66}));
        assert_eq!(engine.grid_masks[3],1);
        let mut output=Vec::new();engine.stop(&mut output);
        for pitch in [60,64] {assert!(output.contains(&OutEvent::NoteOff{track:3,pitch}));}
        assert_eq!(engine.grid_masks[3],0);
    }
    #[test]
    fn recording_bypasses_borrowing_and_rendered_pitches_skip_reapplication() {
        let mut engine=setup(0);engine.recording=true;engine.rec_track=3;
        let output=tick(&mut engine);
        assert!(output.contains(&OutEvent::RecordedActions{track:3,pitch:70,actions:Some(actions(1000))}));
        let mut engine=setup(0);for note in &mut engine.tracks[1].clips[0].notes {note.rendered=true;}
        assert_actions(&tick(&mut engine),None);
    }
    #[test]
    fn routes_persist_and_legacy_routes_default_to_own_atomically() {
        let mut engine=setup(0);let saved=crate::persist::serialize(&engine);
        let mut output=Vec::new();
        crate::command::apply_batch(&mut engine,"usnap 71;source 3 1 1 0 2 0 0",&mut output);
        assert_eq!(engine.source_routes[3].note_ops,None);
        crate::command::apply_batch(&mut engine,"uswap 71 72",&mut output);
        assert_eq!(engine.source_routes[3].note_ops,Some(crate::source_route::ClipRef{track:0,slot:0}));
        let mut restored=Engine::new(48000,12000);assert!(crate::persist::load(&mut restored,&saved));assert_eq!(engine.source_routes,restored.source_routes);
        for count in [7,9,11,13] {
            let old=engine.source_routes[3].message(3).split_whitespace().take(count).collect::<Vec<_>>().join(" ");
            assert!(restored.source_route_set(&old));assert_eq!(restored.source_routes[3].note_ops,None);
        }
        let previous=engine.source_routes;
        assert!(!engine.source_route_set("3 1 1 0 2 0 0 -1 -1 -1 -1 -1 -1 16 0"));assert_eq!(previous,engine.source_routes);
    }
}
