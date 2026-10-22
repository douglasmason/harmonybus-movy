#[cfg(test)]
mod source_expression_fit_tests {
    use super::*;
    fn setup(donor:usize)->Engine {
        let mut engine=Engine::new(48000,12000);engine.playing=true;
        for track in [donor,1,2,3] {
            engine.tracks[track].playing_slot=Some(0);
            engine.tracks[track].clips[0].set_loop(0,16);
        }
        engine.tracks[3].clips[0].add_note_raw(0,0,24,30,90);
        engine.tracks[1].clips[0].add_note_raw(0,0,48,60,100);
        engine.tracks[1].clips[0].add_note_raw(8,192,48,67,100);
        engine.tracks[donor].clips[0].set_loop(0,32);
        for index in 0..4 {
            engine.tracks[donor].clips[0].add_note_raw(index*8,u32::from(index)*192,48,90,40+20*index as u8);
            engine.tracks[2].clips[0].add_note_raw(index*4,u32::from(index)*96,24,36,100);
        }
        assert!(engine.source_route_set(&format!("3 1 1 0 2 0 0 {donor} 0 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 1")));
        engine
    }
    fn tick(engine:&mut Engine)->Vec<OutEvent> {
        let mut output=Vec::new();engine.advance_block(250,&mut output);output
    }
    fn attacks(output:&[OutEvent])->Vec<(u8,u8)> {
        output.iter().filter_map(|event|match event {OutEvent::NoteOn{track:3,pitch,vel}=>Some((*pitch,*vel)),_=>None}).collect()
    }
    #[test]
    fn expression_fit_is_independent_of_pitch_alignment_track_order_and_donor_rate() {
        for donor in [0,4] {
            for (numerator,denominator) in [(1,1),(4,1),(1,4)] {
                let mut engine=setup(donor);
                engine.tracks[donor].clips[0].scale_num=numerator;
                engine.tracks[donor].clips[0].scale_den=denominator;
                let mut notes=Vec::new();
                for _ in 0..=384 {notes.extend(attacks(&tick(&mut engine)));}
                assert_eq!(notes,vec![(60,40),(67,60),(60,80),(67,100),(60,40)]);
                assert_eq!(engine.source_routes[3].alignment,crate::source_route::Alignment::Sequential);
            }
        }
        let mut engine=setup(0);engine.source_routes[3].expression_fit=false;
        let mut notes=Vec::new();for _ in 0..=384 {notes.extend(attacks(&tick(&mut engine)));}
        assert_eq!(notes,vec![(60,40),(67,40),(60,60),(67,60),(60,80)],"default Timeline keeps donor's independent phase");
    }
    #[test]
    fn pressure_and_release_keep_rhythm_clock_after_expression_mode_and_source_change() {
        let mut engine=setup(0);engine.tracks[3].pos_tick=192;
        engine.tracks[3].clips[0].scale_den=2;
        engine.tracks[2].clips[0].scale_num=2;
        engine.tracks[0].clips[0].notes[2].pressure=vec![(4,77),(30,99)];
        assert_eq!(attacks(&tick(&mut engine)),vec![(60,80)]);
        engine.source_route_set("3 1 1 0 2 0 0 -1 -1");
        engine.tracks[0].muted=true;engine.tracks[0].clips[0].notes.clear();
        for position in 1..=20 {
            let output=tick(&mut engine);
            assert_eq!(output.contains(&OutEvent::PolyPressure{track:3,pitch:60,value:77}),position==2);
            assert_eq!(output.contains(&OutEvent::NoteOff{track:3,pitch:60}),position==12);
            assert!(!output.contains(&OutEvent::PolyPressure{track:3,pitch:60,value:99}));
        }
    }
    #[test]
    fn expression_fit_relaunch_uses_actor_and_respects_nonzero_windows() {
        for relaunched in [0,3] {
            let mut engine=setup(0);engine.tracks[3].clips[0].set_loop(0,32);
            for _ in 0..384 {tick(&mut engine);}
            engine.tracks[relaunched].queued_slot=Some(0);
            assert_eq!(attacks(&tick(&mut engine)),vec![(60,if relaunched==3 {40} else {80})]);
        }
        let mut engine=setup(0);
        engine.tracks[3].clips[0].set_loop(16,16);engine.tracks[3].pos_tick=384;
        engine.tracks[0].clips[0].set_loop(16,32);engine.tracks[0].pos_tick=384;
        assert_eq!(attacks(&tick(&mut engine)),vec![(60,80)]);
        for _ in 1..96 {tick(&mut engine);}
        assert_eq!(attacks(&tick(&mut engine)),vec![(67,100)]);
    }
    #[test]
    fn unavailable_fit_expression_is_silent_without_consuming_sequential_pitch() {
        for unavailable in 0..3 {
            let mut engine=setup(0);
            match unavailable {0=>engine.tracks[0].muted=true,1=>engine.tracks[0].playing_slot=None,_=>engine.tracks[0].clips[0].clear()}
            assert!(attacks(&tick(&mut engine)).is_empty());
            engine.tracks[0].muted=false;engine.tracks[0].playing_slot=Some(0);
            engine.tracks[0].clips[0].set_loop(0,32);
            engine.tracks[0].clips[0].notes.clear();
            for _ in 1..96 {tick(&mut engine);}
            assert_eq!(attacks(&tick(&mut engine)),vec![(60,100)],"available empty expression supplies neutral velocity");
        }
    }
    #[test]
    fn expression_changes_do_not_reset_pitch_cursor_and_edits_apply_at_next_attack() {
        let mut engine=setup(0);assert_eq!(attacks(&tick(&mut engine)),vec![(60,40)]);
        let mut route=engine.source_routes[3];route.expression_fit=false;
        engine.source_route_set(&route.message(3));
        for _ in 1..96 {tick(&mut engine);}
        assert_eq!(attacks(&tick(&mut engine)),vec![(67,40)]);
        route.expression_fit=true;engine.source_route_set(&route.message(3));
        engine.tracks[0].clips[0].notes[2].vel=73;
        for _ in 97..192 {tick(&mut engine);}
        assert_eq!(attacks(&tick(&mut engine)),vec![(60,73)]);
        let preview=engine.source_preview(3).unwrap();
        assert!(preview.contains("\"expression_fit\":true"));
        assert!(preview.contains("\"selection_phase_ticks\":386"));
    }
    #[test]
    fn expression_fit_save_undo_recording_and_legacy_encoding() {
        let mut engine=setup(0);let saved=crate::persist::serialize(&engine);
        let mut restored=Engine::new(48000,12000);assert!(crate::persist::load(&mut restored,&saved));
        assert_eq!(restored.source_routes,engine.source_routes);
        let mut output=Vec::new();crate::command::apply_batch(&mut engine,"usnap 2 3",&mut output);
        engine.source_route_set("3 1 1 0 2 0 0 0 0");
        crate::command::apply_batch(&mut engine,"uswap 2 3",&mut output);
        assert!(engine.source_routes[3].expression_fit);
        engine.recording=true;engine.rec_track=3;
        assert_eq!(attacks(&tick(&mut engine)),vec![(30,90)]);
        let original=engine.source_routes;
        for value in [-1,2] {
            assert!(!engine.source_route_set(&format!("3 1 1 0 2 0 0 0 0 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 {value}")));
            assert_eq!(engine.source_routes,original);
        }
        for legacy in ["3 1 1 0 2 0 0","3 1 1 0 2 0 0 0 0","3 1 1 0 2 0 2 0 0 -1 -1 -1 -1 -1 -1 -1 -1 4 0"] {
            assert!(engine.source_route_set(legacy));assert!(!engine.source_routes[3].expression_fit);
            assert_eq!(engine.source_routes[3].message(3).split_whitespace().count(),19);
        }
        let mut route=engine.source_routes[3];route.expression_fit=true;
        let parsed=crate::source_route::Route::parse(&route.message(3)).unwrap().1;
        assert_eq!(parsed,route,"twentieth field must not discard gesture source");
    }
}
