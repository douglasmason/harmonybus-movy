#[cfg(test)] mod chord_selection_tests {
    use super::*;
    #[test] fn selection_snapshots_are_atomic_not_operations(){
        let mut actions=[0;LANES+1];actions[0]=0xc858001f00000000|0x91|(0xab5<<12);
        assert!(chord_selection(&actions));
        let message=format!("ra4,{}",payload(70,actions));assert_eq!(parse(&message),Some((70,actions)));
        for index in 1..=LANES {let mut bad=actions;bad[index]=1;assert!(parse(&format!("ra4,{}",payload(70,bad))).is_none());}
        for bad_word in [actions[0]^(1<<63),actions[0]|(15<<24),actions[0]|(15<<28),0xc858001f00000001] {
            let mut bad=actions;bad[0]=bad_word;assert!(parse(&format!("ra4,{}",payload(70,bad))).is_none());
        }
    }
    #[test] fn register_overrides_preserve_selection_and_pitch() {
        for word in [0xc858001f00000000u64|0x91|(0xab5<<12),0xc859001f00000000u64|0x491|(0xab5<<12)|(2<<37)|(5<<41)] {
            let mut actions=[0;LANES+1];actions[0]=word|(1<<46);
            assert!(chord_selection(&actions));
            for pitch in [24,48,60,84,108] {assert_eq!(parse(&format!("ra4,{}",payload(pitch,actions))),Some((pitch,actions)));}
        }
    }
    #[test] fn functional_snapshots_keep_intent_and_reject_reserved_bits(){
        let mut actions=[0;LANES+1];actions[0]=0xc859001f00000000|0x491|(0xab5<<12)|(2<<37)|(5<<41);
        assert!(chord_selection(&actions));
        assert_eq!(parse(&format!("ra4,{}",payload(62,actions))),Some((62,actions)));
        for word in [actions[0]|(1<<47),(actions[0]&!(15<<41))|(15<<41),actions[0]&!(15<<37)] {
            let mut bad=actions;bad[0]=word;assert!(!chord_selection(&bad));
            assert!(parse(&format!("ra4,{}",payload(62,bad))).is_none());
        }
    }
}
