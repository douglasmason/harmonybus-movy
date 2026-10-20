"""Add a short host-mix recording diagnostic using existing host APIs."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_output_capture(root: Path) -> None:
    """Install the controller/analyzer and a bounded same-polarity native tone."""
    assets: Path = Path(__file__).resolve().parent.parent / 'integration/audio-profile'
    for name in ('output-wave.ts', 'output-capture.ts'):
        (root / 'src/seq' / name).write_text((assets / name).read_text())
    path: Path = root / 'src/seq/preview-test.ts'
    source: str = path.read_text()
    source = "import { outputCapture, clickOutputCapture, tickOutputCapture, cancelOutputCapture } from './output-capture.js';\n" + source
    source = source.replace('return previewTest.quick &&', "return outputCapture.stage !== 'idle' && !['intro','error'].includes(outputCapture.stage) || previewTest.quick &&")
    source = source.replace("return previewTest.stage !== 'idle';", "return outputCapture.stage !== 'idle' || previewTest.stage !== 'idle';")
    source = source.replace('export function cancelPreviewTest(): void {', 'export function cancelPreviewTest(): void {\n    cancelOutputCapture();')
    source = source.replace('thread = false): void {', "thread = false, output = false): void {\n    if (outputCapture.stage !== 'idle' || output && previewTest.stage === 'idle') { clickOutputCapture(now); return; }")
    source = source.replace('export function tickPreviewTest(now = Date.now()): void {', "export function tickPreviewTest(now = Date.now()): void {\n    tickOutputCapture(now);\n    if (outputCapture.stage !== 'idle') return;")
    path.write_text(source)
    path = root / 'src/renderer/preview-test-view.ts'
    source = "import { outputCapture, outputCaptureLines } from '../seq/output-capture.js';\n" + path.read_text()
    source = source.replace('export function renderPreviewTest(): boolean {', "export function renderPreviewTest(): boolean {\n    if (outputCapture.stage !== 'idle') { outputCaptureLines().forEach((line,index) => fontPrint5x3(0,index===7?59:index*8,line.slice(0,32),1)); return true; }")
    path.write_text(source)
    # The input file is selected below by its existing diagnostic call.
    for candidate in (root / 'src').rglob('*.ts'):
        source = candidate.read_text()
        old: str = 'clickPreviewTest(Date.now(), appState.shiftHeld, false, false, !appState.shiftHeld)'
        if old in source:
            candidate.write_text(source.replace(old, 'clickPreviewTest(Date.now(), appState.shiftHeld, false, false, false, !appState.shiftHeld)'))
    path = root / 'build/browser.mjs'
    source = path.read_text().replace('    entryPoints: [', "    entryPoints: [\n        resolve(root, 'src/seq/output-capture.ts'),\n        resolve(root, 'src/seq/output-wave.ts'),")
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/tone_check.rs'
    source = path.read_text().replace('    seconds: u64,', '    same_polarity: bool,\n    seconds: u64,')
    source = source.replace('    pub fn start_long', '    pub fn start_output(&mut self) { self.start(); self.seconds=10; self.same_polarity=true; }\n    pub fn start_long')
    source = source.replace('frame[1] = -value;', 'frame[1] = if self.same_polarity { value } else { -value };')
    source = source.replace('let expected = [value/2, -value/4];', 'let expected = [value/2, if self.same_polarity { value/4 } else { -value/4 }];')
    source = source.replace('    #[test]\n    fn long_capture', '''    #[test]
    fn output_tone_is_ten_seconds_same_polarity_and_stops() {
        let mut probe=ToneCheck::default();probe.start_output();
        let mut audio=[0i16;256];
        while probe.state==1 {
            probe.render(&mut audio,44100);probe.verify(&audio);
            assert!(audio.chunks_exact(2).all(|pair|i32::from(pair[0])*i32::from(pair[1])>=0));
        }
        assert_eq!(probe.frame,441000);assert_eq!(probe.bad,0);assert!(probe.checked>800000);
        audio.fill(123);probe.render(&mut audio,44100);assert_eq!(audio,[123;256]);
    }
    #[test]
    fn long_capture''')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source = path.read_text().replace('    idle_probe: idle_probe::IdleProbe,', '    output_capture: bool,\n    idle_probe: idle_probe::IdleProbe,')
    source = source.replace('            idle_probe: idle_probe::IdleProbe::default(),', '            output_capture: false,\n            idle_probe: idle_probe::IdleProbe::default(),')
    source = source.replace('self.idle_probe.stop();', 'self.idle_probe.stop(); self.output_capture=false;')
    source = source.replace('if self.chains.worker_profile.enabled || self.chains.thread_profile.enabled { self.profile.enabled', 'if self.output_capture || self.chains.worker_profile.enabled || self.chains.thread_profile.enabled { self.profile.enabled')
    source = source.replace('if self.idle_probe.active {', 'if self.idle_probe.active || self.output_capture {')
    source = source.replace('if self.idle_probe.active &&', 'if (self.idle_probe.active || self.output_capture) &&')
    source = source.replace('"tcapture" | "icapture")', '"tcapture" | "icapture" | "ocapture")')
    source = replace_once(source, '            "icapture" => {', '''            "ocapture" => {
                self.chains.worker_profile.stop(); self.chains.thread_profile.stop();
                pressure_trace::stop(); self.idle_probe.stop(); self.output_capture=false;
                if !self.engine.playing {
                    self.profile.start_output_capture(); self.tone_check.start_output();self.output_capture=true;
                }
            }
            "icapture" => {''')
    source = source.replace('    #[test]\n    fn idle_probe_lifecycle', '''    #[test]
    fn output_capture_cancels_on_input_stop_and_deadline() {
        let _lock=crate::midi_out::test_guard();
        let mut instance=Instance::new();
        for command in ["non 0 60 100", "aprof_off"] {
            instance.set_param("cmd","ocapture");assert!(instance.output_capture);
            instance.set_param("cmd",command);assert!(!instance.output_capture);assert_eq!(instance.tone_check.state,3);
        }
        instance.set_param("cmd","ocapture");instance.profile.enabled=false;
        instance.render(&mut [0i16;256]);assert!(!instance.output_capture);
        assert_eq!(instance.tone_check.state,3);
    }
    #[test]
    fn idle_probe_lifecycle''')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/audio_profile.rs'
    source = path.read_text().replace('    pub fn start_idle_capture', '    pub fn start_output_capture(&mut self) { self.start(); self.capture_limit_ns=15_000_000_000; }\n    pub fn start_idle_capture')
    path.write_text(source)
