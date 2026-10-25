use crate::{engine::{Engine,OutEvent},part_settings::{Settings,COUNT},command::apply_batch};
fn load(engine:&mut Engine,track:usize,choice:usize,out:&mut Vec<OutEvent>){
    let info=engine.motif_clip_info(track);let fields:Vec<_>=info.split(',').collect();
    let command=format!("pload {track} {} {} stock {choice} {}",fields[0],fields[1],Settings::comp().wire());
    apply_batch(engine,&command,out);assert!(engine.part_result.starts_with("Loaded"),"{}",engine.part_result);
}
#[test] fn library_is_mapped_atomic_and_undoable(){
    let mut engine=Engine::new(48000,12000);let mut out=Vec::new();let before=engine.undo_snapshot();
    apply_batch(&mut engine,"usnap 1",&mut out);load(&mut engine,2,1,&mut out);apply_batch(&mut engine,"ucommit 1",&mut out);
    let clip=engine.tracks[2].active();assert_eq!(clip.notes.len(),4);assert!(clip.notes.iter().all(|note|!note.rendered&&note.input_key.is_some()));
    assert_eq!(out.iter().filter(|event|matches!(event,OutEvent::RecipeParam{..})).count(),COUNT);
    let saved=crate::persist::serialize(&engine);let mut restored=Engine::new(48000,12000);assert!(crate::persist::load(&mut restored,&saved));
    assert_eq!(restored.tracks[2].active().recipe,clip.recipe);
    apply_batch(&mut engine,"uswap 1 2",&mut out);assert_eq!(engine.undo_snapshot(),before);
}
#[test] fn recipes_recall_per_clip_and_do_not_reset_on_loop(){
    let mut engine=Engine::new(48000,12000);let mut out=Vec::new();load(&mut engine,2,1,&mut out);
    assert!(engine.recipe_edit_param(2,"chord_form","Rootless 7"));
    engine.tracks[2].active_clip=1;load(&mut engine,2,3,&mut out);
    out.clear();engine.tracks[2].active_clip=0;engine.recipe_tick(&mut out);
    assert!(out.contains(&OutEvent::RecipeParam{track:2,key:5,value:14}));
    out.clear();for _ in 0..1000 {engine.recipe_tick(&mut out);}assert!(out.is_empty());
    assert!(!engine.recipe_edit_param(2,"travel_map","None"));assert!(!engine.recipe_edit_param(2,"track_role","Off"));
}
#[test] fn stale_and_recording_imports_do_not_mutate_anything(){
    let mut engine=Engine::new(48000,12000);let mut out=Vec::new();load(&mut engine,2,0,&mut out);
    let before=engine.undo_snapshot();
    apply_batch(&mut engine,&format!("pload 2 0 bad stock 1 {}",Settings::comp().wire()),&mut out);
    assert_eq!(engine.undo_snapshot(),before);assert!(engine.part_result.starts_with("error:"));
    engine.recording=true;let info=engine.motif_clip_info(2);let signature=info.split(',').nth(1).unwrap();
    apply_batch(&mut engine,&format!("pload 2 0 {signature} stock 1 {}",Settings::comp().wire()),&mut out);
    assert_eq!(engine.undo_snapshot(),before);assert!(engine.part_result.contains("recording"));
}
#[test] fn user_entry_roundtrips_settings_notes_and_named_automation(){
    let mut engine=Engine::new(48000,12000);let mut out=Vec::new();load(&mut engine,2,1,&mut out);
    engine.auto_label(2,1,"midi_fx1:chord_voicing");engine.tracks[2].lane_base[1]=0;
    engine.tracks[2].active_mut().set_lock(1,0,31);
    engine.tracks[2].active_mut().recipe.as_mut().unwrap().gate=75;
    let payload=engine.part_export(2);assert!(!payload.starts_with("error"));
    let info=engine.motif_clip_info(6);let signature=info.split(',').nth(1).unwrap();
    apply_batch(&mut engine,&format!("pload 6 0 {signature} user {payload} {}",Settings::comp().wire()),&mut out);
    assert!(engine.part_result.starts_with("Loaded"),"{}",engine.part_result);
    assert_eq!(engine.tracks[6].lane_label[0],"midi_fx1:chord_voicing");
    assert_eq!(engine.tracks[6].active().locks[0].lane,0);
    assert_eq!(engine.tracks[6].active().recipe.as_ref().unwrap().gate,75);
    assert_eq!(engine.tracks[6].active().notes.len(),4);
}
#[test] fn missing_recipe_returns_to_the_original_track_defaults(){
    let mut engine=Engine::new(48000,12000);let mut out=Vec::new();load(&mut engine,2,3,&mut out);
    out.clear();engine.tracks[2].active_clip=1;engine.recipe_tick(&mut out);
    assert!(out.contains(&OutEvent::RecipeParam{track:2,key:5,value:16}));
}
#[test] fn all_stock_styles_sound_and_release_through_the_scheduler(){
    for choice in 0..7 {
        let mut engine=Engine::new(48000,12000);let mut out=Vec::new();load(&mut engine,2,choice,&mut out);
        assert!(!engine.playing,"loading stopped must not start transport");
        apply_batch(&mut engine,"play",&mut out);
        for _ in 0..760 {engine.advance_block(128,&mut out);}
        apply_batch(&mut engine,"stop",&mut out);
        let ons=out.iter().filter(|event|matches!(event,OutEvent::NoteOn{track:2,..})).count();
        let offs=out.iter().filter(|event|matches!(event,OutEvent::NoteOff{track:2,..})).count();
        assert!(ons>0,"style {choice}");assert_eq!(ons,offs,"style {choice}");
    }
}
#[test] fn imports_preserve_automation_base_without_changing_other_clips(){
    let mut engine=Engine::new(48000,12000);let mut out=Vec::new();load(&mut engine,2,1,&mut out);
    engine.auto_label(2,1,"synth:cutoff");engine.tracks[2].lane_base[1]=33;
    engine.tracks[2].active_mut().set_lock(1,2,91);
    let payload=engine.part_export(2);
    engine.auto_label(6,3,"synth:cutoff");engine.tracks[6].lane_base[3]=100;
    let info=engine.motif_clip_info(6);let signature=info.split(',').nth(1).unwrap();
    apply_batch(&mut engine,&format!("pload 6 0 {signature} user {payload} {}",Settings::comp().wire()),&mut out);
    assert!(engine.part_result.starts_with("Loaded"));assert_eq!(engine.tracks[6].lane_base[3],100);
    for step in [0,4,8,12] {assert_eq!(engine.tracks[6].active().lock_at(3,step),Some(33));}
    engine.auto_label(2,2,"midi_fx1:travel_map");engine.tracks[2].active_mut().set_lock(2,0,0);
    assert!(engine.part_export(2).starts_with("error:"));
}
