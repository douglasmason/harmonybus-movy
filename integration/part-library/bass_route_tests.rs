
#[cfg(test)] mod bass_recipe_routes {
    use super::*;
    #[test] fn bass_clip_overrides_only_its_derived_route_and_old_releases_survive() {
        let mut links=JointLinks::new();
        assert!(links.set("0,1,1,-2,-1,0;4,1,0,-2,0,0;8,0,0,0,0,0;12,0,0,0,0,0"));
        let on=Event{track:0,pitch:60,status:0x90,value:100,approach:None,full_velocity:false};
        assert_eq!(links.route(on,false).unwrap().track,1);
        assert_eq!(links.playback_pitch(1,36,true),None);
        assert!(links.set_chord("3,2,0,1"));
        assert!(links.route(on,false).is_none());
        assert_eq!(links.route(Event{status:0x80,..on},false).unwrap().pitch,36);
        assert_eq!(links.playback_pitch(1,36,false),None);
        assert_eq!(links.playback_pitch(1,36,true),Some(36));
        assert!(links.derived(5),"other quartets retain their routing");
        assert!(!links.set_chord("3,2,0,3"));
        assert!(!links.set_chord("3,2,0,16"));
        assert!(links.set_chord("3,2,0"),"Undo returns to existing routing");
        assert_eq!(links.playback_pitch(1,36,false),Some(36));
        assert_eq!(links.playback_pitch(1,36,true),None);
        assert!(links.set_chord("off"));
        assert!(links.derived(1));
    }
}
