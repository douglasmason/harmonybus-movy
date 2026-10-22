#[cfg(test)]
mod source_gesture_tests {
    use super::*;
    fn interval(operation:u8,amount:i32)->crate::recorded_actions::Interval {
        crate::recorded_actions::Interval{start:0,length:48,origin:0,age:0,lane:0,operation,amount,grid:6}
    }
    fn setup(donor:usize)->Engine {
        let mut engine=Engine::new(48000,12000);engine.playing=true;
        for track in [donor,3] {engine.tracks[track].playing_slot=Some(0);engine.tracks[track].clips[0].set_loop(0,16);}
        engine.tracks[3].clips[0].add_note_raw(0,0,2,60,100);
        engine.tracks[donor].clips[0].operation_intervals.push(interval(12,1));
        assert!(engine.source_route_set(&format!("3 1 -1 -1 -1 -1 0 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 {donor} 0")));
        engine
    }
    fn tick(engine:&mut Engine)->Vec<OutEvent>{let mut output=Vec::new();engine.advance_block(250,&mut output);output}
    fn attacks(events:&[OutEvent])->usize {events.iter().filter(|event|matches!(event,OutEvent::NoteOn{track:3,..})).count()}
    #[test]
    fn borrowed_repeat_drives_existing_scheduler_in_both_track_orders() {
        for donor in [0,4] {
            let mut engine=setup(donor);let mut events=Vec::new();
            for _ in 0..49 {events.extend(tick(&mut engine));}
            assert_eq!(attacks(&events),8);
            engine.stop(&mut events);
            assert_eq!(events.iter().filter(|event|matches!(event,OutEvent::NoteOff{track:3,pitch:60})).count(),8);
            assert!(engine.tracks[donor].clips[0].notes.is_empty());
        }
    }
    #[test]
    fn independent_donor_clock_and_relaunch_select_recorded_age() {
        for donor in [0,4] {
            let mut engine=setup(donor);engine.tracks[donor].clips[0].scale_num=2;
            let counts:Vec<_>=(0..7).map(|_|attacks(&tick(&mut engine))).collect();
            assert_eq!(counts,vec![1,0,0,1,0,0,1]);
            engine.tracks[donor].pos_tick=0;
            assert_eq!(attacks(&tick(&mut engine)),1);
            engine.tracks[donor].pos_tick=48;
            assert_eq!(attacks(&tick(&mut engine)),0);
        }
    }
    #[test]
    fn availability_off_and_recording_restore_own_but_empty_donor_does_not() {
        for change in 0..7 {
            let mut engine=setup(0);
            engine.tracks[3].clips[0].operation_intervals.push(interval(14,1));
            tick(&mut engine);
            match change {0=>engine.tracks[0].muted=true,1=>engine.tracks[0].playing_slot=None,
                2=>engine.tracks[0].clips[0].clear(),3=>{engine.recording=true;engine.rec_track=3;},
                4=>{engine.source_route_set("3 0 -1 -1 -1 -1 0");},
                5=>{engine.source_route_set("3 1 -1 -1 -1 -1 0");},
                _=>engine.tracks[0].clips[0].operation_intervals.clear()}
            tick(&mut engine);
            let window=engine.source_gesture_window(3,0,2);
            if change==6 {assert!(window.is_none());} else {assert_eq!(window.unwrap().first,8);}
        }
    }
    #[test]
    fn raw_intervals_use_donor_age_and_actor_loop_coordinates() {
        let mut engine=setup(0);
        engine.tracks[0].clips[0].set_loop(8,16);
        engine.tracks[3].clips[0].set_loop(4,8);
        let donor_start=engine.tracks[0].clips[0].loop_start_ticks();
        let actor_start=engine.tracks[3].clips[0].loop_start_ticks();
        let actor_span=engine.tracks[3].clips[0].length_ticks();
        engine.source_playing_slots[0]=Some(0);engine.source_positions[0]=donor_start+3;
        let recorded=&mut engine.tracks[0].clips[0].operation_intervals[0];
        recorded.start=donor_start;recorded.origin=donor_start+actor_span+12;recorded.age=6;
        let window=engine.source_gesture_window(3,0,actor_start+40).unwrap();
        assert_eq!(window.first,actor_start+15);assert_eq!(window.start,actor_start);assert_eq!(window.span,actor_span);
        for (operation,amount,first,count,reverse) in [(13,1,actor_start+40,1,true),(14,-1,actor_start+34,1,false),(15,2,actor_start+30,2,false),(15,-2,actor_start+16,0,false)] {
            engine.tracks[0].clips[0].operation_intervals[0].operation=operation;
            engine.tracks[0].clips[0].operation_intervals[0].amount=amount;
            let window=engine.source_gesture_window(3,0,actor_start+40).unwrap();
            assert_eq!((window.first,window.count,window.reverse),(first,count,reverse));
        }
        // A donor's own route cannot redirect raw interval reads.
        assert!(engine.source_route_set("0 1 -1 -1 -1 -1 0 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 3 0"));
        assert_eq!(engine.source_gesture_window(3,0,actor_start+40).unwrap().speed_den,2);
    }
    #[test]
    fn live_and_grid_reader_priority_remains_above_borrowed_recordings() {
        for live in [true,false] {
            let mut engine=setup(0);
            // Time shift hides the actor onset that the borrowed repeat would read.
            if live {engine.hb_performance[3].hold(0,true,14,1,0,0,0);}
            else {
                engine.tracks[3].clips[0].grid_gates.push(crate::grid::Gate{start:0,end:48,lane:0});
                engine.grid_configs[3][0]=Some(crate::hb_clip_performance::AutoConfig{operation:14,amount:1,grid:0,cycle:0,every:1,from:1,through:1,probability:100,evolve:false});
            }
            assert_eq!(attacks(&tick(&mut engine)),0);
        }
    }
    #[test]
    fn foreign_rhythm_keeps_attacks_and_release_ownership() {
        let mut engine=setup(0);
        engine.tracks[2].playing_slot=Some(0);engine.tracks[2].clips[0].set_loop(0,16);
        engine.tracks[2].clips[0].add_note_raw(0,0,8,36,100);
        engine.tracks[3].clips[0].scale_num=2;
        engine.source_routes[3].rhythm=Some(crate::source_route::ClipRef{track:2,slot:0});
        assert_eq!(attacks(&tick(&mut engine)),1);
        engine.tracks[0].muted=true;
        for _ in 1..8 {let events=tick(&mut engine);assert_eq!(attacks(&events),0);assert!(!events.contains(&OutEvent::NoteOff{track:3,pitch:60}));}
        assert!(tick(&mut engine).contains(&OutEvent::NoteOff{track:3,pitch:60}));
    }
    #[test]
    fn launch_snapshot_save_undo_and_legacy_routes() {
        let mut engine=setup(0);tick(&mut engine);
        engine.tracks[0].playing_slot=None;
        assert!(engine.source_gesture_window(3,0,1).is_some());
        tick(&mut engine);assert!(engine.source_gesture_window(3,0,2).is_none());
        let saved=crate::persist::serialize(&engine);let mut restored=Engine::new(48000,12000);
        assert!(crate::persist::load(&mut restored,&saved));assert_eq!(restored.source_routes,engine.source_routes);
        let mut events=Vec::new();crate::command::apply_batch(&mut engine,"usnap 1;source 3 1 -1 -1 -1 -1 0;uswap 1 2",&mut events);
        assert_eq!(engine.source_routes[3],restored.source_routes[3]);
        for count in [7,9,11,13,15,17] {
            let legacy=engine.source_routes[3].message(3).split_whitespace().take(count).collect::<Vec<_>>().join(" ");
            assert!(restored.source_route_set(&legacy));assert_eq!(restored.source_routes[3].gestures,None);
        }
        assert!(crate::source_route::Route::parse("3 1 -1 -1 -1 -1 0 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 16 0").is_none());
    }
    #[test]
    #[ignore = "isolated release-mode timing measurement, not a hardware audio assertion"]
    fn source_routing_benchmark_gestures() {
        for interval_count in [0,4096] {
            let mut engine=setup(0);
            let mut inactive=interval(12,1);inactive.start=6144;
            engine.tracks[0].clips[0].operation_intervals=vec![inactive;interval_count];
            for actor in 1..NUM_TRACKS {
                engine.tracks[actor].playing_slot=Some(0);engine.tracks[actor].clips[0].set_loop(0,16);
                engine.source_routes[actor]=engine.source_routes[3];
            }
            let mut output=Vec::with_capacity(4096);let started=std::time::Instant::now();
            for _ in 0..10_000 {engine.advance_block(250,&mut output);output.clear();}
            println!("source-gestures actors=15 intervals={interval_count} ticks=10000 elapsed_us={}",started.elapsed().as_micros());
        }
    }

}
