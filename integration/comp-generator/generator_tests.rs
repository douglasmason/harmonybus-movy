#[cfg(test)] mod generator_tests {
    use super::*;
    use crate::generator::{Config,LABELS};
    fn fixture()->Engine {let mut engine=Engine::new(48000,12000);engine.link_enabled=false;engine.follower_inputs[2]=crate::follower_input::InputKey::new(0,1);engine}
    fn command(engine:&mut Engine,text:&str)->Vec<OutEvent>{let mut out=Vec::new();crate::command::apply_batch(engine,text,&mut out);out}
    fn ticks(engine:&mut Engine,count:u32)->Vec<(u32,OutEvent)> {
        let mut events=Vec::new();
        for tick in 0..count {let mut out=Vec::new();engine.service_tick(&mut out);events.extend(out.into_iter().filter(|event|matches!(event,OutEvent::NoteOn{track:2,..}|OutEvent::NoteOff{track:2,..})).map(|event|(tick,event)));}
        events
    }
    fn record()->(Engine,Vec<(u32,OutEvent)>) {
        let mut engine=fixture();command(&mut engine,"gexplore 2 0 0 32 47");engine.play();engine.toggle_record(2);
        let mut trace=Vec::new();
        for tick in 0..3072 {
            if tick==768 {command(&mut engine,"gexplore 2 0 90 80 47");}
            if tick==1536 {command(&mut engine,"gexplore 2 2 127 120 47");}
            if tick==1800 {command(&mut engine,"gexplore 2 3 64 100 47");}
            let mut out=Vec::new();engine.service_tick(&mut out);
            trace.extend(out.into_iter().filter(|event|matches!(event,OutEvent::NoteOn{track:2,..}|OutEvent::NoteOff{track:2,..})).map(|event|(tick,event)));
        }
        engine.toggle_record(2);(engine,trace)
    }
    #[test] fn generator_exploration_does_not_write_clips_automation_or_persistence() {
        let mut engine=fixture();engine.tracks[2].clips[0]=crate::part_catalog::comp(5).unwrap();
        engine.tracks[2].clips[0].transpose=12;engine.tracks[2].clips[0].scale_num=3;
        engine.tracks[2].clips[0].set_lock(5,0,85);
        let before=engine.undo_snapshot();engine.dirty=false;
        command(&mut engine,"gexplore 2 0 30 64 7");
        assert_eq!(engine.undo_snapshot(),before);assert!(!engine.dirty);
        engine.play();let trace=ticks(&mut engine,768);
        assert!(trace.iter().any(|(_,event)|matches!(event,OutEvent::NoteOn{pitch:60,..})));
        assert!(trace.iter().all(|(_,event)|!matches!(event,OutEvent::NoteOn{pitch:72,..})));
        command(&mut engine,"gexplore 2 3 127 127 7");ticks(&mut engine,300);
        let off=command(&mut engine,"gexplore off");
        assert!(off.iter().all(|event|!matches!(event,OutEvent::NoteOn{..})));
        assert!(engine.gates.is_empty());assert_eq!(engine.undo_snapshot(),before);assert!(!engine.dirty);
    }
    #[test] fn generator_record_curves_replay_reload_and_bake_identically() {
        let (mut engine,recorded)=record();
        let clip=&engine.tracks[2].clips[0];
        assert_eq!(clip.length_steps,128);assert_eq!(clip.generator.unwrap().end,3072);
        assert!(clip.notes.is_empty());assert!(clip.locks.len()>3);
        assert!(LABELS.iter().all(|label|engine.tracks[2].lane_label.iter().any(|name|name==label)));
        let saved=engine.undo_snapshot();let mut restored=fixture();assert!(crate::persist::load(&mut restored,&saved));
        restored.play();let replay=ticks(&mut restored,3072);assert_eq!(recorded,replay,"recipe replay must equal live recorded attacks and releases");
        let mut out=Vec::new();restored.stop(&mut out);restored.generator_bake("gbake 2 0",&mut out);
        assert_eq!(restored.generator_result,"Baked - Undo available");
        assert!(restored.tracks[2].clips[0].generator.is_none());assert!(!restored.tracks[2].clips[0].notes.is_empty());
        restored.play();assert_eq!(ticks(&mut restored,3072),replay,"Bake and playback use identical source decisions");
        assert!(restored.undo_restore(&saved));assert!(restored.tracks[2].clips[0].generator.is_some());
        engine.stop(&mut Vec::new());assert!(engine.generator_explore.iter().all(Option::is_none));assert!(engine.gates.is_empty());
    }
    #[test] fn generator_midbar_stop_keeps_silent_unrecorded_tail() {
        let mut engine=fixture();command(&mut engine,"gexplore 2 0 127 64 2");engine.play();engine.toggle_record(2);
        ticks(&mut engine,117);engine.toggle_record(2);
        assert_eq!(engine.tracks[2].clips[0].generator.unwrap().end,117);
        engine.stop(&mut Vec::new());engine.play();let events=ticks(&mut engine,384);
        assert!(events.iter().all(|(tick,event)|!matches!(event,OutEvent::NoteOn{..})||*tick<117));
    }
    #[test] fn generator_preserves_essential_rhythm_and_changes_intensity_independently() {
        for style in 0..4 {
            let sparse=Config {style,complexity:0,intensity:32,seed:9,end:0};
            let dense=Config {complexity:127,..sparse};let strong=Config {intensity:127,..sparse};
            let sparse_steps:Vec<_>=(0..64).filter(|step|sparse.note(*step).is_some()).collect();
            let dense_steps:Vec<_>=(0..64).filter(|step|dense.note(*step).is_some()).collect();
            assert!(dense_steps.len()>sparse_steps.len());
            for step in sparse_steps {assert!(dense_steps.contains(&step));assert!(strong.note(step).unwrap().vel>sparse.note(step).unwrap().vel);}
        }
    }
    #[test] fn generator_rejects_occupied_record_and_lane_exhaustion_atomically() {
        let mut engine=fixture();engine.tracks[2].clips[0]=crate::part_catalog::comp(0).unwrap();
        command(&mut engine,"gexplore 2 0 1 64 1");let before=engine.undo_snapshot();engine.toggle_record(2);
        assert!(!engine.part_recording_busy());assert_eq!(before,engine.undo_snapshot());
        engine.tracks[2].clips[0].clear();
        for lane in 0..6 {engine.auto_label(2,lane,&format!("synth:param{lane}"));}
        let before=engine.undo_snapshot();engine.toggle_record(2);
        assert!(!engine.part_recording_busy());assert_eq!(before,engine.undo_snapshot());assert!(engine.generator_result.contains("lanes"));
    }
    #[test] fn generator_style_waits_for_bar_seed_locks_and_cancel_releases() {
        let mut engine=fixture();command(&mut engine,"gexplore 2 0 0 64 1");engine.play();ticks(&mut engine,10);
        assert!(!engine.gates.is_empty());command(&mut engine,"gexplore 2 1 90 100 2");
        ticks(&mut engine,374);assert_eq!(engine.generator_explore[2].unwrap().current.style,0);
        ticks(&mut engine,1);assert_eq!(engine.generator_explore[2].unwrap().current.style,1);
        engine.toggle_record(2);command(&mut engine,"gexplore 2 1 90 100 3");
        assert_eq!(engine.generator_explore[2].unwrap().desired.seed,2);assert!(engine.generator_result.contains("Seed locked"));
        engine.stop(&mut Vec::new());assert!(engine.generator_explore.iter().all(Option::is_none));assert!(engine.gates.is_empty());
    }
    #[test] fn generator_count_in_records_from_zero_and_undo_restores_empty_slot() {
        let mut engine=fixture();command(&mut engine,"gexplore 2 2 64 64 1");let before=engine.undo_snapshot();
        command(&mut engine,"usnap 801;rec 2");assert_eq!(engine.count_in_left,crate::TICKS_PER_BAR);
        ticks(&mut engine,crate::TICKS_PER_BAR-1);assert!(engine.tracks[2].clips[0].generator.is_none());
        ticks(&mut engine,385);engine.toggle_record(2);command(&mut engine,"ucommit 801");
        assert!(engine.tracks[2].clips[0].generator.is_some());command(&mut engine,"uswap 801 802");
        assert_eq!(engine.undo_snapshot(),before);
    }
    #[test] fn generator_cancel_during_count_in_cannot_start_a_take_later() {
        let mut engine=fixture();command(&mut engine,"gexplore 2 0 0 64 1;rec 2");
        assert!(engine.part_recording_busy());command(&mut engine,"gexplore off");
        assert!(!engine.part_recording_busy());ticks(&mut engine,500);
        assert!(engine.tracks[2].clips[0].generator.is_none());assert!(engine.gates.is_empty());
    }
    #[test] fn generator_swing_speed_and_bake_preserve_other_automation_holds() {
        let (mut engine,_)=record();engine.stop(&mut Vec::new());
        engine.swing_pct=63;
        engine.tracks[2].clips[0].scale_num=2;
        engine.auto_label(2,5,"synth:cutoff");engine.tracks[2].lane_base[5]=37;
        engine.tracks[2].clips[0].set_lock(5,4,92);
        engine.tracks[2].clips[0].set_lock(5,40,61);
        let before=engine.undo_snapshot();engine.play();let trace=ticks(&mut engine,1536);engine.stop(&mut Vec::new());
        let original=engine.tracks[2].clips[0].clone();
        command(&mut engine,"gbake 2 0");assert!(engine.generator_result.starts_with("Baked"));
        let baked=&engine.tracks[2].clips[0];
        for note in &baked.notes {assert_eq!(baked.effective_at(5,note.step,37),crate::generator::lane_value(&original,5,note.step,37));}
        engine.play();assert_eq!(ticks(&mut engine,1536),trace);
        engine.stop(&mut Vec::new());assert_eq!(engine.generator_mask(),0,"stopping restores live follow routing");
        assert!(engine.undo_restore(&before));engine.humanize=crate::humanize::Humanize::parse("hu1,10,0,0,4",4);
        let before=engine.undo_snapshot();command(&mut engine,"gbake 2 0");assert!(!engine.generator_result.starts_with("Baked"));assert_eq!(before,engine.undo_snapshot());
    }
    #[test] fn generator_existing_preview_preserves_clock_notes_settings_and_saved_bytes() {
        let (mut engine,_)=record();engine.stop(&mut Vec::new());
        let clip=&mut engine.tracks[2].clips[0];
        clip.loop_start_steps=16;clip.length_steps=48;clip.scale_num=3;clip.scale_den=2;clip.transpose=12;
        clip.notes.push(Config::default().note(16).unwrap());engine.swing_pct=63;
        let saved=engine.undo_snapshot();let mut reference=fixture();assert!(crate::persist::load(&mut reference,&saved));
        reference.play();let expected=ticks(&mut reference,768);
        engine.dirty=false;engine.play();command(&mut engine,"gpreview 2 0");
        assert_eq!(ticks(&mut engine,768),expected,"a transparent preview uses the clip clock and retains manual notes");
        let position=engine.tracks[2].pos_tick;command(&mut engine,"gpreview 2 0 1 127");ticks(&mut engine,72);
        let resumed_position=engine.tracks[2].pos_tick;assert_ne!(position,resumed_position);
        command(&mut engine,"gexplore off");assert_eq!(engine.tracks[2].pos_tick,resumed_position);
        assert_eq!(engine.undo_snapshot(),saved);assert!(!engine.dirty);
    }
    #[test] fn generator_overdub_changes_only_visited_control_intervals_and_has_one_native_undo() {
        let (mut engine,_)=record();engine.stop(&mut Vec::new());
        engine.auto_label(2,5,"synth:cutoff");engine.tracks[2].clips[0].set_lock(5,8,83);
        engine.tracks[2].clips[0].notes.push(Config::default().note(4).unwrap());
        let original=engine.tracks[2].clips[0].clone();let saved=engine.undo_snapshot();
        engine.play();ticks(&mut engine,101);command(&mut engine,"gpreview 2 0 1 127;usnap 911;rec 2");
        assert!(engine.recording);assert!(!engine.pending_rec);assert!(!engine.rec_empty_start);assert_eq!(engine.tracks[2].pos_tick,101);
        ticks(&mut engine,200);command(&mut engine,"rec 2;ucommit 911");
        let clip=&engine.tracks[2].clips[0];let labels=&engine.tracks[2].lane_label;
        assert_eq!(clip.generator,original.generator);assert_eq!(clip.length_steps,original.length_steps);assert_eq!(clip.notes.len(),original.notes.len());
        for step in 0..128 {
            let before=original.generator.unwrap().at(&original,labels,step);let after=clip.generator.unwrap().at(clip,labels,step);
            assert_eq!(after.intensity,if (5..13).contains(&step){127}else{before.intensity},"punch interval step {step}");
            assert_eq!(after.complexity,before.complexity);assert_eq!(after.style,before.style);
        }
        assert_eq!(clip.lock_at(5,8),Some(83));
        assert!(clip.locks.len()<original.locks.len()+5,"a held control does not accumulate one redundant lock per tick");
        command(&mut engine,"stop;uswap 911 912");assert_eq!(engine.undo_snapshot(),saved);
    }
    #[test] fn generator_overdub_without_movement_is_noop_and_multiple_loops_keep_length() {
        let (mut engine,_)=record();engine.stop(&mut Vec::new());let saved=engine.undo_snapshot();
        command(&mut engine,"gpreview 2 0;rec 2");assert_eq!(engine.count_in_left,crate::TICKS_PER_BAR);
        ticks(&mut engine,crate::TICKS_PER_BAR+6200);command(&mut engine,"rec 2;stop");
        assert_eq!(engine.undo_snapshot(),saved,"no knob movement must leave the original curves intact");
        engine.play();command(&mut engine,"gpreview 2 0 0 127;rec 2");ticks(&mut engine,6200);command(&mut engine,"rec 2;stop");
        assert_eq!(engine.tracks[2].clips[0].length_steps,128);assert_eq!(engine.tracks[2].clips[0].generator.unwrap().end,3072);
        assert!(engine.tracks[2].clips[0].locks.len()<20,"looped latch recording remains compact");
    }
    #[test] fn generator_overdub_style_accepts_on_bar_and_restores_the_following_bar() {
        let (mut engine,_)=record();engine.stop(&mut Vec::new());let original=engine.tracks[2].clips[0].clone();
        engine.play();ticks(&mut engine,100);command(&mut engine,"gpreview 2 0 2 1;rec 2");
        ticks(&mut engine,285);command(&mut engine,"rec 2");
        let clip=&engine.tracks[2].clips[0];let labels=&engine.tracks[2].lane_label;
        for step in 0..128 {
            assert_eq!(clip.generator.unwrap().at(clip,labels,step).style,if (16..32).contains(&step){1}else{original.generator.unwrap().at(&original,labels,step).style});
        }
    }
    #[test] fn generator_overdub_selection_change_and_count_in_cancel_cannot_write_another_clip() {
        let (mut engine,_)=record();engine.stop(&mut Vec::new());
        engine.tracks[2].clips[1]=engine.tracks[2].clips[0].clone();let saved=engine.undo_snapshot();
        command(&mut engine,"gpreview 2 0 0 127;rec 2");ticks(&mut engine,50);command(&mut engine,"gexplore off");
        assert!(!engine.part_recording_busy());ticks(&mut engine,400);engine.stop(&mut Vec::new());assert_eq!(engine.undo_snapshot(),saved);
        engine.play();command(&mut engine,"gpreview 2 0 0 127;rec 2");ticks(&mut engine,100);
        let other=engine.tracks[2].clips[1].clone();engine.select_clip(2,1);ticks(&mut engine,1);
        assert!(engine.generator_explore.iter().all(Option::is_none));assert!(!engine.part_recording_busy());
        assert_eq!(engine.tracks[2].clips[1].locks,other.locks);assert!(engine.gates.iter().all(|gate|gate.track!=2));
    }
    #[test] fn generator_overdub_replay_reload_and_bake_match_recorded_midi_with_speed_and_swing() {
        let (mut engine,_)=record();engine.stop(&mut Vec::new());
        engine.tracks[2].clips[0].scale_num=2;engine.swing_pct=63;
        engine.play();command(&mut engine,"gpreview 2 0 1 127;rec 2");let recorded=ticks(&mut engine,1536);
        command(&mut engine,"rec 2;stop");let saved=engine.undo_snapshot();
        let mut restored=fixture();assert!(crate::persist::load(&mut restored,&saved));restored.play();
        assert_eq!(ticks(&mut restored,1536),recorded);
        restored.stop(&mut Vec::new());command(&mut restored,"gbake 2 0");restored.play();assert_eq!(ticks(&mut restored,1536),recorded);
    }
    #[test] fn generator_overdub_full_automation_capacity_refuses_the_whole_boundary_edit() {
        let (mut engine,_)=record();engine.stop(&mut Vec::new());
        for lane in 3..8 {for step in 0..256 {
            if engine.tracks[2].clips[0].locks.len()<crate::clip::MAX_LOCKS {engine.tracks[2].clips[0].set_lock(lane,step,61);}
        }}
        engine.play();command(&mut engine,"gpreview 2 0 1 127;rec 2");let before=engine.undo_snapshot();
        ticks(&mut engine,1);assert!(!engine.part_recording_busy());assert!(engine.generator_explore.iter().all(Option::is_none));
        assert_eq!(engine.generator_result,"Automation capacity reached");assert_eq!(engine.undo_snapshot(),before);
    }
    #[test] fn generator_overdub_can_join_an_ordinary_record_pass_on_the_same_comp_clip() {
        let (mut engine,_)=record();engine.stop(&mut Vec::new());engine.play();ticks(&mut engine,100);
        command(&mut engine,"rec 2");assert!(engine.recording);assert!(engine.generator_explore.iter().all(Option::is_none));
        command(&mut engine,"gpreview 2 0 1 101");assert_eq!(engine.generator_explore[2].unwrap().source,Some(0));
        assert_eq!(engine.tracks[2].pos_tick,100);ticks(&mut engine,25);command(&mut engine,"rec 2");
        let clip=&engine.tracks[2].clips[0];assert_eq!(clip.generator.unwrap().at(clip,&engine.tracks[2].lane_label,5).intensity,101);
        assert_eq!(clip.length_steps,128);
    }
    #[test] fn generator_overdub_trimmed_loop_accepts_style_at_its_start() {
        let (mut engine,_)=record();engine.stop(&mut Vec::new());
        engine.tracks[2].clips[0].set_loop(16,16);engine.tracks[2].clips[0].set_clip_length(5);engine.play();command(&mut engine,"gpreview 2 0 2 2;rec 2");
        ticks(&mut engine,120);command(&mut engine,"rec 2;stop");
        let clip=&engine.tracks[2].clips[0];assert_eq!(clip.loop_start_steps,16);assert_eq!(clip.length_steps,5);
        for step in 16..21 {assert_eq!(clip.generator.unwrap().at(clip,&engine.tracks[2].lane_label,step).style,2);}
    }
    #[test] fn generator_audio_block_sizes_do_not_change_the_sequence() {
        let (engine,_)=record();let saved=engine.undo_snapshot();
        let run=|block:u32| {
            let mut engine=fixture();assert!(crate::persist::load(&mut engine,&saved));engine.play();
            let mut events=Vec::new();let mut frames=0;
            while frames<768000 {let count=block.min(768000-frames);engine.advance_block(count,&mut events);frames+=count;}
            events.into_iter().filter(|event|matches!(event,OutEvent::NoteOn{..}|OutEvent::NoteOff{..})).collect::<Vec<_>>()
        };
        assert_eq!(run(64),run(257));assert_eq!(run(257),run(1024));
    }
    fn bass_ticks(engine:&mut Engine,count:u32)->Vec<(u32,OutEvent)> {
        let mut events=Vec::new();
        for tick in 0..count {let mut out=Vec::new();engine.service_tick(&mut out);events.extend(out.into_iter().filter(|event|matches!(event,OutEvent::NoteOn{track:1,..}|OutEvent::NoteOff{track:1,..})).map(|event|(tick,event)));}
        events
    }
    fn bass_take()->(Engine,Vec<(u32,OutEvent)>) {
        let mut engine=fixture();engine.follower_inputs[1]=crate::follower_input::InputKey::new(0,1);
        command(&mut engine,"gexplore 1 5 0 64 19");engine.play();engine.toggle_record(1);
        let mut trace=Vec::new();
        for tick in 0..1536 {
            if tick==100 {command(&mut engine,"gexplore 1 5 127 100 19");}
            if tick==600 {command(&mut engine,"gexplore 1 7 95 80 19");}
            trace.extend(bass_ticks(&mut engine,1).into_iter().map(|(_,event)|(tick,event)));
        }
        command(&mut engine,"rec 1;stop");(engine,trace)
    }
    #[test] fn bass_generator_authored_pitches_density_and_actor_style_identity() {
        for style in 4..8 {
            let sparse=Config{style,complexity:0,..Config::default()};let dense=Config{complexity:127,..sparse};
            let core:Vec<_>=(0..64).filter_map(|step|sparse.note(step)).collect();
            assert!((0..64).filter_map(|step|dense.note(step)).any(|note|!core.iter().any(|base|base.step==note.step)));
            for note in core {let rich=dense.note(note.step).unwrap();assert_eq!(rich.pitch,note.pitch);assert!((36..=43).contains(&note.pitch));}
            assert!(sparse.accepts_style(4));assert!(!sparse.accepts_style(0));
        }
        assert_eq!(Config::parse("3 32 64 1 768").unwrap().wire(),"3 32 64 1 768","existing Comp IDs and wire format remain stable");
        let (mut engine,_)=bass_take();let saved=engine.undo_snapshot();
        command(&mut engine,"gpreview 1 0 2 0");assert!(engine.generator_explore.iter().all(Option::is_none));assert_eq!(engine.undo_snapshot(),saved);
        let style_lane=engine.tracks[1].lane_label.iter().position(|label|label==LABELS[2]).unwrap();
        engine.tracks[1].clips[0].set_lock(style_lane as u8,0,0);
        let clip=&engine.tracks[1].clips[0];assert!(clip.generator.unwrap().at(clip,&engine.tracks[1].lane_label,0).bass());
    }
    #[test] fn bass_generator_record_replay_and_bake_keep_monophonic_releases() {
        let (engine,recorded)=bass_take();let saved=engine.undo_snapshot();
        let clip=&engine.tracks[1].clips[0];assert_eq!(clip.recipe.as_ref().unwrap().name,"Bass-Generator");
        assert_eq!(clip.recipe.as_ref().unwrap().settings.0[4],0);
        let mut sounding=0;
        for (_,event) in &recorded {match event {OutEvent::NoteOn{..}=>{assert_eq!(sounding,0);sounding+=1;},OutEvent::NoteOff{..}=>{sounding-=1;assert_eq!(sounding,0);},_=>{}}}
        assert_eq!(sounding,0);
        let mut replay=fixture();assert!(crate::persist::load(&mut replay,&saved));replay.play();assert_eq!(bass_ticks(&mut replay,1536),recorded);
        replay.stop(&mut Vec::new());command(&mut replay,"gbake 1 0");assert!(replay.generator_result.starts_with("Baked"));replay.play();assert_eq!(bass_ticks(&mut replay,1536),recorded);
        replay.stop(&mut Vec::new());assert!(replay.undo_restore(&saved));assert!(replay.tracks[1].clips[0].generator.is_some());
    }
    #[test] fn bass_generator_preview_preserves_manual_notes_and_bakes_speed_swing() {
        let (mut engine,_)=bass_take();
        let clip=&mut engine.tracks[1].clips[0];let mut manual=Config::default().note(0).unwrap();manual.pitch=55;manual.gate=350;clip.notes.push(manual);
        clip.scale_num=3;clip.scale_den=2;engine.swing_pct=63;
        let saved=engine.undo_snapshot();engine.play();command(&mut engine,"gpreview 1 0");let preview=bass_ticks(&mut engine,1024);
        assert!(preview.iter().any(|(tick,event)|*tick>150&&matches!(event,OutEvent::NoteOff{pitch:55,..})),"generated retriggers cannot release manual overlay notes");
        command(&mut engine,"gexplore off;stop");assert_eq!(engine.undo_snapshot(),saved);
        engine.play();let expected=bass_ticks(&mut engine,1024);engine.stop(&mut Vec::new());assert_eq!(preview,expected);
        command(&mut engine,"gbake 1 0");assert!(engine.generator_result.starts_with("Baked"));engine.play();assert_eq!(bass_ticks(&mut engine,1024),expected);
    }
    #[test] fn bass_generator_switch_audition_restores_settings_and_preserves_other_actor() {
        let mut engine=fixture();let mut original=crate::part_settings::Settings::comp();original.0[11]=1;original.0[12]=4;original.0[19]=83;
        engine.recipe_bases[1]=Some(original);engine.recipe_tick(&mut Vec::new());let saved=engine.undo_snapshot();
        command(&mut engine,"gexplore 2 0 20 64 7;play");ticks(&mut engine,1);
        assert!(engine.gates.iter().any(|gate|gate.track==2));
        command(&mut engine,"gexplore 1 4 40 64 8");assert!(engine.gates.iter().any(|gate|gate.track==2));assert!(engine.generator_exploring(2));
        let settings=engine.generator_settings(1).unwrap();assert_eq!(settings.0[4],0);assert_eq!(settings.0[11],0);assert_eq!(settings.0[12],0);assert_eq!(settings.0[19],83);
        bass_ticks(&mut engine,500);command(&mut engine,"gexplore off;stop");assert!(engine.gates.is_empty());assert_eq!(engine.recipe_seen[1],Some(original));assert_eq!(engine.undo_snapshot(),saved);
    }
    #[test] fn bass_generator_overdub_and_comp_playback_remain_independent() {
        let (mut engine,_)=bass_take();let (comp,_)=record();engine.tracks[2]=comp.tracks[2].clone();engine.tracks[2].playing_slot=None;
        let before=engine.undo_snapshot();let original_comp=engine.tracks[2].active().locks.clone();
        engine.play();command(&mut engine,"gpreview 1 0 0 12;usnap 990;rec 1");bass_ticks(&mut engine,1536);
        command(&mut engine,"rec 1;stop;ucommit 990");assert_eq!(engine.tracks[2].active().locks,original_comp);
        command(&mut engine,"uswap 990 991");assert_eq!(engine.undo_snapshot(),before);
        engine.play();assert_eq!(engine.generator_mask()&6,6);command(&mut engine,"stop");assert_eq!(engine.generator_mask(),0);
    }

    #[test] fn bass_generator_cancel_restores_host_capture_without_a_prior_recipe() {
        let mut engine=fixture();let saved=engine.undo_snapshot();let mut original=crate::part_settings::Settings::comp();original.0[11]=1;original.0[12]=4;
        command(&mut engine,"gexplore 1 4 64 64 1");
        // The production RecipeCapture response supplies host-only settings.
        engine.generator_restore[1]=Some(original);engine.recipe_tick(&mut Vec::new());
        assert_eq!(engine.recipe_seen[1].unwrap().0[4],0);assert!(engine.recipe_bases[1].is_none());
        let events=command(&mut engine,"gexplore off");
        for (key,value) in [(4,2),(11,1),(12,4)] {assert!(events.iter().any(|event|matches!(event,OutEvent::RecipeParam{track:1,key:actual,value:setting} if *actual==key&&*setting==value)));}
        assert!(engine.recipe_seen[1].is_none());assert_eq!(engine.undo_snapshot(),saved);
    }

    fn duet_ticks(engine:&mut Engine,count:u32)->Vec<(u32,OutEvent)> {
        let mut events=Vec::new();
        for tick in 0..count {let mut out=Vec::new();engine.service_tick(&mut out);events.extend(out.into_iter().filter(|event|matches!(event,OutEvent::NoteOn{track:1|2,..}|OutEvent::NoteOff{track:1|2,..})).map(|event|(tick,event)));}
        events
    }
    #[test] fn generator_duet_matches_both_solo_traces_without_persistent_edits() {
        let mut duet=fixture();let saved=duet.undo_snapshot();duet.dirty=false;
        command(&mut duet,"gexplore 2 3 95 80 7;gexplore 1 7 73 50 19");duet.play();
        let together=duet_ticks(&mut duet,1536);
        for (track,source) in [(1,"gexplore 1 7 73 50 19;play"),(2,"gexplore 2 3 95 80 7;play")] {
            let mut solo=fixture();command(&mut solo,source);
            let expected=duet_ticks(&mut solo,1536);
            let actual:Vec<_>=together.iter().filter(|(_,event)|matches!(event,OutEvent::NoteOn{track:owner,..}|OutEvent::NoteOff{track:owner,..} if *owner==track)).cloned().collect();
            assert!(!actual.is_empty());assert_eq!(actual,expected,"each actor keeps its solo timing, pitch and releases");
        }
        assert_eq!(duet.generator_mask()&6,6);assert_eq!(duet.undo_snapshot(),saved);assert!(!duet.dirty);
        command(&mut duet,"stop");assert!(duet.gates.is_empty());assert_eq!(duet.undo_snapshot(),saved);
    }
    #[test] fn generator_duet_records_either_actor_while_other_controls_stay_temporary() {
        for (record_track,other_track) in [(1,2),(2,1)] {
            let mut engine=fixture();let before=engine.undo_snapshot();
            command(&mut engine,"gexplore 2 0 20 64 7;gexplore 1 4 30 64 19;play;usnap 1101");
            command(&mut engine,&format!("rec {}",record_track));
            assert_eq!(engine.generator_record_track(),Some(record_track));
            duet_ticks(&mut engine,100);
            command(&mut engine,"gexplore 2 0 100 100 7;gexplore 1 4 110 110 19");
            let events=duet_ticks(&mut engine,668);
            assert!(events.iter().any(|(_,event)|matches!(event,OutEvent::NoteOn{track,..} if *track as usize==other_track)));
            assert!(engine.tracks[other_track].active().generator.is_none());assert!(!engine.tracks[other_track].active().exists());
            assert!(engine.tracks[other_track].lane_assigned.iter().all(|assigned|!*assigned));
            // The recorder's destination wins even if focus now points elsewhere.
            command(&mut engine,&format!("rec {}",other_track));
            assert!(!engine.part_recording_busy());assert!(engine.generator_exploring(other_track));assert!(!engine.generator_exploring(record_track));
            let captured=&engine.tracks[record_track].clips[0];assert!(captured.generator.is_some());assert!(captured.locks.len()>3);
            command(&mut engine,"ucommit 1101;uswap 1101 1102");assert_eq!(engine.undo_snapshot(),before);
            assert!(engine.generator_exploring(other_track));assert!(!engine.generator_exploring(record_track));
            assert!(duet_ticks(&mut engine,400).iter().any(|(_,event)|matches!(event,OutEvent::NoteOn{track,..} if *track as usize==other_track)));
            command(&mut engine,"stop");
        }
    }
    #[test] fn generator_duet_targeted_stop_and_count_in_cancellation_are_independent() {
        for record_track in [1,2] {
            let other_track=3-record_track;let mut engine=fixture();
            command(&mut engine,"gexplore 2 0 20 64 7;gexplore 1 5 30 64 19");
            command(&mut engine,&format!("rec {}",record_track));assert!(engine.count_in_left>0);
            command(&mut engine,&format!("gexplore {} off",other_track));
            assert!(engine.part_recording_busy());assert_eq!(engine.generator_record_track(),Some(record_track));
            command(&mut engine,if other_track==1 {"gexplore 1 5 30 64 19"}else{"gexplore 2 0 20 64 7"});
            assert!(engine.generator_exploring(other_track));
            command(&mut engine,&format!("gexplore {} off",record_track));assert!(!engine.part_recording_busy());
            let events=duet_ticks(&mut engine,800);
            assert!(events.iter().any(|(_,event)|matches!(event,OutEvent::NoteOn{track,..} if *track as usize==other_track)));
            assert!(engine.tracks[record_track].active().generator.is_none());
            command(&mut engine,"gexplore off");assert!(engine.gates.is_empty());assert_eq!(engine.generator_mask(),0);
        }
    }
    #[test] fn generator_duet_stopping_one_actor_releases_only_its_gates() {
        let mut engine=fixture();command(&mut engine,"gexplore 2 0 0 64 7;gexplore 1 5 0 64 19;play");
        duet_ticks(&mut engine,1);assert!(engine.gates.iter().any(|gate|gate.track==1));assert!(engine.gates.iter().any(|gate|gate.track==2));
        let offs=command(&mut engine,"gexplore 1 off");
        assert!(offs.iter().any(|event|matches!(event,OutEvent::NoteOff{track:1,..})));
        assert!(offs.iter().all(|event|!matches!(event,OutEvent::NoteOff{track:2,..})));
        assert!(engine.gates.iter().any(|gate|gate.track==2));assert!(engine.generator_exploring(2));
        command(&mut engine,"stop");assert!(engine.gates.is_empty());
    }
    #[test] fn generator_duet_preview_overdub_is_independent_and_clip_binding_cannot_drift() {
        let (mut engine,_)=record();engine.stop(&mut Vec::new());
        command(&mut engine,"gexplore 1 7 100 90 19;gpreview 2 0 1 111;play;rec 2");
        duet_ticks(&mut engine,500);assert!(engine.recording);assert!(engine.generator_exploring(1));
        command(&mut engine,"gexplore 1 off");assert!(engine.recording);
        command(&mut engine,"gexplore 1 4 20 40 28");assert!(engine.generator_exploring(1));
        let other=engine.tracks[2].clips[1].clone();engine.tracks[2].active_clip=1;
        duet_ticks(&mut engine,1);assert!(!engine.part_recording_busy());assert!(!engine.generator_exploring(2));assert!(engine.generator_exploring(1));assert_eq!(engine.tracks[2].clips[1].notes,other.notes);assert!(engine.tracks[2].clips[1].generator.is_none());
        // Selecting another clip during the count-in cancels the original arm.
        command(&mut engine,"stop");engine.tracks[2].active_clip=1;
        command(&mut engine,"gexplore 2 0 20 64 7;rec 2");engine.tracks[2].active_clip=2;
        duet_ticks(&mut engine,400);assert!(!engine.part_recording_busy());assert!(engine.tracks[2].clips[2].generator.is_none());
    }

    #[test] fn generator_phrase_structure_repeats_without_flattening_and_complexity_retains_core() {
        for style in 8..16 {
            let config=Config {style,complexity:0,intensity:64,seed:37,end:0};
            let definition=&crate::generator::STYLES[style as usize];
            let steps=crate::part_catalog::generator_source_steps(config.bass(),definition.catalog);
            assert_eq!(steps,if style%4==3 {64}else{32});
            let core=crate::part_catalog::generator_source_notes(config.bass(),definition.catalog);
            let attacks:Vec<_>=(0..steps).filter_map(|step|config.note(step).map(|n|(step,n.gate,n.pitch,n.vel))).collect();
            assert_eq!(attacks,core,"the stock library and generator share authored essentials");
            let first:Vec<_>=attacks.iter().filter(|n|n.0<16).copied().collect();
            let second:Vec<_>=attacks.iter().filter(|n|(16..32).contains(&n.0)).map(|n|(n.0-16,n.1,n.2,n.3)).collect();
            assert_ne!(first,second,"the answer bar must not repeat the opening");
            let signature=|config:Config,step:u16|config.note(step).map(|n|(n.gate,n.pitch,n.vel));
            for complexity in [0,32,64,96,127] {
                let current=Config {complexity,..config};
                for step in 0..64 {
                    assert_eq!(signature(current,step),signature(current,step+64),"phrase and seed wrap together");
                    if let Some(note)=config.note(step) {
                        assert_eq!(signature(current,step),Some((note.gate,note.pitch,note.vel)));
                    }
                    if complexity>0&&(Config {complexity:complexity-1,..config}).note(step).is_some(){assert!(current.note(step).is_some());}
                }
            }
            let dense=Config {complexity:127,..config};
            assert!((0..steps).filter(|step|dense.note(*step).is_some()).count()>core.len());
            assert!((0..steps).any(|step|dense.note(step).is_none()),"rests survive maximum complexity");
            for step in 0..steps {
                let quiet=Config {intensity:0,..dense}.note(step);
                let loud=Config {intensity:127,..dense}.note(step);
                assert_eq!(quiet.as_ref().map(|n|(n.step,n.pitch,n.gate)),loud.as_ref().map(|n|(n.step,n.pitch,n.gate)));
                if let (Some(quiet),Some(loud))=(quiet,loud){assert!(loud.vel>quiet.vel);}
            }
        }
        // Authored late-phrase pickups are not accidentally folded into bar one.
        assert!(Config {style:8,complexity:127,..Config::default()}.note(31).is_some());
        assert!(Config {style:8,complexity:0,..Config::default()}.note(31).is_none());
        assert!(Config {style:11,complexity:0,..Config::default()}.note(56).is_some());
        assert!(Config {style:11,complexity:0,..Config::default()}.note(8).is_none());
    }
    #[test] fn generator_phrases_record_automation_reload_bake_and_undo_with_identical_timing() {
        for style in 8..16 {
            let mut engine=fixture();let before=engine.undo_snapshot();
            command(&mut engine,&format!("gexplore 2 {style} 0 32 37"));
            engine.play();let audition=ticks(&mut engine,1536);engine.stop(&mut Vec::new());
            assert_eq!(before,engine.undo_snapshot(),"audition cannot persist phrase notes or lanes");
            command(&mut engine,&format!("gexplore 2 {style} 0 32 37"));
            engine.play();engine.toggle_record(2);
            let mut captured=ticks(&mut engine,384);
            assert_eq!(captured,audition.iter().filter(|(tick,_)|*tick<384).cloned().collect::<Vec<_>>());
            command(&mut engine,&format!("gexplore 2 {style} 127 100 37"));
            captured.extend(ticks(&mut engine,500).into_iter().map(|(tick,event)|(tick+384,event)));
            let next=if style<12 {11}else{15};
            command(&mut engine,&format!("gexplore 2 {next} 64 80 37"));
            captured.extend(ticks(&mut engine,2188).into_iter().map(|(tick,event)|(tick+884,event)));
            command(&mut engine,"rec 2;stop");
            let clip=&engine.tracks[2].clips[0];assert!(clip.notes.is_empty());assert_eq!(clip.length_steps,128);
            assert_eq!(clip.generator.unwrap().at(clip,&engine.tracks[2].lane_label,47).style,style);
            assert_eq!(clip.generator.unwrap().at(clip,&engine.tracks[2].lane_label,48).style,next);
            let saved=engine.undo_snapshot();let mut restored=fixture();assert!(crate::persist::load(&mut restored,&saved));
            restored.play();assert_eq!(ticks(&mut restored,3072),captured,"recorded phrase and control curves replay exactly");
            command(&mut restored,"stop;gbake 2 0");assert_eq!(restored.generator_result,"Baked - Undo available");
            restored.play();assert_eq!(ticks(&mut restored,3072),captured,"Bake keeps later bars and Bass gate ownership");
            command(&mut restored,"stop");assert!(restored.undo_restore(&saved));
            assert!(restored.tracks[2].clips[0].generator.is_some());assert!(engine.undo_restore(&before));
            assert_eq!(engine.undo_snapshot(),before);
        }
    }
    #[test] fn generator_restore_follows_saved_curves_without_restarting_either_source() {
        for bass in [false,true] {for library in [false,true] {
            let (mut reference,payload)=saved_user_recipe(bass);
            let mut engine=fixture();
            let actor=if bass{"bass"}else{"comp"};let style=if bass{15}else{11};
            if library {command(&mut engine,&format!("guser 2 {actor} {payload};guser 2 edit 0 12;guser 2 edit 1 127;guser 2 edit 2 {style}"));}
            else {assert!(crate::persist::load(&mut engine,&reference.undo_snapshot()));command(&mut engine,&format!("gpreview 2 0 0 12;gpreview 2 0 1 127;gpreview 2 0 2 {style}"));}
            let saved=engine.undo_snapshot();engine.dirty=false;engine.play();reference.play();
            ticks(&mut engine,400);ticks(&mut reference,400);
            let position=engine.tracks[2].pos_tick;let master=engine.master_tick;let gates=engine.gates.len();
            assert!(command(&mut engine,"grestore 2 0").is_empty());
            assert_eq!(engine.tracks[2].pos_tick,position);assert_eq!(engine.master_tick,master);assert_eq!(engine.gates.len(),gates);
            assert_eq!(engine.generator_explore[2].unwrap().touched,7);
            ticks(&mut engine,8);assert_eq!(engine.generator_explore[2].unwrap().touched,7);
            ticks(&mut engine,1);let state=engine.generator_explore[2].unwrap();
            assert_eq!(state.touched,4);assert_eq!(state.restore_pending,4);assert_eq!(state.current.complexity,90);assert_eq!(state.current.intensity,100);assert_eq!(state.current.style,style);
            ticks(&mut engine,359);assert_eq!(engine.generator_explore[2].unwrap().current.style,style);
            ticks(&mut engine,1);let state=engine.generator_explore[2].unwrap();
            assert_eq!(state.touched,0);assert_eq!(state.restore_pending,0);assert_eq!(state.current.style,if bass{13}else{9});
            ticks(&mut engine,767);ticks(&mut reference,1136);
            assert_eq!(ticks(&mut engine,3072),ticks(&mut reference,3072),"restored onsets and releases must follow the original changing curves and phase");
            assert_eq!(engine.undo_snapshot(),saved);assert!(!engine.dirty);
        }}
    }
    #[test] fn generator_restore_latest_edit_wins_only_for_its_control() {
        for library in [false,true] {
            let (source,payload)=saved_user_recipe(false);let mut engine=fixture();
            if library {command(&mut engine,&format!("guser 2 comp {payload}"));}
            else {assert!(crate::persist::load(&mut engine,&source.undo_snapshot()));command(&mut engine,"gpreview 2 0");}
            let prefix=if library{"guser 2 edit"}else{"gpreview 2 0"};
            command(&mut engine,&format!("{prefix} 0 12;{prefix} 1 127;{prefix} 2 11;play"));ticks(&mut engine,400);
            command(&mut engine,&format!("grestore 2 0;{prefix} 1 55"));ticks(&mut engine,369);
            let state=engine.generator_explore[2].unwrap();assert_eq!(state.touched,2);assert_eq!(state.restore_pending,0);
            assert_eq!(state.current.complexity,90);assert_eq!(state.current.intensity,55);assert_eq!(state.current.style,9);
        }
    }
    #[test] fn generator_restore_while_stopped_is_immediate_and_new_record_keeps_saved_recipe() {
        for library in [false,true] {
            let (source,payload)=saved_user_recipe(false);let mut engine=fixture();
            if library {command(&mut engine,&format!("guser 2 comp {payload};guser 2 edit 1 127"));}
            else {assert!(crate::persist::load(&mut engine,&source.undo_snapshot()));command(&mut engine,"gpreview 2 0 1 127");}
            let before=engine.undo_snapshot();command(&mut engine,"grestore 2 0");
            assert_eq!(engine.generator_explore[2].unwrap().touched,0);assert_eq!(engine.generator_explore[2].unwrap().current.intensity,32);
            assert_eq!(engine.undo_snapshot(),before);command(&mut engine,"rec 2");ticks(&mut engine,crate::TICKS_PER_BAR+400);command(&mut engine,"rec 2;stop");
            let clip=&engine.tracks[2].clips[0];let original=&source.tracks[2].clips[0];assert_eq!(clip.generator,original.generator);assert_eq!(clip.locks,original.locks);
        }
    }
    #[test] fn generator_restore_pending_before_record_cannot_capture_discarded_overrides() {
        for library in [false,true] {
            let (source,payload)=saved_user_recipe(false);let mut engine=fixture();
            if library {command(&mut engine,&format!("guser 2 comp {payload};guser 2 edit 0 12;guser 2 edit 1 127;guser 2 edit 2 11"));}
            else {assert!(crate::persist::load(&mut engine,&source.undo_snapshot()));command(&mut engine,"gpreview 2 0 0 12;gpreview 2 0 1 127;gpreview 2 0 2 11");}
            engine.play();ticks(&mut engine,400);command(&mut engine,"grestore 2 0;rec 2");ticks(&mut engine,1600);command(&mut engine,"rec 2;stop");
            let clip=&engine.tracks[2].clips[0];assert_eq!(clip.generator,source.tracks[2].clips[0].generator);assert_eq!(clip.locks,source.tracks[2].clips[0].locks);
        }
    }
    #[test] fn generator_restore_refuses_recording_count_in_stale_slots_and_stock_sources() {
        assert!(crate::command::is_control_verb("grestore"));assert!(!crate::command::is_undoable_edit("grestore"));
        let (_,payload)=saved_user_recipe(false);let mut engine=fixture();
        command(&mut engine,"gexplore 2 0 0 64 1;grestore 2 0");assert!(engine.generator_result.contains("saved recipe"));assert_eq!(engine.generator_explore[2].unwrap().touched,7);
        command(&mut engine,&format!("guser 2 comp {payload};guser 2 edit 1 127;grestore 2 1"));assert!(engine.generator_result.contains("Clip changed"));assert_eq!(engine.generator_explore[2].unwrap().touched,2);
        for invalid in ["grestore 16 0","grestore 2 99","grestore 2","grestore no 0"] {command(&mut engine,invalid);assert_eq!(engine.generator_explore[2].unwrap().touched,2);}
        command(&mut engine,"rec 2;grestore 2 0");assert!(engine.generator_result.contains("Finish this actor take"));assert_eq!(engine.generator_explore[2].unwrap().restore_pending,0);
        ticks(&mut engine,500);command(&mut engine,"grestore 2 0");assert!(engine.generator_result.contains("Finish this actor take"));assert!(engine.recording);
        command(&mut engine,"rec 2;stop");assert_eq!(engine.tracks[2].clips[0].generator.unwrap().at(&engine.tracks[2].clips[0],&engine.tracks[2].lane_label,0).intensity,127);
    }
    #[test] fn generator_restore_other_actor_during_recording_and_trimmed_loop_boundary() {
        let (mut engine,payload)=saved_user_recipe(false);
        command(&mut engine,&format!("guser 1 comp {payload};guser 1 edit 1 127;gpreview 2 0;play;rec 2"));ticks(&mut engine,400);
        command(&mut engine,"grestore 1 0");assert!(engine.generator_result.starts_with("Restore saved"));ticks(&mut engine,24);
        assert_eq!(engine.generator_record_track(),Some(2));assert_eq!(engine.generator_explore[1].unwrap().touched,0);assert!(engine.recording);
        command(&mut engine,"rec 2;stop");engine.tracks[2].clips[0].set_loop(16,16);engine.tracks[2].clips[0].set_clip_length(5);
        command(&mut engine,"gpreview 2 0 2 11;play");ticks(&mut engine,10);command(&mut engine,"grestore 2 0");
        ticks(&mut engine,111);assert_eq!(engine.generator_explore[2].unwrap().touched,0,"a trimmed loop restores style at its own start without waiting for an unreachable bar");
    }
    fn saved_user_recipe(bass:bool)->(Engine,String) {
        let mut engine=fixture();let style=if bass{12}else{8};
        command(&mut engine,&format!("gexplore 2 {style} 0 32 37"));engine.play();engine.toggle_record(2);
        ticks(&mut engine,384);command(&mut engine,&format!("gexplore 2 {} 90 100 37",style+1));
        ticks(&mut engine,768);command(&mut engine,&format!("gexplore 2 {} 127 64 37",style+3));
        ticks(&mut engine,384);command(&mut engine,"rec 2;stop");
        engine.tracks[2].clips[0].recipe.as_mut().unwrap().gate=75;
        let payload=engine.part_export(2);assert!(payload.starts_with("70617274320a"),"{payload}");(engine,payload)
    }
    #[test] fn part_summary_reports_evaluated_curves_and_source_styles_without_mutation() {
        for bass in [false,true] {
            let (engine,_)=saved_user_recipe(bass);let before=engine.undo_snapshot();
            assert_eq!(engine.part_summary(2),if bass{"ps1|64|12,13,15|7|Bass-Generator"}else{"ps1|64|8,9,11|7|Comp-Generator"});
            assert_eq!(engine.undo_snapshot(),before);
        }
    }
    #[test] fn part_summary_distinguishes_fixed_locks_from_changes_and_handles_note_styles() {
        let mut engine=fixture();command(&mut engine,"gexplore 2 8 64 80 1");engine.play();engine.toggle_record(2);ticks(&mut engine,768);command(&mut engine,"rec 2;stop");
        assert_eq!(engine.part_summary(2),"ps1|32|8|0|Comp-Generator");
        let lane=engine.tracks[2].lane_label.iter().position(|name|name==LABELS[1]).unwrap();engine.tracks[2].clips[0].set_lock(lane as u8,16,80);
        assert_eq!(engine.part_summary(2),"ps1|32|8|0|Comp-Generator");
        engine.tracks[2].clips[0].set_lock(lane as u8,16,110);
        assert_eq!(engine.part_summary(2),"ps1|32|8|2|Comp-Generator");
        engine.tracks[2].clips[0]=crate::part_catalog::comp(1).unwrap();
        assert_eq!(engine.part_summary(2),format!("ps1|16||0|{}",crate::part_catalog::NAMES[1]));
        assert!(engine.part_summary(99).starts_with("error:"));assert!(engine.part_summary(1).starts_with("error:"));
    }
    #[test] fn generator_user_recipe_export_import_and_temporary_playback_keep_abstract_curves() {
        for bass in [false,true] {
            let (mut reference,payload)=saved_user_recipe(bass);
            let prepared=crate::part_load::prepare_part("user",&payload).unwrap();
            assert_eq!(prepared.clip.generator,reference.tracks[2].clips[0].generator);
            assert_eq!(prepared.clip.locks,reference.tracks[2].clips[0].locks);
            assert_eq!(prepared.clip.recipe,reference.tracks[2].clips[0].recipe);
            reference.play();let expected=ticks(&mut reference,3072);
            let mut audition=fixture();audition.tracks[2].clips[0]=crate::part_catalog::comp(5).unwrap();
            let saved=audition.undo_snapshot();audition.dirty=false;
            command(&mut audition,&format!("guser 2 {} {payload}",if bass{"bass"}else{"comp"}));
            assert!(audition.generator_library[2].is_some());assert_eq!(audition.generator_settings(2),prepared.clip.recipe.as_ref().map(|recipe|recipe.settings));
            audition.play();assert_eq!(ticks(&mut audition,3072),expected,"saved recipe uses the existing clock, gates and control curve");
            assert_eq!(audition.undo_snapshot(),saved);assert!(!audition.dirty);
            command(&mut audition,"guser 2 edit 1 127");ticks(&mut audition,200);
            command(&mut audition,"stop");assert_eq!(audition.undo_snapshot(),saved);assert!(audition.generator_library[2].is_none());
        }
    }
    #[test] fn generator_user_recipe_record_adopts_at_first_tick_remaps_lanes_and_replays_exactly() {
        for bass in [false,true] {
            let (mut reference,payload)=saved_user_recipe(bass);reference.play();let expected=ticks(&mut reference,3072);
            let mut engine=fixture();engine.auto_label(2,0,"synth:cutoff");engine.tracks[2].lane_base[0]=73;
            let before=engine.undo_snapshot();
            command(&mut engine,&format!("guser 2 {} {payload};usnap 1201;rec 2",if bass{"bass"}else{"comp"}));
            ticks(&mut engine,crate::TICKS_PER_BAR-1);assert!(engine.tracks[2].clips[0].generator.is_none());
            assert_eq!(ticks(&mut engine,3072),expected,"Record's first onset must not double-fire when the source is adopted");
            command(&mut engine,"rec 2;ucommit 1201;stop");
            assert_eq!(engine.tracks[2].clips[0].length_steps,64,"saved recipes keep their full length through looped overdub");
            assert!(engine.tracks[2].clips[0].notes.is_empty());assert_eq!(engine.tracks[2].lane_label[0],"synth:cutoff");assert_eq!(engine.tracks[2].lane_base[0],73);
            for label in LABELS {assert!(engine.tracks[2].lane_label.iter().position(|name|name==label).unwrap()>0);}
            let saved=engine.undo_snapshot();let mut restored=fixture();assert!(crate::persist::load(&mut restored,&saved));
            restored.play();assert_eq!(ticks(&mut restored,3072),expected);command(&mut restored,"stop;gbake 2 0");restored.play();assert_eq!(ticks(&mut restored,3072),expected);
            command(&mut engine,"uswap 1201 1202");assert_eq!(engine.undo_snapshot(),before);
        }
    }
    #[test] fn generator_user_recipe_overrides_record_then_follow_ordinary_overdub_and_undo() {
        let (_,payload)=saved_user_recipe(false);let mut engine=fixture();let before=engine.undo_snapshot();
        command(&mut engine,&format!("guser 2 comp {payload};guser 2 edit 0 127;usnap 1211;rec 2"));
        ticks(&mut engine,crate::TICKS_PER_BAR-1);let mut captured=ticks(&mut engine,400);
        command(&mut engine,"guser 2 edit 1 110");captured.extend(ticks(&mut engine,1136).into_iter().map(|(tick,event)|(tick+400,event)));
        command(&mut engine,"rec 2;ucommit 1211;stop");
        let clip=&engine.tracks[2].clips[0];assert_eq!(clip.length_steps,64);
        for step in 0..64 {assert_eq!(clip.generator.unwrap().at(clip,&engine.tracks[2].lane_label,step).complexity,127);}
        let saved=engine.undo_snapshot();let mut restored=fixture();assert!(crate::persist::load(&mut restored,&saved));restored.play();assert_eq!(ticks(&mut restored,1536),captured);
        command(&mut engine,"uswap 1211 1212");assert_eq!(engine.undo_snapshot(),before);
    }
    #[test] fn generator_user_recipe_refuses_wrong_actor_and_lossy_edits_before_mutation() {
        let (mut source,payload)=saved_user_recipe(false);let mut engine=fixture();let before=engine.undo_snapshot();
        command(&mut engine,&format!("guser 2 bass {payload}"));assert!(engine.generator_result.contains("another actor"));assert_eq!(engine.undo_snapshot(),before);assert!(engine.generator_explore[2].is_none());
        command(&mut engine,&format!("guser 2 comp {payload}"));
        let exploring=engine.generator_explore[2].unwrap().current;
        command(&mut engine,&format!("guser 2 bass {payload}"));
        assert!(engine.generator_result.contains("another actor"));assert_eq!(engine.generator_explore[2].unwrap().current,exploring);assert!(engine.generator_library[2].is_some());
        for lane in 0..6 {engine.auto_label(2,lane,&format!("synth:param{lane}"));}
        let before=engine.undo_snapshot();engine.toggle_record(2);assert!(!engine.part_recording_busy());assert_eq!(engine.undo_snapshot(),before);
        let original=source.tracks[2].clips[0].clone();source.tracks[2].clips[0].notes.push(Config::default().note(0).unwrap());
        assert!(source.part_export(2).contains("Bake edited"));source.tracks[2].clips[0]=original.clone();source.tracks[2].clips[0].scale_num=2;
        assert!(source.part_export(2).contains("1x speed"));source.tracks[2].clips[0]=original;
        let lane=source.tracks[2].lane_label.iter().position(|name|name==LABELS[2]).unwrap();source.tracks[2].clips[0].set_lock(lane as u8,16,12);
        assert!(source.part_export(2).contains("another actor"));
        let mut fill=fixture();let user=crate::part_catalog::NAMES.len();command(&mut fill,&format!("filllibrary 16 {user} {payload}"));
        assert!(!fill.fill_preview(&format!("16_{user}_99_99_0_2")).starts_with("error:"));
        assert!(fill.fill_preview(&format!("16_{user}_99_99_2_2")).contains("Style length"));
    }
    #[test] fn generator_user_recipe_count_in_cancel_and_companion_undo_keep_transient_sources() {
        let (_,comp)=saved_user_recipe(false);let (_,bass)=saved_user_recipe(true);let mut engine=fixture();
        engine.follower_inputs[1]=crate::follower_input::InputKey::new(0,1);
        command(&mut engine,&format!("guser 2 comp {comp};guser 1 bass {bass};rec 2"));ticks(&mut engine,100);command(&mut engine,"gexplore 2 off");
        assert!(!engine.part_recording_busy());ticks(&mut engine,500);assert!(engine.tracks[2].clips[0].generator.is_none());assert!(engine.generator_library[1].is_some());
        command(&mut engine,"stop");engine.tracks[2].clips[0].clear();
        command(&mut engine,&format!("guser 2 comp {comp};guser 1 bass {bass};usnap 1221;rec 2"));ticks(&mut engine,crate::TICKS_PER_BAR+500);
        command(&mut engine,"rec 1;ucommit 1221;uswap 1221 1222");
        assert!(engine.tracks[2].clips[0].generator.is_none());assert!(engine.generator_library[1].is_some());assert!(engine.generator_exploring(1));
        assert!(engine.tracks[1].clips[0].generator.is_none());command(&mut engine,"stop");assert!(engine.gates.is_empty());
    }
}
