#[cfg(test)] mod chord_route_tests {
    use super::*;
    #[test] fn arbitrary_melody_routes_to_comp_without_changing_joint_defaults(){
        let mut links=JointLinks::new();let defaults="0,1,1,-2,-1,0;4,0,0,0,0,0;8,0,0,0,0,0;12,0,0,0,0,0";
        assert!(links.set(defaults));assert!(links.set_chord("5,2,1"));
        let event=Event{track:5,pitch:64,status:0x90,value:100,approach:None,full_velocity:false};
        assert_eq!(links.route(event,false).unwrap().track,2);
        assert!(links.route(Event{track:3,..event},false).is_none());
        assert!(!links.set_chord("5,5,1"));assert!(links.derived(2));
        assert!(links.set_chord("5,2,0"));let drained=links.drain();assert_eq!(drained.len(),1);assert_eq!(drained[0].0.track,2);
        assert!(!links.derived(2));assert_eq!(links.playback_pitch(2,48,true),Some(48));
        links.set(defaults);assert!(!links.derived(2),"ordinary Joint synchronization preserves Chord override");
        assert!(links.set_chord("off"));assert!(links.derived(2));assert_eq!(links.route(Event{track:3,..event},false).unwrap().pitch,52);
    }
}
