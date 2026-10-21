#[cfg(test)]
mod source_hb_tests {
    use super::*;
    fn setup(donor:usize)->Engine {
        let mut engine=Engine::new(48000,12000);engine.playing=true;
        for track in [0,1,2,3,donor] {engine.tracks[track].playing_slot=Some(0);engine.tracks[track].clips[0].set_loop(0,16);}
        engine.tracks[2].clips[0].add_note_raw(0,0,48,36,100);
        engine.tracks[3].clips[0].add_note_raw(0,0,48,60,100);
        for (track,lane,label,base,value) in [(0,5,"synth:cutoff",11,90),(3,1,"synth:cutoff",12,20),
            (donor,6,"midi_fx1:render_velocity_percent",32,127),(3,2,"midi_fx1:render_velocity_percent",32,64)] {
            engine.auto_label(track,lane,label);engine.tracks[track].lane_base[lane]=base;
            engine.tracks[track].clips[0].set_lock(lane as u8,0,value);
        }
        engine.source_route_set(&format!("3 1 -1 -1 2 0 0 -1 -1 0 0 {donor} 0"));engine
    }
    fn tick(engine:&mut Engine)->Vec<OutEvent>{let mut output=Vec::new();engine.advance_block(250,&mut output);output}
    fn hb(value:u8)->OutEvent{OutEvent::Cc{track:3,lane:2,val:value}}
    #[test]
    fn independent_render_and_instrument_donors_precede_notes() {
        for donor in [1,4] {
            let mut engine=setup(donor);let output=tick(&mut engine);
            let attack=output.iter().position(|event|matches!(event,OutEvent::NoteOn{track:3,..})).unwrap();
            for event in [hb(127),OutEvent::Cc{track:3,lane:1,val:90}] {assert!(output.iter().position(|item|*item==event).unwrap()<attack);}
            engine.tracks[donor].muted=true;
            let output=tick(&mut engine);assert!(output.contains(&hb(64)));
            assert_eq!(engine.tracks[3].auto_cur[1],90);
        }
    }
    #[test]
    fn render_clock_advances_during_rests_without_destination_speed_dependency() {
        let mut engine=setup(1);engine.tracks[1].clips[0].scale_num=2;engine.tracks[3].clips[0].scale_den=4;
        engine.tracks[1].clips[0].set_lock(6,1,80);
        tick(&mut engine);
        for position in 1..=12 {assert_eq!(tick(&mut engine).contains(&hb(80)),position==12);}
    }
    #[test]
    fn unsafe_parameters_are_not_part_of_render_routing() {
        use crate::source_route::automation_dimension;
        for label in ["midi_fx1:master_transpose","midi_fx1:key_center_apply","midi_fx1:parallel_scale","midi_fx1:track_role",
            "midi_fx1:render_channel","midi_fx1:motion_hold_1","midi_fx1:motion_enabled","midi_fx1:arp_clear","midi_fx1:arp_hold",
            "midi_fx1:arp_playback","midi_fx1:chord_mode","midi_fx1:unknown","midi_fx2:chord_form"] {assert_eq!(automation_dimension(label),None,"{label}");}
        let mut engine=setup(1);
        engine.auto_label(1,7,"midi_fx1:motion_hold_1");engine.auto_label(3,7,"midi_fx1:motion_hold_1");
        engine.tracks[1].clips[0].set_lock(7,0,127);engine.tracks[3].clips[0].set_lock(7,0,0);
        let output=tick(&mut engine);assert!(!output.contains(&OutEvent::Cc{track:3,lane:7,val:127}));
    }
    #[test]
    fn render_source_switch_and_stop_keep_releases_and_restore_values() {
        let mut engine=setup(1);tick(&mut engine);
        engine.tracks[4].playing_slot=Some(0);engine.tracks[4].clips[0].set_loop(0,16);
        engine.auto_label(4,0,"midi_fx1:render_velocity_percent");engine.tracks[4].clips[0].set_lock(0,0,80);
        engine.source_route_set("3 1 -1 -1 2 0 0 -1 -1 0 0 4 0");
        let output=tick(&mut engine);assert!(output.contains(&hb(80)));assert!(!output.contains(&OutEvent::NoteOff{track:3,pitch:60}));
        engine.tracks[4].playing_slot=None;assert!(tick(&mut engine).contains(&hb(64)));
        let mut output=Vec::new();engine.stop(&mut output);assert!(output.contains(&hb(32)));assert!(output.contains(&OutEvent::NoteOff{track:3,pitch:60}));
    }
    #[test]
    fn render_actor_mute_record_and_legacy_load_restore_own_ownership() {
        let mut engine=setup(1);tick(&mut engine);engine.tracks[3].muted=true;
        assert!(tick(&mut engine).contains(&hb(32)));
        engine.tracks[3].clips[0].set_lock(2,1,120);
        for _ in 2..=25 {assert!(!tick(&mut engine).contains(&hb(120)));}
        engine.tracks[3].muted=false;assert!(tick(&mut engine).contains(&hb(127)));
        engine.recording=true;engine.rec_track=3;assert!(tick(&mut engine).contains(&hb(120)));
        let saved=crate::persist::serialize(&engine);
        let mut restored=Engine::new(48000,12000);assert!(crate::persist::load(&mut restored,&saved));assert_eq!(restored.source_routes,engine.source_routes);
        for legacy in ["3 1 -1 -1 2 0 0","3 1 -1 -1 2 0 0 -1 -1","3 1 -1 -1 2 0 0 -1 -1 0 0"] {assert!(engine.source_route_set(legacy));assert_eq!(engine.source_routes[3].hb_render,None);}
        let previous=engine.source_routes;
        for invalid in ["3 1 -1 -1 2 0 0 -1 -1 0 0 16 0","3 1 -1 -1 2 0 0 -1 -1 0 0 -1 0"] {assert!(!engine.source_route_set(invalid));assert_eq!(engine.source_routes,previous);}
    }
}
