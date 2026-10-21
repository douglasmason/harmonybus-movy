#[cfg(test)]
mod source_override_tests {
    use super::*;
    const FOLLOW:&str="0,1,1,-2,-1,0;4,0,0,0,0,0;8,0,0,0,0,0;12,0,0,0,0,0";
    #[test]
    fn woven_note_bypasses_follow_but_releases_through_original_owner() {
        let mut links=JointLinks::new();links.set(FOLLOW);
        assert_eq!(links.playback_pitch(1,48,true),None);
        assert_eq!(links.playback_pitch(1,48,false),None);
        assert_eq!(links.playback_source_pitch(1,48,true,true),Some(48));
        links.set(FOLLOW);
        assert_eq!(links.playback_pressure(1,48),Some(48));
        assert_eq!(links.playback_pitch(1,48,false),Some(48));
    }
    #[test]
    fn replacing_follow_blocks_new_derived_ons_and_preserves_old_offs() {
        let mut links=JointLinks::new();links.set(FOLLOW);
        let event=Event{track:0,pitch:60,status:0x90,value:100,approach:None,full_velocity:false};
        assert_eq!(links.route_source(event,true,0).unwrap().track,1);
        assert_eq!(links.route_source(Event{status:0x80,..event},true,2).unwrap().pitch,36);
        assert!(links.route_source(event,true,2).is_none());
        assert!(links.route_source(Event{status:0x80,..event},true,2).is_none());
    }
}
