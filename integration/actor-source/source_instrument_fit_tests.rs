#[cfg(test)]
mod source_instrument_fit_tests {
    use super::*;
    fn setup(donor:usize)->Engine {
        let mut engine=Engine::new(48000,12000);engine.playing=true;
        for track in [donor,2,3] {
            engine.tracks[track].playing_slot=Some(0);
            engine.tracks[track].clips[0].set_loop(0,16);
        }
        engine.tracks[2].clips[0].add_note_raw(0,0,48,36,100);
        engine.tracks[3].clips[0].add_note_raw(0,0,48,60,100);
        engine.tracks[donor].clips[0].set_loop(0,32);
        engine.auto_label(donor,5,"synth:cutoff");engine.tracks[donor].lane_base[5]=33;
        for (step,value) in [(0,91),(1,72),(16,55)] {engine.tracks[donor].clips[0].set_lock(5,step,value);}
        engine.auto_label(3,1,"synth:cutoff");engine.tracks[3].lane_base[1]=19;
        engine.tracks[3].clips[0].set_lock(1,0,44);
        assert!(engine.source_route_set(&format!("3 1 -1 -1 2 0 0 -1 -1 {donor} 0 -1 -1 -1 -1 -1 -1 -1 -1 0 1")));
        engine
    }
    fn tick(engine:&mut Engine)->Vec<OutEvent> {
        let mut output=Vec::new();engine.advance_block(250,&mut output);output
    }
    fn cc(value:u8)->OutEvent {OutEvent::Cc{track:3,lane:1,val:value}}
    #[test]
    fn fitted_automation_precedes_notes_in_both_track_orders() {
        for donor in [0,4] {
            let mut engine=setup(donor);engine.tracks[3].pos_tick=23;
            let output=tick(&mut engine);
            let control=output.iter().position(|event|*event==cc(72)).unwrap();
            let attack=output.iter().position(|event|matches!(event,OutEvent::NoteOn{track:3,..})).unwrap();
            assert!(control<attack);
            assert!(!output.contains(&cc(44)));assert!(!output.contains(&cc(91)));
        }
    }
    #[test]
    fn fitted_step_watermark_updates_inside_actor_step_during_rests() {
        for (numerator,denominator) in [(1,1),(4,1),(1,4)] {
            let mut engine=setup(0);engine.tracks[0].clips[0].scale_num=numerator;engine.tracks[0].clips[0].scale_den=denominator;
            assert!(tick(&mut engine).contains(&cc(91)));
            for position in 1..=24 {
                let output=tick(&mut engine);
                assert_eq!(output.contains(&cc(72)),position==12);
                assert!(!output.iter().any(|event|matches!(event,OutEvent::NoteOn{track:3,..})));
                if position!=12 {assert!(!output.iter().any(|event|matches!(event,OutEvent::Cc{track:3,lane:1,..})));}
            }
        }
        let mut engine=setup(0);engine.tracks[3].clips[0].scale_den=4;tick(&mut engine);
        for position in 1..=48 {assert_eq!(tick(&mut engine).contains(&cc(72)),position==48);}
    }
    #[test]
    fn hb_render_automation_keeps_its_independent_donor_phase() {
        let mut engine=setup(0);
        engine.auto_label(0,6,"midi_fx1:render_velocity_percent");
        engine.auto_label(3,2,"midi_fx1:render_velocity_percent");
        engine.tracks[0].clips[0].set_lock(6,0,25);engine.tracks[0].clips[0].set_lock(6,1,90);
        engine.source_routes[3].hb_render=Some(crate::source_route::ClipRef{track:0,slot:0});
        assert!(tick(&mut engine).contains(&OutEvent::Cc{track:3,lane:2,val:25}));
        for position in 1..=24 {
            let output=tick(&mut engine);
            assert_eq!(output.contains(&cc(72)),position==12);
            assert_eq!(output.contains(&OutEvent::Cc{track:3,lane:2,val:90}),position==24);
        }
    }
    #[test]
    fn fitted_source_loss_recording_own_and_disable_restore_existing_value_owner() {
        for change in 0..6 {
            let mut engine=setup(0);tick(&mut engine);
            match change {
                0=>engine.tracks[0].muted=true,
                1=>engine.tracks[0].playing_slot=None,
                2=>engine.auto_label(0,5,"synth:other"),
                3=>{engine.recording=true;engine.rec_track=3;},
                4=>{let mut route=engine.source_routes[3];route.enabled=false;engine.source_route_set(&route.message(3));},
                _=>{let mut route=engine.source_routes[3];route.instrument=None;engine.source_route_set(&route.message(3));},
            }
            assert!(tick(&mut engine).contains(&cc(44)),"change {change}");
            assert_eq!(engine.tracks[3].lane_base[1],19);
            assert_eq!(engine.tracks[3].lane_label[1],"synth:cutoff");
            for _ in 2..=48 {tick(&mut engine);}
            assert!(engine.gates.iter().all(|gate|gate.track!=3));
        }
        let mut engine=setup(0);tick(&mut engine);engine.tracks[3].muted=true;
        assert!(tick(&mut engine).contains(&cc(19)));
    }
    #[test]
    fn fit_relaunch_and_nonzero_window_use_actor_phase_and_existing_lock_reader() {
        for relaunched in [0,3] {
            let mut engine=setup(0);engine.tracks[3].clips[0].set_loop(0,32);
            for _ in 0..384 {tick(&mut engine);}
            engine.tracks[relaunched].queued_slot=Some(0);tick(&mut engine);
            assert_eq!(engine.tracks[3].auto_cur[1],if relaunched==3 {91} else {55});
        }
        let mut engine=setup(0);
        engine.tracks[0].clips[0].set_loop(16,32);engine.tracks[0].pos_tick=384;
        engine.tracks[3].clips[0].set_loop(16,16);engine.tracks[3].pos_tick=384;
        engine.tracks[0].clips[0].set_lock(5,17,66);
        assert!(tick(&mut engine).contains(&cc(55)));
        for _ in 1..12 {tick(&mut engine);}
        assert!(tick(&mut engine).contains(&cc(66)));
    }
    #[test]
    fn fitted_lock_edits_and_auditions_invalidate_existing_watermark() {
        let mut engine=setup(0);tick(&mut engine);
        let mut output=Vec::new();crate::command::apply_batch(&mut engine,"aset 0 5 0 67",&mut output);
        assert!(tick(&mut engine).contains(&cc(67)));
        engine.auto_set(3,1,0,12,&mut output);
        assert!(output.contains(&cc(12)));assert!(tick(&mut engine).contains(&cc(67)));
        engine.tracks[0].clips[0].locks.clear();engine.source_automation_invalidate();
        assert!(tick(&mut engine).contains(&cc(33)),"empty matching lane uses donor base");
        let mut stopped=Vec::new();engine.stop(&mut stopped);
        assert!(stopped.contains(&cc(19)));assert!(stopped.contains(&OutEvent::NoteOff{track:3,pitch:60}));
    }
    #[test]
    fn fit_route_undo_save_legacy_and_expression_extension_preserve_dimensions() {
        let mut engine=setup(0);let mut route=engine.source_routes[3];route.expression_fit=true;
        route.gestures=Some(crate::source_route::ClipRef{track:4,slot:1});engine.source_route_set(&route.message(3));
        let saved=crate::persist::serialize(&engine);let mut restored=Engine::new(48000,12000);
        assert!(crate::persist::load(&mut restored,&saved));assert_eq!(restored.source_routes,engine.source_routes);
        let mut output=Vec::new();crate::command::apply_batch(&mut engine,"usnap 2 3",&mut output);
        route.instrument_fit=false;engine.source_route_set(&route.message(3));
        assert_eq!(route.message(3).split_whitespace().count(),20);
        crate::command::apply_batch(&mut engine,"uswap 2 3",&mut output);assert!(engine.source_routes[3].instrument_fit);
        for bad in [-1,2] {
            assert!(!engine.source_route_set(&format!("3 1 -1 -1 2 0 0 -1 -1 0 0 -1 -1 -1 -1 -1 -1 -1 -1 0 {bad}")));
            assert!(engine.source_routes[3].instrument_fit);
        }
        engine.source_route_set(&route.message(3));assert!(!engine.source_routes[3].instrument_fit);assert!(engine.source_routes[3].expression_fit);
        engine.source_route_set("3 1 -1 -1 2 0 0 -1 -1 0 0");assert!(!engine.source_routes[3].instrument_fit);
        assert_eq!(engine.source_routes[3].message(3).split_whitespace().count(),19);
    }
}
