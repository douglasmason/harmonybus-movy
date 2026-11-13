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
    #[test] fn operation_edges_preserve_short_strokes_and_cancel_boundaries() {
        let mut engine=fixture();start(&mut engine);engine.cloud_operation_inputs();
        command(&mut engine,"gcloud 2 touch14 96 8193 10001 100;gcloud 2 touch14 96 8193 10001 0");
        assert_eq!(engine.cloud_operation_inputs()[2],3);assert_eq!(engine.cloud_operation_inputs()[2],1);
        command(&mut engine,"gcloud 2 touch14 96 8193 10001 100");assert_eq!(engine.cloud_operation_inputs()[2],7);
        command(&mut engine,"gcloud 2 move14 96 8194 10002 100");assert_eq!(engine.cloud_operation_inputs()[2],5);
        engine.master_tick+=192;assert_eq!(engine.cloud_operation_inputs()[2],1);
        command(&mut engine,"gcloud 2 touch14 96 8193 10001 100");assert_eq!(engine.cloud_operation_inputs()[2],7,"a fresh Down can reacquire an expired contact ID");
        engine.frame_now+=engine.clock.sample_rate() as u64*2;assert_eq!(engine.cloud_operation_inputs()[2],1);
        assert!(!engine.cloud_touch("gcloud 2 move14 96 8194 10002 100"));
        command(&mut engine,"gcloud 2 touch14 96 8193 10001 100;gcloud 2 clear");assert_eq!(engine.cloud_operation_inputs()[2],9);
        command(&mut engine,"gexplore 2 off");assert_eq!(engine.cloud_operation_inputs()[2],8);
        start(&mut engine);engine.stop(&mut Vec::new());assert_ne!(engine.cloud_operation_inputs()[2]&8,0);
    }
    #[test] fn operation_shift_records_resolved_deposits_and_replays_and_bakes_exactly() {
        let mut engine=fixture();start(&mut engine);engine.play();engine.toggle_record(2);
        command(&mut engine,"gcloud 2 touch14 96 12001 10001 110 1 4;gcloud 2 hold 1;gcloud 2 touch14 96 12001 10001 0");
        let mut heard=Vec::new();
        for step in 0..64 {
            if step==8 {engine.cloud_operation_apply(2,crate::cloud::Operation{hold:false,shift:[-1,5000]});}
            if step==16 {command(&mut engine,"gcloud 2 shiftxy 8000 2000 1");}
            if step==24 {engine.cloud_operation_apply(2,crate::cloud::Operation::default());assert_eq!(engine.clouds[2].held_shift,[8000,2000]);}
            if step==32 {command(&mut engine,"gcloud 2 hold 0");}
            heard.extend(trace(&mut engine,24).into_iter().map(|(tick,pitch,velocity,on)|(tick+step*24,pitch,velocity,on)));
        }
        engine.toggle_record(2);let points=engine.tracks[2].clips[0].cloud_points.clone();assert!(!heard.is_empty());
        for (step,x,y) in [(8,12000,15001),(16,3616,617),(24,3617,12001)] {
            assert!(points.iter().any(|point|point.step==step&&point.x==x&&point.y==y&&point.pressure_target==crate::cloud::PressureTarget::Rate));
        }
        let saved=engine.undo_snapshot();let mut restored=fixture();assert!(crate::persist::load(&mut restored,&saved));
        assert_eq!(restored.tracks[2].clips[0].cloud_points,points);assert!(!restored.clouds[2].holding());assert_eq!(restored.clouds[2].operation_shift,[0;2]);
        restored.play();assert_eq!(trace(&mut restored,1536),heard);restored.stop(&mut Vec::new());
        assert_eq!(crate::part_load::prepare_part("user",&restored.part_export(2)).unwrap().clip.cloud_points,points);
        restored.generator_bake("gbake 2 0",&mut Vec::new());restored.play();assert_eq!(trace(&mut restored,1536),heard);
    }
    #[test] fn remote_movement_is_bound_to_the_original_capture() {
        for ending in ["gcloud 2 hold 0","gcloud 2 clear","stop","gexplore 2 off"] {
            let mut engine=fixture();start(&mut engine);
            command(&mut engine,"gcloud 2 touch14 96 10001 9001 100;gcloud 2 hold 1");
            let original=engine.clouds[2].capture_id;assert_ne!(original,0);
            assert!(engine.cloud_touch(&format!("gcloud 2 bound {original} shiftxy 1 -1 0")));
            assert_eq!(engine.clouds[2].held_shift,[1,-1]);
            command(&mut engine,ending);start(&mut engine);
            command(&mut engine,"gcloud 2 touch14 96 11001 8001 100;gcloud 2 hold 1");
            let replacement=engine.clouds[2].capture_id;assert_ne!(replacement,original);
            let saved=engine.undo_snapshot();
            for action in ["shiftxy 100 200 1","shift x 100 0","shiftby y 100 0","center"] {
                assert!(!engine.cloud_touch(&format!("gcloud 2 bound {original} {action}")),"{ending}: stale {action}");
                assert_eq!(engine.clouds[2].held_shift,[0,0]);
            }
            for invalid in ["gcloud 2 bound 0 center","gcloud 2 bound -1 center","gcloud 2 bound 4294967296 center","gcloud 2 bound","gcloud 16 bound 1 center"] {assert!(!engine.cloud_touch(invalid));}
            assert!(!engine.cloud_touch(&format!("gcloud 2 bound {replacement} hold 0")));
            assert!(engine.cloud_touch(&format!("gcloud 2 bound {replacement} shiftxy -1 1 0")));
            assert_eq!(engine.clouds[2].held_shift,[-1,1]);assert_eq!(engine.undo_snapshot(),saved);
            // Adding/releasing an independent operation owner keeps the same capture.
            assert!(engine.clouds[2].hold_operation(true,0));command(&mut engine,"gcloud 2 hold 0");
            assert_eq!(engine.clouds[2].capture_id,replacement);
            assert!(engine.cloud_touch(&format!("gcloud 2 bound {replacement} center")));
            let mut another=fixture();start(&mut another);command(&mut another,"gcloud 2 96 80 80 100;gcloud 2 hold 1");
            assert_ne!(another.clouds[2].capture_id,replacement,"runtime identity cannot alias a replaced Engine");
        }
    }
    #[test] fn held_motion_records_resolved_deposits_and_replays_and_bakes_exactly() {
        let mut engine=fixture();start(&mut engine);engine.play();engine.toggle_record(2);
        command(&mut engine,"gcloud 2 touch14 96 12001 10001 110 1 4;gcloud 2 hold 1;gcloud 2 touch14 96 12001 10001 0");
        let capture=engine.clouds[2].capture_id;let mut heard=Vec::new();
        for step in 0..64 {
            if step==8 {command(&mut engine,&format!("gcloud 2 bound {capture} shiftxy -1 5000 0"));}
            if step==16 {command(&mut engine,&format!("gcloud 2 bound {capture} shiftxy 8000 2000 1"));}
            if step==24 {command(&mut engine,&format!("gcloud 2 bound {capture} center"));}
            if step==32 {command(&mut engine,"gcloud 2 hold 0");}
            heard.extend(trace(&mut engine,24).into_iter().map(|(tick,pitch,velocity,on)|(tick+step*24,pitch,velocity,on)));
        }
        engine.toggle_record(2);let points=engine.tracks[2].clips[0].cloud_points.clone();assert!(!heard.is_empty());
        for (step,x,y) in [(8,12000,15001),(16,3616,617),(24,12001,10001)] {
            assert!(points.iter().any(|point|point.step==step&&point.x==x&&point.y==y&&point.pressure_target==crate::cloud::PressureTarget::Rate));
        }
        let saved=engine.undo_snapshot();let mut restored=fixture();assert!(crate::persist::load(&mut restored,&saved));
        assert_eq!(restored.tracks[2].clips[0].cloud_points,points);assert!(!restored.clouds[2].holding());
        restored.play();assert_eq!(trace(&mut restored,1536),heard);restored.stop(&mut Vec::new());
        assert_eq!(crate::part_load::prepare_part("user",&restored.part_export(2)).unwrap().clip.cloud_points,points);
        restored.generator_bake("gbake 2 0",&mut Vec::new());restored.play();assert_eq!(trace(&mut restored,1536),heard);
    }
    #[test] fn held_motion_is_transient_bounded_and_cannot_restart_after_cancellation() {
        let mut engine=fixture();let before=engine.undo_snapshot();engine.dirty=false;start(&mut engine);
        for ending in ["gcloud 2 hold 0","gcloud 2 clear","stop","gexplore 2 off"] {
            start(&mut engine);engine.dirty=false;command(&mut engine,"gcloud 2 touch14 96 8193 10001 100;gcloud 2 hold 1;gcloud 2 shiftby x 1 1");
            assert_eq!(engine.clouds[2].held_shift,[1,0]);
            for invalid in ["gcloud 2 shiftxy 1 16384 0","gcloud 2 shiftxy 16384 1 0","gcloud 2 shiftxy 1 1 2","gcloud 2 shiftxy 1","gcloud 2 shift x 16384 0","gcloud 2 shiftby y -16384 1","gcloud 2 shift z 0 0","gcloud 2 shift x 1 2","gcloud 2 center extra","gcloud 2 shift x","gcloud 16 shift x 1 0","gcloud 1 shift x 1 0"] {assert!(!engine.cloud_touch(invalid),"{invalid}");}
            assert_eq!(engine.clouds[2].held_shift,[1,0],"rejected paired movement cannot partially change an axis");assert!(!engine.dirty,"live movement does not dirty a clip");command(&mut engine,ending);
            for message in ["gcloud 2 shiftxy 1 1 0","gcloud 2 shift x 4000 0","gcloud 2 shiftby y 1 1","gcloud 2 center"]{assert!(!engine.cloud_touch(message));}
            assert_eq!(engine.clouds[2].held_shift,[0,0]);assert!(!engine.clouds[2].holding());
            assert_eq!(engine.undo_snapshot(),before);
        }
    }
    #[test] fn precise_contacts_keep_low_bits_through_hold_record_reload_library_and_bake() {
        let mut engine=fixture();start(&mut engine);engine.play();engine.toggle_record(2);
        assert!(!engine.cloud_touch("gcloud 2 move14 96 8193 10001 80"));
        command(&mut engine,"gcloud 2 touch14 96 8193 10001 80 1;gcloud 2 touch14 113 8194 10002 90 1");
        assert_eq!(engine.clouds[2].contacts[0].point.x,8193);
        assert!(engine.cloud_view(2).starts_with("cf2|8193,10001,80;8194,10002,90|"));
        for message in ["gcloud 2 touch14 97 16384 0 100","gcloud 2 touch14 97 0 0 128","gcloud 2 touch14 97 -1 0 100","gcloud 2 move14 113 9000 10000 80 2"] {assert!(!engine.cloud_touch(message));}
        command(&mut engine,"gcloud 2 hold 1;gcloud 2 touch14 96 8193 10001 0;gcloud 2 touch14 113 8194 10002 0");
        let heard=trace(&mut engine,768);engine.toggle_record(2);
        let points=engine.tracks[2].clips[0].cloud_points.clone();
        assert!(points.iter().any(|point|point.x==8193&&point.y==10001));
        let saved=engine.undo_snapshot();assert!(saved.contains(",8193,10001,80,1,14"));
        let mut restored=fixture();assert!(crate::persist::load(&mut restored,&saved));
        assert_eq!(restored.tracks[2].clips[0].cloud_points,points);
        restored.play();assert_eq!(trace(&mut restored,768),heard);restored.stop(&mut Vec::new());
        let payload=restored.part_export(2);assert_eq!(crate::part_load::prepare_part("user",&payload).unwrap().clip.cloud_points,points);
        restored.generator_bake("gbake 2 0",&mut Vec::new());restored.play();assert_eq!(trace(&mut restored,768),heard);
        command(&mut engine,"stop");assert!(!engine.cloud_touch("gcloud 2 move14 113 9000 10000 80"));
        for malformed in ["0,16384,0,100,0,14","0,10,10,100,0,13","0,-1,10,100,0,14"]{assert!(crate::cloud::Point::parse(malformed).is_none());}
    }
    #[test] fn mixed_pressure_targets_survive_hold_record_save_recipe_replay_and_bake() {
        use crate::cloud::{Point,PressureTarget};
        let mut engine=fixture();start(&mut engine);engine.play();engine.toggle_record(2);
        command(&mut engine,"gcloud 2 touch14 96 8193 10001 35 1 1;gcloud 2 64 100 70 75 0 2;gcloud 2 0 127 64 110;gcloud 2 touch14 97 11001 9301 90 0 3;gcloud 2 112 127 80 77 1 4");
        command(&mut engine,"gcloud 2 hold 1;gcloud 2 touch14 96 8193 10001 0;gcloud 2 64 100 70 0;gcloud 2 0 127 64 0;gcloud 2 touch14 97 11001 9301 0;gcloud 2 112 127 80 0");
        let heard=trace(&mut engine,768);engine.toggle_record(2);assert!(!heard.is_empty());
        let points=engine.tracks[2].clips[0].cloud_points.clone();
        for target in [PressureTarget::Velocity,PressureTarget::Length,PressureTarget::Spread,PressureTarget::Probability,PressureTarget::Rate] {assert!(points.iter().any(|point|point.pressure_target==target));}
        let saved=engine.undo_snapshot();assert!(saved.contains(",8193,10001,35,1,14,1"));assert!(saved.contains(",12900,9030,75,0,14,2"));assert!(saved.contains(",11001,9301,90,0,14,3"));assert!(saved.contains(",16383,10320,77,1,14,4"));
        let mut restored=fixture();assert!(crate::persist::load(&mut restored,&saved));assert_eq!(restored.tracks[2].clips[0].cloud_points,points);
        restored.play();assert_eq!(trace(&mut restored,768),heard);restored.stop(&mut Vec::new());
        assert_eq!(crate::part_load::prepare_part("user",&restored.part_export(2)).unwrap().clip.cloud_points,points);
        restored.generator_bake("gbake 2 0",&mut Vec::new());restored.play();assert_eq!(trace(&mut restored,768),heard);
        for wire in ["0,40,80,100","0,40,80,100,1","0,8193,10001,80,1,14"] {
            let point=Point::parse(wire).unwrap();assert_eq!(point.pressure_target,PressureTarget::Velocity);assert_eq!(point.wire(),wire);
        }
        for malformed in ["0,10,10,100,0,14,5","0,10,10,100,0,14,-1","0,10,10,100,0,13,1","0,10,10,100,0,14,1,0"] {assert!(Point::parse(malformed).is_none());}
        for malformed in ["gcloud 2 touch14 96 0 0 80 0 5","gcloud 2 move14 96 0 0 80 0 5"] {assert!(!engine.cloud_touch(malformed));}
    }
    #[test] fn cloud_updates_cannot_reacquire_released_cleared_stopped_or_expired_contacts() {
        // Exercise each surface's ID range through the production command path.
        for id in [0,32,96,112] {
            for ending in ["up","clear","stop","explore","expire"] {
                let mut engine=fixture();start(&mut engine);let before=engine.undo_snapshot();
                let update=format!("gcloud 2 move {id} 100 80 70 1");
                assert!(!engine.cloud_touch(&update));
                command(&mut engine,&format!("gcloud 2 {id} 20 30 100 1"));
                assert!(engine.cloud_touch(&update));
                assert_eq!((engine.clouds[2].contacts[0].point.x,engine.clouds[2].contacts[0].point.pressure),(100*crate::cloud::XY_LEGACY_SCALE,70));
                match ending {
                    "up"=>command(&mut engine,&format!("gcloud 2 {id} 100 80 0 1")),
                    "clear"=>command(&mut engine,"gcloud 2 clear"),
                    "stop"=>command(&mut engine,"stop"),
                    "explore"=>command(&mut engine,"gexplore 2 off"),
                    _=>engine.advance_block(96000,&mut Vec::new()),
                }
                let pending=engine.clouds[2].pending_touches.len();
                assert!(!engine.cloud_touch(&update),"{ending}: update cannot resurrect contact {id}");
                assert!(engine.clouds[2].contacts.is_empty());assert_eq!(engine.clouds[2].pending_touches.len(),pending);
                assert_eq!(engine.undo_snapshot(),before,"cancellation and stale updates do not edit a clip");
                start(&mut engine);command(&mut engine,&format!("gcloud 2 {id} 30 40 90"));
                assert_eq!(engine.clouds[2].contacts.len(),1,"a fresh touch can start the next gesture");
            }
        }
        let mut engine=fixture();start(&mut engine);command(&mut engine,"gcloud 2 96 20 30 100");
        for message in ["gcloud 2 move","gcloud 2 move 96 20 30 100 2","gcloud 2 move move 96 20 30 100","gcloud 2 move 96 128 30 100","gcloud 16 move 96 20 30 100"]{assert!(!engine.cloud_touch(message));}
        engine.master_tick=192;assert!(!engine.cloud_touch("gcloud 2 move 96 20 30 100"),"musical lease also gates updates before the next sampler tick");
    }
    #[test] fn cloud_hold_is_transient_track_owned_and_cleared_by_stop_or_cancel() {
        let mut engine=fixture();let before=engine.undo_snapshot();engine.dirty=false;start(&mut engine);
        for message in ["gcloud 2 hold 1","gcloud 16 hold 1","gcloud 2 hold 2","gcloud 2 hold 1 extra","gcloud 1 hold 1"]{assert!(!engine.cloud_touch(message));}
        command(&mut engine,"gcloud 2 96 127 90 110;gcloud 2 96 127 90 0;gcloud 2 hold 1");
        assert!(engine.clouds[2].holding());assert!(!engine.clouds[1].holding());engine.play();
        trace(&mut engine,1536);assert!(!trace(&mut engine,384).is_empty(),"held cloud outlives contact leases and the four-beat tail");
        assert!(engine.cloud_view(2).starts_with("cf1||"),"held emitters are consequences, never physical green contacts");
        assert_eq!(engine.undo_snapshot(),before);assert!(!engine.dirty);
        command(&mut engine,"gcloud 2 clear");assert!(!engine.clouds[2].holding());assert!(engine.clouds[2].points.is_empty());
        for ending in ["gexplore 2 off","stop"] {
            start(&mut engine);command(&mut engine,"gcloud 2 96 127 90 110;gcloud 2 hold 1");assert!(engine.clouds[2].holding());
            command(&mut engine,ending);assert!(!engine.clouds[2].holding());
        }
        start(&mut engine);command(&mut engine,"gcloud 2 96 127 90 110");engine.advance_block(96000,&mut Vec::new());
        assert!(!engine.cloud_touch("gcloud 2 hold 1"),"a stale stopped contact is not a cloud to hold");
    }
    #[test] fn held_cloud_overlays_controls_record_reload_recipe_and_bake_exactly() {
        let mut engine=fixture();start(&mut engine);engine.play();engine.toggle_record(2);
        command(&mut engine,"gcloud 2 96 0 20 110 1;gcloud 2 96 127 100 110 1;gcloud 2 96 127 100 0 1;gcloud 2 hold 1");
        let mut heard=Vec::new();
        for step in 0..64 {
            if step==12 {command(&mut engine,"gexplore 2 16 127 96 71 0 127 20 80 100 80 90");}
            if step==16 {command(&mut engine,"gcloud 2 97 127 20 100");}
            if step==17 {command(&mut engine,"gcloud 2 97 127 20 0");}
            if step==32 {command(&mut engine,"gcloud 2 hold 0");}
            heard.extend(trace(&mut engine,24).into_iter().map(|(tick,pitch,velocity,on)|(tick+step*24,pitch,velocity,on)));
        }
        engine.toggle_record(2);let points=engine.tracks[2].clips[0].cloud_points.clone();
        assert!(points.iter().any(|point|point.step==31));assert!(points.iter().all(|point|point.step<32));
        assert_eq!(engine.tracks[2].lane_assigned.iter().filter(|assigned|**assigned).count(),8);
        let saved=engine.undo_snapshot();let mut restored=fixture();assert!(crate::persist::load(&mut restored,&saved));assert!(!restored.clouds[2].holding());
        restored.play();assert_eq!(trace(&mut restored,1536),heard);
        restored.stop(&mut Vec::new());let payload=restored.part_export(2);
        assert_eq!(crate::part_load::prepare_part("user",&payload).unwrap().clip.cloud_points,points);
        restored.generator_bake("gbake 2 0",&mut Vec::new());restored.play();assert_eq!(trace(&mut restored,1536),heard);
    }
    #[test] fn cloud_multitouch_live_does_not_change_set_and_contacts_expire() {
        let mut engine=fixture();let before=engine.undo_snapshot();engine.dirty=false;start(&mut engine);
        command(&mut engine,"gcloud 2 0 127 20 100;gcloud 2 1 127 100 100");engine.play();
        assert!(!trace(&mut engine,192).is_empty());
        assert_eq!(engine.undo_snapshot(),before);assert!(!engine.dirty);
        assert!(trace(&mut engine,768).iter().any(|event|!event.3));
        assert!(engine.clouds[2].contacts.is_empty());assert!(engine.clouds[2].points.is_empty());assert!(engine.gates.is_empty());
        assert!(trace(&mut engine,384).is_empty());
    }
    fn recorded_stroke_roundtrip(rate_strokes:bool) {
        let mut engine=fixture();start(&mut engine);engine.play();engine.toggle_record(2);
        let mut recorded=Vec::new();
        for step in 0..32 {
            if step<16 {command(&mut engine,&format!("gcloud 2 0 127 {} 110",step*8));command(&mut engine,&format!("gcloud 2 1 {} {} 100{}",if rate_strokes {step*8}else{90},127-step*8,if rate_strokes {" 1"}else{""}));}
            else {command(&mut engine,"gcloud 2 0 0 0 0;gcloud 2 1 0 0 0");}
            if step==12 {command(&mut engine,"gexplore 2 16 127 96 71 0 127 20 80 100 80 90");}
            recorded.extend(trace(&mut engine,24).into_iter().map(|(tick,pitch,velocity,on)|(tick+step*24,pitch,velocity,on)));
        }
        engine.toggle_record(2);
        assert!(!recorded.is_empty());assert!(engine.tracks[2].clips[0].cloud_field);assert!(!engine.tracks[2].clips[0].cloud_points.is_empty());
        assert_eq!(engine.tracks[2].lane_assigned.iter().filter(|assigned|**assigned).count(),8);
        assert!(engine.tracks[2].clips[0].cloud_points.iter().any(|point|point.activity==crate::cloud::Activity::Probability));
        assert_eq!(engine.tracks[2].clips[0].cloud_points.iter().any(|point|point.activity==crate::cloud::Activity::Rate),rate_strokes);
        let saved=engine.undo_snapshot();let mut restored=fixture();assert!(crate::persist::load(&mut restored,&saved));
        restored.play();assert_eq!(trace(&mut restored,768),recorded,"accepted stroke and control automation must reproduce the take");
        restored.stop(&mut Vec::new());let payload=restored.part_export(2);assert!(!payload.starts_with("error:"),"{payload}");
        let preset=crate::part_load::prepare_part("user",&payload).unwrap();assert_eq!(preset.clip.cloud_points,restored.tracks[2].clips[0].cloud_points);
        restored.generator_bake("gbake 2 0",&mut Vec::new());assert_eq!(restored.generator_result,"Baked - Undo available");
        restored.play();assert_eq!(trace(&mut restored,768),recorded,"Bake must retain the same abstract mapped notes");
        assert!(restored.undo_restore(&saved));assert!(restored.tracks[2].clips[0].generator.is_some());
    }
    #[test] fn cloud_recorded_strokes_controls_reload_library_and_bake_replay() {recorded_stroke_roundtrip(false);}
    #[test] fn cloud_mixed_rate_probability_strokes_controls_reload_library_and_bake_replay() {recorded_stroke_roundtrip(true);}
    #[test] fn cloud_fast_swipes_between_ticks_record_reload_and_bake_exactly() {
        let mut engine=fixture();start(&mut engine);engine.play();engine.toggle_record(2);
        let mut heard=Vec::new();
        for step in 0..32 {
            if step<8 {command(&mut engine,&format!("gcloud 2 96 0 {} 100 {};gcloud 2 move 96 127 {} 120 {};gcloud 2 96 127 {} 0",step*16,step%2,step*16,step%2,step*16));}
            heard.extend(trace(&mut engine,24).into_iter().map(|(tick,pitch,velocity,on)|(tick+step*24,pitch,velocity,on)));
        }
        engine.toggle_record(2);let points=engine.tracks[2].clips[0].cloud_points.clone();
        assert_eq!(points.len(),64);assert!(points.iter().any(|point|point.x>0&&point.x<crate::cloud::XY_MAX));
        let saved=engine.undo_snapshot();let mut restored=fixture();assert!(crate::persist::load(&mut restored,&saved));
        restored.play();assert_eq!(trace(&mut restored,768),heard);
        restored.stop(&mut Vec::new());let payload=restored.part_export(2);
        assert_eq!(crate::part_load::prepare_part("user",&payload).unwrap().clip.cloud_points,points);
        restored.generator_bake("gbake 2 0",&mut Vec::new());restored.play();assert_eq!(trace(&mut restored,768),heard);
    }
    #[test] fn cloud_rate_axis_selects_clocked_subdivisions_and_respects_rate_ceiling() {
        use crate::cloud::{Activity,Point};
        let mut config=crate::generator::Config::parse("16 127 96 71 0 127 50 64 0 64 0").unwrap();
        let attacks=|config,x| (0..32).filter(|step|!crate::cloud::notes(config,*step,&[Point::legacy(i32::from(*step),x,64,127,Activity::Rate)],true).is_empty()).collect::<Vec<_>>();
        assert_eq!(attacks(config,0),vec![0,8,16,24]);
        assert_eq!(attacks(config,127),(0..32).collect::<Vec<_>>());
        config.cloud[0]=48; // Fastest is a quarter note; intermediate is dotted quarter.
        assert_eq!(attacks(config,127),(0..32).step_by(4).collect::<Vec<_>>());
        assert_eq!(attacks(config,60),vec![0,6,12,18,24,30],"dotted subdivisions must not be gated by the faster quarter-note clock");
        let legacy=Point::parse("0,40,80,100").unwrap();assert_eq!(legacy.activity,Activity::Probability);assert_eq!(legacy.wire(),"0,40,80,100");
        let rate=Point::parse("0,40,80,100,1").unwrap();assert_eq!(rate.activity,Activity::Rate);assert_eq!(Point::parse(&rate.wire()),Some(rate));
        for malformed in ["0,40,80,100,2","0,40,80,100,-1","0,40,80,100,1,0"]{assert!(Point::parse(malformed).is_none());}
    }
    #[test] fn cloud_controls_need_eight_lanes_before_record_changes_anything() {
        let mut engine=fixture();engine.auto_label(2,7,"synth:cutoff");start(&mut engine);let before=engine.undo_snapshot();engine.toggle_record(2);
        assert_eq!(engine.undo_snapshot(),before);assert!(!engine.recording);assert!(!engine.pending_rec);
    }
    #[test] fn cloud_legacy_config_and_malformed_touch_are_safe() {
        assert_eq!(crate::generator::Config::parse("0 32 64 1").unwrap().wire(),"0 32 64 1 0");
        assert!(crate::generator::Config::parse("16 127 96 1 0 128 64 64 64 64 64").is_none());
        let mut engine=fixture();start(&mut engine);
        for message in ["gcloud 16 0 0 0 127","gcloud 2 128 0 0 127","gcloud 2 0 -1 0 127","gcloud 2 0 0 0 128","gcloud 2 0 0 0 127 2","gcloud 2 0 0 0 127 1 5","gcloud 2 0 0 0 127 1 0 0"]{assert!(!engine.cloud_touch(message));}
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
            if (12..16).contains(&step){command(&mut engine,"gcloud 2 1 80 120 127 1");}
            else {command(&mut engine,"gcloud 2 1 80 120 0 1");}
            heard.extend(trace(&mut engine,24).into_iter().map(|(tick,pitch,vel,on)|(tick+step*24,pitch,vel,on)));
        }
        engine.toggle_record(2);engine.stop(&mut Vec::new());
        assert_eq!(engine.tracks[2].clips[0].cloud_points.iter().filter(|point|point.step<12).copied().collect::<Vec<_>>(),original.iter().filter(|point|point.step<12).copied().collect::<Vec<_>>());
        let saved=engine.undo_snapshot();assert_ne!(before,saved);
        let mut restored=fixture();assert!(crate::persist::load(&mut restored,&saved));restored.play();assert_eq!(trace(&mut restored,768),heard);
        assert!(engine.undo_restore(&before));assert_eq!(engine.tracks[2].clips[0].cloud_points,original);
    }
}
