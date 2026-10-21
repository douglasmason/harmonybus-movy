#[cfg(test)]
mod source_instrument_tests {
    use super::*;
    fn setup(donor: usize) -> Engine {
        let mut engine=Engine::new(48000,12000);engine.playing=true;
        for track in [donor,2,3] {
            engine.tracks[track].playing_slot=Some(0);
            engine.tracks[track].clips[0].set_loop(0,16);
        }
        engine.tracks[2].clips[0].add_note_raw(0,0,48,36,100);
        engine.tracks[3].clips[0].add_note_raw(0,0,48,60,100);
        engine.auto_label(donor,5,"synth:cutoff");
        engine.tracks[donor].lane_base[5]=33;
        engine.tracks[donor].clips[0].set_lock(5,0,91);
        engine.tracks[donor].clips[0].set_lock(5,1,72);
        engine.auto_label(3,1,"synth:cutoff");
        engine.tracks[3].lane_base[1]=19;
        engine.tracks[3].clips[0].set_lock(1,0,44);
        assert!(engine.source_route_set(&format!("3 1 -1 -1 2 0 0 -1 -1 {donor} 0")));
        engine
    }
    fn tick(engine: &mut Engine) -> Vec<OutEvent> {
        let mut output=Vec::new();engine.advance_block(250,&mut output);output
    }
    fn control(value:u8) -> OutEvent {OutEvent::Cc{track:3,lane:1,val:value}}
    #[test]
    fn target_name_not_lane_number_and_controls_precede_attack() {
        for donor in [0,4] {
            let mut engine=setup(donor);
            engine.auto_label(donor,1,"synth:resonance");
            engine.tracks[donor].clips[0].set_lock(1,0,120);
            let output=tick(&mut engine);
            let cc=output.iter().position(|event|*event==control(91)).unwrap();
            let attack=output.iter().position(|event|matches!(event,OutEvent::NoteOn{track:3,..})).unwrap();
            assert!(cc<attack);
            assert!(!output.contains(&control(120)));
            assert!(!output.contains(&control(44)),"own automation must not overwrite borrowed controls");
        }
    }
    #[test]
    fn donor_clock_updates_during_rests_despite_slow_destination() {
        let mut engine=setup(0);
        engine.tracks[0].clips[0].scale_num=2;
        engine.tracks[3].clips[0].scale_den=4;
        assert!(tick(&mut engine).contains(&control(91)));
        for position in 1..=12 {
            let output=tick(&mut engine);
            assert_eq!(output.contains(&control(72)),position==12);
            assert!(!output.iter().any(|event|matches!(event,OutEvent::NoteOn{track:3,..})));
        }
    }
    #[test]
    fn source_mute_stop_missing_match_disable_and_record_restore_own_timeline() {
        for change in 0..6 {
            let mut engine=setup(0);tick(&mut engine);
            match change {
                0=>engine.tracks[0].muted=true,
                1=>engine.tracks[0].playing_slot=None,
                2=>engine.auto_label(0,5,"synth:other"),
                3=>{engine.source_route_set("3 0 -1 -1 2 0 0 -1 -1 0 0");},
                4=>{engine.recording=true;engine.rec_track=3;},
                _=>{engine.source_route_set("3 1 -1 -1 2 0 0 -1 -1 -1 -1");},
            }
            engine.source_instrument_invalidate();
            let output=tick(&mut engine);
            assert!(output.contains(&control(44)),"change {change}: {output:?}");
            assert_eq!(engine.tracks[3].lane_base[1],19);
            assert_eq!(engine.tracks[3].lane_label[1],"synth:cutoff");
            for _ in 2..=48 {tick(&mut engine);}
            assert!(engine.gates.iter().all(|gate|gate.track!=3));
        }
    }
    #[test]
    fn actor_and_transport_stop_restore_base_and_release_notes() {
        for stop_all in [false,true] {
            let mut engine=setup(0);tick(&mut engine);
            let mut output=Vec::new();
            if stop_all {engine.stop(&mut output);} else {engine.tracks[3].playing_slot=None;output=tick(&mut engine);}
            assert!(output.contains(&control(19)));
            assert!(output.contains(&OutEvent::NoteOff{track:3,pitch:60}));
            assert_eq!(engine.source_instrument_mask[3],0);
        }
    }
    #[test]
    fn raw_donor_ignores_routes_and_excludes_hb_mix_and_effects() {
        let mut engine=setup(0);
        engine.source_route_set("0 1 -1 -1 -1 -1 0 -1 -1 3 0");
        for (lane,label) in [(2,"midi_fx1:transpose"),(3,"mix:volume"),(4,"fx1:cutoff")] {
            engine.auto_label(0,lane,label);engine.auto_label(3,lane,label);
            engine.tracks[0].clips[0].set_lock(lane as u8,0,120);
            engine.tracks[3].clips[0].set_lock(lane as u8,0,22);
        }
        let output=tick(&mut engine);
        assert!(output.contains(&control(91)));
        for lane in [2,3,4] {
            assert!(output.contains(&OutEvent::Cc{track:3,lane,val:22}));
            assert!(!output.contains(&OutEvent::Cc{track:3,lane,val:120}));
        }
    }
    #[test]
    fn edits_invalidate_watermark_and_relaunch_samples_raw_loop_start() {
        let mut engine=setup(0);tick(&mut engine);
        let mut output=Vec::new();
        crate::command::apply_batch(&mut engine,"aset 0 5 0 67",&mut output);
        assert!(tick(&mut engine).contains(&control(67)));
        engine.tracks[0].clips[0].set_clip_length(3);
        engine.tracks[0].clips[0].add_note_raw(2,48,12,80,100);
        for _ in 2..=48 {tick(&mut engine);}
        assert_eq!(engine.tracks[3].auto_cur[1],33,"donor note resets to donor base");
        engine.tracks[0].queued_slot=Some(0);
        for _ in 49..=384 {tick(&mut engine);}
        assert_eq!(engine.tracks[3].auto_cur[1],67,"relaunch uses step zero");
    }
    #[test]
    fn destination_audition_cannot_leave_a_stale_borrowed_parameter() {
        let mut engine=setup(0);tick(&mut engine);
        let mut output=Vec::new();
        engine.auto_set(3,1,0,12,&mut output);
        assert!(output.contains(&control(12)));
        assert!(tick(&mut engine).contains(&control(91)));
        engine.auto_base_quiet(3,1,7);
        assert!(tick(&mut engine).contains(&control(91)));
    }
    #[test]
    fn actor_mute_keeps_base_across_own_locks_until_unmuted() {
        let mut engine=setup(0);
        engine.tracks[3].clips[0].set_lock(1,1,120);
        tick(&mut engine);engine.tracks[3].muted=true;
        assert!(tick(&mut engine).contains(&control(19)));
        for _ in 2..=25 {
            assert!(!tick(&mut engine).contains(&control(120)));
            assert_eq!(engine.tracks[3].auto_cur[1],19);
        }
        engine.tracks[3].muted=false;
        assert!(tick(&mut engine).contains(&control(72)));
    }
    #[test]
    fn instrument_routes_round_trip_and_legacy_routes_default_to_own() {
        let mut engine=setup(0);tick(&mut engine);
        let saved=crate::persist::serialize(&engine);
        assert!(crate::persist::load(&mut engine,&saved));
        assert_eq!(engine.source_routes[3].instrument,Some(crate::source_route::ClipRef{track:0,slot:0}));
        for legacy in ["3 1 -1 -1 2 0 0","3 1 -1 -1 2 0 0 -1 -1"] {
            engine.source_route_set(legacy);assert_eq!(engine.source_routes[3].instrument,None);
        }
        let original=engine.source_routes;
        for invalid in ["3 1 -1 -1 2 0 0 -1 -1 16 0","3 1 -1 -1 2 0 0 -1 -1 -1 0"] {
            assert!(!engine.source_route_set(invalid));assert_eq!(engine.source_routes,original);
        }
    }
    #[test]
    #[ignore = "isolated release-mode timing measurement, not a hardware audio assertion"]
    fn source_routing_benchmark_instrument() {
        use std::time::Instant;
        for enabled in [false,true] {
            let mut engine=setup(0);engine.source_routes[3].instrument=if enabled {Some(crate::source_route::ClipRef{track:0,slot:0})} else {None};
            let mut output=Vec::with_capacity(4096);
            let started=Instant::now();let mut count=0usize;
            for _ in 0..100_000 {engine.advance_block(250,&mut output);count+=output.len();output.clear();}
            println!("instrument-routing enabled={enabled} ticks=100000 events={count} elapsed_us={}",started.elapsed().as_micros());
        }
    }

}
