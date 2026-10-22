#[cfg(test)]
mod source_grid_tests {
    use super::*;
    fn setup(donor:usize)->Engine {
        let mut engine=Engine::new(48000,12000);engine.playing=true;
        for track in [donor,2,3] {engine.tracks[track].playing_slot=Some(0);engine.tracks[track].clips[0].set_loop(0,16);}
        engine.tracks[2].clips[0].add_note_raw(0,0,48,36,100);
        engine.tracks[3].clips[0].add_note_raw(0,0,48,60,100);
        engine.tracks[donor].clips[0].grid_gates.push(crate::grid::Gate{start:0,end:8,lane:1});
        engine.tracks[3].clips[0].grid_gates.push(crate::grid::Gate{start:0,end:96,lane:0});
        assert!(engine.source_route_set(&format!("3 1 -1 -1 2 0 0 -1 -1 -1 -1 -1 -1 -1 -1 {donor} 0")));engine
    }
    fn tick(engine:&mut Engine)->Vec<OutEvent>{let mut output=Vec::new();engine.advance_block(250,&mut output);output}
    fn mask(value:u16)->OutEvent{OutEvent::GridMask{track:3,mask:value}}
    #[test]
    fn donor_edges_precede_attacks_regardless_of_track_order() {
        for donor in [0,4] {
            let mut engine=setup(donor);let output=tick(&mut engine);
            assert!(output.iter().position(|event|*event==mask(2)).unwrap()<output.iter().position(|event|matches!(event,OutEvent::NoteOn{track:3,..})).unwrap());
            for _ in 1..8 {assert!(!tick(&mut engine).contains(&mask(0)));}
            assert!(tick(&mut engine).contains(&mask(0)));
            assert_eq!(engine.grid_masks[3],0);
        }
    }
    #[test]
    fn faster_donor_releases_during_rests_on_slow_actor() {
        let mut engine=setup(0);engine.tracks[0].clips[0].scale_num=2;engine.tracks[3].clips[0].scale_den=4;
        tick(&mut engine);
        for _ in 1..4 {assert!(!tick(&mut engine).contains(&mask(0)));}
        assert!(tick(&mut engine).contains(&mask(0)));
    }
    #[test]
    fn availability_and_recording_restore_actor_holds_without_releasing_notes() {
        for change in 0..6 {
            let mut engine=setup(0);tick(&mut engine);
            match change {0=>engine.tracks[0].muted=true,1=>engine.tracks[0].playing_slot=None,
                2=>engine.tracks[0].clips[0].clear(),3=>{engine.recording=true;engine.rec_track=3;},
                4=>{engine.source_route_set("3 0 -1 -1 2 0 0");},_=>{engine.source_route_set("3 1 -1 -1 2 0 0");}}
            let output=tick(&mut engine);assert!(output.contains(&mask(1)),"change {change}: {output:?}");
            assert!(!output.contains(&OutEvent::NoteOff{track:3,pitch:60}));
        }
    }
    #[test]
    fn empty_donor_mute_stop_and_relaunch_clear_and_reacquire_holds() {
        let mut engine=setup(0);tick(&mut engine);
        engine.tracks[3].muted=true;assert!(tick(&mut engine).contains(&mask(0)));
        engine.tracks[3].muted=false;assert!(tick(&mut engine).contains(&mask(2)));
        engine.tracks[0].clips[0].grid_gates.clear();assert!(tick(&mut engine).contains(&mask(0)));
        engine.tracks[0].clips[0].grid_gates.push(crate::grid::Gate{start:0,end:8,lane:1});
        engine.tracks[0].pos_tick=0;assert!(tick(&mut engine).contains(&mask(2)));
        let mut output=Vec::new();engine.stop(&mut output);assert!(output.contains(&mask(0)));assert!(output.contains(&OutEvent::NoteOff{track:3,pitch:60}));
    }
    #[test]
    fn holds_read_raw_donor_and_keep_destination_clip_reader_owner() {
        let mut engine=setup(0);engine.source_route_set("0 1 -1 -1 -1 -1 0 -1 -1 -1 -1 -1 -1 -1 -1 3 0");
        engine.grid_configs[3][1]=Some(crate::hb_clip_performance::AutoConfig{operation:12,amount:1,grid:2,cycle:0,every:1,from:1,through:1,probability:100,evolve:false});
        tick(&mut engine);assert_eq!(engine.grid_masks[3],2);
        let gesture=engine.grid_performance[3].slots[1].unwrap();assert_eq!(gesture.clip,0);assert_eq!(gesture.origin,0);
        let mut output=Vec::new();engine.grid_tick(3,&mut output);assert_eq!(engine.grid_performance[3].slots[1].unwrap().age,gesture.age);
        assert!(output.is_empty());
    }
    #[test]
    fn grid_route_save_undo_and_legacy_compatibility() {
        let mut engine=setup(0);let saved=crate::persist::serialize(&engine);
        let mut restored=Engine::new(48000,12000);assert!(crate::persist::load(&mut restored,&saved));assert_eq!(restored.source_routes,engine.source_routes);
        let mut output=Vec::new();crate::command::apply_batch(&mut engine,"usnap 1;source 3 1 -1 -1 2 0 0;uswap 1 2",&mut output);
        assert_eq!(engine.source_routes[3],restored.source_routes[3]);
        for count in [7,9,11,13,15] {
            let legacy=engine.source_routes[3].message(3).split_whitespace().take(count).collect::<Vec<_>>().join(" ");
            assert!(restored.source_route_set(&legacy));assert_eq!(restored.source_routes[3].grid_holds,None);
        }
    }
}
