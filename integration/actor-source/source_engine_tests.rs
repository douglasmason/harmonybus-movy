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
        for message in ["16 1 0 0 0 0 0","3 1 -1 0 0 0 0","3 1 0 9 0 0 0","3 2 0 0 0 0 0","3 1 0 0 0 0 3"] {
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
    fn expression_donor_changes_velocity_pressure_but_not_actions_or_pitch_cursor() {
        let mut engine=setup();
        engine.tracks[0].clips[0].add_note_raw(0,0,48,90,42);
        engine.tracks[0].clips[0].notes[0].pressure=vec![(0,21),(2,77)];
        let destination_actions=Some([0;crate::recorded_actions::LANES+1]);
        let mut donor_actions=[0;crate::recorded_actions::LANES+1];donor_actions[0]=123;
        engine.tracks[3].clips[0].notes[0].actions=destination_actions;
        engine.tracks[0].clips[0].notes[0].actions=Some(donor_actions);
        assert!(engine.source_route_set("3 1 1 0 2 0 0 0 0"));
        let output=tick(&mut engine);
        for pitch in [60,64] {
            assert!(output.contains(&OutEvent::NoteOn{track:3,pitch,vel:42}));
            let attack=output.iter().position(|event|*event==OutEvent::NoteOn{track:3,pitch,vel:42}).unwrap();
            let pressure=output.iter().position(|event|*event==OutEvent::PolyPressure{track:3,pitch,value:21}).unwrap();
            assert!(attack<pressure);
            assert!(output.contains(&OutEvent::RecordedActions{track:3,pitch,actions:destination_actions}));
        }
        engine.source_route_set("3 1 1 0 2 0 0 -1 -1");
        engine.tracks[0].clips[0].notes.clear();
        engine.tracks[0].playing_slot=None;
        for position in 1..=96 {
            let output=tick(&mut engine);
            if position==2 {assert!(output.contains(&OutEvent::PolyPressure{track:3,pitch:60,value:77}));}
            if position==24 {assert!(output.contains(&OutEvent::NoteOff{track:3,pitch:60}));}
            if position==96 {assert!(output.contains(&OutEvent::NoteOn{track:3,pitch:67,vel:100}));}
        }
    }
    #[test]
    fn expression_samples_independent_phase_and_wrap_without_track_order_dependency() {
        for donor in [0,4] {
            let mut engine=setup();
            engine.tracks[donor].playing_slot=Some(0);
            let clip=&mut engine.tracks[donor].clips[0];
            clip.set_clip_length(4);
            clip.scale_num=2;
            clip.add_note_raw(0,0,24,90,42);
            clip.add_note_raw(2,48,24,91,73);
            // At donor phase 46 the shared snapshot must select 42, even if
            // a lower-numbered donor advances to 48 before the rhythm attack.
            engine.tracks[donor].pos_tick=46;
            engine.source_route_set(&format!("3 1 1 0 2 0 0 {donor} 0"));
            assert!(tick(&mut engine).contains(&OutEvent::NoteOn{track:3,pitch:60,vel:42}));
            for _ in 1..96 {tick(&mut engine);}
            assert!(tick(&mut engine).contains(&OutEvent::NoteOn{track:3,pitch:67,vel:42}));
            engine.tracks[2].clips[0].add_note_raw(8,192,24,36,100);
            for _ in 97..192 {tick(&mut engine);}
            engine.tracks[donor].pos_tick=70;
            assert!(tick(&mut engine).contains(&OutEvent::NoteOn{track:3,pitch:60,vel:73}));
        }
    }
    #[test]
    fn unavailable_expression_does_not_consume_pitch_and_empty_expression_is_neutral() {
        for unavailable in 0..3 {
            let mut engine=setup();
            engine.source_route_set("3 1 1 0 2 0 0 0 0");
            match unavailable {
                0=>engine.tracks[0].muted=true,
                1=>engine.tracks[0].playing_slot=None,
                _=>engine.tracks[0].playing_slot=Some(1),
            }
            assert!(ons(&tick(&mut engine)).is_empty());
            engine.tracks[0].muted=false;engine.tracks[0].playing_slot=Some(0);
            for _ in 1..96 {tick(&mut engine);}
            let output=tick(&mut engine);
            assert_eq!(ons(&output),vec![60,64]);
            assert!(output.contains(&OutEvent::NoteOn{track:3,pitch:60,vel:100}));
        }
    }
    #[test]
    fn expression_pressure_uses_rhythm_clock_and_recording_keeps_own_path() {
        let mut engine=setup();
        engine.tracks[0].clips[0].add_note_raw(0,0,48,90,42);
        engine.tracks[0].clips[0].notes[0].pressure=vec![(4,77),(30,99)];
        engine.tracks[0].clips[0].scale_den=2;
        engine.tracks[2].clips[0].scale_num=2;
        engine.tracks[3].clips[0].scale_den=2;
        engine.source_route_set("3 1 1 0 2 0 0 0 0");
        tick(&mut engine);
        for position in 1..=20 {
            let output=tick(&mut engine);
            assert_eq!(output.contains(&OutEvent::PolyPressure{track:3,pitch:60,value:77}),position==2);
            assert_eq!(output.contains(&OutEvent::NoteOff{track:3,pitch:60}),position==12);
            assert!(!output.contains(&OutEvent::PolyPressure{track:3,pitch:60,value:99}));
        }
        let mut engine=setup();
        engine.source_route_set("3 1 1 0 2 0 0 0 0");
        engine.recording=true;engine.rec_track=3;
        assert_eq!(ons(&tick(&mut engine)),vec![30]);
    }
    #[test]
    fn expression_routes_persist_undo_and_validate_atomically() {
        let mut engine=setup();
        engine.source_route_set("3 1 1 0 2 0 0 0 0");
        let saved=crate::persist::serialize(&engine);
        let mut restored=Engine::new(48000,12000);
        assert!(crate::persist::load(&mut restored,&saved));
        assert_eq!(engine.source_routes,restored.source_routes);
        let original=engine.source_routes;
        for invalid in ["3 1 1 0 2 0 0 16 0","3 1 1 0 2 0 0 0 8","3 1 1 0 2 0 0 -1 0","3 1 1 0 2 0 0 0","3 1 1 0 2 0 0 0 0 0"] {
            assert!(!engine.source_route_set(invalid));assert_eq!(engine.source_routes,original);
        }
        // Loading the previous snapshot is the existing native undo mechanism.
        engine.source_route_set("3 1 1 0 2 0 0 1 0");
        assert!(crate::persist::load(&mut engine,&saved));
        assert_eq!(engine.source_routes,original);
        assert!(engine.source_route_set("3 1 1 0 2 0 0"));
        assert_eq!(engine.source_routes[3].expression,None);
    }
    #[test]
    fn source_preview_reads_real_gates_without_consuming_material() {
        let mut engine=setup();
        let cursor=engine.source_cursors[3].onset;
        let before=engine.source_preview(3).unwrap();
        assert!(before.contains("\"notes\":[]"));
        assert!(before.contains("\"track\":1,\"slot\":0,\"active\":true"));
        assert_eq!(engine.source_cursors[3].onset,cursor);
        assert!(engine.source_preview(NUM_TRACKS).is_none());
        assert!(engine.source_preview(usize::MAX).is_none());
        let output=tick(&mut engine);
        assert_eq!(ons(&output),vec![60,64]);
        let cursor=engine.source_cursors[3].onset;
        for _ in 0..10 {
            let snapshot=engine.source_preview(3).unwrap();
            assert!(snapshot.contains("\"notes\":[60,64]"),"{snapshot}");
            assert_eq!(engine.source_cursors[3].onset,cursor);
        }
        engine.tracks[1].muted=true;
        let snapshot=engine.source_preview(3).unwrap();
        assert!(snapshot.contains("\"track\":1,\"slot\":0,\"active\":false"));
        assert!(snapshot.contains("\"notes\":[60,64]"),"source mute does not invent early releases");
        engine.stop(&mut Vec::new());
        let snapshot=engine.source_preview(3).unwrap();
        assert!(snapshot.contains("\"playing\":false"));
        assert!(snapshot.contains("\"notes\":[]"));
    }
    #[test]
    #[ignore = "isolated release-mode timing measurement, not a hardware audio assertion"]
    fn source_routing_benchmark() {
        use std::time::Instant;
        for (enabled,alignment,expression_fit) in [(false,0,false),(true,0,false),(true,1,false),(true,2,false),(true,0,true)] {
            let mut engine=setup();engine.source_route_set(&format!("3 {} 1 0 2 0 {alignment}",enabled as u8));
            if expression_fit {engine.source_routes[3].expression=Some(crate::source_route::ClipRef{track:1,slot:0});engine.source_routes[3].expression_fit=true;}
            let mut output=Vec::with_capacity(4096);
            let started=Instant::now();let mut count=0usize;
            for _ in 0..100_000 {engine.advance_block(250,&mut output);count+=output.len();output.clear();}
            println!("source-routing enabled={enabled} alignment={alignment} expression_fit={expression_fit} ticks=100000 events={count} elapsed_us={}",started.elapsed().as_micros());
        }
    }

}

#[cfg(test)]
mod source_fit_window_tests {
    use super::*;
    use crate::source_route::{Alignment, fitted_phase};
    fn setup(actor:usize, donor:usize)->Engine {
        let mut engine=Engine::new(48000,12000);engine.playing=true;
        for track in [actor,donor,2] {
            engine.tracks[track].playing_slot=Some(0);
            engine.tracks[track].clips[0].set_loop(0,16);
        }
        engine.tracks[actor].clips[0].add_note_raw(0,0,24,30,90);
        engine.tracks[donor].clips[0].set_loop(0,32);
        for index in 0..4 {
            engine.tracks[donor].clips[0].add_note_raw(index*8,u32::from(index)*192,48,60+index as u8,70);
            engine.tracks[2].clips[0].add_note_raw(index*4,u32::from(index)*96,24,36,100);
        }
        assert!(engine.source_route_set(&format!("{actor} 1 {donor} 0 2 0 2")));
        engine
    }
    fn tick(engine:&mut Engine)->Vec<OutEvent> {
        let mut output=Vec::new();engine.advance_block(250,&mut output);output
    }
    fn pitches(output:&[OutEvent],actor:usize)->Vec<u8> {
        output.iter().filter_map(|event|match event {
            OutEvent::NoteOn{track,pitch,..} if *track as usize==actor=>Some(*pitch),_=>None}).collect()
    }
    #[test]
    fn fitted_pitch_uses_actor_window_across_track_order_and_donor_speed() {
        for (actor,donor) in [(3,1),(0,4)] {
            for (numerator,denominator) in [(1,1),(4,1),(1,4)] {
                let mut engine=setup(actor,donor);
                engine.tracks[donor].clips[0].scale_num=numerator;
                engine.tracks[donor].clips[0].scale_den=denominator;
                let mut attacks=Vec::new();let mut releases=0;
                for position in 0..=768 {
                    let output=tick(&mut engine);
                    let notes=pitches(&output,actor);
                    if !notes.is_empty(){attacks.push((position,notes));}
                    releases+=output.iter().filter(|event|matches!(event,OutEvent::NoteOff{track,..} if *track as usize==actor)).count();
                }
                assert_eq!(attacks,(0..=8).map(|index|(index*96,vec![60+(index%4) as u8])).collect::<Vec<_>>());
                assert_eq!(releases,8);
            }
        }
    }
    #[test]
    fn actor_speed_changes_fitted_phase_but_rhythm_clock_retains_gates() {
        let mut engine=setup(3,1);engine.tracks[3].clips[0].scale_den=2;
        let mut attacks=Vec::new();let mut releases=Vec::new();
        for position in 0..=768 {
            let output=tick(&mut engine);
            let notes=pitches(&output,3);if !notes.is_empty(){attacks.push(notes);}
            if output.iter().any(|event|matches!(event,OutEvent::NoteOff{track:3,..})){releases.push(position);}
        }
        assert_eq!(attacks,vec![vec![60],vec![60],vec![61],vec![61],vec![62],vec![62],vec![63],vec![63],vec![60]]);
        assert_eq!(releases,(0..8).map(|index|index*96+24).collect::<Vec<_>>());
    }
    #[test]
    fn nonzero_loop_bounds_floor_and_wrap_without_rounding_outside_window() {
        assert_eq!(fitted_phase(240,240,384,480,1152),480);
        assert_eq!(fitted_phase(336,240,384,480,1152),768);
        assert_eq!(fitted_phase(623,240,384,480,1152),1629);
        assert_eq!(fitted_phase(624,240,384,480,1152),480);
        assert_eq!(fitted_phase(2,0,7,5,3),5);
        assert_eq!(fitted_phase(6,0,7,5,3),7);
        assert_eq!(fitted_phase(u32::MAX-1,0,u32::MAX,0,u32::MAX),u32::MAX-1);
        let mut engine=setup(3,1);
        engine.tracks[3].clips[0].set_loop(16,16);engine.tracks[3].pos_tick=384;
        engine.tracks[1].clips[0].set_loop(16,32);engine.tracks[1].pos_tick=384;
        // Source's first in-window group is 62; clipped-out notes cannot leak in.
        assert_eq!(pitches(&tick(&mut engine),3),vec![62]);
        for _ in 1..96 {tick(&mut engine);}
        assert_eq!(pitches(&tick(&mut engine),3),vec![63]);
    }
    #[test]
    fn rests_do_not_freeze_fit_phase_and_chords_remain_grouped() {
        let mut engine=setup(3,1);
        engine.tracks[1].clips[0].add_note_raw(8,192,48,65,80);
        engine.tracks[2].clips[0].trigs.push(crate::clip::Trig{step:0,lane:None,props:crate::clip::TrigProps{prob:0,cond_a:1,cond_b:1,invert:false}});
        assert!(pitches(&tick(&mut engine),3).is_empty());
        for _ in 1..96 {tick(&mut engine);}
        assert_eq!(pitches(&tick(&mut engine),3),vec![61,65]);
    }
    #[test]
    fn source_loss_and_alignment_change_keep_existing_release_and_pressure_owners() {
        let mut engine=setup(3,1);
        engine.tracks[3].clips[0].notes[0].pressure=vec![(2,77)];
        assert_eq!(pitches(&tick(&mut engine),3),vec![60]);
        engine.tracks[1].muted=true;
        for position in 1..=96 {
            let output=tick(&mut engine);
            if position==2 {assert!(output.contains(&OutEvent::PolyPressure{track:3,pitch:60,value:77}));}
            if position==24 {assert!(output.contains(&OutEvent::NoteOff{track:3,pitch:60}));}
            assert!(pitches(&output,3).is_empty());
        }
        engine.tracks[1].muted=false;
        engine.source_route_set("3 1 1 0 2 0 0");
        for _ in 97..192 {tick(&mut engine);}
        assert_eq!(pitches(&tick(&mut engine),3),vec![60],"Sequential restarts at its first group");
        engine.source_route_set("3 1 1 0 2 0 2");
        for _ in 193..288 {tick(&mut engine);}
        assert_eq!(pitches(&tick(&mut engine),3),vec![63]);
        let mut output=Vec::new();engine.stop(&mut output);
        assert!(output.contains(&OutEvent::NoteOff{track:3,pitch:63}));
    }
    #[test]
    fn fit_save_undo_and_recording_use_existing_route_and_own_path() {
        let mut engine=setup(3,1);let saved=crate::persist::serialize(&engine);
        let mut restored=Engine::new(48000,12000);assert!(crate::persist::load(&mut restored,&saved));
        assert_eq!(restored.source_routes,engine.source_routes);
        let mut output=Vec::new();crate::command::apply_batch(&mut engine,"usnap 2 3",&mut output);
        engine.source_route_set("3 1 1 0 2 0 1");
        crate::command::apply_batch(&mut engine,"uswap 2 3",&mut output);
        assert_eq!(engine.source_routes[3].alignment,Alignment::FitWindow);
        engine.recording=true;engine.rec_track=3;
        assert_eq!(pitches(&tick(&mut engine),3),vec![30]);
        assert_eq!(engine.tracks[1].clips[0].notes.len(),4);
        for legacy in ["3 1 1 0 2 0 0","3 1 1 0 2 0 1"] {
            assert!(engine.source_route_set(legacy));
            assert_ne!(engine.source_routes[3].alignment,Alignment::FitWindow);
        }
    }
    #[test]
    fn fit_relaunch_follows_actor_reset_and_ignores_donor_phase_reset() {
        for relaunched in [1,3] {
            let mut engine=setup(3,1);
            engine.tracks[3].clips[0].set_loop(0,32);
            for _ in 0..384 {tick(&mut engine);}
            engine.tracks[relaunched].queued_slot=Some(0);
            assert_eq!(pitches(&tick(&mut engine),3),if relaunched==3 {vec![60]} else {vec![62]});
        }
    }
    #[test]
    fn fit_edits_and_empty_actor_are_read_without_material_cache() {
        let mut engine=setup(3,1);engine.tracks[3].clips[0].notes.clear();
        engine.tracks[1].clips[0].notes[0].tick=48;
        assert_eq!(pitches(&tick(&mut engine),3),vec![63],"before first onset carries last group, like Timeline");
        engine.tracks[1].clips[0].notes[1].pitch=72;
        for _ in 1..96 {tick(&mut engine);}
        assert_eq!(pitches(&tick(&mut engine),3),vec![72]);
        assert!(engine.source_preview(3).unwrap().contains("\"alignment\":2"));
    }
}
