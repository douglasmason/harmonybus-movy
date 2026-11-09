#[cfg(test)] mod cloud_remote_tests {
    use super::*;
    #[test] fn cloud_remote_observation_preserves_persistence_and_bounds_actions() {
        let mut instance=Instance::new();
        instance.set_param("cmd","bpm 13700");
        let saved=instance.get_param("persistent_state").unwrap();
        instance.set_param("cloud_ui_state",r#"{"footer":"Cloud \"take\""}"#);
        let expected=format!("{{\"cloud_ui_state\":{},\"cloud_view\":\"cf1|||\"}}",remote_json_string(&instance.cloud_ui));
        for _ in 0..10 {assert_eq!(instance.get_param("cloud_hold_2").as_deref(),Some("0"));assert!(instance.engine.dirty);}
        assert!(instance.get_param("cloud_hold_16").is_none());
        instance.get_param("rui_poll");
        assert!(instance.get_param("status").unwrap().contains("cloudremote=0"),"the unconditional host probe must not wake the remote controller");
        for _ in 0..8 {
            assert_eq!(instance.get_param("state").as_deref(),Some(expected.as_str()));
            assert!(instance.engine.dirty);
            assert_eq!(instance.get_param("module_id").as_deref(),Some("movy"));
        }
        assert_eq!(instance.get_param("persistent_state").unwrap(),saved);
        assert!(instance.get_param("status").unwrap().contains("cloudremote=1"));
        let digest=instance.get_param("rui_poll").unwrap();instance.blocks+=34;
        assert_ne!(instance.get_param("rui_poll").unwrap(),digest,"active cloud frames must push even when controls are stationary");
        instance.blocks+=1200;
        assert!(instance.get_param("status").unwrap().contains("cloudremote=0"));
        instance.set_param("cloud_action","play\nstop");
        instance.set_param("cloud_action",&"x".repeat(181));
        assert_eq!(instance.get_param("cloud_actions").as_deref(),Some(""));
        for _ in 0..70 {instance.set_param("cloud_action","draw x 1");}
        assert!(instance.get_param("status").unwrap().contains("cloudremote=1"));
        assert_eq!(instance.get_param("cloud_actions").unwrap().lines().count(),64);
        assert_eq!(instance.get_param("cloud_actions").as_deref(),Some(""));
        assert_eq!(instance.get_param("save_state").unwrap(),saved);
        assert!(!instance.engine.dirty);
        instance.set_param("state",&saved);
        assert_eq!(instance.get_param("persistent_state").unwrap(),saved);
    }
}
