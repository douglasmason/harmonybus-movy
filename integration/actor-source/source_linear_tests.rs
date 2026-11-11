#[cfg(test)]
mod source_linear_tests {
    use super::*;
    fn setup()->Engine {
        let mut engine=Engine::new(48000,12000);engine.playing=true;
        engine.tracks[3].playing_slot=Some(0);engine.tracks[3].clips[0].set_loop(0,16);
        engine.tracks[3].clips[0].add_note_raw(0,0,192,60,100);
        engine.auto_label(3,1,"synth:cutoff");engine.auto_numeric(3,1,"synth:cutoff",true);
        engine.tracks[3].lane_base[1]=19;
        engine.tracks[3].clips[0].set_lock(1,0,0);engine.tracks[3].clips[0].set_lock(1,8,96);
        engine.source_routes[3].instrument_linear=true;
        engine
    }
    fn tick(engine:&mut Engine)->Vec<OutEvent> {
        let mut events=Vec::new();engine.advance_block(250,&mut events);events
    }
    fn cc(value:u8)->OutEvent {OutEvent::Cc{track:3,lane:1,val:value}}
    #[test]
    fn own_fractional_reader_runs_before_attacks_without_enabling_weaving() {
        let mut engine=setup();let events=tick(&mut engine);
        assert!(!engine.source_routes[3].enabled);
        let control=events.iter().position(|event|*event==cc(0)).unwrap();
        let attack=events.iter().position(|event|matches!(event,OutEvent::NoteOn{track:3,..})).unwrap();
        assert!(control<attack);
        for position in 1..=12 {
            let events=tick(&mut engine);
            assert_eq!(engine.tracks[3].auto_cur[1],((position as f64)*0.5).round() as i16);
            assert!(!events.iter().any(|event|matches!(event,OutEvent::NoteOn{track:3,..})));
        }
        assert_eq!(engine.source_automation_cache[3][1].unwrap().rebuilds,1);
        let mut events=Vec::new();engine.stop(&mut events);
        assert!(events.contains(&cc(19)));assert!(events.contains(&OutEvent::NoteOff{track:3,pitch:60}));
        assert_eq!(engine.source_automation_mask[3],0);
    }
    #[test]
    fn borrowed_fit_and_timeline_keep_donor_clock_and_track_order() {
        for donor in [0,4] {for fit in [false,true] {
            let mut engine=setup();engine.tracks[donor].playing_slot=Some(0);
            engine.tracks[donor].clips[0].set_loop(0,32);
            engine.auto_label(donor,6,"synth:cutoff");
            engine.tracks[donor].clips[0].set_lock(6,0,0);engine.tracks[donor].clips[0].set_lock(6,16,96);
            engine.source_routes[3].enabled=true;
            engine.source_routes[3].instrument=Some(crate::source_route::ClipRef{track:donor,slot:0});
            engine.source_routes[3].instrument_fit=fit;
            for _ in 0..=12 {tick(&mut engine);}
            assert_eq!(engine.tracks[3].auto_cur[1],if fit {6} else {3});
            engine.tracks[donor].muted=true;tick(&mut engine);
            assert_eq!(engine.tracks[3].auto_cur[1],7,"missing source resumes own fractional position");
        }}
    }
    #[test]
    fn enums_unknown_targets_and_harmony_choices_remain_stepped() {
        let mut engine=setup();
        for (lane,label,numeric) in [(2,"synth:shape",false),(3,"synth:unknown",false),(4,"midi_fx1:chord_form",true)] {
            engine.auto_label(3,lane,label);engine.auto_numeric(3,lane,label,numeric);
            engine.tracks[3].clips[0].set_lock(lane as u8,0,0);engine.tracks[3].clips[0].set_lock(lane as u8,8,127);
        }
        engine.source_routes[3].hb_render_linear=true;
        for _ in 0..=96 {tick(&mut engine);}
        assert_eq!(engine.tracks[3].auto_cur[1],48);
        for lane in 2..=4 {assert_eq!(engine.tracks[3].auto_cur[lane],0);assert!(!engine.tracks[3].lane_numeric[lane]);}
        engine.auto_label(3,1,"synth:shape");engine.auto_numeric(3,1,"synth:cutoff",true);
        assert!(!engine.tracks[3].lane_numeric[1],"stale target metadata cannot enable interpolation");
    }
    #[test]
    fn edits_recording_and_mode_changes_release_or_refresh_the_existing_owner() {
        let mut engine=setup();for _ in 0..=48 {tick(&mut engine);}
        assert_eq!(engine.tracks[3].auto_cur[1],24);
        let mut events=Vec::new();engine.auto_set(3,1,8,48,&mut events);tick(&mut engine);
        assert_eq!(engine.tracks[3].auto_cur[1],12);
        engine.recording=true;engine.rec_track=3;tick(&mut engine);
        assert_eq!(engine.source_automation_mask[3]&2,0);assert_eq!(engine.tracks[3].auto_cur[1],0);
        engine.recording=false;tick(&mut engine);assert!(engine.tracks[3].auto_cur[1]>0);
        let mut route=engine.source_routes[3];route.instrument_linear=false;
        engine.source_route_set(&route.message(3));tick(&mut engine);
        assert_eq!(engine.tracks[3].auto_cur[1],0);assert_eq!(engine.source_automation_mask[3]&2,0);
        route.instrument_linear=true;engine.source_route_set(&route.message(3));tick(&mut engine);
        engine.tracks[3].muted=true;assert!(tick(&mut engine).contains(&cc(19)));
        assert_eq!(engine.tracks[3].lane_base[1],19);
    }
    #[test]
    fn per_reader_modes_and_numeric_target_identity_survive_save_undo_and_legacy() {
        let mut engine=setup();let original=engine.source_routes[3];
        let saved=crate::persist::serialize(&engine);let mut restored=Engine::new(48000,12000);
        assert!(crate::persist::load(&mut restored,&saved));
        assert_eq!(restored.source_routes[3],original);assert!(restored.tracks[3].lane_numeric[1]);
        let legacy=saved.lines().filter(|line|!line.starts_with("an ")).collect::<Vec<_>>().join("\n");
        assert!(crate::persist::load(&mut restored,&legacy));assert!(!restored.tracks[3].lane_numeric[1]);
        let mut output=Vec::new();crate::command::apply_batch(&mut engine,"usnap 2 3",&mut output);
        let mut changed=original;changed.instrument_linear=false;changed.hb_render_linear=true;
        engine.source_route_set(&changed.message(3));crate::command::apply_batch(&mut engine,"uswap 2 3",&mut output);
        assert_eq!(engine.source_routes[3],original);assert!(engine.tracks[3].lane_numeric[1]);
        engine.source_route_set("3 0 -1 -1 -1 -1 0");assert!(!engine.source_routes[3].instrument_linear);
        assert_eq!(engine.source_routes[3].message(3).split_whitespace().count(),19);
        assert!(!engine.source_route_set("3 0 -1 -1 -1 -1 0 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 0 0 -1 100 2 0"));
        crate::command::apply_batch(&mut engine,"akind 3 1 0 synth:cutoff",&mut output);assert!(!engine.tracks[3].lane_numeric[1]);
        crate::command::apply_batch(&mut engine,"akind 3 1 2 synth:cutoff",&mut output);assert!(!engine.tracks[3].lane_numeric[1]);
    }
}
