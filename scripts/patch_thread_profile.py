"""Measure main-thread elapsed and CPU time without modifying Schwung."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_thread_profile(root: Path) -> None:
    """Install opt-in paired clocks, separate tone stages and a bounded capture."""
    assets: Path = Path(__file__).resolve().parent.parent / 'integration/audio-profile'
    source_root: Path = root / 'engine/crates/movy-dsp/src'
    (source_root / 'thread_profile.rs').write_text((assets / 'thread_profile.rs').read_text())
    path: Path = source_root / 'audio_profile.rs'
    source: str = path.read_text().replace('    pub fn stamp(&self)', '    pub fn start_thread_capture(&mut self) { self.start(); self.capture_limit_ns = 65_000_000_000; }\n    pub fn stamp(&self)')
    source += '''
#[cfg(test)]
mod thread_deadline_tests {
    use super::*;
    #[test]
    fn thread_capture_stops_at_65_seconds_without_ui() {
        let origin = Instant::now();
        let mut profile = AudioProfile::default(); profile.start_thread_capture();
        profile.begin_at(origin);
        profile.finish_at([0; 7],128,44100,(0,0),origin+std::time::Duration::from_secs(35));
        assert!(profile.enabled);
        profile.finish_at([0; 7],128,44100,(0,0),origin+std::time::Duration::from_secs(65));
        assert!(!profile.enabled);
        let snapshot = profile.status(); profile.begin();
        assert_eq!(profile.status(),snapshot);
    }
}
'''
    path.write_text(source)
    path = source_root / 'tone_check.rs'
    source = path.read_text().replace('    frame: u64,', '    seconds: u64,\n    frame: u64,')
    source = source.replace('Self { state: 1, ..Self::default() }', 'Self { state: 1, seconds: 30, ..Self::default() }')
    source = source.replace('    pub fn cancel', '    pub fn start_long(&mut self) { self.start(); self.seconds = 60; }\n    pub fn cancel')
    source = source.replace('u64::from(rate) * 30', 'u64::from(rate) * self.seconds').replace('u64::from(self.rate)*30', 'u64::from(self.rate)*self.seconds')
    source = source.replace('/// Thirty seconds, with', '/// Selected duration, with')
    source = replace_once(source, '    #[test]\n    fn variable_blocks', '''    #[test]
    fn long_capture_checks_sixty_seconds_and_then_restores_audio() {
        let mut probe = ToneCheck::default(); probe.start_long();
        let rate = 44100;
        while probe.state == 1 {
            let mut audio = [1234; 256];
            probe.render(&mut audio,rate); probe.verify(&audio);
        }
        assert_eq!(probe.frame,60 * u64::from(rate));
        assert_eq!(probe.checked,2 * (60 * u64::from(rate) - 2 * u64::from(rate / 100)));
        assert_eq!(probe.bad,0);
        let mut audio = [1234; 256]; probe.render(&mut audio,rate);
        assert_eq!(audio,[1234; 256]);
    }
    #[test]
    fn variable_blocks''')
    path.write_text(source)
    path = source_root / 'chain_slots.rs'
    source = path.read_text().replace('pub struct ChainSlots {', 'pub struct ChainSlots {\n    pub thread_profile: crate::thread_profile::ThreadProfile,')
    source = replace_once(source, '            pool: None,', '            pool: None,\n            thread_profile: crate::thread_profile::ThreadProfile::default(),')
    source = replace_once(source, '        for i in 0..MOVY_CHAINS {\n            if self.work[i].synth {', '        let midi_tick_stamp = self.thread_profile.stamp();\n        for i in 0..MOVY_CHAINS {\n            if self.work[i].synth {')
    source = replace_once(source, '        self.colo_ran = [false; SEND_BUSES];', '        self.thread_profile.done(crate::thread_profile::MIDI_TICKS, midi_tick_stamp, "idle_midi_ticks");\n        self.colo_ran = [false; SEND_BUSES];')
    path.write_text(source)
    path = source_root / 'lib.rs'
    source = path.read_text().replace('mod worker_profile;', 'mod worker_profile;\nmod thread_profile;')
    source = source.replace('self.chains.worker_profile.stop();', 'self.chains.worker_profile.stop(); self.chains.thread_profile.stop();')
    source = source.replace('if self.chains.worker_profile.enabled { self.profile.enabled', 'if self.chains.worker_profile.enabled || self.chains.thread_profile.enabled { self.profile.enabled')
    source = source.replace('"wparallel" | "wserial")', '"wparallel" | "wserial" | "tcapture")')
    source = replace_once(source, '            "wparallel" | "wserial" => {', '''            "tcapture" => {
                self.chains.worker_profile.stop(); self.chains.thread_profile.start();
                self.profile.start_thread_capture(); self.tone_check.start_long();
            }
            "wparallel" | "wserial" => {
                self.chains.thread_profile.stop();''')
    source = source.replace('s.push_str(&self.chains.worker_profile.status());', 's.push_str(&self.chains.worker_profile.status());\n                s.push_str(&self.chains.thread_profile.status());')
    source = source.replace('workerbuild=0.34.1-hbclean.188', 'workerbuild=0.34.1-hbclean.189')
    source = replace_once(source, 'if self.profile.enabled { self.profile.start(); }', 'if self.profile.enabled && !self.chains.worker_profile.enabled && !self.chains.thread_profile.enabled { self.profile.start(); }')
    source = replace_once(source, '    fn worker_profile_commands_restore_mode_on_cancel_set_load_and_deadline()', '''    fn thread_profile_lifecycle_preserves_deadline_and_stops_on_exit() {
        let _lock = crate::midi_out::test_guard();
        let mut instance = Instance::new();
        instance.set_param("cmd","tcapture");
        instance.set_param("cmd","cpurst");
        let mut audio = [0i16; 256]; instance.render(&mut audio);
        assert!(instance.chains.thread_profile.enabled);
        assert!(instance.chains.thread_profile.status().contains(";1,1,"));
        instance.profile.enabled = false; instance.render(&mut audio);
        assert!(!instance.chains.thread_profile.enabled);
        assert_eq!(instance.tone_check.state,3);
        instance.set_param("cmd","tcapture");
        instance.set_param("state","movy1\\n");
        assert!(!instance.chains.thread_profile.enabled);
        instance.set_param("cmd","tcapture");
        instance.set_param("cmd","aprof_off");
        assert!(!instance.chains.thread_profile.enabled);
    }
    #[test]
    fn worker_profile_commands_restore_mode_on_cancel_set_load_and_deadline()''')
    source = replace_once(source, '        let worker_block_start', '        let thread_block_start = self.chains.thread_profile.stamp();\n        let worker_block_start')
    for call, kind in (('self.chains.hb_conductor_block(message.as_c_str());','PREPARE'), ('self.chains.render(out_audio);','CHAINS'), ('self.tone_check.render(out_audio, host::sample_rate());','TONE_RENDER'), ('self.tone_check.verify(out_audio);','TONE_VERIFY')):
        source = replace_once(source, '        '+call, '        let thread_stage_start = self.chains.thread_profile.stamp();\n        '+call+'\n        self.chains.thread_profile.done(thread_profile::'+kind+', thread_stage_start, "'+kind.lower()+'");')
    source = replace_once(source, '        self.profile.finish(profile_spans', '        self.chains.thread_profile.done(thread_profile::CALLBACK, thread_block_start, "callback_body");\n        self.profile.finish(profile_spans')
    for function_name, next_name, kind, key in (('on_midi','set_param','MIDI','"midi"'),('set_param','get_param','WRITE','cstr(key)'),('get_param','get_error','READ','cstr(key)')):
        start: int = source.index('unsafe extern "C" fn '+function_name+'(')
        end: int = source.index('unsafe extern "C" fn '+next_name+'(', start)
        function: str = source[start:end]
        function = replace_once(function, '    let profile_start', '    let thread_start = inst(instance).and_then(|instance| instance.chains.thread_profile.stamp());\n    let profile_start')
        function = replace_once(function, '        instance.profile.request_done', '        instance.chains.thread_profile.done(thread_profile::'+kind+', thread_start, '+key+');\n        instance.profile.request_done')
        source = source[:start]+function+source[end:]
    path.write_text(source)
    for filename in ('state.ts','engine.ts'):
        path = root/'src/seq'/filename
        source = path.read_text()
        if filename == 'state.ts':
            source = source.replace('    cpuWorker: string;', '    cpuThread: string;\n    cpuWorker: string;').replace("        cpuWorker: '',", "        cpuThread: '',\n        cpuWorker: '',")
        else:
            source = source.replace("    seqState.cpuWorker = '';", "    seqState.cpuThread = '';\n    seqState.cpuWorker = '';")
            source = source.replace("else if (key === 'workerprof')", "else if (key === 'threadprof') seqState.cpuThread = val;\n        else if (key === 'workerprof')")
        path.write_text(source)
    path = root/'src/midi/router.ts'
    source = path.read_text().replace('clickPreviewTest(Date.now(), appState.shiftHeld, false, !appState.shiftHeld)', 'clickPreviewTest(Date.now(), appState.shiftHeld, false, false, !appState.shiftHeld)')
    path.write_text(source)
