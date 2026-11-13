#[cfg(test)]
#[path = "../tests/support/context_bench.rs"]
mod cloud_allocation_counter;
#[cfg(test)]
mod cloud_grain_reference;

#[cfg(test)]
mod cloud_performance_tests {
    use super::*;
    use seq_core::cloud::{Activity, Contact, Point, MAX_POINTS, TAIL_STEPS};
    use seq_core::generator::Config;
    use std::hint::black_box;

    fn points(count: usize) -> Vec<Point> {
        (0..count).map(|index| Point {
            step: (index % 16) as i32 - 15,
            x: (index % 128) as u16*129, y: ((index * 17) % 128) as u16*129,
            pressure: 127 - (index % 100) as u8,
            pressure_target: seq_core::cloud::PressureTarget::Velocity,
            activity: if index % 3 == 0 { Activity::Rate } else { Activity::Probability },
        }).collect()
    }

    fn dense_instance(count: usize) -> Instance {
        let mut instance = Instance::new();
        let runtime = &mut instance.engine.clouds[2];
        runtime.view = points(count);
        runtime.grains = points(64);
        runtime.contacts = points(16).into_iter().enumerate().map(|(index, point)| Contact {
            id: index as u8, point, refreshed: 0, frame: 0, precise: false,
        }).collect();
        instance.cloud_ui = "quotes \" slash \\ tonic C♯ — 🎹".repeat(90);
        instance
    }

    /// Frozen hbclean.334 formatter, including contact expiry and point order.
    fn legacy_snapshot(engine: &Engine, track: usize, frame_now: u64) -> String {
        let Some(runtime) = engine.clouds.get(track) else { return String::new(); };
        let tick = engine.hb_master_tick();
        let now = tick.saturating_sub(1) as f64 / seq_core::TICKS_PER_STEP as f64;
        let points = |points: &[Point]| points.iter()
            .filter(|point| now - (point.step as f64) < TAIL_STEPS as f64)
            .map(|point| format!("{},{},{},{:.3}", point.x/129, point.y/129, point.pressure, (now - point.step as f64).max(0.0)))
            .collect::<Vec<_>>().join(";");
        let contacts = runtime.contacts.iter().filter(|contact|
            tick.saturating_sub(contact.refreshed) < 192 &&
            frame_now.saturating_sub(contact.frame) < engine.clock.sample_rate() as u64 * 2)
            .map(|contact| format!("{},{},{}", contact.point.x/129, contact.point.y/129, contact.point.pressure))
            .collect::<Vec<_>>().join(";");
        format!("cf1|{}|{}|{}", contacts, points(&runtime.view), points(&runtime.grains))
    }

    fn abi_read(instance: &mut Instance, key: &CStr, output: &mut [u8]) -> i32 {
        unsafe { get_param(instance as *mut Instance as *mut c_void, key.as_ptr(),
            output.as_mut_ptr() as *mut c_char, output.len() as c_int) }
    }

    #[test]
    fn cloud_snapshot_abi_matches_legacy_and_allocates_nothing() {
        let mut output = vec![0xa5; 128 * 1024];
        for count in [0, 256, MAX_POINTS + 256] {
            let mut instance = dense_instance(count);
            // At the exact tail boundary a point disappears; future ages clamp.
            instance.engine.clouds[2].view.extend([
                Point { step: -16, ..points(1)[0] }, Point { step: 1, ..points(1)[0] },
            ]);
            for frame_now in [0, 96000] {
                if frame_now > 0 { instance.engine.advance_block(frame_now as u32, &mut Vec::new()); }
                let view = legacy_snapshot(&instance.engine, 2, frame_now);
                let state = format!("{{\"cloud_ui_state\":{},\"cloud_view\":{:?}}}", remote_json_string(&instance.cloud_ui), view);
                let ui = instance.cloud_ui.clone();
                for (key, expected) in [(c"cloud_view", view.as_str()), (c"cloud_view_2", view.as_str()),
                    (c"state", state.as_str()), (c"cloud_ui_state", ui.as_str()),
                    (c"cloud_hold_2", "0"), (c"cloud_hold_state_2", "ch2|0|0|0|0|0"), (c"cloud_view_16", "")] {
                    output.fill(0xa5);
                    let (_, allocations) = cloud_allocation_counter::measured(|| {
                        for _ in 0..8 {
                            assert_eq!(abi_read(&mut instance, key, &mut output), expected.len() as i32);
                        }
                    });
                    assert_eq!(allocations, 0, "key={key:?}, points={count}");
                    assert_eq!(&output[..expected.len()], expected.as_bytes());
                    assert_eq!(output[expected.len()], 0);
                    assert_eq!(output[expected.len() + 1], 0xa5);
                    assert_eq!(instance.get_param(key.to_str().unwrap()).as_deref(), Some(expected));
                    for capacity in [0, expected.len()] {
                        output.fill(0xa5);
                        assert_eq!(abi_read(&mut instance, key, &mut output[..capacity]), -1);
                        assert!(output.iter().all(|byte| *byte == 0xa5), "failure must not partially write a reply");
                    }
                    assert_eq!(abi_read(&mut instance, key, &mut output[..expected.len() + 1]), expected.len() as i32);
                }
            }
            for key in [c"cloud_view_bad", c"cloud_view_-1", c"cloud_hold_16", c"cloud_hold_state_bad", c"cloud_hold_state_16"] {
                output.fill(0xa5);
                assert_eq!(abi_read(&mut instance, key, &mut output), -1);
                assert!(output.iter().all(|byte| *byte == 0xa5));
            }
        }
    }

    #[test]
    fn cloud_grains_match_frozen_renderer_across_order_controls_and_boundaries() {
        let mut history = points(256);
        history.extend(points(64)); // Equal sort keys must stay musically identical.
        history.push(Point { step: 20, ..history[0] });
        let mut reversed = history.clone(); reversed.reverse();
        let mut scratch = Vec::with_capacity(MAX_POINTS + 256);
        for source in [&history[..], &reversed[..], &[]] {
            for style in [16, 17] { for seed in [1, 71, 65535] {
                for rate in [0, 42, 96, 127] { for density in [0, 64, 127] {
                    for field in [false, true] { for step in [0, 1, 7, 15, 16, 20, 31, 255] {
                        let config = Config { style, seed, complexity: density, intensity: 97,
                            cloud: [rate, 63, 90, 100, 75, 110], ..Default::default() };
                        for end in [0, step as u32 * seq_core::TICKS_PER_STEP] {
                            let config = Config { end, ..config };
                            let expected = cloud_grain_reference::legacy_grains(config, step, source, field);
                            scratch.clear(); scratch.extend_from_slice(source);
                            let actual: Vec<_> = seq_core::cloud::grains_in_place(config, step, &mut scratch, field)
                                .into_iter().flatten().collect();
                            assert_eq!(format!("{actual:?}"), format!("{expected:?}"));
                        }
                    }}
                }}
            }}
        }
    }

    #[test]
    fn cloud_grain_scratch_has_no_steady_state_allocations() {
        let source = points(MAX_POINTS);
        let mut scratch = Vec::with_capacity(MAX_POINTS);
        let config = Config { style: 16, complexity: 127, cloud: [127; 6], ..Default::default() };
        let (_, allocations) = cloud_allocation_counter::measured(|| {
            for _ in 0..100 {
                scratch.clear(); scratch.extend_from_slice(&source);
                black_box(seq_core::cloud::grains_in_place(config, 0, &mut scratch, true));
            }
        });
        assert_eq!(allocations, 0);
    }

    #[test]
    #[ignore = "desktop timing only; equivalence and allocations run in normal tests"]
    fn cloud_performance_benchmark() {
        let mut instance = dense_instance(256);
        let mut output = vec![0; 128 * 1024];
        let iterations = 1000;
        let source = points(256);
        let mut scratch = Vec::with_capacity(source.len());
        let config = Config { style: 16, complexity: 127, cloud: [127; 6], ..Default::default() };
        for snapshot in [true, false] {
            let mut samples = [Vec::with_capacity(7), Vec::with_capacity(7)];
            let mut counts = [0; 2];
            for trial in 0..7 {
                for before in [trial % 2 == 0, trial % 2 != 0] {
                    let (elapsed, allocations) = cloud_allocation_counter::measured(|| {
                        for _ in 0..iterations {
                            if snapshot {
                                if before { black_box(legacy_snapshot(&instance.engine, 2, 0)); }
                                else { black_box(abi_read(&mut instance, c"cloud_view", &mut output)); }
                            } else if before { black_box(cloud_grain_reference::legacy_grains(config, 0, &source, true)); }
                            else {
                                scratch.clear(); scratch.extend_from_slice(&source);
                                black_box(seq_core::cloud::grains_in_place(config, 0, &mut scratch, true));
                            }
                        }
                    });
                    let index = usize::from(!before);
                    samples[index].push(elapsed);
                    counts[index] = allocations;
                    if !before { assert_eq!(allocations, 0); }
                }
            }
            for sample in &mut samples { sample.sort_unstable(); }
            println!("cloud {}: {iterations} calls/trial; allocations {} -> {}; median ns/call {:.1} -> {:.1} (7 alternating trials; desktop, not device audio)",
                if snapshot { "snapshot" } else { "grains" }, counts[0], counts[1],
                samples[0][3] as f64 / iterations as f64, samples[1][3] as f64 / iterations as f64);
        }
    }
}
