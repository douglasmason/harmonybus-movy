
#[cfg(test)]
mod hb_rhythm_engine_tests {
    use super::*;
    #[test]
    fn known_clip_can_advance_a_chord_without_editing_or_shortening_it() {
        let mut e=Engine::new(48000,12000);
        e.tracks[0].clips[0].set_loop(0,4);
        e.tracks[0].clips[0].toggle_step(1,&[(60,100),(64,90),(67,80)]);
        e.tracks[0].playing_slot=Some(0);e.playing=true;
        e.hb_auto_config(0,"|rr1,3,0"); // Short-Long: 24 -> 12
        let saved=crate::persist::serialize(&e);
        let mut attacks=Vec::new();let mut releases=Vec::new();
        for tick in 0..96 {
            let mut out=Vec::new();e.step_tick(0,&mut out);
            for event in out {match event {
                OutEvent::NoteOn{pitch,..}=>attacks.push((tick,pitch)),
                OutEvent::NoteOff{pitch,..}=>releases.push((tick,pitch)), _=>{}
            }}
        }
        assert_eq!(attacks,vec![(12,60),(12,64),(12,67)]);
        assert_eq!(releases.len(),3);assert!(releases.iter().all(|(tick,_)|*tick>12));
        assert_eq!(crate::persist::serialize(&e),saved);
        e.stop(&mut Vec::new());assert!(e.gates.is_empty());
    }
}
