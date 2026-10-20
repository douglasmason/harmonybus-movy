#[cfg(test)]
mod pressure_recording_tests {
    use super::*;

    #[test]
    fn records_independent_curves_roundtrips_and_replays_before_release() {
        let mut engine=Engine::new(48000,12000);
        engine.tracks[0].active_mut().set_loop(0,16);
        engine.tracks[0].muted=false;
        engine.recording=true;
        engine.rec_track=0;
        engine.tracks[0].pos_tick=10;
        engine.live_note_on(0,60,100);
        engine.live_note_on(0,64,90);
        engine.live_poly_pressure(0,60,30);
        engine.live_poly_pressure(0,64,80);
        engine.tracks[0].pos_tick=34;
        engine.live_poly_pressure(0,60,70);
        engine.live_poly_pressure(0,60,75); // same tick: latest value
        engine.live_poly_pressure(0,65,120); // no owner
        engine.live_poly_pressure(1,60,120); // wrong track
        engine.tracks[0].pos_tick=58;
        engine.live_note_off(0,60);
        engine.live_note_off(0,64);
        engine.live_poly_pressure(0,60,127); // released: ignored
        let notes=&engine.tracks[0].active().notes;
        assert_eq!(notes[0].pressure,vec![(0,30),(24,75)]);
        assert_eq!(notes[1].pressure,vec![(0,80)]);
        let state=crate::persist::serialize(&engine);
        let mut replay=Engine::new(48000,12000);
        crate::persist::load(&mut replay,&state);
        assert_eq!(replay.tracks[0].active().notes[0].pressure,notes[0].pressure);
        replay.tracks[0].playing_slot=Some(0);
        replay.tracks[0].active_mut().transpose=2;
        replay.tracks[0].active_mut().quant=100; // onset 10 -> 0; pressure follows it
        let mut output=Vec::new();
        for pass in 0..2 {
            for tick in 0..384 {
                output.clear();
                replay.step_tick(0,&mut output);
                if tick==0 {
                    let on=output.iter().position(|event|matches!(event,OutEvent::NoteOn{pitch:62,..})).unwrap();
                    let pressure=output.iter().position(|event|matches!(event,OutEvent::PolyPressure{pitch:62,value:30,..})).unwrap();
                    assert!(on<pressure,"pass {pass}: note must own pressure first");
                }
                if tick==24 { assert!(output.contains(&OutEvent::PolyPressure{track:0,pitch:62,value:75})); }
                if tick>=48 { assert!(!output.iter().any(|event|matches!(event,OutEvent::PolyPressure{..}))); }
            }
        }
        replay.copy_steps(0,0,1);
        replay.paste_steps(0,4);
        assert!(replay.tracks[0].active().notes.iter().any(|note|note.step==4&&note.pressure==vec![(0,30),(24,75)]));
        let mut legacy=Engine::new(48000,12000);
        crate::persist::load(&mut legacy,"movy1\ncl 0 0 16 0 0:48:60:100:0\n");
        assert!(legacy.tracks[0].active().notes[0].pressure.is_empty());
    }

    #[test]
    fn held_pressure_crosses_wrap_and_recording_tail() {
        let mut engine=Engine::new(48000,12000);
        engine.tracks[0].active_mut().set_loop(0,16);
        engine.recording=true;
        engine.rec_track=0;
        engine.tracks[0].pos_tick=370;
        engine.live_note_on(0,60,100);
        engine.tracks[0].pos_tick=5;
        engine.tracks[0].cycle+=1;
        engine.live_poly_pressure(0,60,42);
        engine.tracks[0].pos_tick=20;
        engine.live_note_off(0,60);
        assert_eq!(engine.tracks[0].active().notes[0].pressure,vec![(19,42)]);
        engine.tracks[0].pos_tick=40;
        engine.live_note_on(0,64,100);
        engine.toggle_record(0); // held note becomes a recording tail
        engine.tracks[0].pos_tick=45;
        engine.live_poly_pressure(0,64,65);
        engine.tracks[0].pos_tick=60;
        engine.live_note_off(0,64);
        assert_eq!(engine.tracks[0].active().notes[1].pressure,vec![(5,65)]);
    }
}
