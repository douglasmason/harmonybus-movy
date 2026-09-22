
#[cfg(test)] mod humanize_playback_tests {
    use super::*;
    fn run(settings:&str)->(Vec<(usize,u8,u8,u8,bool)>,String){
        let mut engine=Engine::new(48000,12000);
        for track in 0..2 {
            for pitch in [60,64,67] {engine.tracks[track].active_mut().add_note_raw(4,96,24,pitch,90);}
        }
        engine.follower_input_context(settings);
        let stored=crate::persist::serialize(&engine);
        engine.play();let mut trace=Vec::new();
        for tick in 0..768 {
            let mut events=Vec::new();engine.service_tick(&mut events);
            for event in events {match event {
                OutEvent::NoteOn{track,pitch,vel}=>trace.push((tick,track,pitch,vel,true)),
                OutEvent::NoteOff{track,pitch}=>trace.push((tick,track,pitch,0,false)),_=>{}
            }}
        }
        // Note data and velocities remain intact after two passes.
        for track in 0..2 {for note in &engine.tracks[track].active().notes {
            assert_eq!((note.tick,note.gate,note.vel),(96,24,90));
        }}
        engine.stop(&mut Vec::new());assert!(engine.gates.is_empty());
        (trace,stored)
    }
    #[test] fn grouped_playback_balanced_gates_and_unchanged_conductor_schedule(){
        let (plain,stored)=run("fic1,0,1,1");
        let (disabled,stored_disabled)=run("fic1,0,1,1|hu1,0,0,0,3");
        assert_eq!(plain,disabled);assert_eq!(stored,stored_disabled);
        let (human,stored_human)=run("fic1,0,1,1|hu1,30,20,30,3");
        assert_eq!(stored,stored_human);
        assert_eq!(human.iter().filter(|event|event.4).count(),12);
        assert_eq!(human.iter().filter(|event|!event.4).count(),12);
        let conductor=|events:&Vec<(usize,u8,u8,u8,bool)>|events.iter().filter(|event|event.1==1)
            .map(|event|(event.0,event.2,event.4)).collect::<Vec<_>>();
        assert_eq!(conductor(&plain),conductor(&human));
        let first:Vec<_>=human.iter().filter(|event|event.1==0&&event.4&&event.0<384).collect();
        assert_eq!(first.len(),3);assert!(first.iter().all(|event|event.0==first[0].0&&event.3==first[0].3));
        assert!(human.iter().any(|event|event.4&&event.3!=90));
    }
    #[test] fn quantized_chord_has_one_timing_offset(){
        let mut engine=Engine::new(48000,12000);
        for (pitch,tick) in [(60,94),(64,96),(67,98)] {
            engine.tracks[0].active_mut().add_note_raw(4,tick,24,pitch,90);
        }
        engine.tracks[0].active_mut().quant=100;
        engine.follower_input_context("fic1,0,1,1|hu1,30,20,30,1");engine.play();
        let mut onsets=Vec::new();
        for tick in 0..160 {let mut events=Vec::new();engine.service_tick(&mut events);
            for event in events {if let OutEvent::NoteOn{track:0,..}=event {onsets.push(tick);}}
        }
        assert_eq!(onsets.len(),3);assert!(onsets.iter().all(|tick|*tick==onsets[0]));
    }
}
