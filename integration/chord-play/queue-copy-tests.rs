mod queue_copy_tests {
    use super::*;
    fn wire(entries: &[(u8,u64,u32)]) -> String {
        let mut signature=14695981039346656037u64;
        for &(pitch,word,gate) in entries { for value in [word,pitch as u64,gate as u64] {
            for byte in value.to_le_bytes() { signature=(signature^byte as u64).wrapping_mul(1099511628211); }
        }}
        format!("qx1|{signature:016x}|{}|{}{}",entries.len(),entries.iter().map(|entry|entry.2).sum::<u32>(),
            entries.iter().map(|&(pitch,word,gate)|format!("|{pitch},{word:016x},{gate}")).collect::<String>())
    }
    fn progression() -> String {
        wire(&[(60,0xc858001f00ab5091,384),(67,0xc858001f00ab5089,384)])
    }
    #[test]
    fn atomic_abstract_copy_preserves_live_state_and_has_one_undo() {
        let mut engine=Engine::new(48000,12000);let mut output=Vec::new();
        engine.tracks[3].active_clip=2;engine.tracks[3].clips[2].ensure_exists();
        engine.tracks[3].playing_slot=Some(2);engine.tracks[3].pos_tick=37;
        engine.tracks[0].active_clip=5;
        let before=engine.undo_snapshot();
        crate::command::apply_batch(&mut engine,"usnap 9",&mut output);
        let snapshot=ChordQueueSnapshot::parse(&progression()).unwrap();let token=snapshot.token;
        engine.copy_chord_queue(snapshot,0,1,token).unwrap();
        crate::command::apply_batch(&mut engine,"ucommit 9",&mut output);
        assert!(output.is_empty());
        assert_eq!((engine.tracks[3].active_clip,engine.tracks[3].playing_slot,engine.tracks[3].pos_tick),(2,Some(2),37));
        assert_eq!(engine.tracks[0].active_clip,5);assert_eq!(engine.tracks[0].playing_slot,None);
        let clip=&engine.tracks[0].clips[1];
        assert_eq!((clip.length_ticks(),clip.notes.len()),(768,2));
        assert_eq!(clip.notes[1].tick,384);
        assert!(clip.notes.iter().all(|note|!note.rendered&&crate::recorded_actions::chord_selection(note.actions.as_ref().unwrap())));
        let saved=crate::persist::serialize(&engine);let mut loaded=Engine::new(48000,12000);
        assert!(crate::persist::load(&mut loaded,&saved));
        assert_eq!(loaded.tracks[0].clips[1].notes,engine.tracks[0].clips[1].notes);
        crate::command::apply_batch(&mut engine,"uswap 9 10",&mut output);assert_eq!(engine.undo_snapshot(),before);
        crate::command::apply_batch(&mut engine,"uswap 10 11",&mut output);assert_eq!(engine.tracks[0].clips[1].notes.len(),2);
    }
    #[test]
    fn rejection_never_writes_a_partial_or_occupied_clip() {
        let mut engine=Engine::new(48000,12000);
        for (track,slot,stale) in [(0,0,true),(16,0,false),(0,8,false)] {
            let snapshot=ChordQueueSnapshot::parse(&progression()).unwrap();let token=snapshot.token;
            let before=engine.undo_snapshot();
            assert!(engine.copy_chord_queue(snapshot,track,slot,if stale{token^1}else{token}).is_err());
            assert_eq!(engine.undo_snapshot(),before);
        }
        engine.tracks[0].clips[0].ensure_exists();
        let snapshot=ChordQueueSnapshot::parse(&progression()).unwrap();let token=snapshot.token;
        let before=engine.undo_snapshot();assert!(engine.copy_chord_queue(snapshot,0,0,token).is_err());assert_eq!(engine.undo_snapshot(),before);
        engine.recording=true;
        let snapshot=ChordQueueSnapshot::parse(&progression()).unwrap();let token=snapshot.token;
        assert!(engine.copy_chord_queue(snapshot,0,1,token).is_err());assert!(!engine.tracks[0].clips[1].exists());
    }
    #[test]
    fn export_validation_rejects_truncation_bad_lengths_and_executable_operations() {
        let valid=progression();
        for offset in 0..valid.len() {assert!(ChordQueueSnapshot::parse(&valid[..offset]).is_err());}
        assert!(ChordQueueSnapshot::parse(&(valid.clone()+"|extra")).is_err());
        for entries in [vec![(60,1,384)],vec![(128,0xc858001f00ab5091,384)],vec![(60,0xc858001f00ab5091,0)],vec![(60,0xc858001f00ab5091,25)],vec![(60,0xc858001f00ab5091,6145)]] {
            assert!(ChordQueueSnapshot::parse(&wire(&entries)).is_err());
        }
        let maximum=vec![(60,0xc858001f00ab5091,24);256];
        assert_eq!(ChordQueueSnapshot::parse(&wire(&maximum)).unwrap().clip.length_ticks(),6144);
    }
}
