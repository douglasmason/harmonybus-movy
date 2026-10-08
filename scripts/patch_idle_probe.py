"""Install a bounded hands-off callback isolation test without changing the host."""
import json
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_idle_probe(root: Path) -> None:
    """Keep phase switching and cancellation native; preserve the pressure command."""
    repository: Path = Path(__file__).resolve().parent.parent
    native: Path = root / 'engine/crates/movy-dsp/src'
    (native / 'idle_probe.rs').write_text((repository / 'integration/audio-profile/idle_probe.rs').read_text())
    path: Path = native / 'lib.rs'
    source: str = path.read_text()
    source = source.replace('mod pressure_trace;', 'mod pressure_trace;\nmod idle_probe;')
    source = source.replace('    tone_check: tone_check::ToneCheck,', '    idle_probe: idle_probe::IdleProbe,\n    tone_check: tone_check::ToneCheck,')
    source = source.replace('            tone_check: tone_check::ToneCheck::default(),', '            idle_probe: idle_probe::IdleProbe::default(),\n            tone_check: tone_check::ToneCheck::default(),')
    source = source.replace('pressure_trace::stop();', 'pressure_trace::stop(); self.idle_probe.stop();')
    source = source.replace('"wserial" | "tcapture")', '"wserial" | "tcapture" | "icapture")')
    source = replace_once(source, '            "tcapture" => {', '''            "icapture" => {
                self.chains.worker_profile.stop(); pressure_trace::stop(); self.idle_probe.stop();
                if !self.engine.playing {
                    self.chains.thread_profile.start(); self.profile.start_idle_capture();
                    self.tone_check.start_long(); self.idle_probe.start();
                }
            }
            "tcapture" => {
                self.idle_probe.stop();''')
    source = replace_once(source, '        pressure_trace::block();', '''        // Musical input or transport restart invalidates isolation, never suppresses notes.
        if self.idle_probe.active && (self.engine.playing || host::transport_snapshot().is_some_and(|value| value.0)) {
            self.idle_probe.stop(); self.profile.enabled = false; self.tone_check.cancel();
            self.chains.thread_profile.stop();
        }
        let idle_minimal = self.idle_probe.begin(out_audio.len()/2,host::sample_rate());
        pressure_trace::block();''')
    source = replace_once(source, '        self.blocks += 1;', '        if !idle_minimal {\n        self.blocks += 1;')
    source = replace_once(source, '        let thread_stage_start = self.chains.thread_profile.stamp();\n        self.tone_check.render', '        } else { out_audio.fill(0); }\n        let thread_stage_start = self.chains.thread_profile.stamp();\n        self.tone_check.render')
    source = replace_once(source, '        self.profile.finish(profile_spans', '        self.idle_probe.finish();\n        self.profile.finish(profile_spans')
    source = source.replace('s.push_str(&pressure_trace::status());', 's.push_str(&pressure_trace::status()); s.push_str(&self.idle_probe.status());')
        # Cancel before forwarding any new musical event; never eat its release.
    source = replace_once(source, '    fn set_param(&mut self, key: &str, val: &str) {', '''    fn abort_idle_input(&mut self) {
        if self.idle_probe.active {
            self.idle_probe.stop(); self.profile.enabled=false; self.tone_check.cancel();
            self.chains.thread_profile.stop();
        }
    }
    fn set_param(&mut self, key: &str, val: &str) {
        if key == "cmd" && val.split(';').any(|operation| matches!(operation.split_whitespace().next(),Some("non" | "nof" | "npr" | "play" | "rec"))) { self.abort_idle_input(); }
        if matches!(key,"surface_events" | "padpressure" | "hbperform") { self.abort_idle_input(); }''')
    # Direct pad and external MIDI input are handled in the ABI callback.
    start: int = source.index('unsafe extern "C" fn on_midi(')
    end: int = source.index('unsafe extern "C" fn set_param(', start)
    function: str = source[start:end]
    function = replace_once(function, '        let status = unsafe { *msg };', '        let status = unsafe { *msg };\n        if status < 0xf0 { if let Some(instance) = inst(instance) { instance.abort_idle_input(); } }')
    source = source[:start] + function + source[end:]
    for kind, key in [('MIDI','"midi"'),('WRITE','cstr(key)'),('READ','cstr(key)')]:
        source = replace_once(source, f'        instance.chains.thread_profile.done(thread_profile::{kind},', f'        instance.idle_probe.request(profile_start);\n        instance.chains.thread_profile.done(thread_profile::{kind},')
    source = replace_once(source, '    fn thread_profile_lifecycle_preserves_deadline_and_stops_on_exit()', '    fn idle_probe_lifecycle_and_real_callback_bypass() {\n        let _lock = crate::midi_out::test_guard();\n        let mut instance = Instance::new();\n        instance.set_param("cmd","icapture");\n        assert!(instance.idle_probe.active);\n        let mut audio = [0i16;256];\n        instance.render(&mut audio);\n        let normal_blocks=instance.blocks;\n        instance.idle_probe.test_elapsed(21);\n        instance.render(&mut audio);\n        assert_eq!(instance.blocks,normal_blocks,"minimal phase skips musical callback body");\n        assert!(audio.iter().any(|value|*value!=0),"tone still renders in minimal phase");\n        instance.idle_probe.test_elapsed(41);\n        instance.render(&mut audio);\n        assert_eq!(instance.blocks,normal_blocks+1,"normal phase restores without UI");\n        instance.set_param("cmd","non 0 60 100");\n        assert!(instance.idle_probe.aborted);assert!(!instance.idle_probe.active);\n        assert_eq!(instance.tone_check.state,3);\n        instance.set_param("cmd","icapture");instance.set_param("state","movy1\\n");\n        assert!(!instance.idle_probe.active);\n        instance.set_param("cmd","icapture");instance.set_param("cmd","aprof_off");\n        assert!(!instance.idle_probe.active);\n        instance.set_param("cmd","icapture");instance.idle_probe.test_elapsed(60);\n        instance.render(&mut audio);\n        assert!(!instance.idle_probe.active);assert!(!instance.idle_probe.aborted);\n    }\n    #[test]\n    fn thread_profile_lifecycle_preserves_deadline_and_stops_on_exit()')
    version: str = json.loads((repository / 'release.json').read_text())['version']
    source = source.replace('workerbuild=0.34.1-hbclean.189', 'workerbuild=' + version)
    path.write_text(source)
    path = native / 'audio_profile.rs'
    source = path.read_text().replace('    pub fn start_thread_capture', '    pub fn start_idle_capture(&mut self) { self.start(); self.capture_limit_ns = 65_000_000_000; }\n    pub fn start_thread_capture')
    path.write_text(source)
    for name in ('state.ts','engine.ts'):
        path = root / 'src/seq' / name
        source = path.read_text()
        if name == 'state.ts':
            source = source.replace('    cpuPressure: string;', '    cpuIdle: string;\n    cpuPressure: string;').replace("        cpuPressure: '',", "        cpuIdle: '',\n        cpuPressure: '',")
        else:
            source = source.replace("    seqState.cpuPressure = '';", "    seqState.cpuIdle = '';\n    seqState.cpuPressure = '';")
            source = source.replace("else if (key === 'pressuretrace')", "else if (key === 'idleprobe') seqState.cpuIdle = val;\n        else if (key === 'pressuretrace')")
        path.write_text(source)
