use crate::{engine::{Engine,OutEvent},part_settings::{Settings,COUNT},command::apply_batch};
fn load(engine:&mut Engine,track:usize,choice:usize,out:&mut Vec<OutEvent>){
    load_kind(engine,track,"stock",choice,out);
}
fn load_kind(engine:&mut Engine,track:usize,kind:&str,choice:usize,out:&mut Vec<OutEvent>){
    let info=engine.motif_clip_info(track);let fields:Vec<_>=info.split(',').collect();
    let command=format!("pload {track} {} {} {kind} {choice} {}",fields[0],fields[1],Settings::comp().wire());
    apply_batch(engine,&command,out);assert!(engine.part_result.starts_with("Loaded"),"{}",engine.part_result);
}
#[test] fn bass_styles_are_single_mapped_notes_with_balanced_releases(){
    for choice in 0..crate::part_catalog::BASS_NAMES.len() {
        let mut engine=Engine::new(48000,12000);let mut out=Vec::new();
        load_kind(&mut engine,1,"bass",choice,&mut out);
        let clip=engine.tracks[1].active();
        assert_eq!(clip.recipe.as_ref().unwrap().settings.0[4],0);
        assert!(clip.recipe.as_ref().unwrap().settings.mapped());
        assert!(clip.notes.iter().all(|note|!note.rendered&&note.input_key.is_some()&&note.pitch<=48));
        assert!(clip.notes.windows(2).all(|pair|pair[0].tick+pair[0].gate<=pair[1].tick));
        assert!(!engine.playing);
        apply_batch(&mut engine,"play",&mut out);
        for _ in 0..760 {engine.advance_block(128,&mut out);}
        apply_batch(&mut engine,"stop",&mut out);
        let ons=out.iter().filter(|event|matches!(event,OutEvent::NoteOn{track:1,..})).count();
        let offs=out.iter().filter(|event|matches!(event,OutEvent::NoteOff{track:1,..})).count();
        assert!(ons>0);assert_eq!(ons,offs,"bass style {choice}");
    }
}
#[test] fn bass_recall_undo_and_import_reject_raw_output(){
    let mut engine=Engine::new(48000,12000);let mut out=Vec::new();
    let before=engine.undo_snapshot();apply_batch(&mut engine,"usnap 11",&mut out);
    load_kind(&mut engine,1,"bass",0,&mut out);
    apply_batch(&mut engine,"ucommit 11",&mut out);
    let saved=crate::persist::serialize(&engine);let mut restored=Engine::new(48000,12000);
    assert!(crate::persist::load(&mut restored,&saved));
    assert_eq!(restored.tracks[1].active().recipe,engine.tracks[1].active().recipe);
    let payload=engine.part_export(1);assert!(!payload.starts_with("error:"));
    engine.tracks[1].active_mut().notes[0].rendered=true;
    assert!(engine.part_export(1).starts_with("error:"));
    apply_batch(&mut engine,"uswap 11 12",&mut out);assert_eq!(engine.undo_snapshot(),before);
    let info=restored.motif_clip_info(5);let signature=info.split(',').nth(1).unwrap();
    apply_batch(&mut restored,&format!("pload 5 0 {signature} user {payload} {}",Settings::comp().wire()),&mut out);
    assert!(restored.part_result.starts_with("Loaded"));
    assert_eq!(restored.tracks[5].active().notes[1].pitch,43);
    assert!(restored.recipe_edit_param(5,"travel_map","Closest Split"));
    assert!(!restored.recipe_edit_param(5,"travel_map","None"));
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

#[test] fn library_load_can_keep_all_weaving_dimensions_and_undo_together(){
    let mut engine=Engine::new(48000,12000);let mut out=Vec::new();
    load_kind(&mut engine,1,"bass",0,&mut out);
    assert!(engine.source_route_set("1 1 -1 -1 2 0 2 3 0 4 0 5 0 6 0 7 0 8 0 1 1"));
    let routes=engine.source_routes;let before=engine.undo_snapshot();
    apply_batch(&mut engine,"usnap 41",&mut out);
    let info=engine.motif_clip_info(1);let signature=info.split(',').nth(1).unwrap();
    apply_batch(&mut engine,&format!("pload 1 0 {signature} bass 5 {} keep",Settings::comp().wire()),&mut out);
    assert!(engine.part_result.starts_with("Loaded"));assert_eq!(engine.source_routes,routes);
    apply_batch(&mut engine,"ucommit 41",&mut out);
    let saved=crate::persist::serialize(&engine);let mut restored=Engine::new(48000,12000);
    assert!(crate::persist::load(&mut restored,&saved));assert_eq!(restored.source_routes,routes);
    apply_batch(&mut engine,"uswap 41 42",&mut out);assert_eq!(engine.undo_snapshot(),before);
    // Legacy callers retain the deliberate own-content behavior.
    load_kind(&mut engine,1,"bass",1,&mut out);
    assert_eq!(engine.source_routes[1],Default::default());
    assert_eq!(&engine.source_routes[2..],&routes[2..]);
    let before=engine.undo_snapshot();let info=engine.motif_clip_info(1);let signature=info.split(',').nth(1).unwrap();
    apply_batch(&mut engine,&format!("pload 1 0 {signature} bass 2 {} invalid",Settings::comp().wire()),&mut out);
    assert!(engine.part_result.starts_with("error:"));assert_eq!(engine.undo_snapshot(),before);
}

#[test] fn loaded_bass_uses_borrowed_rhythm_and_donor_edits_keep_releases(){
    let mut engine=Engine::new(48000,12000);let mut out=Vec::new();
    load_kind(&mut engine,1,"bass",0,&mut out);
    load_kind(&mut engine,2,"stock",1,&mut out);
    assert!(engine.source_route_set("1 1 -1 -1 2 0 0"));
    let info=engine.motif_clip_info(1);let signature=info.split(',').nth(1).unwrap();
    apply_batch(&mut engine,&format!("pload 1 0 {signature} bass 0 {} keep",Settings::comp().wire()),&mut out);
    engine.playing=true;
    engine.tracks[1].playing_slot=Some(0);engine.tracks[2].playing_slot=Some(0);
    out.clear();
    let mut attacks=Vec::new();
    for tick in 0..200 {
        let start=out.len();engine.advance_block(250,&mut out);
        for event in &out[start..] {if let OutEvent::NoteOn{track:1,pitch,..}=event {attacks.push((tick,*pitch));}}
    }
    assert_eq!(attacks,vec![(0,36),(96,43),(192,36)],"borrow quarter-note attacks, consume bass pitch groups");
    // Replacing the live donor while a borrowed note is held retains the actor route
    // and the existing gate's release, then uses the new donor on later attacks.
    load_kind(&mut engine,2,"stock",2,&mut out);
    assert!(engine.source_routes[1].enabled);
    for _ in 0..500 {engine.advance_block(250,&mut out);}
    engine.stop(&mut out);
    for pitch in [36,43] {
        let ons=out.iter().filter(|event|matches!(event,OutEvent::NoteOn{track:1,pitch:note,..} if *note==pitch)).count();
        let offs=out.iter().filter(|event|matches!(event,OutEvent::NoteOff{track:1,pitch:note} if *note==pitch)).count();
        assert!(ons>0);assert_eq!(ons,offs,"paired borrowed bass pitch {pitch}");
    }
}
