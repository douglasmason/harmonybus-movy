#[cfg(test)] mod variation_playback_tests {
    use super::*;
    fn fixture() -> Engine {
        let mut engine=Engine::new(48000,12000);
        for track in 0..4 { for tick in (0..384).step_by(24) { for pitch in [60,64,67] {
            engine.tracks[track].active_mut().add_note_raw((tick/24) as u16,tick,18,pitch,90);
        }}}
        engine.follower_input_context("fic1,0,1,14");
        engine
    }
    fn trace(engine: &mut Engine, count: usize) -> Vec<(usize,u8,u8,u8,bool)> {
        let mut trace=Vec::new();
        for tick in 0..count { let mut events=Vec::new();engine.service_tick(&mut events);
            for event in events { match event {
                OutEvent::NoteOn{track,pitch,vel}=>trace.push((tick,track,pitch,vel,true)),
                OutEvent::NoteOff{track,pitch}=>trace.push((tick,track,pitch,0,false)),_=>{}
            }}
        }
        trace
    }
    #[test] fn zero_is_exact_and_saved_variation_repeats_without_editing_notes() {
        let mut plain=fixture();let mut varied=fixture();
        assert!(varied.variation_set("1 0 100 100 100 45"));
        plain.play();varied.play();assert_eq!(trace(&mut plain,768),trace(&mut varied,768));
        let mut varied=fixture();let original=varied.tracks[1].active().notes.clone();
        varied.variation_set("1 100 60 50 35 45");
        let saved=crate::persist::serialize(&varied);
        let mut restored=Engine::new(48000,12000);assert!(crate::persist::load(&mut restored,&saved));
        assert_eq!(varied.variations,restored.variations);
        restored.follower_input_context("fic1,0,1,14");varied.play();restored.play();
        let output=trace(&mut varied,768);assert_eq!(output,trace(&mut restored,768));
        let first:Vec<_>=output.iter().filter(|event|event.1==1&&event.4&&event.0<384).map(|event|(event.0,event.2,event.3)).collect();
        let second:Vec<_>=output.iter().filter(|event|event.1==1&&event.4&&event.0>=384).map(|event|(event.0-384,event.2,event.3)).collect();
        assert_eq!(first,second);assert!(first.len()<48);assert!(first.iter().any(|event|event.2!=90));
        for (before,after) in original.iter().zip(&varied.tracks[1].active().notes) {
            assert_eq!((before.tick,before.pitch,before.vel,before.gate),(after.tick,after.pitch,after.vel,after.gate));
        }
        let ons=output.iter().filter(|event|event.4).count();
        let offs=output.iter().filter(|event|!event.4).count();assert_eq!(ons,offs);
        varied.stop(&mut Vec::new());assert!(varied.gates.is_empty());
    }
    #[test] fn reroll_waits_for_bar_and_conductors_are_unchanged() {
        let mut engine=fixture();engine.variation_set("0 100 100 100 100 42");
        let mut plain=fixture();engine.play();plain.play();
        assert_eq!(trace(&mut engine,24),trace(&mut plain,24));
        engine.variation_set("1 100 50 30 0 2");assert_eq!(engine.variation_seeds[1],1);
        trace(&mut engine,360);assert_eq!(engine.variation_seeds[1],1);
        trace(&mut engine,1);assert_eq!(engine.variation_seeds[1],2);
        assert!(!engine.variation_set("1 101 50 30 0 2"));
        assert!(!engine.variation_set("16 50 50 30 0 2"));
        let (_,config)=crate::variation::Variation::parse("1 100 0 0 100 1").unwrap();
        assert_eq!(config.apply(123,90,24,true),Some((90,24)));
        assert_eq!(config.apply(123,90,24,false),None);
    }
    #[test] fn source_weaving_uses_destination_variation_once() {
        let mut engine=fixture();
        engine.source_route_set("1 1 2 0 3 0 1 -1 -1 -1 -1");
        engine.variation_set("1 100 50 40 0 5");
        engine.play();let events=trace(&mut engine,384);
        let actor:Vec<_>=events.iter().filter(|event|event.1==1&&event.4).collect();
        assert_eq!(actor.len(),48);assert!(actor.iter().any(|event|event.3!=90));
        for group in actor.chunks(3) { assert!(group.iter().all(|event|event.0==group[0].0&&event.3==group[0].3)); }
        assert_eq!(events.iter().filter(|event|event.1==1&&!event.4).count(),48);
    }
    #[test] fn recording_bypasses_variation_and_undo_restores_settings() {
        let mut engine=fixture();let mut plain=fixture();
        let saved=crate::persist::serialize(&engine);
        engine.variation_set("1 100 100 100 100 13");
        engine.play();plain.play();
        engine.recording=true;engine.rec_track=1;plain.recording=true;plain.rec_track=1;
        assert_eq!(trace(&mut engine,384),trace(&mut plain,384));
        engine.stop(&mut Vec::new());
        assert!(crate::persist::load(&mut engine,&saved));
        assert_eq!(engine.variations,[Default::default();NUM_TRACKS]);
    }
}
