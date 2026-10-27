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
        engine.stop(&mut Vec::new());assert!(engine.generator_explore.is_none());assert!(engine.gates.is_empty());
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
        ticks(&mut engine,374);assert_eq!(engine.generator_explore.unwrap().current.style,0);
        ticks(&mut engine,1);assert_eq!(engine.generator_explore.unwrap().current.style,1);
        engine.toggle_record(2);command(&mut engine,"gexplore 2 1 90 100 3");
        assert_eq!(engine.generator_explore.unwrap().desired.seed,2);assert!(engine.generator_result.contains("Seed locked"));
        engine.stop(&mut Vec::new());assert!(engine.generator_explore.is_none());assert!(engine.gates.is_empty());
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
        assert!(engine.generator_explore.is_none());assert!(!engine.part_recording_busy());
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
        ticks(&mut engine,1);assert!(!engine.part_recording_busy());assert!(engine.generator_explore.is_none());
        assert_eq!(engine.generator_result,"Automation capacity reached");assert_eq!(engine.undo_snapshot(),before);
    }
    #[test] fn generator_overdub_can_join_an_ordinary_record_pass_on_the_same_comp_clip() {
        let (mut engine,_)=record();engine.stop(&mut Vec::new());engine.play();ticks(&mut engine,100);
        command(&mut engine,"rec 2");assert!(engine.recording);assert!(engine.generator_explore.is_none());
        command(&mut engine,"gpreview 2 0 1 101");assert_eq!(engine.generator_explore.unwrap().source,Some(0));
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

}
