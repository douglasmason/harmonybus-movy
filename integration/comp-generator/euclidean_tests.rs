#[cfg(test)] mod euclidean_generator_tests {
    use super::*;
    use crate::generator::{Config,EUCLIDEAN_LABELS};
    fn fixture()->Engine {let mut engine=Engine::new(48000,12000);engine.link_enabled=false;engine.follower_inputs[2]=crate::follower_input::InputKey::new(0,1);engine}
    fn config(bass:bool)->Config {Config {style:crate::generator::STYLES.iter().position(|style|style.name=="Euclidean"&&style.bass==bass).unwrap() as u8,euclidean:[3,7,0,0],..Default::default()}}
    fn command(engine:&mut Engine,text:&str)->Vec<OutEvent>{let mut out=Vec::new();crate::command::apply_batch(engine,text,&mut out);out}
    fn ticks(engine:&mut Engine,count:u32)->Vec<(u32,OutEvent)> {
        let mut events=Vec::new();
        for tick in 0..count {let mut out=Vec::new();engine.service_tick(&mut out);events.extend(out.into_iter().filter(|event|matches!(event,OutEvent::NoteOn{track:2,..}|OutEvent::NoteOff{track:2,..})).map(|event|(tick,event)));}events
    }
    #[test] fn euclidean_config_roundtrips_and_isolates_source_controls() {
        for bass in [false,true]{
            let mut current=config(bass);assert_eq!(Config::parse(&current.wire()),Some(current));
            assert_eq!(current.mask(),255);assert_eq!(current.step_mask(),255);
            assert!(!current.set(1,0));assert!(!current.set(0,17));assert!(!current.set(2,16));assert!(!current.set(3,4));assert!(!current.set(8,0));
            assert!(!current.accepts_style(if bass{4}else{0}));assert!(!current.accepts_style(if bass{17}else{16}));
            assert!(Config::parse(&format!("{} 32 64 1 0 3 0 0 0",current.style)).is_none());
            assert!(current.set(4,100));assert_eq!(current.intensity,100);assert_eq!(current.euclidean,[3,7,0,0]);
        }
        assert_eq!(config(false).style,19);assert_eq!(config(true).style,20,"legacy style IDs stay stable");
        assert_eq!(Config::parse("0 32 64 1").unwrap().wire(),"0 32 64 1 0");
        assert_eq!(Config::parse("16 96 80 1 0 96 48 64 40 64 32").unwrap().wire(),"16 96 80 1 0 96 48 64 40 64 32");
    }
    #[test] fn euclidean_free_explore_keeps_phase_across_bars_and_harmony_changes() {
        let mut engine=fixture();let current=config(false);let saved=engine.undo_snapshot();engine.dirty=false;
        command(&mut engine,&format!("gexplore 2 {}",current.wire()));engine.play();
        let mut attacks=Vec::new();
        for tick in 0..3072 {
            if tick==800{engine.follower_inputs[2]=crate::follower_input::InputKey::new(7,1);}
            if ticks(&mut engine,1).iter().any(|(_,event)|matches!(event,OutEvent::NoteOn{..})){attacks.push(tick);}
        }
        let expected:Vec<_>=(0..128).filter(|step|crate::euclidean::hit(*step,7,3,0,0)).map(|step|step as u32*TICKS_PER_STEP).collect();
        assert_eq!(attacks,expected);command(&mut engine,"gexplore off");assert!(engine.gates.is_empty());
        // The changed input key is runtime state, not a clip edit.
        engine.follower_inputs[2]=crate::follower_input::InputKey::new(0,1);
        assert_eq!(engine.undo_snapshot(),saved);assert!(!engine.dirty);engine.stop(&mut Vec::new());
    }
    fn record(bass:bool)->(Engine,Vec<(u32,OutEvent)>) {
        let mut engine=fixture();let mut current=config(bass);
        command(&mut engine,&format!("gexplore 2 {}",current.wire()));engine.play();engine.toggle_record(2);
        let mut trace=Vec::new();
        for tick in 0..3072 {
            match tick {400=>current.euclidean[0]=5,1000=>current.euclidean[2]=3,1700=>current.euclidean[1]=11,2100=>current.euclidean[3]=1,2500=>current.intensity=100,_=>{}}
            if [400,1000,1700,2100,2500].contains(&tick){command(&mut engine,&format!("gexplore 2 {}",current.wire()));}
            trace.extend(ticks(&mut engine,1).into_iter().map(|(_,event)|(tick,event)));
        }
        engine.toggle_record(2);command(&mut engine,"stop");(engine,trace)
    }
    fn view(engine:&Engine)->Vec<i32> {
        engine.generator_info(2).split('|').nth(6).unwrap_or("").split_whitespace().take(5).map(|value|value.parse().unwrap()).collect()
    }
    #[test] fn euclidean_observation_uses_played_phase_and_is_read_only() {
        for rate in 0..4 {
            let mut engine=fixture();let mut current=config(false);current.euclidean[3]=rate;
            command(&mut engine,&format!("gexplore 2 {}",current.wire()));
            assert_eq!(view(&engine),vec![3,7,0,rate as i32,-1]);
            engine.dirty=false;let saved=engine.undo_snapshot();engine.play();
            for tick in 0..3200 {
                if tick==800 {engine.follower_inputs[2]=crate::follower_input::InputKey::new(7,1);}
                ticks(&mut engine,1);
                let observation=view(&engine);
                assert_eq!(observation,vec![3,7,0,rate as i32,((tick/TICKS_PER_STEP>>rate)%7) as i32]);
                assert!(!engine.dirty,"reading feedback cannot dirty the Set");
            }
            engine.tracks[2].muted=true;assert_eq!(view(&engine)[4],-1);
            engine.tracks[2].muted=false;engine.follower_inputs[2]=crate::follower_input::InputKey::new(0,1);
            assert_eq!(engine.undo_snapshot(),saved);
            command(&mut engine,"stop");assert!(view(&engine).is_empty());assert!(engine.generator_visuals[2].is_none());
        }
    }
    #[test] fn euclidean_observation_waits_for_accepted_controls_and_swung_step() {
        let mut engine=fixture();let mut current=config(false);engine.swing_pct=67;
        command(&mut engine,&format!("gexplore 2 {}",current.wire()));engine.play();ticks(&mut engine,1);
        current.euclidean=[5,11,4,1];command(&mut engine,&format!("gexplore 2 {}",current.wire()));
        assert_eq!(view(&engine),vec![3,7,0,0,0],"pending knob edits are not already sounding");
        ticks(&mut engine,TICKS_PER_STEP);assert_eq!(view(&engine),vec![3,7,0,0,0],"swung odd step has not fired");
        let mut moved=false;
        for _ in 0..TICKS_PER_STEP {
            ticks(&mut engine,1);
            if view(&engine)[0]==5 {assert_eq!(view(&engine),vec![5,11,4,1,0]);moved=true;break;}
        }
        assert!(moved);
        let (mut recorded,_)=record(false);recorded.play();ticks(&mut recorded,1);
        assert_eq!(view(&recorded)[4],0);
        recorded.tracks[2].active_clip=1;assert!(view(&recorded).is_empty(),"another selected clip cannot borrow this cursor");
        let saved=recorded.undo_snapshot();assert!(crate::persist::load(&mut recorded,&saved));assert!(recorded.generator_visuals.iter().all(Option::is_none));
    }
    #[test] fn euclidean_record_automation_reload_user_recipe_and_bake_match() {
        for bass in [false,true]{
            let (engine,recorded)=record(bass);let clip=&engine.tracks[2].clips[0];
            assert!(clip.notes.is_empty());assert_eq!(clip.length_steps,128);
            assert!(EUCLIDEAN_LABELS.iter().all(|label|engine.tracks[2].lane_label.iter().any(|name|name==label)));
            for field in 0..5 {
                let lane=engine.tracks[2].lane_label.iter().position(|label|label==EUCLIDEAN_LABELS[field]).unwrap();
                assert!(clip.locks.iter().filter(|lock|lock.lane==lane as u8).count()>1,"every moved control records");
            }
            let saved=engine.undo_snapshot();let mut replay=fixture();assert!(crate::persist::load(&mut replay,&saved));replay.play();
            assert_eq!(ticks(&mut replay,3072),recorded);command(&mut replay,"stop");
            let payload=engine.part_export(2);assert!(payload.starts_with("70617274320a"),"{payload}");
            let prepared=crate::part_load::prepare_part("user",&payload).unwrap();assert_eq!(prepared.clip.generator,clip.generator);
            let mut audition=fixture();command(&mut audition,&format!("guser 2 {} {payload}",if bass{"bass"}else{"comp"}));audition.play();
            assert_eq!(ticks(&mut audition,3072),recorded,"saved recipes retain their clip phase");
            command(&mut replay,"gbake 2 0");assert_eq!(replay.generator_result,"Baked - Undo available");replay.play();
            assert_eq!(ticks(&mut replay,3072),recorded);command(&mut replay,"stop");
            assert!(replay.undo_restore(&saved));assert_eq!(replay.tracks[2].clips[0].generator,clip.generator);
        }
    }
    #[test] fn euclidean_preview_restore_zero_hits_and_lane_capacity_preserve_saved_content() {
        let (mut engine,_)=record(false);let saved=engine.undo_snapshot();
        command(&mut engine,"gpreview 2 0 0 0;play");assert!(ticks(&mut engine,100).is_empty());
        command(&mut engine,"grestore 2 0");ticks(&mut engine,24);
        assert_eq!(engine.generator_explore[2].unwrap().touched,0);command(&mut engine,"stop");assert_eq!(engine.undo_snapshot(),saved);
        let mut empty=fixture();for lane in 0..4{empty.auto_label(2,lane,&format!("synth:p{lane}"));}
        let before=empty.undo_snapshot();command(&mut empty,&format!("gexplore 2 {}",config(false).wire()));empty.toggle_record(2);
        assert!(!empty.part_recording_busy());assert_eq!(empty.undo_snapshot(),before);assert!(empty.generator_result.contains("lanes"));
    }
    #[test] fn euclidean_expression_is_bounded_and_legacy_defaults_sound_identical() {
        for bass in [false,true] {
            let legacy=config(bass);assert_eq!(legacy.wire().split_whitespace().count(),9);
            for phase in 0..128 {if let Some(note)=legacy.note(phase){assert_eq!(note.gate,TICKS_PER_STEP/2);assert_eq!(note.vel,90);}}
            let mut expressive=legacy;expressive.euclidean=[5,13,2,1];expressive.expression=[2,60,25];
            assert_eq!(Config::parse(&expressive.wire()),Some(expressive));assert_eq!(expressive.wire().split_whitespace().count(),12);
            let notes:Vec<_>=(0..26).filter_map(|step|expressive.note(step)).collect();
            assert_eq!(notes.len(),5);assert_eq!(notes.iter().filter(|note|note.vel==90).count(),2);
            assert!(notes.iter().all(|note|note.vel==90||note.vel==36));assert!(notes.iter().all(|note|note.gate==12));
            for (field,value) in [(5,17),(6,101),(7,0),(7,101)]{assert!(!expressive.set(field,value));}
            assert!(Config::parse("19 32 64 1 0 3 8 0 0 2 50 0").is_none());
            assert!(Config::parse("0 32 64 1 0 3 8 0 0 2 50 50").is_none());
            expressive.expression=[0,100,50];
            assert!((0..26).filter_map(|step|expressive.note(step)).all(|note|note.vel==90),"zero accents disables emphasis");
            expressive.expression=[2,0,50];
            assert!((0..26).filter_map(|step|expressive.note(step)).all(|note|note.vel==90),"zero depth disables emphasis");
        }
    }
    #[test] fn euclidean_expression_automation_replays_reloads_and_bakes_exactly() {
        for bass in [false,true] {
            let mut engine=fixture();let mut current=config(bass);current.expression=[2,40,25];
            command(&mut engine,&format!("gexplore 2 {}",current.wire()));engine.play();engine.toggle_record(2);
            let mut recorded=Vec::new();
            for tick in 0..1536 {
                if tick==400{current.expression=[1,80,100];command(&mut engine,&format!("gexplore 2 {}",current.wire()));}
                recorded.extend(ticks(&mut engine,1).into_iter().map(|(_,event)|(tick,event)));
            }
            engine.toggle_record(2);command(&mut engine,"stop");let saved=engine.undo_snapshot();
            let payload=engine.part_export(2);assert!(payload.starts_with("70617274320a"),"{payload}");
            let mut replay=fixture();assert!(crate::persist::load(&mut replay,&saved));replay.play();assert_eq!(ticks(&mut replay,1536),recorded);command(&mut replay,"stop");
            let mut audition=fixture();command(&mut audition,&format!("guser 2 {} {payload}",if bass{"bass"}else{"comp"}));audition.play();assert_eq!(ticks(&mut audition,1536),recorded);
            command(&mut replay,"gbake 2 0");replay.play();assert_eq!(ticks(&mut replay,1536),recorded);
        }
    }
    fn legacy_recipe()->Engine {
        let (mut engine,_)=record(false);
        for label in &EUCLIDEAN_LABELS[5..] {
            let lane=engine.tracks[2].lane_label.iter().position(|name|name==label).unwrap();
            engine.tracks[2].lane_label[lane].clear();engine.tracks[2].lane_assigned[lane]=false;
            engine.tracks[2].clips[0].locks.retain(|lock|lock.lane as usize!=lane);
        }
        engine
    }
    #[test] fn euclidean_legacy_expression_lanes_are_added_only_by_record_and_undo_restores_them() {
        let mut engine=legacy_recipe();let saved=engine.undo_snapshot();
        assert!(engine.part_export(2).starts_with("70617274320a"));
        command(&mut engine,"gpreview 2 0 7 25;play");ticks(&mut engine,97);
        assert_eq!(engine.undo_snapshot(),saved,"preview adds no persistent lanes");
        engine.toggle_record(2);ticks(&mut engine,96);engine.toggle_record(2);command(&mut engine,"stop");
        let track=&engine.tracks[2];let lane=track.lane_label.iter().position(|name|name==EUCLIDEAN_LABELS[7]).unwrap();
        assert_eq!(track.clips[0].lock_at(lane as u8,0),Some(50));
        assert!(track.clips[0].locks.iter().any(|lock|lock.lane as usize==lane&&lock.val==25));
        assert!(!track.lane_label.iter().any(|name|name==EUCLIDEAN_LABELS[5]||name==EUCLIDEAN_LABELS[6]));
        assert!(engine.part_export(2).starts_with("70617274320a"));
        assert!(engine.undo_restore(&saved));assert_eq!(engine.undo_snapshot(),saved);
        // A lane used by a different clip does not impose a new legacy curve.
        engine.auto_label(2,7,EUCLIDEAN_LABELS[7]);assert!(engine.part_export(2).starts_with("70617274320a"));
    }
    #[test] fn euclidean_optional_lane_exhaustion_is_atomic_and_keeps_legacy_overdub() {
        let mut engine=legacy_recipe();for lane in 5..8{engine.auto_label(2,lane,&format!("synth:p{lane}"));}
        command(&mut engine,"gpreview 2 0 4 90;play");engine.toggle_record(2);ticks(&mut engine,24);assert!(engine.recording);engine.toggle_record(2);
        let saved=engine.undo_snapshot();command(&mut engine,"gpreview 2 0 7 25");engine.toggle_record(2);
        assert!(!engine.recording);assert!(engine.generator_result.contains("lanes"));assert_eq!(engine.undo_snapshot(),saved);
        // An expression gesture arriving after Record starts also fails before
        // changing an ordinary touched lane at that same boundary.
        command(&mut engine,"grestore 2 0");ticks(&mut engine,24);engine.toggle_record(2);
        command(&mut engine,"gpreview 2 0 4 100;gpreview 2 0 7 20");let before=engine.undo_snapshot();ticks(&mut engine,24);
        assert_eq!(engine.undo_snapshot(),before);assert!(!engine.recording);
    }
}
