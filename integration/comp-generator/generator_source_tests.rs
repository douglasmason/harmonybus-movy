#[cfg(test)]
mod generator_source_tests {
    use super::*;
    use crate::generator::{Config,LABELS};

    fn fixture(donor:usize,actor:usize,style:u8)->Engine {
        let mut engine=Engine::new(48000,12000);engine.link_enabled=false;
        let config=Config{style,complexity:72,intensity:94,seed:371,end:1536};
        for track in [donor,actor] {
            engine.tracks[track].clips[0].set_loop(0,64);
            engine.tracks[track].playing_slot=Some(0);
        }
        engine.tracks[donor].clips[0].generator=Some(config);
        engine.follower_inputs[donor]=crate::follower_input::InputKey::new(0,1);
        engine.follower_inputs[actor]=crate::follower_input::InputKey::new(2,1);
        for (lane,label) in LABELS.iter().enumerate() {
            engine.auto_label(donor,lane,label);
            engine.tracks[donor].clips[0].set_lock(lane as u8,0,config.values()[lane]);
        }
        for (step,pitch) in [(0,60),(8,64)] {
            let clip=&mut engine.tracks[actor].clips[0];
            clip.add_note_raw(step,step as u32*TICKS_PER_STEP,12,pitch,81);
            clip.notes.last_mut().unwrap().input_key=crate::follower_input::InputKey::new(0,1);
        }
        assert!(engine.source_route_set(&format!("{actor} 1 -1 -1 {donor} 0 0")));
        engine.play();engine
    }

    fn tick(engine:&mut Engine)->Vec<OutEvent> {
        let mut output=Vec::new();engine.service_tick(&mut output);output
    }
    fn attack_count(output:&[OutEvent],track:usize)->usize {
        output.iter().filter(|event|matches!(event,OutEvent::NoteOn{track:owner,..} if *owner as usize==track)).count()
    }
    fn check_balance(output:&[OutEvent],actor:usize,held:&mut [i32;128]) {
        for event in output {
            match event {
                OutEvent::NoteOn{track,pitch,..} if *track as usize==actor=>held[*pitch as usize]+=1,
                OutEvent::NoteOff{track,pitch} if *track as usize==actor=>{
                    held[*pitch as usize]-=1;assert!(held[*pitch as usize]>=0,"unpaired release");
                },
                _=>{},
            }
        }
    }

    #[test]
    fn generated_rhythm_all_styles_use_one_source_decision_and_destination_pitch() {
        for style in 0..crate::generator::STYLES.len() as u8 {
            for (donor,actor) in [(1,3),(3,1)] {
                for (num,den,swing) in [(1,1,50),(2,1,67),(1,2,67)] {
                    let mut engine=fixture(donor,actor,style);
                    engine.swing_pct=swing;
                    engine.tracks[donor].clips[0].scale_num=num;
                    engine.tracks[donor].clips[0].scale_den=den;
                    engine.tracks[actor].clips[0].scale_num=den;
                    engine.tracks[actor].clips[0].scale_den=num;
                    // Editor focus must not replace the explicitly routed playing clip.
                    engine.tracks[donor].active_clip=1;
                    crate::generator::CONFIG_READS.with(|count|count.set(0));
                    let mut attacks=0;let mut held=[0;128];
                    for _ in 0..1536 {
                        let output=tick(&mut engine);
                        assert_eq!(attack_count(&output,actor),attack_count(&output,donor),"style {style}, donor {donor}, speed {num}/{den}");
                        for event in &output {
                            if let OutEvent::NoteOn{track,pitch,vel}=event {
                                if *track as usize==actor {
                                    assert!(matches!(*pitch,62|66));assert_eq!(*vel,81);attacks+=1;
                                }
                            }
                        }
                        assert!(engine.gates.iter().filter(|gate|gate.track as usize==actor).all(|gate|!gate.generated&&gate.clock_track as usize==donor));
                        check_balance(&output,actor,&mut held);
                    }
                    assert!(attacks>0);assert!(engine.tracks[donor].clips[0].notes.is_empty());
                    let reads=crate::generator::CONFIG_READS.with(|count|count.get());
                    assert_eq!(reads,64*num as usize/den as usize,"donation must not reevaluate the generator");
                    let mut output=Vec::new();engine.stop(&mut output);check_balance(&output,actor,&mut held);
                    assert_eq!(held,[0;128]);
                }
            }
        }
    }

    #[test]
    fn generated_rhythm_merges_coincident_authored_attacks_once_with_longest_gate() {
        let mut engine=fixture(1,3,0);
        let clip=&mut engine.tracks[1].clips[0];
        clip.generator.as_mut().unwrap().complexity=0;clip.set_lock(0,0,0);
        clip.add_note_raw(0,0,71,72,96);
        let output=tick(&mut engine);
        assert_eq!(attack_count(&output,1),2);assert_eq!(attack_count(&output,3),1);
        assert_eq!(engine.gates.iter().find(|gate|gate.track==3).unwrap().ticks_left,71);
        for _ in 1..71 {let output=tick(&mut engine);assert!(!output.contains(&OutEvent::NoteOff{track:3,pitch:62}));}
        assert!(tick(&mut engine).contains(&OutEvent::NoteOff{track:3,pitch:62}));
    }

    #[test]
    fn generated_rhythm_live_preview_and_saved_curves_do_not_write_the_donor() {
        let mut engine=fixture(1,3,0);
        engine.tracks[1].clips[0].set_lock(0,0,0);
        engine.tracks[1].clips[0].set_lock(0,8,127);
        engine.tracks[1].clips[0].set_lock(2,16,3);
        engine.stop(&mut Vec::new());
        let saved=crate::persist::serialize(&engine);engine.play();
        let mut attacks=0;
        for position in 0..768 {
            if position==35 {assert!(engine.generator_preview_set("gpreview 1 0 0 127",&mut Vec::new()));}
            if position==390 {assert!(engine.generator_preview_set("gpreview 1 0 2 1",&mut Vec::new()));}
            let output=tick(&mut engine);
            assert_eq!(attack_count(&output,3),attack_count(&output,1));
            attacks+=attack_count(&output,3);
        }
        assert!(attacks>8);
        engine.stop(&mut Vec::new());assert_eq!(crate::persist::serialize(&engine),saved);
        assert!(engine.undo_restore(&saved));engine.play();
        for _ in 0..768 {let output=tick(&mut engine);assert_eq!(attack_count(&output,3),attack_count(&output,1));}
    }

    #[test]
    fn generated_rhythm_unavailable_sources_and_recording_keep_existing_ownership() {
        for donor in [1,3] {
            let actor=4-donor;let mut engine=fixture(donor,actor,0);
            assert_eq!(attack_count(&tick(&mut engine),actor),1);
            engine.tracks[donor].muted=true;
            for _ in 0..100 {assert_eq!(attack_count(&tick(&mut engine),actor),0);}
            assert!(engine.gates.iter().all(|gate|gate.track as usize!=actor));
            engine.tracks[donor].muted=false;engine.tracks[donor].playing_slot=None;
            for _ in 0..100 {assert_eq!(attack_count(&tick(&mut engine),actor),0);}
            engine.stop(&mut Vec::new());engine.play();
            engine.recording=true;engine.rec_track=actor;
            let output=tick(&mut engine);
            assert_eq!(attack_count(&output,actor),1,"recording uses only the actor's own note");
            assert!(engine.gates.iter().filter(|gate|gate.track as usize==actor).all(|gate|gate.clock_track as usize==actor));
        }
    }

    #[test]
    fn generated_rhythm_free_auditions_do_not_impersonate_a_clip() {
        let mut engine=fixture(1,3,0);engine.stop(&mut Vec::new());
        engine.tracks[1].clips[0].clear();
        assert!(engine.generator_explore_set("gexplore 1 0 127 64 31",&mut Vec::new()));
        engine.play();let mut attacks=0;
        for _ in 0..384 {
            let output=tick(&mut engine);attacks+=attack_count(&output,1);
            assert_eq!(attack_count(&output,3),0);
        }
        assert!(attacks>0);
        engine.toggle_record(1);
        for _ in 0..384 {assert_eq!(attack_count(&tick(&mut engine),3),0,"a free take still has temporary source ownership");}
        engine.toggle_record(1);engine.stop(&mut Vec::new());engine.play();
        assert_eq!(attack_count(&tick(&mut engine),3),1,"the finished clip can donate without Bake");
    }

    #[test]
    fn generated_rhythm_routes_do_not_recurse_or_mutate_generated_actors() {
        let mut engine=fixture(1,3,0);
        assert!(engine.source_route_set("1 1 -1 -1 3 0 0"));
        let mut attacks=0;
        for _ in 0..384 {
            let output=tick(&mut engine);let count=attack_count(&output,1);
            assert!(count<=1);assert_eq!(attack_count(&output,3),count);attacks+=count;
        }
        assert!(attacks>0);assert!(engine.tracks[1].clips[0].notes.is_empty());
    }

    #[test]
    fn generated_rhythm_survives_reload_block_sizes_and_partial_take_silence() {
        let mut original=fixture(1,3,2);original.swing_pct=67;
        original.tracks[1].clips[0].set_loop(0,16);
        original.tracks[1].clips[0].generator.as_mut().unwrap().end=117;
        original.stop(&mut Vec::new());let saved=crate::persist::serialize(&original);
        let mut expected=None;
        for block in [32,128,1024] {
            let mut engine=Engine::new(48000,12000);
            assert!(crate::persist::load(&mut engine,&saved));
            engine.follower_inputs=original.follower_inputs;engine.play();
            let mut trace=Vec::new();let mut remaining=384000;
            while remaining>0 {
                let frames=remaining.min(block);engine.advance_block(frames,&mut trace);remaining-=frames;
            }
            engine.stop(&mut trace);
            let trace:Vec<_>=trace.into_iter().filter(|event|matches!(event,OutEvent::NoteOn{track:3,..}|OutEvent::NoteOff{track:3,..})).collect();
            assert!(!trace.is_empty());
            if let Some(expected)=&expected {assert_eq!(&trace,expected);}else{expected=Some(trace);}
        }
        original.play();
        for position in 0..384 {
            let output=tick(&mut original);
            if position>=117 {assert_eq!(attack_count(&output,3),0,"unrecorded tail must remain silent");}
        }
    }
}
