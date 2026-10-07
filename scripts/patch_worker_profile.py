"""Add an opt-in worker comparison without changing normal render scheduling."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_worker_profile(root: Path) -> None:
    """Install bounded counters, per-round worker clocks, and native restoration."""
    source_root: Path = root / 'engine/crates/movy-dsp/src'
    assets: Path = Path(__file__).resolve().parent.parent / 'integration/audio-profile'
    (source_root / 'worker_profile.rs').write_text((assets / 'worker_profile.rs').read_text())
    path: Path = source_root / 'render_pool.rs'
    source: str = path.read_text()
    source = replace_once(source, 'struct Shared {', '''struct Shared {
    epoch: Instant,
    diagnostic: AtomicBool,
    dispatched_ns: AtomicU64,
    worker_started_ns: Vec<AtomicU64>,
    worker_finished_ns: Vec<AtomicU64>,''')
    source = replace_once(source, 'let shared = Arc::new(Shared {', '''let shared = Arc::new(Shared {
            epoch: Instant::now(), diagnostic: AtomicBool::new(false),
            dispatched_ns: AtomicU64::new(0),
            worker_started_ns: (0..helpers).map(|_| AtomicU64::new(0)).collect(),
            worker_finished_ns: (0..helpers).map(|_| AtomicU64::new(0)).collect(),''')
    source = replace_once(source, '    pub fn render_block(&self, lanes: &[Vec<Task>]) {', '''    pub fn render_block(&self, lanes: &[Vec<Task>]) {
        self.render_profiled(lanes, false);
    }
    pub fn render_profiled(&self, lanes: &[Vec<Task>], measured: bool) -> crate::worker_profile::RoundTiming {
        let mut timing = crate::worker_profile::RoundTiming::default();
        let inline_start = measured.then(Instant::now);''')
    source = replace_once(source, '''            return;
        }

        for i in 0..helpers {''', '''            if let Some(start) = inline_start { timing.main_ns = start.elapsed().as_nanos() as u64; }
            return timing;
        }

        for i in 0..helpers {''')
    source = replace_once(source, '        self.shared.pending.store(helpers as u32, Ordering::Relaxed);', '''        self.shared.diagnostic.store(measured, Ordering::Relaxed);
        if measured {
            self.shared.dispatched_ns.store(self.shared.epoch.elapsed().as_nanos() as u64, Ordering::Relaxed);
        }
        self.shared.pending.store(helpers as u32, Ordering::Relaxed);''')
    source = replace_once(source, '        run(&lanes[0], &self.shared);', '''        let main_start = measured.then(Instant::now);
        run(&lanes[0], &self.shared);''')
    source = replace_once(source, '        self.join();', '''        if let Some(start) = main_start { timing.main_ns = start.elapsed().as_nanos() as u64; }
        let join_start = measured.then(Instant::now);
        self.join();
        if let Some(start) = join_start {
            timing.parallel = true;
            timing.join_ns = start.elapsed().as_nanos() as u64;
            if !self.is_poisoned() {
                let dispatched = self.shared.dispatched_ns.load(Ordering::Relaxed);
                for lane in 0..helpers.min(2) {
                    let began = self.shared.worker_started_ns[lane].load(Ordering::Relaxed);
                    let ended = self.shared.worker_finished_ns[lane].load(Ordering::Relaxed);
                    timing.delay_ns[lane] = began.saturating_sub(dispatched);
                    timing.work_ns[lane] = ended.saturating_sub(began);
                }
            }
        }
        timing''')
    source = replace_once(source, '''            run(tasks, &shared);
            // Release:''', '''            let measured = shared.diagnostic.load(Ordering::Relaxed);
            if measured { shared.worker_started_ns[lane].store(shared.epoch.elapsed().as_nanos() as u64, Ordering::Relaxed); }
            run(tasks, &shared);
            if measured { shared.worker_finished_ns[lane].store(shared.epoch.elapsed().as_nanos() as u64, Ordering::Relaxed); }
            // Release:''')
    path.write_text(source)

    path = source_root / 'chain_slots.rs'
    source = path.read_text()
    source = replace_once(source, 'pub struct ChainSlots {', 'pub struct ChainSlots {\n    pub worker_profile: crate::worker_profile::WorkerProfile,')
    source = replace_once(source, '            pool: None,', '            pool: None,\n            worker_profile: crate::worker_profile::WorkerProfile::default(),')
    source = replace_once(source, '        self.pool.as_ref().is_some_and(|p| !p.is_poisoned())', '        !self.worker_profile.serial && self.pool.as_ref().is_some_and(|p| !p.is_poisoned())')
    for lanes_name in ('lanes', 'send_lanes'):
        source = replace_once(source, f'            pool.render_block(&self.{lanes_name});',
                              f'            let timing = pool.render_profiled(&self.{lanes_name}, self.worker_profile.enabled);\n            self.worker_profile.round(timing);')
    source = replace_once(source, '    fn render_serial(&mut self, frames: usize) -> usize {', '''    fn render_serial(&mut self, frames: usize) -> usize {
        let started = self.worker_profile.enabled.then(std::time::Instant::now);
        let active = self.render_serial_inner(frames);
        if let Some(started) = started {
            self.worker_profile.round(crate::worker_profile::RoundTiming {
                main_ns: started.elapsed().as_nanos() as u64, ..Default::default()
            });
        }
        active
    }
    fn render_serial_inner(&mut self, frames: usize) -> usize {''')
    source = replace_once(source, '    fn render_sends_serial(&mut self, frames: usize) {', """    fn render_sends_serial(&mut self, frames: usize) {
        let started = self.worker_profile.enabled.then(std::time::Instant::now);
        self.render_sends_serial_inner(frames);
        if let Some(started) = started {
            self.worker_profile.round(crate::worker_profile::RoundTiming {
                main_ns: started.elapsed().as_nanos() as u64, ..Default::default()
            });
        }
    }
    fn render_sends_serial_inner(&mut self, frames: usize) {""")
    path.write_text(source)

    path = source_root / 'lib.rs'
    source = path.read_text()
    source = replace_once(source, 'mod audio_profile;', 'mod audio_profile;\nmod worker_profile;')
    source = replace_once(source, '"aprof_off" | "acapture"', '"aprof_off" | "acapture" | "wparallel" | "wserial"')
    source = replace_once(source, '            "acapture" =>', '''            "wparallel" | "wserial" => {
                self.chains.worker_profile.start(key == "wserial");
                self.profile.start_capture(); self.tone_check.start();
            }
            "acapture" =>''')
    source = replace_once(source, '"acapture" => { self.profile', '"acapture" => { self.chains.worker_profile.stop(); self.profile')
    source = replace_once(source, '"aprof_on" => { self.tone_check', '"aprof_on" => { self.chains.worker_profile.stop(); self.tone_check')
    source = replace_once(source, '            "state" => {\n                if seq_core::persist::load', '            "state" => {\n                self.chains.worker_profile.stop(); self.profile.enabled = false; self.tone_check.cancel();\n                if seq_core::persist::load')
    source = replace_once(source, '"aprof_off" => { self.profile.enabled = false;', '"aprof_off" => { self.chains.worker_profile.stop(); self.profile.enabled = false;')
    source = replace_once(source, 's.push_str(&self.tone_check.status());', '''s.push_str(&self.tone_check.status());
                s.push_str(&self.chains.worker_profile.status());
                s.push_str(" workerbuild=0.34.1-hbclean.188");''')
    source = replace_once(source, '        let mut profile_stamp = self.profile.begin();', '''        let worker_block_start = self.chains.worker_profile.enabled.then(std::time::Instant::now);
        let mut profile_stamp = self.profile.begin();''')
    source = replace_once(source, '        if !self.profile.enabled { self.tone_check.cancel(); }', '''        if let Some(started) = worker_block_start {
            self.chains.worker_profile.block(started.elapsed().as_nanos() as u64,
                (out_audio.len() as u64/2)*1_000_000_000/u64::from(host::sample_rate().max(1)), 0);
        }
        if !self.profile.enabled { self.tone_check.cancel(); self.chains.worker_profile.stop(); }''')
    path.write_text(source)

    for filename in ('state.ts', 'engine.ts'):
        path = root / 'src/seq' / filename
        source = path.read_text()
        if filename == 'state.ts':
            source = source.replace('    cpuTone: string;', '    cpuWorker: string;\n    workerBuild: string;\n    cpuTone: string;')
            source = source.replace("        cpuTone: '',", "        cpuWorker: '',\n        workerBuild: '',\n        cpuTone: '',")
        else:
            source = source.replace("    seqState.cpuTone = '';", "    seqState.cpuWorker = '';\n    seqState.workerBuild = '';\n    seqState.cpuTone = '';")
            source = source.replace("else if (key === 'tonecheck')", "else if (key === 'workerprof') seqState.cpuWorker = val;\n        else if (key === 'workerbuild') seqState.workerBuild = val;\n        else if (key === 'tonecheck')")
        path.write_text(source)
    path = root / 'src/midi/router.ts'
    source = path.read_text().replace('clickPreviewTest(Date.now(), appState.shiftHeld, !appState.shiftHeld)', 'clickPreviewTest(Date.now(), appState.shiftHeld, false, !appState.shiftHeld)')
    path.write_text(source)
    path = source_root / 'render_pool.rs'
    source = path.read_text()
    source = replace_once(source, 'mod tests {', 'mod tests {\n' + (assets / 'worker_pool_tests.rs').read_text())
    path.write_text(source)
    path = source_root / 'lib.rs'
    source = path.read_text()
    source = replace_once(source, 'mod tests {', 'mod tests {\n' + (assets / 'worker_engine_tests.rs').read_text())
    path.write_text(source)
