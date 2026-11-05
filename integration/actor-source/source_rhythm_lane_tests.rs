#[cfg(test)]
mod source_rhythm_lane_tests {
    use super::*;
    use crate::source_route::ClipRef;

    fn fixture(donor:usize)->Engine {
        let mut engine=Engine::new(48000,12000);engine.link_enabled=false;
        for track in [donor,3] {
            engine.tracks[track].playing_slot=Some(0);
            engine.tracks[track].clips[0].set_loop(0,16);
        }
        for (step,pitch,gate) in [(0,36,24),(0,38,96),(2,42,6),(4,38,48),(8,36,24)] {
            engine.tracks[donor].clips[0].add_note_raw(step,step as u32*TICKS_PER_STEP,gate,pitch,100);
        }
        for (step,pitch) in [(0,60),(8,64)] {
            engine.tracks[3].clips[0].add_note_raw(step,step as u32*TICKS_PER_STEP,12,pitch,81);
        }
        engine.tracks[3].clips[0].notes[0].pressure=vec![(3,77)];
        assert!(engine.source_route_set(&format!("3 1 -1 -1 {donor} 0 0")));
        engine.play();engine
    }
    fn choose(engine:&mut Engine,pitch:Option<u8>) {
        let mut route=engine.source_routes[3];route.rhythm_pitch=pitch;
        assert!(engine.source_route_set(&route.message(3)));
    }
    fn tick(engine:&mut Engine)->Vec<OutEvent> {
        let mut output=Vec::new();engine.service_tick(&mut output);output
    }
    fn pitches(output:&[OutEvent])->Vec<u8> {
        output.iter().filter_map(|event|match event {OutEvent::NoteOn{track:3,pitch,vel}=>{assert_eq!(*vel,81);Some(*pitch)},_=>None}).collect()
    }
    fn balance(output:&[OutEvent],held:&mut [i32;128]) {
        for event in output {match event {
            OutEvent::NoteOn{track:3,pitch,..}=>held[*pitch as usize]+=1,
            OutEvent::NoteOff{track:3,pitch}=>{held[*pitch as usize]-=1;assert!(held[*pitch as usize]>=0);},
            _=>{},
        }}
    }

    #[test]
    fn rhythm_lane_filters_mixed_drums_without_consuming_rejected_pitch_groups() {
        for donor in [0,4] {
            for (pitch,expected) in [
                (None,vec![(0,60),(48,64),(96,60),(192,64)]),
                (Some(36),vec![(0,60),(192,64)]),
                (Some(38),vec![(0,60),(96,64)]),
                (Some(42),vec![(48,60)]),
                (Some(127),vec![]),
            ] {
                let mut engine=fixture(donor);choose(&mut engine,pitch);
                let mut actual=Vec::new();let mut held=[0;128];
                for position in 0..384 {
                    let output=tick(&mut engine);
                    actual.extend(pitches(&output).into_iter().map(|pitch|(position,pitch)));
                    balance(&output,&mut held);
                }
                let mut output=Vec::new();engine.stop(&mut output);balance(&output,&mut held);
                assert_eq!(actual,expected);assert_eq!(held,[0;128]);
            }
        }
    }

    #[test]
    fn rhythm_lane_gate_and_pressure_follow_only_matching_note_owners() {
        let mut engine=fixture(4);choose(&mut engine,Some(36));
        // Two kick voices at one onset still donate once, using their longest
        // gate. The simultaneous 96-tick snare must not extend that gate.
        engine.tracks[4].clips[0].add_note_raw(0,0,48,36,80);
        assert_eq!(pitches(&tick(&mut engine)),vec![60]);
        for position in 1..=48 {
            let output=tick(&mut engine);
            assert_eq!(output.contains(&OutEvent::NoteOff{track:3,pitch:60}),position==48);
            if position==3 {assert!(output.contains(&OutEvent::PolyPressure{track:3,pitch:60,value:77}));}
        }
    }

    #[test]
    fn rhythm_lane_live_switch_preserves_existing_gate_and_pitch_sequence() {
        let mut engine=fixture(4);choose(&mut engine,Some(36));
        assert_eq!(pitches(&tick(&mut engine)),vec![60]);
        choose(&mut engine,Some(38));
        for position in 1..=96 {
            let output=tick(&mut engine);
            assert_eq!(output.contains(&OutEvent::NoteOff{track:3,pitch:60}),position==24);
            assert_eq!(pitches(&output),if position==96 {vec![64]}else{vec![]});
        }
    }

    #[test]
    fn rhythm_lane_respects_probability_zero_velocity_and_suppression() {
        let mut engine=fixture(4);choose(&mut engine,Some(36));
        engine.tracks[4].clips[0].trigs.push(crate::clip::Trig{step:0,lane:Some(36),props:crate::clip::TrigProps{prob:0,..crate::clip::TrigProps::DEFAULT}});
        engine.tracks[4].clips[0].add_note_raw(1,24,12,36,0);
        engine.tracks[4].clips[0].add_note_raw(2,48,12,36,100);
        engine.tracks[4].clips[0].notes.last_mut().unwrap().suppress=true;
        for position in 0..=192 {
            assert_eq!(pitches(&tick(&mut engine)),if position==192 {vec![60]}else{vec![]});
        }
    }

    #[test]
    fn rhythm_lane_uses_raw_note_numbers_and_the_existing_swung_scaled_clock() {
        for wanted in [0,127] {
            for (num,den) in [(1,1),(2,1),(1,2)] {
                let mut engine=fixture(0);choose(&mut engine,Some(wanted));engine.swing_pct=67;
                let clip=&mut engine.tracks[0].clips[0];clip.notes.clear();clip.transpose=12;
                clip.add_note_raw(1,24,24,wanted,100);clip.add_note_raw(9,216,24,wanted,100);
                clip.scale_num=num;clip.scale_den=den;
                engine.tracks[3].clips[0].scale_num=den;engine.tracks[3].clips[0].scale_den=num;
                let mut held=[0;128];let mut attacks=0;
                for _ in 0..768 {
                    let output=tick(&mut engine);
                    let donor=output.iter().filter(|event|matches!(event,OutEvent::NoteOn{track:0,..})).count();
                    let own=pitches(&output).len();assert_eq!(own,donor);attacks+=own;
                    assert!(engine.gates.iter().filter(|gate|gate.track==3).all(|gate|gate.clock_track==0));
                    balance(&output,&mut held);
                }
                assert!(attacks>0);let mut output=Vec::new();engine.stop(&mut output);balance(&output,&mut held);
                assert_eq!(held,[0;128]);
            }
        }
    }

    #[test]
    fn rhythm_lane_persists_undo_and_legacy_routes_and_rejects_invalid_edits_atomically() {
        let mut engine=fixture(4);let legacy=engine.source_routes[3].message(3);
        assert_eq!(legacy.split_whitespace().count(),19);
        engine.stop(&mut Vec::new());let before=engine.undo_snapshot();
        for expression_fit in [false,true] {for instrument_fit in [false,true] {
            engine.source_routes[3].expression_fit=expression_fit;
            engine.source_routes[3].instrument_fit=instrument_fit;choose(&mut engine,Some(38));
            let saved=crate::persist::serialize(&engine);let route=engine.source_routes[3];
            let mut restored=Engine::new(48000,12000);assert!(crate::persist::load(&mut restored,&saved));
            assert_eq!(restored.source_routes[3],route);
            let message=route.message(3);assert_eq!(message.split_whitespace().count(),22);
            let prefix=message.rsplit_once(' ').unwrap().0;
            for suffix in ["-2","128","1.5","36 38"] {
                assert!(!engine.source_route_set(&format!("{prefix} {suffix}")));assert_eq!(engine.source_routes[3],route);
            }
            assert!(engine.source_preview(3).unwrap().contains("\"rhythm_pitch\":38"));
            assert!(engine.source_diagnostics().contains("\"rhythm_pitch\":38"));
        }}
        assert!(engine.undo_restore(&before));assert_eq!(engine.source_routes[3].rhythm_pitch,None);
        let mut restored=Engine::new(48000,12000);
        for suffix in [""," 0"," 1"," 0 1"," 1 1"," 1 1 -1"] {
            assert!(restored.source_route_set(&(legacy.clone()+suffix)));
            assert_eq!(restored.source_routes[3].rhythm_pitch,None);
        }
    }

    #[test]
    fn rhythm_lane_generator_and_authored_notes_share_the_same_filter() {
        let mut engine=fixture(1);choose(&mut engine,Some(60));
        let clip=&mut engine.tracks[1].clips[0];clip.notes.clear();
        clip.generator=Some(crate::generator::Config{style:4,complexity:127,intensity:64,seed:31,end:384});
        let wanted=clip.generator.unwrap().note(0).unwrap().pitch;
        clip.add_note_raw(0,0,100,127,100);choose(&mut engine,Some(wanted));
        let mut attacks=0;
        for _ in 0..384 {
            let output=tick(&mut engine);
            let matching=output.iter().any(|event|matches!(event,OutEvent::NoteOn{track:1,pitch,..} if *pitch==wanted));
            let actual=pitches(&output);assert_eq!(!actual.is_empty(),matching);assert!(actual.len()<=1);attacks+=actual.len();
        }
        assert!(attacks>0);
    }

    #[test]
    fn rhythm_lane_recording_and_source_loss_keep_existing_safety_rules() {
        let mut engine=fixture(4);choose(&mut engine,Some(36));
        let output=tick(&mut engine);assert_eq!(pitches(&output),vec![60]);
        engine.tracks[4].muted=true;
        for _ in 0..100 {assert!(pitches(&tick(&mut engine)).is_empty());}
        assert!(engine.gates.iter().all(|gate|gate.track!=3));
        engine.tracks[4].muted=false;engine.tracks[4].playing_slot=None;
        for _ in 0..100 {assert!(pitches(&tick(&mut engine)).is_empty());}
        engine.stop(&mut Vec::new());engine.play();engine.recording=true;engine.rec_track=3;
        assert_eq!(pitches(&tick(&mut engine)),vec![60]);
        assert!(engine.gates.iter().filter(|gate|gate.track==3).all(|gate|gate.clock_track==3));
        assert_eq!(engine.source_routes[3].rhythm,Some(ClipRef{track:4,slot:0}));
        assert_eq!(engine.source_routes[3].rhythm_pitch,Some(36));
    }

    #[test]
    fn rhythm_lane_two_receivers_reload_and_replay_independently_across_block_sizes() {
        let mut engine=fixture(4);choose(&mut engine,Some(36));
        engine.tracks[1].clips[0].set_loop(0,16);
        engine.tracks[1].clips[0].add_note_raw(0,0,12,72,94);
        engine.tracks[1].playing_slot=Some(0);
        let mut route=engine.source_routes[3];route.rhythm_pitch=Some(38);
        assert!(engine.source_route_set(&route.message(1)));
        engine.stop(&mut Vec::new());let saved=crate::persist::serialize(&engine);
        let mut expected=None;
        for block in [32,128,1024] {
            let mut restored=Engine::new(48000,12000);
            assert!(crate::persist::load(&mut restored,&saved));restored.play();
            let mut output=Vec::new();let mut remaining=96000;
            while remaining>0 {let frames=remaining.min(block);restored.advance_block(frames,&mut output);remaining-=frames;}
            restored.stop(&mut output);
            let trace:Vec<_>=output.into_iter().filter(|event|matches!(event,OutEvent::NoteOn{track:1|3,..}|OutEvent::NoteOff{track:1|3,..})).collect();
            assert_eq!(trace.iter().filter(|event|matches!(event,OutEvent::NoteOn{track:1,..})).count(),2);
            assert_eq!(trace.iter().filter(|event|matches!(event,OutEvent::NoteOn{track:3,..})).count(),2);
            if let Some(expected)=&expected {assert_eq!(&trace,expected);}else{expected=Some(trace);}
        }
    }
}
