use crate::{engine::{Engine,OutEvent},clip::Clip,follower_input::InputKey,part_settings::Settings,command::apply_batch};
fn setup()->Engine {
    let mut engine=Engine::new(48000,12000);
    let mut pitch=Clip::new();pitch.input_key=InputKey::new(2,1);
    for (step,tick,note) in [(16,384,60),(16,384,64),(24,576,67)]{pitch.add_note_raw(step,tick,24,note,80);}
    pitch.set_loop(16,16);pitch.notes[2].actions=Some([7;52]);engine.tracks[1].clips[3]=pitch;
    let mut rhythm=Clip::new();
    for (step,tick,pitch) in [(32,768,36),(32,768,38),(36,864,42),(44,1056,36)]{rhythm.add_note_raw(step,tick,48,pitch,100);}
    rhythm.set_loop(32,16);engine.tracks[4].clips[2]=rhythm;engine.tracks[1].active_clip=3;engine.tracks[4].active_clip=2;engine
}
fn write(engine:&mut Engine,request:&str,out:&mut Vec<OutEvent>)->String {
    let preview=engine.fill_preview(request);assert!(!preview.starts_with("error:"),"{preview}");
    let command=format!("clipfill 2 5 {} {request} {} {} own",engine.fill_target("2_5"),preview.split('|').next().unwrap(),Settings::comp().wire());
    apply_batch(engine,&command,out);command
}
#[test] fn stopped_clips_compose_chord_groups_and_input_intent_without_launching(){
    let mut engine=setup();let mut out=Vec::new();write(&mut engine,"1_3_4_2_1_0",&mut out);
    assert!(engine.part_result.starts_with("Filled"),"{}",engine.part_result);
    let clip=&engine.tracks[2].clips[5];
    assert_eq!(clip.notes.iter().map(|note|(note.tick,note.pitch)).collect::<Vec<_>>(),vec![(0,60),(0,64),(96,67),(288,60),(288,64)]);
    assert_eq!(clip.notes[2].actions,Some([7;52]));assert!(clip.notes.iter().all(|note|note.input_key==InputKey::new(2,1)&&!note.rendered));
    assert_eq!(clip.length_steps,16);assert!(!engine.playing);assert_eq!(engine.tracks[2].playing_slot,None);assert_eq!(engine.tracks[2].active_clip,0);
}
#[test] fn fit_selects_by_target_phase_and_repeat_keeps_rhythm_period(){
    let mut engine=setup();let mut out=Vec::new();write(&mut engine,"1_3_4_2_2_1",&mut out);
    let clip=&engine.tracks[2].clips[5];
    assert_eq!(clip.notes.iter().filter(|note|note.pitch==67).map(|note|note.tick).collect::<Vec<_>>(),vec![384,480,672]);
    assert_eq!(clip.length_steps,32);
}
#[test] fn stale_sources_destination_recording_and_capacity_reject_atomically(){
    let mut engine=setup();let mut out=Vec::new();let command=write(&mut engine,"1_3_4_2_1_0",&mut out);
    let before=engine.undo_snapshot();apply_batch(&mut engine,&command,&mut out);assert!(engine.part_result.contains("Destination changed"));assert_eq!(engine.undo_snapshot(),before);
    let preview=engine.fill_preview("1_3_4_2_1_0");let command=format!("clipfill 2 5 {} 1_3_4_2_1_0 {} {} keep",engine.fill_target("2_5"),preview.split('|').next().unwrap(),Settings::comp().wire());
    engine.tracks[4].clips[2].notes[0].gate+=1;let before=engine.undo_snapshot();apply_batch(&mut engine,&command,&mut out);
    assert!(engine.part_result.contains("Source changed"));assert_eq!(engine.undo_snapshot(),before);
    engine.recording=true;apply_batch(&mut engine,&command,&mut out);assert!(engine.part_result.contains("recording"));assert_eq!(engine.undo_snapshot(),before);
    engine.recording=false;
    let mut dense=Clip::new();dense.input_key=InputKey::new(0,1);dense.set_loop(0,1);for pitch in 0..8{dense.add_note_raw(0,0,24,60+pitch,100);}dense.length_steps=1;engine.tracks[1].clips[3]=dense.clone();engine.tracks[4].clips[2]=dense;
    assert!(engine.fill_preview("1_3_4_2_16_0").contains("capacity"));
}
#[test] fn playback_flags_do_not_expire_preview_and_fill_undo_restores_weaving(){
    let mut engine=setup();let mut out=Vec::new();engine.source_route_set("2 1 1 3 4 2 0");
    let preview=engine.fill_preview("1_3_4_2_1_0");
    engine.tracks[1].clips[3].notes[0].fired=true;engine.tracks[1].clips[3].notes[0].suppress=true;
    assert_eq!(engine.fill_preview("1_3_4_2_1_0"),preview);
    let before=engine.undo_snapshot();apply_batch(&mut engine,"usnap 21",&mut out);write(&mut engine,"1_3_4_2_1_0",&mut out);apply_batch(&mut engine,"ucommit 21",&mut out);
    assert!(!engine.source_routes[2].enabled);let saved=crate::persist::serialize(&engine);let mut restored=Engine::new(48000,12000);assert!(crate::persist::load(&mut restored,&saved));assert_eq!(restored.tracks[2].clips[5].notes.len(),5);
    apply_batch(&mut engine,"uswap 21 22",&mut out);assert_eq!(engine.undo_snapshot(),before);
}
#[test] fn written_clip_uses_ordinary_scheduler_and_balanced_note_ownership(){
    let mut engine=setup();let mut out=Vec::new();engine.tracks[1].clips[3].notes[2].actions=None;write(&mut engine,"1_3_4_2_1_0",&mut out);
    engine.tracks[2].active_clip=5;engine.tracks[2].playing_slot=Some(5);engine.playing=true;
    for _ in 0..800 {engine.advance_block(250,&mut out);}engine.stop(&mut out);
    for pitch in [60,64,67]{let ons=out.iter().filter(|event|matches!(event,OutEvent::NoteOn{track:2,pitch:note,..} if *note==pitch)).count();let offs=out.iter().filter(|event|matches!(event,OutEvent::NoteOff{track:2,pitch:note} if *note==pitch)).count();assert!(ons>0);assert_eq!(ons,offs);}
}
#[test] fn raw_pitches_and_live_timing_are_not_silently_reinterpreted(){
    let mut engine=setup();engine.tracks[1].clips[3].input_key=None;for note in &mut engine.tracks[1].clips[3].notes {note.input_key=None;}
    assert!(engine.fill_preview("1_3_4_2_1_0").contains("input key"));
    engine=setup();engine.tracks[4].clips[2].quant=1;assert!(engine.fill_preview("1_3_4_2_1_0").contains("timing"));
    assert!(engine.fill_preview("99_0_4_2_1_0").contains("Invalid"));assert!(engine.fill_preview("1_3_4_2_0_0").contains("length"));
}

fn conductor_settings()->Settings {let mut settings=Settings::comp();settings.0[0]=0;settings.0[1]=0;settings}
fn conductor_write(engine:&mut Engine,request:&str,out:&mut Vec<OutEvent>)->String {
    let preview=engine.fill_preview(request);assert!(!preview.starts_with("error:"),"{preview}");
    let command=format!("clipfill 0 5 {} {request} {} {} own",engine.fill_target("0_5"),preview.split('|').next().unwrap(),conductor_settings().wire());
    apply_batch(engine,&command,out);command
}
#[test] fn conductor_descriptor_without_input_key_keeps_intent_ties_and_rests(){
    let mut engine=setup();let mut out=Vec::new();
    let mut actions=[0;52];actions[0]=0xc858001f00000000|0x91|(0xab5<<12);
    let source=&mut engine.tracks[1].clips[3];source.notes.truncate(1);source.input_key=None;
    source.notes[0].input_key=None;source.notes[0].actions=Some(actions);source.notes[0].gate=192;
    let original=source.notes[0].clone();
    apply_batch(&mut engine,"usnap 71",&mut out);let before=engine.undo_snapshot();
    conductor_write(&mut engine,"1_3_4_2_2_2",&mut out);assert!(engine.part_result.starts_with("Filled"),"{}",engine.part_result);
    let clip=&engine.tracks[0].clips[5];assert_eq!(clip.length_steps,32);
    assert_eq!(clip.notes.iter().map(|n|(n.tick,n.gate)).collect::<Vec<_>>(),vec![(0,192),(384,192)]);
    assert!(clip.notes.iter().all(|n|n.actions==original.actions&&n.input_key.is_none()&&!n.rendered));
    assert_eq!(engine.tracks[0].playing_slot,None);assert_eq!(engine.tracks[0].active_clip,0);
    let saved=crate::persist::serialize(&engine);let mut restored=Engine::new(48000,12000);assert!(crate::persist::load(&mut restored,&saved));
    assert_eq!(restored.tracks[0].clips[5].notes[0].actions,Some(actions));
    assert_eq!(restored.tracks[0].clips[5].recipe.as_ref().unwrap().settings,conductor_settings());
    restored.tracks[0].active_clip=5;
    assert!(restored.recipe_edit_param(0,"render_velocity_percent","85"));
    assert_eq!(restored.tracks[0].clips[5].recipe.as_ref().unwrap().settings.0[19],85);
    assert!(!restored.recipe_edit_param(0,"track_role","Follower"));
    apply_batch(&mut engine,"ucommit 71;uswap 71 72",&mut out);assert_eq!(engine.undo_snapshot(),before);
    write(&mut engine,"1_3_4_2_1_0",&mut out);assert!(engine.part_result.contains("conductor destination"));
}
#[test] fn motif_import_can_fill_another_conductor_clip_with_original_silence(){
    let mut engine=Engine::new(48000,12000);let mut out=Vec::new();
    let info=engine.motif_clip_info(0);let info:Vec<_>=info.split(',').collect();
    let words=vec!["0";52].join(",");
    // One tied event, then a timed rest: the existing motif importer owns parsing.
    apply_batch(&mut engine,&format!("mload 0 0 {} 0 384 0 1 0,192,60.100:{words}|192,192:{words}",info[1]),&mut out);
    assert!(engine.motif_load_result.starts_with("Written"));
    conductor_write(&mut engine,"0_0_99_99_2_2",&mut out);assert!(engine.part_result.starts_with("Filled"),"{}",engine.part_result);
    assert_eq!(engine.tracks[0].clips[5].notes.iter().map(|n|(n.tick,n.gate)).collect::<Vec<_>>(),vec![(0,192),(384,192)]);
    engine.tracks[0].clips[0].notes.clear();
    conductor_write(&mut engine,"0_0_99_99_1_2",&mut out);assert!(engine.part_result.starts_with("Filled"));
    assert!(engine.tracks[0].clips[5].notes.is_empty());assert_eq!(engine.tracks[0].clips[5].length_steps,16);
}
#[test] fn conductor_fill_recombines_rhythm_and_rejects_role_changes_atomically(){
    let mut engine=setup();let mut out=Vec::new();conductor_write(&mut engine,"1_3_4_2_1_0",&mut out);
    assert!(engine.part_result.starts_with("Filled"));assert_eq!(engine.tracks[0].clips[5].notes.len(),5);
    engine.tracks[1].clips[3].recipe=Some(crate::clip_recipe::Recipe{name:"Follower".into(),settings:Settings::comp(),gate:100});
    let before=engine.undo_snapshot();conductor_write(&mut engine,"1_3_4_2_1_2",&mut out);
    assert!(engine.part_result.contains("source recipe is a follower"));assert_eq!(engine.undo_snapshot(),before);
}

fn drum_setup()->Engine {
    let mut engine=setup();let mut out=Vec::new();
    apply_batch(&mut engine,"drumout 4 1;drumout 8 1",&mut out);
    let source=&mut engine.tracks[4].clips[2];
    source.notes[0].vel=117;source.notes[1].vel=73;source.notes[2].vel=41;
    source.notes[3].tick=1148;source.notes[3].step=47;source.notes[3].gate=100;
    source.notes[3].pressure=vec![(1,90),(20,60)];
    source.transpose=12;source.input_key=InputKey::new(7,2);
    source.notes[0].input_key=source.input_key;source.notes[0].rendered=true;
    engine
}
fn drum_command(engine:&Engine,request:&str,track:usize,slot:usize)->String {
    let preview=engine.fill_preview(request);assert!(!preview.starts_with("error:"),"{preview}");
    format!("clipfill {track} {slot} {} {request} {} drums own",engine.fill_target(&format!("{track}_{slot}")),preview.split('|').next().unwrap())
}
#[test] fn drum_original_preserves_lanes_accents_gaps_and_repeat_boundaries(){
    let mut engine=drum_setup();let mut out=Vec::new();
    let before=crate::motif_load::fingerprint(&engine.tracks[4].clips[2]);
    let preview=engine.fill_preview("4_2_99_99_2_2");assert!(preview.ends_with("|drums|36,38,42"),"{preview}");
    let command=drum_command(&engine,"4_2_99_99_2_2",8,5);apply_batch(&mut engine,&command,&mut out);
    assert!(engine.part_result.starts_with("Filled"),"{}",engine.part_result);
    let clip=&engine.tracks[8].clips[5];
    assert_eq!(clip.notes.iter().map(|note|(note.tick,note.pitch,note.vel,note.gate)).collect::<Vec<_>>(),vec![
        (0,36,117,48),(0,38,73,48),(96,42,41,48),(380,36,100,100),
        (384,36,117,48),(384,38,73,48),(480,42,41,48),(764,36,100,4)]);
    assert_eq!(clip.notes[3].pressure,vec![(1,90),(20,60)]);assert_eq!(clip.notes[7].pressure,vec![(1,90)]);
    assert!(clip.notes.iter().all(|note|note.input_key.is_none()&&note.actions.is_none()&&!note.rendered&&!note.suppress&&!note.fired));
    assert_eq!(clip.transpose,0);assert!(clip.recipe.is_none()&&clip.input_key.is_none());assert_eq!(clip.length_steps,32);
    assert!(!engine.playing);assert_eq!(engine.tracks[8].playing_slot,None);assert_eq!(engine.tracks[8].active_clip,0);
    assert_eq!(crate::motif_load::fingerprint(&engine.tracks[4].clips[2]),before);
    assert!(engine.recipe_bases[8].is_none());
}
#[test] fn drum_fill_undo_save_and_silent_groove_use_existing_clip_ownership(){
    let mut engine=drum_setup();let mut out=Vec::new();
    // Use a persisted-valid source and selection; loading intentionally drops
    // harmonic input attached to rendered notes and selects an existing clip.
    engine.tracks[4].clips[2].notes[0].rendered=false;engine.tracks[8].active_clip=5;
    engine.tracks[8].clips[5].add_note_raw(0,0,12,55,99);let before=engine.undo_snapshot();
    apply_batch(&mut engine,"usnap 81",&mut out);
    let command=drum_command(&engine,"4_2_99_99_2_2",8,5);apply_batch(&mut engine,&command,&mut out);
    apply_batch(&mut engine,"ucommit 81",&mut out);
    let saved=crate::persist::serialize(&engine);let mut restored=Engine::new(48000,12000);assert!(crate::persist::load(&mut restored,&saved));
    assert_eq!(restored.tracks[8].clips[5].notes,engine.tracks[8].clips[5].notes);assert!(restored.drum_output(8));
    apply_batch(&mut engine,"uswap 81 82",&mut out);assert_eq!(engine.undo_snapshot(),before);
    engine.tracks[4].clips[2].notes.clear();let command=drum_command(&engine,"4_2_99_99_2_2",8,5);apply_batch(&mut engine,&command,&mut out);
    assert!(engine.part_result.starts_with("Filled"));assert!(engine.tracks[8].clips[5].notes.is_empty());assert_eq!(engine.tracks[8].clips[5].length_steps,32);
}
#[test] fn drum_fill_rejects_stale_role_source_and_recording_without_mutation(){
    let mut engine=drum_setup();let mut out=Vec::new();
    let command=drum_command(&engine,"4_2_99_99_2_2",8,5);
    engine.set_drum_output(8,false,&mut out);let before=engine.undo_snapshot();apply_batch(&mut engine,&command,&mut out);
    assert!(engine.part_result.contains("Destination changed"));assert_eq!(engine.undo_snapshot(),before);
    engine.set_drum_output(8,true,&mut out);engine.tracks[4].clips[2].notes[0].vel-=1;let before=engine.undo_snapshot();apply_batch(&mut engine,&command,&mut out);
    assert!(engine.part_result.contains("Source changed"));assert_eq!(engine.undo_snapshot(),before);
    let command=drum_command(&engine,"4_2_99_99_2_2",8,5);engine.recording=true;let before=engine.undo_snapshot();apply_batch(&mut engine,&command,&mut out);
    assert!(engine.part_result.contains("recording"));assert_eq!(engine.undo_snapshot(),before);
}
#[test] fn drum_and_melodic_content_cannot_cross_destination_types(){
    let mut engine=drum_setup();let mut out=Vec::new();
    let command=drum_command(&engine,"4_2_99_99_2_2",2,5);let before=engine.undo_snapshot();apply_batch(&mut engine,&command,&mut out);
    assert!(engine.part_result.contains("drum destination"));assert_eq!(engine.undo_snapshot(),before);
    let preview=engine.fill_preview("1_3_4_2_1_0");assert!(!preview.starts_with("error:"));
    let command=format!("clipfill 8 5 {} 1_3_4_2_1_0 {} {} own",engine.fill_target("8_5"),preview.split('|').next().unwrap(),Settings::comp().wire());
    apply_batch(&mut engine,&command,&mut out);assert!(engine.part_result.contains("melodic destination"));assert_eq!(engine.undo_snapshot(),before);
    // Local drum modules use the same native identity as routed drum tracks.
    apply_batch(&mut engine,"tdrum 2 1",&mut out);let command=drum_command(&engine,"4_2_99_99_1_2",2,5);apply_batch(&mut engine,&command,&mut out);
    assert!(engine.part_result.starts_with("Filled"));assert!(engine.recipe_bases[2].is_none());
}
#[test] fn drum_fill_refuses_unsupported_timing_operations_and_capacity(){
    for variation in 0..5 {
        let mut engine=drum_setup();let source=&mut engine.tracks[4].clips[2];
        match variation {
            0=>source.quant=50,
            1=>source.scale_num=2,
            2=>source.locks.push(crate::clip::Lock{lane:0,step:32,val:40}),
            3=>source.notes[0].actions=Some([7;52]),
            _=>source.trigs.push(crate::clip::Trig{step:32,lane:Some(36),props:crate::clip::TrigProps{prob:50,..crate::clip::TrigProps::DEFAULT}}),
        }
        assert!(engine.fill_preview("4_2_99_99_1_2").starts_with("error:"));
    }
    let mut engine=drum_setup();assert!(engine.fill_preview("4_2_1_3_1_0").contains("Original"));
    let source=&mut engine.tracks[4].clips[2];*source=Clip::new();source.length_steps=1;
    for pitch in 0..8 {source.add_note_raw(0,0,12,pitch,100);}
    assert!(engine.fill_preview("4_2_99_99_16_2").contains("capacity"));
}
#[test] fn live_drum_clip_replacement_flushes_old_gates_and_uses_normal_output(){
    let mut engine=drum_setup();let mut out=Vec::new();
    engine.tracks[8].clips[5].add_note_raw(0,0,900,61,90);engine.tracks[8].clips[5].length_steps=16;
    engine.tracks[8].active_clip=5;engine.tracks[8].playing_slot=Some(5);engine.playing=true;
    engine.advance_block(250,&mut out);assert!(out.iter().any(|event|matches!(event,OutEvent::DrumMidi{status:0x90,pitch:61,..})));
    let command=drum_command(&engine,"4_2_99_99_2_2",8,5);apply_batch(&mut engine,&command,&mut out);
    assert!(engine.part_result.starts_with("Filled"));assert_eq!(engine.tracks[8].pos_tick,0);
    assert!(out.iter().any(|event|matches!(event,OutEvent::DrumMidi{status:0x80,pitch:61,..})));
    for _ in 0..800 {engine.advance_block(250,&mut out);}engine.stop(&mut out);
    for pitch in [36,38,42,61] {
        let ons=out.iter().filter(|event|matches!(event,OutEvent::DrumMidi{status:0x90,pitch:note,..} if *note==pitch)).count();
        let offs=out.iter().filter(|event|matches!(event,OutEvent::DrumMidi{status:0x80,pitch:note,..} if *note==pitch)).count();
        assert!(ons>0,"pitch {pitch}");assert_eq!(ons,offs,"pitch {pitch}");
    }
}
