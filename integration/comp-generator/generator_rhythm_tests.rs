#[cfg(test)]
mod generator_rhythm_tests {
    use super::*;
    use crate::generator::Config;

    fn fixture(donor:usize,amount:u8)->Engine {
        let mut engine=Engine::new(48000,12000);engine.link_enabled=false;
        for track in [donor,3] {
            engine.tracks[track].clips[0].set_loop(0,16);
            engine.tracks[track].playing_slot=Some(0);
            engine.follower_inputs[track]=crate::follower_input::InputKey::new(0,1);
        }
        for tick in [0,7,53,103,215,300] {
            engine.tracks[donor].clips[0].add_note_raw((tick/24) as u16,tick,9,36,100);
        }
        engine.tracks[donor].clips[0].add_note_raw(0,0,100,38,127);
        engine.tracks[donor].clips[0].add_note_raw(1,24,100,38,127);
        engine.tracks[3].clips[0].generator=Some(Config{style:4,complexity:0,intensity:64,seed:31,end:384,..Default::default()});
        assert!(engine.source_route_set(&format!("3 1 -1 -1 {donor} 0 0 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 0 0 36 {amount}")));
        engine.play();engine
    }
    fn tick(engine:&mut Engine)->Vec<OutEvent> {let mut output=Vec::new();engine.service_tick(&mut output);output}
    fn trace(engine:&mut Engine,count:u32)->Vec<(u32,OutEvent)> {
        let mut events=Vec::new();
        for position in 0..count {events.extend(tick(engine).into_iter().filter(|event|matches!(event,OutEvent::NoteOn{track:3,..}|OutEvent::NoteOff{track:3,..})).map(|event|(position,event)));}
        events
    }
    fn finish(engine:&mut Engine,events:&[(u32,OutEvent)]) {
        let mut held=[0i32;128];let mut output=Vec::new();engine.stop(&mut output);
        for event in events.iter().map(|(_,event)|event).chain(output.iter()) {
            match event {
                OutEvent::NoteOn{track:3,pitch,..}=>held[*pitch as usize]+=1,
                OutEvent::NoteOff{track:3,pitch}=>{held[*pitch as usize]-=1;assert!(held[*pitch as usize]>=0,"unpaired release");},
                _=>{},
            }
        }
        assert_eq!(held,[0;128]);
    }
    fn attacks(events:&[(u32,OutEvent)])->Vec<(u32,u8,u8)> {
        events.iter().filter_map(|(position,event)|if let OutEvent::NoteOn{pitch,vel,..}=event{Some((*position,*pitch,*vel))}else{None}).collect()
    }

    #[test]
    fn generated_receiver_samples_own_phrase_not_donor_pitch_or_hit_count() {
        for donor in [0,4] {
            let mut engine=fixture(donor,100);let events=trace(&mut engine,384);
            assert_eq!(attacks(&events),vec![(0,36,108),(7,36,108),(53,36,108),(103,43,88),(215,36,100),(300,43,84)]);
            assert!(engine.tracks[3].clips[0].notes.is_empty());finish(&mut engine,&events);
        }
    }

    #[test]
    fn generated_receiver_zero_matches_original_including_authored_notes() {
        for donor in [0,4] {
            let mut expected=None;
            for enabled in [false,true] {
                let mut engine=fixture(donor,0);engine.source_routes[3].enabled=enabled;
                engine.tracks[3].clips[0].add_note_raw(2,48,12,72,81);
                let events=trace(&mut engine,768);finish(&mut engine,&events);
                if let Some(expected)=&expected {assert_eq!(&events,expected);}else{expected=Some(events);}
            }
        }
    }

    #[test]
    fn generated_receiver_blends_are_complementary_and_keep_common_hits_once() {
        let mut prior_donor=false;let mut prior_own=true;
        for amount in 0..=100 {
            let mut engine=fixture(4,amount);let events=trace(&mut engine,384);
            let positions:Vec<_>=attacks(&events).into_iter().map(|(position,_,_)|position).collect();
            assert_eq!(positions.iter().filter(|position|**position==0).count(),1);
            assert!(positions.iter().all(|position|[0,7,53,96,103,192,215,288,300].contains(position)));
            assert!(!prior_donor||positions.contains(&53));assert!(prior_own||!positions.contains(&192));
            prior_donor=positions.contains(&53);prior_own=positions.contains(&192);
            finish(&mut engine,&events);
        }
    }

    #[test]
    fn generated_receiver_gate_uses_donor_clock_and_survives_amount_change() {
        for donor in [0,4] {
            let mut engine=fixture(donor,100);let mut events=trace(&mut engine,1);
            let gate=engine.gates.iter().find(|gate|gate.track==3).unwrap();
            assert!(gate.generated);assert_eq!(gate.clock_track,donor as u8);assert_eq!(gate.ticks_left,9);
            let mut route=engine.source_routes[3];route.rhythm_amount=0;engine.source_route_set(&route.message(3));
            let rest=trace(&mut engine,100);
            assert!(rest.contains(&(8,OutEvent::NoteOff{track:3,pitch:36})));
            assert_eq!(attacks(&rest),vec![(95,43,88)]);
            events.extend(rest);finish(&mut engine,&events);
        }
    }

    #[test]
    fn generated_receiver_reads_curves_once_per_selected_donor_not_per_candidate() {
        let mut engine=fixture(4,100);
        crate::generator::CONFIG_READS.with(|count|count.set(0));
        trace(&mut engine,384);
        assert_eq!(crate::generator::CONFIG_READS.with(|count|count.get()),22,"16 own candidates plus six accepted kicks; snare ignored");
    }

    #[test]
    fn generated_receiver_preview_accepts_and_restores_controls_at_step_boundaries() {
        for donor in [0,4] {
            let mut engine=fixture(donor,100);let saved=engine.undo_snapshot();
            assert_eq!(attacks(&trace(&mut engine,1)),vec![(0,36,108)]);
            assert!(engine.generator_preview_set("gpreview 3 0 1 127",&mut Vec::new()));
            assert_eq!(attacks(&trace(&mut engine,69)),vec![(6,36,108),(52,36,127)]);
            assert!(engine.generator_follow_set("gfollow 3 0"));
            assert_eq!(attacks(&trace(&mut engine,314)),vec![(33,43,88),(145,36,100),(230,43,84)]);
            assert_eq!(engine.undo_snapshot(),saved,"audition and restore never change saved curves");
        }
    }

    #[test]
    fn generated_receiver_all_recorded_noncloud_styles_and_silent_tails() {
        for style in 0..crate::generator::STYLES.len() as u8 {
            let config=Config{style,complexity:0,intensity:64,seed:31,end:117,..Default::default()};
            if config.is_cloud(){continue;}
            let mut engine=fixture(4,100);engine.tracks[3].clips[0].generator=Some(config);
            let events=trace(&mut engine,384);
            assert_eq!(attacks(&events).into_iter().map(|(position,_,_)|position).collect::<Vec<_>>(),vec![0,7,53,103],"style {style}");
            finish(&mut engine,&events);
            if config.is_euclidean() {
                let mut empty=fixture(4,100);let mut config=config;config.euclidean[0]=0;
                empty.tracks[3].clips[0].generator=Some(config);
                assert!(attacks(&trace(&mut empty,384)).is_empty());
            }
        }
    }

    #[test]
    fn generated_receiver_swing_speed_nonzero_window_and_preview_ignore_track_order() {
        for (num,den) in [(1,1),(2,1),(1,2)] {for amount in [0,50,100] {for preview in [false,true] {
            let mut expected=None;
            for donor in [0,4] {
                let mut engine=fixture(donor,amount);engine.stop(&mut Vec::new());engine.swing_pct=67;
                for track in [3,donor] {
                    let clip=&mut engine.tracks[track].clips[0];clip.set_loop(16,16);
                    for note in &mut clip.notes {note.tick+=384;note.step+=16;}
                }
                engine.tracks[3].clips[0].generator.as_mut().unwrap().end=768;
                engine.tracks[3].clips[0].scale_num=den;engine.tracks[3].clips[0].scale_den=num;
                engine.tracks[donor].clips[0].scale_num=num;engine.tracks[donor].clips[0].scale_den=den;
                engine.play();let mut events=trace(&mut engine,1);
                if preview {assert!(engine.generator_preview_set("gpreview 3 0 1 127",&mut Vec::new()));}
                events.extend(trace(&mut engine,1535));finish(&mut engine,&events);
                assert!(!attacks(&events).is_empty());
                if let Some(expected)=&expected {assert_eq!(&events,expected,"{num}/{den} amount {amount} preview {preview}");}else{expected=Some(events);}
            }
        }}}
    }

    #[test]
    fn generated_receiver_record_free_and_cloud_keep_own_ownership() {
        for kind in [0,1,2] {
            let mut expected=None;
            for enabled in [false,true] {
                let mut engine=fixture(4,100);engine.source_routes[3].enabled=enabled;
                match kind {
                    0=>{engine.recording=true;engine.rec_track=3;},
                    1=>{engine.tracks[3].clips[0].generator=None;assert!(engine.generator_explore_set("gexplore 3 4 0 64 31",&mut Vec::new()));},
                    _=>{let style=crate::generator::STYLES.iter().position(|style|style.name=="Cloud").unwrap() as u8;engine.tracks[3].clips[0].generator.as_mut().unwrap().style=style;},
                }
                assert!(!engine.generator_rhythm_following(3));
                let events=trace(&mut engine,384);finish(&mut engine,&events);
                if let Some(expected)=&expected {assert_eq!(&events,expected);}else{expected=Some(events);}
            }
        }
    }

    #[test]
    fn generated_receiver_donor_loss_and_probability_do_not_invent_hits() {
        for stopped in [false,true] {
            let mut engine=fixture(4,100);
            if stopped {engine.tracks[4].playing_slot=None;}else{engine.tracks[4].muted=true;}
            assert!(attacks(&trace(&mut engine,384)).is_empty());
        }
        let mut engine=fixture(4,100);
        engine.tracks[4].clips[0].trigs.push(crate::clip::Trig{step:2,lane:Some(36),props:crate::clip::TrigProps{prob:0,..crate::clip::TrigProps::DEFAULT}});
        let events=trace(&mut engine,384);assert!(!attacks(&events).iter().any(|(position,_,_)|*position==53));finish(&mut engine,&events);
    }

    #[test]
    fn generated_receiver_other_source_dimensions_cannot_replace_recipe_material() {
        let mut engine=fixture(4,100);let mut route=engine.source_routes[3];
        route.pitch=Some(crate::source_route::ClipRef{track:2,slot:0});
        route.expression=route.pitch;route.alignment=crate::source_route::Alignment::FitWindow;
        engine.source_route_set(&route.message(3));
        assert_eq!(attacks(&trace(&mut engine,384)),attacks(&trace(&mut fixture(4,100),384)));
    }

    #[test]
    fn generated_receiver_cycle_uses_raw_generator_attacks_once() {
        for donor in [0,4] {
            let mut engine=fixture(donor,100);engine.tracks[donor].clips[0].notes.clear();
            engine.tracks[donor].clips[0].generator=Some(Config{style:2,complexity:0,intensity:64,seed:31,end:384,..Default::default()});
            engine.source_routes[3].rhythm_pitch=None;
            let mut cycle=engine.source_routes[3];cycle.rhythm=Some(crate::source_route::ClipRef{track:3,slot:0});
            engine.source_route_set(&cycle.message(donor));
            let config=engine.tracks[donor].clips[0].generator.unwrap();
            let expected:Vec<_>=(0..16).filter_map(|step|config.note(step).map(|note|note.tick)).collect();
            let events=trace(&mut engine,384);
            assert_eq!(attacks(&events).into_iter().map(|(position,_,_)|position).collect::<Vec<_>>(),expected);finish(&mut engine,&events);
        }
    }

    #[test]
    fn generated_receiver_reload_blocks_undo_and_bake_guard() {
        let mut engine=fixture(4,50);engine.stop(&mut Vec::new());let saved=engine.undo_snapshot();
        engine.generator_bake("gbake 3 0",&mut Vec::new());
        assert_eq!(engine.generator_result,"Turn Source Weaving off before Bake");assert_eq!(engine.undo_snapshot(),saved);
        let mut expected=None;
        for block in [32,128,1024] {
            let mut restored=Engine::new(48000,12000);assert!(crate::persist::load(&mut restored,&saved));
            restored.play();let mut output=Vec::new();let mut remaining=192000;
            while remaining>0 {let frames=remaining.min(block);restored.advance_block(frames,&mut output);remaining-=frames;}
            restored.stop(&mut output);
            let events:Vec<_>=output.into_iter().filter(|event|matches!(event,OutEvent::NoteOn{track:3,..}|OutEvent::NoteOff{track:3,..})).collect();
            assert!(!events.is_empty());
            if let Some(expected)=&expected {assert_eq!(&events,expected);}else{expected=Some(events);}
        }
        engine.source_routes[3].rhythm_amount=0;assert!(engine.undo_restore(&saved));assert_eq!(engine.source_routes[3].rhythm_amount,50);
    }

    #[test] #[ignore]
    fn source_routing_benchmark_generated_receivers() {
        for empty in [false,true] {for amount in [0,50,100] {
            let mut engine=fixture(4,amount);let mut output=Vec::with_capacity(512);
            if empty {
                let clip=&mut engine.tracks[3].clips[0];clip.set_loop(0,256);
                let style=crate::generator::STYLES.iter().position(|style|style.name=="Euclidean").unwrap() as u8;
                clip.generator=Some(Config{style,end:6144,euclidean:[0,16,0,0],..Default::default()});
            }
            let start=std::time::Instant::now();
            for _ in 0..100000 {output.clear();engine.service_tick(&mut output);std::hint::black_box(&output);}
            println!("generated receiver empty_256={empty} amount={amount}: {:.3} us/tick",start.elapsed().as_secs_f64()*10.0);
        }}
    }
}
