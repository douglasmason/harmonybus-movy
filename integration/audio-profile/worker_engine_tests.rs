    #[test]
    fn worker_profile_commands_restore_mode_on_cancel_set_load_and_deadline() {
        let _lock = crate::midi_out::test_guard();
        let mut instance = Instance::new();
        let mut parallel = [0i16; 256];
        let mut serial = [0i16; 256];
        instance.set_param("cmd", "wparallel");
        instance.render(&mut parallel);
        assert!(instance.chains.worker_profile.enabled);
        assert!(!instance.chains.worker_profile.serial);
        instance.set_param("cmd", "wserial");
        instance.render(&mut serial);
        assert_eq!(serial, parallel, "same tone output through both render modes");
        assert!(instance.chains.worker_profile.status().contains(",1,1,0,"));
        instance.set_param("cmd", "aprof_off");
        assert!(!instance.chains.worker_profile.serial);
        instance.set_param("cmd", "wserial");
        instance.set_param("state", "movy1\n");
        assert!(!instance.chains.worker_profile.enabled);
        assert!(!instance.chains.worker_profile.serial);
        instance.set_param("cmd", "wserial");
        // AudioProfile's own clock/deadline is independently tested. Exercise
        // the callback handoff after it disables itself without any UI poll.
        instance.profile.enabled = false;
        instance.render(&mut serial);
        assert!(!instance.chains.worker_profile.serial);
        assert!(!instance.chains.worker_profile.enabled);
        instance.set_param("cmd", "wserial");
        instance.set_param("cmd", "acapture");
        assert!(!instance.chains.worker_profile.serial);
    }
