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
}
