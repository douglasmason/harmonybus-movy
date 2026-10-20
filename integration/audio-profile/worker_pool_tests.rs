    #[test]
    fn worker_profile_preserves_samples_and_attributes_delayed_work() {
        unsafe extern "C" fn delayed_fill(inst: *mut c_void, buf: *mut i16, frames: i32) {
            std::thread::sleep(Duration::from_millis(2));
            unsafe { fill(inst, buf, frames) };
        }
        let pool = RenderPool::new(2, CHAINS);
        let mut buffers = bufs();
        let mut lanes = vec![tasks(&mut buffers, 0..2), tasks(&mut buffers, 2..4), tasks(&mut buffers, 4..6)];
        pool.render_block(&lanes);
        let reference = buffers.clone();
        lanes[1][0].pre = Pre::Render(delayed_fill);
        for buffer in &mut buffers { buffer.fill(0); }
        let measured = pool.render_profiled(&lanes, true);
        assert_eq!(buffers, reference, "measurement must not change samples");
        assert!(measured.parallel);
        assert!(measured.work_ns[0] >= 1_000_000, "helper work includes the injected delay");
        assert!(measured.work_ns[1] > 0);
        let disabled = pool.render_profiled(&lanes, false);
        assert!(!disabled.parallel);
        assert_eq!(disabled.work_ns, [0, 0]);
        assert_eq!(buffers, reference);
        let inline = pool.render_profiled(&[tasks(&mut buffers, 0..CHAINS)], true);
        assert!(!inline.parallel, "inline work must not claim helper activity");
        assert_eq!(inline.join_ns, 0);
        assert!(inline.main_ns > 0);
    }
