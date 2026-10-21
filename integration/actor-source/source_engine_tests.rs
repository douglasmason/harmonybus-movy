#[cfg(test)]
mod source_routing_tests {
    use super::*;
    fn setup() -> Engine {
        let mut engine=Engine::new(48000,12000);
        engine.playing=true;
        for track in 0..4 {
            engine.tracks[track].playing_slot=Some(0);
            engine.tracks[track].clips[0].set_loop(0,16);
        }
        engine.tracks[1].clips[0].add_note_raw(0,0,48,60,100);
        engine.tracks[1].clips[0].add_note_raw(0,0,48,64,80);
        engine.tracks[1].clips[0].add_note_raw(8,192,48,67,90);
        engine.tracks[2].clips[0].add_note_raw(0,0,24,36,100);
        engine.tracks[2].clips[0].add_note_raw(4,96,24,36,100);
        engine.tracks[3].clips[0].add_note_raw(0,0,24,30,100);
        assert!(engine.source_route_set("3 1 1 0 2 0 0"));
        engine
    }
    fn tick(engine:&mut Engine)->Vec<OutEvent> {
        let mut output=Vec::new();engine.advance_block(250,&mut output);output
    }
    fn ons(output:&[OutEvent])->Vec<u8> {
        output.iter().filter_map(|event|match event {OutEvent::NoteOn{track:3,pitch,..}=>Some(*pitch),_=>None}).collect()
    }
    #[test]
    fn destination_context_and_automation_precede_borrowed_attack() {
        let mut engine=setup();
        engine.tracks[3].lane_assigned[0]=true;
        engine.tracks[3].clips[0].locks.push(crate::clip::Lock{lane:0,step:0,val:87});
        engine.tracks[3].clips[0].grid_gates.push(crate::grid::Gate{start:0,end:24,lane:0});
        engine.tracks[3].clips[0].shared_events.push(crate::shared_context::Event{
            tick:0,kind:1,value:crate::shared_context::Value{on:true,a:1,b:0,c:0}});
        let output=tick(&mut engine);
        let attack=output.iter().position(|event|matches!(event,OutEvent::NoteOn{track:3,..})).unwrap();
        for control in [
            output.iter().position(|event|matches!(event,OutEvent::Cc{track:3,lane:0,val:87})),
            output.iter().position(|event|matches!(event,OutEvent::GridMask{track:3,mask:1})),
            output.iter().position(|event|matches!(event,OutEvent::SharedContext{track:3,kind:1,..})),
        ] {assert!(control.is_some_and(|position|position<attack),"control must precede attack: {output:?}");}
        assert_eq!(output.iter().filter(|event|matches!(event,OutEvent::SharedContext{track:3,kind:1,..})).count(),1);
    }
    #[test]
    fn sequential_chords_rests_and_gates_use_real_scheduler() {
        let mut engine=setup();
        assert_eq!(ons(&tick(&mut engine)),vec![60,64]);
        for position in 1..=96 {
            let output=tick(&mut engine);
            if position==24 {
                assert!(output.contains(&OutEvent::NoteOff{track:3,pitch:60}));
                assert!(output.contains(&OutEvent::NoteOff{track:3,pitch:64}));
            }
            assert_eq!(ons(&output),if position==96 {vec![67]} else {vec![]});
        }
        assert_eq!(engine.tracks[3].clips[0].notes[0].pitch,30);
        assert!(!engine.tracks[1].clips[0].notes[2].fired);
    }
    #[test]
    fn rhythm_clock_owns_gates_independent_of_actor_speed() {
        let mut engine=setup();
        engine.tracks[2].clips[0].scale_num=2;
        engine.tracks[3].clips[0].scale_den=2;
        assert_eq!(ons(&tick(&mut engine)),vec![60,64]);
        for position in 1..=48 {
            let output=tick(&mut engine);
            assert_eq!(output.contains(&OutEvent::NoteOff{track:3,pitch:60}),position==12);
            assert_eq!(ons(&output),if position==48 {vec![67]} else {vec![]});
        }
    }
    #[test]
    fn changes_keep_existing_gate_and_pressure_ownership() {
        let mut engine=setup();
        engine.tracks[3].clips[0].notes[0].pressure=vec![(2,77)];
        tick(&mut engine);
        assert!(engine.source_route_set("3 1 3 0 2 0 0"));
        for position in 1..=96 {
            let output=tick(&mut engine);
            if position==2 {assert!(output.contains(&OutEvent::PolyPressure{track:3,pitch:60,value:77}));}
            if position==24 {assert!(output.contains(&OutEvent::NoteOff{track:3,pitch:60}));}
            if position==96 {assert_eq!(ons(&output),vec![30]);}
        }
        let mut output=Vec::new();engine.stop(&mut output);
        assert!(output.contains(&OutEvent::NoteOff{track:3,pitch:30}));
        assert!(engine.gates.is_empty());
    }
    #[test]
    fn timeline_reads_source_phase_instead_of_consuming_groups() {
        let mut engine=setup();
        engine.source_route_set("3 1 1 0 2 0 1");
        engine.tracks[2].clips[0].add_note_raw(8,192,24,36,100);
        for position in 0..=192 {
            let output=tick(&mut engine);
            if position==0 || position==96 {assert_eq!(ons(&output),vec![60,64]);}
            if position==192 {assert_eq!(ons(&output),vec![67]);}
        }
    }
    #[test]
    fn three_and_four_bar_sources_keep_independent_loops() {
        let mut engine=setup();
        engine.source_route_set("3 1 1 0 2 0 1");
        engine.tracks[1].clips[0].set_loop(0,48);
        engine.tracks[2].clips[0].set_loop(0,64);
        engine.tracks[2].clips[0].notes.truncate(1);
        let mut attacks=Vec::new();
        for position in 0..=4608 {
            let output=tick(&mut engine);let pitches=ons(&output);
            if !pitches.is_empty() {attacks.push((position,pitches));}
        }
        assert_eq!(attacks,vec![(0,vec![60,64]),(1536,vec![67]),(3072,vec![67]),(4608,vec![60,64])]);
    }
    #[test]
    fn source_edits_are_visible_on_next_attack_without_cached_indices() {
        let mut engine=setup();tick(&mut engine);
        engine.tracks[1].clips[0].notes.truncate(1);
        engine.tracks[1].clips[0].notes[0].pitch=72;
        for _ in 1..96 {tick(&mut engine);}
        assert_eq!(ons(&tick(&mut engine)),vec![72]);
    }
    #[test]
    fn stopping_rhythm_track_flushes_its_actor_gates() {
        let mut engine=setup();tick(&mut engine);
        engine.tracks[2].playing_slot=None;
        let output=tick(&mut engine);
        assert!(output.contains(&OutEvent::NoteOff{track:3,pitch:60}));
        assert!(engine.gates.iter().all(|gate|gate.track!=3));
    }
    #[test]
    fn conditional_rest_does_not_consume_pitch() {
        let mut engine=setup();
        engine.tracks[2].clips[0].trigs.push(crate::clip::Trig{step:0,lane:None,props:crate::clip::TrigProps{prob:0,cond_a:1,cond_b:1,invert:false}});
        assert!(ons(&tick(&mut engine)).is_empty());
        for _ in 1..96 {tick(&mut engine);}
        assert_eq!(ons(&tick(&mut engine)),vec![60,64]);
    }
    #[test]
    fn routes_round_trip_and_legacy_load_resets_them() {
        let mut engine=setup();let saved=crate::persist::serialize(&engine);
        let mut restored=Engine::new(48000,12000);
        assert!(crate::persist::load(&mut restored,&saved));
        assert_eq!(restored.source_routes,engine.source_routes);
        assert!(crate::persist::load(&mut engine,"movy1\nbpm 12000\n"));
        assert!(!engine.source_routes.iter().any(|route|route.enabled));
    }
    #[test]
    fn invalid_route_is_atomic_and_cycles_reference_only_raw_material() {
        let mut engine=setup();let original=engine.source_routes;
        for message in ["16 1 0 0 0 0 0","3 1 -1 0 0 0 0","3 1 0 9 0 0 0","3 2 0 0 0 0 0","3 1 0 0 0 0 2"] {
            assert!(!engine.source_route_set(message));assert_eq!(engine.source_routes,original);
        }
        engine.source_route_set("1 1 3 0 2 0 0");
        assert_eq!(ons(&tick(&mut engine)),vec![60,64]);
    }
    #[test]
    fn pitch_relaunch_resets_sequence_but_harmony_changes_do_not() {
        let mut engine=setup();
        engine.tracks[2].clips[0].notes.truncate(1);
        tick(&mut engine);
        engine.follower_inputs[3]=crate::follower_input::InputKey::new(2,1);
        for _ in 1..384 {tick(&mut engine);}
        assert_eq!(ons(&tick(&mut engine)),vec![67]);
        engine.tracks[1].queued_slot=Some(0);
        for _ in 385..768 {tick(&mut engine);}
        assert_eq!(ons(&tick(&mut engine)),vec![60,64]);
    }
    #[test]
    fn recording_uses_own_material_and_preserves_source_clips() {
        let mut engine=setup();engine.recording=true;engine.rec_track=3;
        assert_eq!(ons(&tick(&mut engine)),vec![30]);
        assert_eq!(engine.tracks[1].clips[0].notes.len(),3);
    }
    #[test]
    fn source_input_key_projects_through_destination_follower() {
        let mut engine=setup();
        for note in &mut engine.tracks[1].clips[0].notes {note.input_key=crate::follower_input::InputKey::new(0,1);}
        engine.follower_inputs[3]=crate::follower_input::InputKey::new(2,1);
        assert_eq!(ons(&tick(&mut engine)),vec![62,66]);
    }
    #[test]
    fn retrigger_closes_old_woven_gate_before_same_pitch_attack() {
        let mut engine=setup();engine.tracks[1].clips[0].notes.truncate(1);
        engine.tracks[2].clips[0].notes[0].gate=192;
        tick(&mut engine);for _ in 1..96 {tick(&mut engine);}
        let output=tick(&mut engine);
        let off=output.iter().position(|event|*event==OutEvent::NoteOff{track:3,pitch:60}).unwrap();
        let on=output.iter().position(|event|*event==OutEvent::NoteOn{track:3,pitch:60,vel:100}).unwrap();
        assert!(off<on);
        assert_eq!(engine.gates.iter().filter(|gate|gate.track==3).count(),1);
    }
    #[test]
    fn stopped_source_is_silent_and_disabled_settings_survive_reload() {
        let mut engine=setup();engine.tracks[1].playing_slot=None;
        assert!(ons(&tick(&mut engine)).is_empty());
        engine.source_route_set("3 0 1 0 2 0 1");
        let saved=crate::persist::serialize(&engine);
        let mut restored=Engine::new(48000,12000);
        crate::persist::load(&mut restored,&saved);
        assert_eq!(engine.source_routes,restored.source_routes);
    }
    #[test]
    #[ignore = "isolated release-mode timing measurement, not a hardware audio assertion"]
    fn source_routing_benchmark() {
        use std::time::Instant;
        for enabled in [false,true] {
            let mut engine=setup();engine.source_routes[3].enabled=enabled;
            let mut output=Vec::with_capacity(4096);
            let started=Instant::now();let mut count=0usize;
            for _ in 0..100_000 {engine.advance_block(250,&mut output);count+=output.len();output.clear();}
            println!("source-routing enabled={enabled} ticks=100000 events={count} elapsed_us={}",started.elapsed().as_micros());
        }
    }

}
