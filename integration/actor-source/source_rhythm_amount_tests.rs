#[cfg(test)]
mod source_rhythm_amount_tests {
    use super::*;

    fn fixture(donor:usize,amount:u8)->Engine {
        let mut engine=Engine::new(48000,12000);engine.link_enabled=false;
        for track in [donor,3] {
            engine.tracks[track].playing_slot=Some(0);
            engine.tracks[track].clips[0].set_loop(0,16);
        }
        for step in [0,1,4,6] {engine.tracks[donor].clips[0].add_note_raw(step,u32::from(step)*24,24,36,100);}
        engine.tracks[donor].clips[0].add_note_raw(2,48,96,38,100);
        for (step,pitch) in [(0,60),(2,62),(4,64),(8,65)] {
            engine.tracks[3].clips[0].add_note_raw(step,u32::from(step)*24,12,pitch,81);
        }
        engine.tracks[3].clips[0].notes[0].pressure=vec![(3,77)];
        assert!(engine.source_route_set(&format!("3 1 -1 -1 {donor} 0 0 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 0 0 36 {amount}")));
        engine.play();engine
    }
    fn tick(engine:&mut Engine)->Vec<OutEvent> {let mut output=Vec::new();engine.service_tick(&mut output);output}
    fn onsets(engine:&mut Engine,ticks:u32)->Vec<(u32,u8)> {
        let mut attacks=Vec::new();let mut held=[0i32;128];
        for position in 0..ticks {
            for event in tick(engine) {match event {
                OutEvent::NoteOn{track:3,pitch,vel}=>{assert_eq!(vel,81);held[pitch as usize]+=1;attacks.push((position,pitch));},
                OutEvent::NoteOff{track:3,pitch}=>{held[pitch as usize]-=1;assert!(held[pitch as usize]>=0);},
                _=>{},
            }}
        }
        let mut output=Vec::new();engine.stop(&mut output);
        for event in output {if let OutEvent::NoteOff{track:3,pitch}=event {held[pitch as usize]-=1;}}
        assert_eq!(held,[0;128]);attacks
    }

    #[test]
    fn answer_offbeats_preserves_own_accents_and_is_order_independent() {
        for donor in [0,4] {
            let mut engine=fixture(donor,100);let mut route=engine.source_routes[3];route.rhythm_answer=true;
            assert!(engine.source_route_set(&route.message(3)));
            assert_eq!(crate::source_route::Route::parse(&route.message(3)),Some((3,route)));
            assert_eq!(onsets(&mut engine,384),vec![(0,60),(96,62),(144,64),(192,65)]);
            route.rhythm_amount=0;let mut own=fixture(donor,0);assert!(own.source_route_set(&route.message(3)));
            assert_eq!(onsets(&mut own,384),vec![(0,60),(48,62),(96,64),(192,65)]);
        }
    }
    #[test]
    fn rhythm_amount_endpoints_and_repeatable_blends_keep_pitch_and_expression() {
        for donor in [0,4] {
            for (amount,expected) in [(0,vec![0,48,96,192]),(50,vec![0,48,96,144,192]),
                (75,vec![0,24,48,96,144]),(100,vec![0,24,96,144])] {
                let actual=onsets(&mut fixture(donor,amount),768);
                let positions:Vec<_>=actual.iter().map(|(position,_)|*position).collect();
                assert_eq!(positions,expected.iter().copied().chain(expected.iter().map(|position|position+384)).collect::<Vec<_>>());
                for (index,(_,pitch)) in actual.iter().enumerate() {assert_eq!(*pitch,[60,62,64,65][index%4]);}
            }
        }
    }

    #[test]
    fn rhythm_amount_all_values_preserve_common_hits_and_monotonic_source_selection() {
        let mut previous_donor=false;let mut previous_own=true;
        for amount in 0..=100 {
            let positions:Vec<_>=onsets(&mut fixture(4,amount),384).into_iter().map(|(position,_)|position).collect();
            for common in [0,96] {assert_eq!(positions.iter().filter(|position|**position==common).count(),1);}
            assert!(positions.iter().all(|position|[0,24,48,96,144,192].contains(position)));
            assert!(!previous_donor||positions.contains(&24),"more follow cannot remove a donor-only onset");
            assert!(previous_own||!positions.contains(&192),"more follow cannot restore an own-only onset");
            previous_donor=positions.contains(&24);previous_own=positions.contains(&192);
        }
    }

    #[test]
    fn rhythm_amount_live_edits_keep_gate_clock_pressure_and_cursor() {
        for donor in [0,4] {
            let mut engine=fixture(donor,50);tick(&mut engine);
            assert_eq!(engine.gates.iter().find(|gate|gate.track==3).unwrap().clock_track,donor as u8);
            let mut route=engine.source_routes[3];route.rhythm_amount=0;
            assert!(engine.source_route_set(&route.message(3)));
            for position in 1..=48 {
                let output=tick(&mut engine);
                assert_eq!(output.contains(&OutEvent::NoteOff{track:3,pitch:60}),position==24);
                if position==3 {assert!(output.contains(&OutEvent::PolyPressure{track:3,pitch:60,value:77}));}
                if position==48 {
                    assert!(output.contains(&OutEvent::NoteOn{track:3,pitch:62,vel:81}));
                    assert_eq!(engine.gates.iter().find(|gate|gate.track==3).unwrap().clock_track,3);
                }
            }
        }
    }

    #[test]
    fn rhythm_amount_source_loss_keeps_only_the_own_share_and_recording_bypasses_blend() {
        for amount in [0,50,100] {
            for stopped in [false,true] {
                let mut engine=fixture(4,amount);
                if stopped {engine.tracks[4].playing_slot=None;}else{engine.tracks[4].muted=true;}
                let expected=match amount {0=>vec![0,48,96,192],50=>vec![48,192],_=>vec![]};
                assert_eq!(onsets(&mut engine,384).into_iter().map(|(position,_)|position).collect::<Vec<_>>(),expected);
            }
            let mut recording=fixture(4,amount);recording.recording=true;recording.rec_track=3;
            assert_eq!(onsets(&mut recording,384),vec![(0,60),(48,62),(96,64),(192,65)]);
            let mut disabled=fixture(4,amount);disabled.source_routes[3].enabled=false;
            assert_eq!(onsets(&mut disabled,384),vec![(0,60),(48,62),(96,64),(192,65)]);
        }
    }

    #[test]
    fn rhythm_amount_own_source_keeps_lane_filter_at_every_amount() {
        for amount in [0,50,100] {
            let mut engine=fixture(4,amount);let mut route=engine.source_routes[3];
            route.rhythm=None;route.rhythm_pitch=Some(64);engine.source_route_set(&route.message(3));
            assert_eq!(onsets(&mut engine,384),vec![(96,60)]);
        }
    }

    #[test]
    fn rhythm_amount_round_trip_undo_defaults_and_invalid_messages_are_atomic() {
        let mut engine=fixture(4,100);engine.stop(&mut Vec::new());let before=engine.undo_snapshot();
        let old=engine.source_routes[3].message(3);assert_eq!(old.split_whitespace().count(),22);
        for amount in [0,1,50,99,100] {for lane in [None,Some(36)] {
            let mut route=engine.source_routes[3];route.rhythm_amount=amount;route.rhythm_pitch=lane;
            route.expression_fit=true;route.instrument_fit=true;
            assert!(engine.source_route_set(&route.message(3)));
            let saved=crate::persist::serialize(&engine);let mut restored=Engine::new(48000,12000);
            assert!(crate::persist::load(&mut restored,&saved));assert_eq!(restored.source_routes[3],route);
            assert!(restored.source_preview(3).unwrap().contains(&format!("\"rhythm_amount\":{amount}")));
            assert!(restored.source_diagnostics().contains(&format!("\"rhythm_amount\":{amount}")));
            for invalid in ["-1","101","1.5","50 50"] {
                assert!(!restored.source_route_set(&format!("{old} {invalid}")));
                assert_eq!(restored.source_routes[3],route);
            }
        }}
        assert!(engine.undo_restore(&before));assert_eq!(engine.source_routes[3].rhythm_amount,100);
        for legacy in ["3 1 -1 -1 4 0 0".to_owned(),old] {
            assert!(engine.source_route_set(&legacy));assert_eq!(engine.source_routes[3].rhythm_amount,100);
        }
        let mut route=crate::source_route::Route::default();assert_eq!(route.message(3).split_whitespace().count(),19);
        route.rhythm_amount=0;assert_eq!(route.message(3).split_whitespace().count(),23);
    }

    #[test]
    fn rhythm_amount_reload_replay_and_audio_block_sizes_are_deterministic() {
        let mut engine=fixture(4,50);engine.stop(&mut Vec::new());let saved=crate::persist::serialize(&engine);
        let mut expected=None;
        for block in [32,128,1024] {
            let mut restored=Engine::new(48000,12000);assert!(crate::persist::load(&mut restored,&saved));
            for _ in 0..2 {
                restored.play();let mut output=Vec::new();let mut remaining=192000;
                while remaining>0 {let frames=remaining.min(block);restored.advance_block(frames,&mut output);remaining-=frames;}
                restored.stop(&mut output);
                let trace:Vec<_>=output.into_iter().filter(|event|matches!(event,OutEvent::NoteOn{track:3,..}|OutEvent::NoteOff{track:3,..}|OutEvent::PolyPressure{track:3,..})).collect();
                assert_eq!(trace.iter().filter(|event|matches!(event,OutEvent::NoteOn{..})).count(),10);
                if let Some(expected)=&expected {assert_eq!(&trace,expected);}else{expected=Some(trace);}
            }
        }
    }

    #[test]
    fn rhythm_amount_swing_and_opposite_speeds_are_independent_of_track_order() {
        for (num,den) in [(2,1),(1,2)] {
            for amount in [0,50,100] {
                let mut expected=None;
                for donor in [0,4] {
                    let mut engine=fixture(donor,amount);engine.swing_pct=67;
                    engine.tracks[donor].clips[0].scale_num=num;engine.tracks[donor].clips[0].scale_den=den;
                    engine.tracks[3].clips[0].scale_num=den;engine.tracks[3].clips[0].scale_den=num;
                    let trace=onsets(&mut engine,1536);assert!(!trace.is_empty());
                    if let Some(expected)=&expected {assert_eq!(&trace,expected);}else{expected=Some(trace);}
                }
            }
        }
    }

    #[test]
    fn rhythm_amount_nonzero_loop_window_retains_the_same_blend() {
        let mut engine=fixture(4,50);engine.stop(&mut Vec::new());
        for track in [3,4] {
            let clip=&mut engine.tracks[track].clips[0];clip.set_loop(16,16);
            for note in &mut clip.notes {note.tick+=384;note.step+=16;}
        }
        engine.play();
        assert_eq!(onsets(&mut engine,384),vec![(0,60),(48,62),(96,64),(144,65),(192,60)]);
    }

    #[test]
    fn rhythm_amount_other_receivers_and_cyclic_routes_do_not_change_a_raw_donor() {
        let mut expected=None;
        for other_amount in [0,50,100] {
            let mut engine=fixture(4,50);
            engine.tracks[1].clips[0]=engine.tracks[3].clips[0].clone();engine.tracks[1].playing_slot=Some(0);
            let mut other=engine.source_routes[3];other.rhythm_amount=other_amount;
            engine.source_route_set(&other.message(1));
            let mut cycle=other;cycle.rhythm=Some(crate::source_route::ClipRef{track:3,slot:0});cycle.rhythm_pitch=None;
            engine.source_route_set(&cycle.message(4));
            let trace=onsets(&mut engine,768);
            if let Some(expected)=&expected {assert_eq!(&trace,expected);}else{expected=Some(trace);}
        }
    }

    #[test]
    fn rhythm_amount_uses_accepted_donor_hits_without_changing_probability_or_repeating_generation() {
        for generated in [false,true] {
            let mut expected_donor=None;
            for amount in [0,50,100] {
                let mut engine=fixture(1,amount);
                if generated {
                    engine.tracks[1].clips[0].notes.clear();
                    engine.tracks[1].clips[0].generator=Some(crate::generator::Config{style:4,complexity:127,intensity:64,seed:31,end:384,..Default::default()});
                    engine.source_routes[3].rhythm_pitch=None;
                }else{
                    engine.tracks[1].clips[0].trigs.push(crate::clip::Trig{step:1,lane:Some(36),props:crate::clip::TrigProps{prob:0,..crate::clip::TrigProps::DEFAULT}});
                }
                let mut donor=Vec::new();let mut own=Vec::new();
                for position in 0..384 {for event in tick(&mut engine) {match event {
                    OutEvent::NoteOn{track:1,pitch,vel}=>donor.push((position,pitch,vel)),
                    OutEvent::NoteOn{track:3,..}=>own.push(position),_=>{},
                }}}
                assert!(!own.is_empty());
                if amount==0 {assert_eq!(own,vec![0,48,96,192]);}
                if !generated {assert!(!donor.iter().any(|(position,_,_)|*position==24));assert!(!own.contains(&24));}
                if let Some(expected)=&expected_donor {assert_eq!(&donor,expected);}else{expected_donor=Some(donor);}
            }
        }
    }
}
