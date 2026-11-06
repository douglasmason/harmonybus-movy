#[cfg(test)] mod cloud_tests {
    use super::*;
    fn fixture()->Engine {let mut engine=Engine::new(48000,12000);engine.link_enabled=false;engine.follower_inputs[2]=crate::follower_input::InputKey::new(0,1);engine}
    fn command(engine:&mut Engine,message:&str){crate::command::apply_batch(engine,message,&mut Vec::new());}
    fn trace(engine:&mut Engine,count:u32)->Vec<(u32,u8,u8,bool)> {
        let mut result=Vec::new();
        for tick in 0..count {let mut out=Vec::new();engine.service_tick(&mut out);for event in out {match event {OutEvent::NoteOn{track:2,pitch,vel}=>result.push((tick,pitch,vel,true)),OutEvent::NoteOff{track:2,pitch}=>result.push((tick,pitch,0,false)),_=>{}}}}
        result
    }
    fn start(engine:&mut Engine){command(engine,"gexplore 2 16 127 96 71 0 127 50 64 80 64 100");}
    #[test] fn cloud_multitouch_live_does_not_change_set_and_contacts_expire() {
        let mut engine=fixture();let before=engine.undo_snapshot();engine.dirty=false;start(&mut engine);
        command(&mut engine,"gcloud 2 0 127 20 100;gcloud 2 1 127 100 100");engine.play();
        assert!(!trace(&mut engine,192).is_empty());
        assert_eq!(engine.undo_snapshot(),before);assert!(!engine.dirty);
        assert!(trace(&mut engine,768).iter().any(|event|!event.3));
        assert!(engine.clouds[2].contacts.is_empty());assert!(engine.clouds[2].points.is_empty());assert!(engine.gates.is_empty());
        assert!(trace(&mut engine,384).is_empty());
    }
    #[test] fn cloud_recorded_strokes_controls_reload_library_and_bake_replay() {
        let mut engine=fixture();start(&mut engine);engine.play();engine.toggle_record(2);
        let mut recorded=Vec::new();
        for step in 0..32 {
            if step<16 {command(&mut engine,&format!("gcloud 2 0 127 {} 110",step*8));command(&mut engine,&format!("gcloud 2 1 90 {} 100",127-step*8));}
            else {command(&mut engine,"gcloud 2 0 0 0 0;gcloud 2 1 0 0 0");}
            if step==12 {command(&mut engine,"gexplore 2 16 127 96 71 0 127 20 80 100 80 90");}
            recorded.extend(trace(&mut engine,24).into_iter().map(|(tick,pitch,velocity,on)|(tick+step*24,pitch,velocity,on)));
        }
        engine.toggle_record(2);
        assert!(!recorded.is_empty());assert!(engine.tracks[2].clips[0].cloud_field);assert!(!engine.tracks[2].clips[0].cloud_points.is_empty());
        assert_eq!(engine.tracks[2].lane_assigned.iter().filter(|assigned|**assigned).count(),8);
        let saved=engine.undo_snapshot();let mut restored=fixture();assert!(crate::persist::load(&mut restored,&saved));
        restored.play();assert_eq!(trace(&mut restored,768),recorded,"accepted stroke and control automation must reproduce the take");
        restored.stop(&mut Vec::new());let payload=restored.part_export(2);assert!(!payload.starts_with("error:"),"{payload}");
        let preset=crate::part_load::prepare_part("user",&payload).unwrap();assert_eq!(preset.clip.cloud_points,restored.tracks[2].clips[0].cloud_points);
        restored.generator_bake("gbake 2 0",&mut Vec::new());assert_eq!(restored.generator_result,"Baked - Undo available");
        restored.play();assert_eq!(trace(&mut restored,768),recorded,"Bake must retain the same abstract mapped notes");
        assert!(restored.undo_restore(&saved));assert!(restored.tracks[2].clips[0].generator.is_some());
    }
    #[test] fn cloud_controls_need_eight_lanes_before_record_changes_anything() {
        let mut engine=fixture();engine.auto_label(2,7,"synth:cutoff");start(&mut engine);let before=engine.undo_snapshot();engine.toggle_record(2);
        assert_eq!(engine.undo_snapshot(),before);assert!(!engine.recording);assert!(!engine.pending_rec);
    }
    #[test] fn cloud_legacy_config_and_malformed_touch_are_safe() {
        assert_eq!(crate::generator::Config::parse("0 32 64 1").unwrap().wire(),"0 32 64 1 0");
        assert!(crate::generator::Config::parse("16 127 96 1 0 128 64 64 64 64 64").is_none());
        let mut engine=fixture();start(&mut engine);
        for message in ["gcloud 16 0 0 0 127","gcloud 2 128 0 0 127","gcloud 2 0 -1 0 127","gcloud 2 0 0 0 128"]{assert!(!engine.cloud_touch(message));}
        for contact in 0..32 {engine.cloud_touch(&format!("gcloud 2 {contact} 64 64 127"));}
        assert_eq!(engine.clouds[2].contacts.len(),crate::cloud::MAX_CONTACTS);
        let before=engine.undo_snapshot();for _ in 0..10 {engine.cloud_view(2);}assert_eq!(engine.undo_snapshot(),before);
        command(&mut engine,"gexplore 2 off");assert!(engine.clouds[2].contacts.is_empty());
    }
    #[test] fn cloud_short_taps_survive_until_the_shared_grid_and_late_touch_replays() {
        let mut engine=fixture();start(&mut engine);engine.play();engine.toggle_record(2);
        let mut recorded=trace(&mut engine,192);
        command(&mut engine,"gcloud 2 0 127 90 127;gcloud 2 0 127 90 0");
        recorded.extend(trace(&mut engine,576).into_iter().map(|(tick,pitch,vel,on)|(tick+192,pitch,vel,on)));
        engine.toggle_record(2);let clip=&engine.tracks[2].clips[0];
        assert_eq!(clip.cloud_field_start,8);assert_eq!(clip.cloud_points.len(),1);
        let saved=engine.undo_snapshot();let mut restored=fixture();assert!(crate::persist::load(&mut restored,&saved));restored.play();
        assert_eq!(trace(&mut restored,768),recorded);
        engine.stop(&mut Vec::new());assert_eq!(engine.cloud_view(2),"cf1|||");
    }
    #[test] fn cloud_does_not_repurpose_other_recipes_lanes_or_erase_them() {
        let mut engine=fixture();
        for (lane,label) in crate::generator::LABELS.iter().enumerate(){engine.auto_label(2,lane,label);engine.tracks[2].clips[1].set_lock(lane as u8,0,70);}
        start(&mut engine);let before=engine.undo_snapshot();engine.toggle_record(2);
        assert_eq!(engine.undo_snapshot(),before);assert!(!engine.recording);assert!(!engine.pending_rec);
    }
    #[test] fn cloud_stopped_contact_lease_does_not_wait_for_musical_time() {
        let mut engine=fixture();start(&mut engine);
        command(&mut engine,"gcloud 2 0 127 64 127");
        assert_eq!(engine.clouds[2].contacts.len(),1);
        engine.advance_block(96000,&mut Vec::new());
        assert!(engine.clouds[2].contacts.is_empty());
        assert!(engine.clouds[2].pending_touches.is_empty());
        assert_eq!(engine.cloud_view(2),"cf1|||");
        engine.play();assert!(trace(&mut engine,768).is_empty());
    }
    #[test] fn cloud_gesture_overdub_keeps_untouched_history_and_replays() {
        let mut engine=fixture();start(&mut engine);engine.play();engine.toggle_record(2);
        for step in 0..32 {command(&mut engine,&format!("gcloud 2 0 127 {} 100",step*4));trace(&mut engine,24);}
        engine.toggle_record(2);engine.stop(&mut Vec::new());
        let before=engine.undo_snapshot();let original=engine.tracks[2].clips[0].cloud_points.clone();
        command(&mut engine,"gpreview 2 0");engine.play();let mut heard=trace(&mut engine,192);engine.toggle_record(2);
        for step in 8..32 {
            if (12..16).contains(&step){command(&mut engine,"gcloud 2 1 127 120 127");}
            else {command(&mut engine,"gcloud 2 1 127 120 0");}
            heard.extend(trace(&mut engine,24).into_iter().map(|(tick,pitch,vel,on)|(tick+step*24,pitch,vel,on)));
        }
        engine.toggle_record(2);engine.stop(&mut Vec::new());
        assert_eq!(engine.tracks[2].clips[0].cloud_points.iter().filter(|point|point.step<12).copied().collect::<Vec<_>>(),original.iter().filter(|point|point.step<12).copied().collect::<Vec<_>>());
        let saved=engine.undo_snapshot();assert_ne!(before,saved);
        let mut restored=fixture();assert!(crate::persist::load(&mut restored,&saved));restored.play();assert_eq!(trace(&mut restored,768),heard);
        assert!(engine.undo_restore(&before));assert_eq!(engine.tracks[2].clips[0].cloud_points,original);
    }
}
