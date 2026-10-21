"""Extend the existing CPU page with opt-in whole-callback stage timing."""
import base64
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_audio_profile(root: Path) -> None:
    """Install fixed-size timing counters and reuse the normal status poll."""
    assets: Path = Path(__file__).resolve().parent.parent / 'integration/audio-profile'
    for name in ('cpu-movy-tracks', 'cpu-schwung-tracks', 'cpu-overscale', 'cpu-empty', 'cpu-sends', 'cpu-sends-quiet'):
        (root / 'browser-test/screenshots/baseline' / (name + '.png')).write_bytes(
            base64.b64decode((assets / (name + '.png.b64')).read_text()))
    (root / 'src/seq/preview-test.ts').write_text((assets / 'preview-test.ts').read_text())
    (root / 'src/renderer/preview-test-view.ts').write_text((assets / 'preview-test-view.ts').read_text())
    (root / 'browser-test/hb-audio-profile.mjs').write_text((assets / 'hb-audio-profile.mjs').read_text())
    (root / 'engine/crates/movy-dsp/src/audio_profile.rs').write_text((assets / 'audio_profile.rs').read_text())
    (root / 'engine/crates/movy-dsp/src/tone_check.rs').write_text((assets / 'tone_check.rs').read_text())
    path: Path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source: str = path.read_text()
    source = replace_once(source, 'mod click;', 'mod click;\nmod audio_profile;\nmod tone_check;')
    source = replace_once(source, '            "cmd" => {', '            "cmd" => {\n                for operation in val.split(\';\').map(str::trim) {\n                    if matches!(operation, "cpurst" | "cpulog" | "aprof_on" | "aprof_off" | "acapture") {\n                        self.set_param(operation, "1");\n                    }\n                }')
    source = replace_once(source, '    blocks: u64,', '    profile: audio_profile::AudioProfile,\n    tone_check: tone_check::ToneCheck,\n    blocks: u64,')
    source = replace_once(source, '            blocks: 0,', '            profile: audio_profile::AudioProfile::default(),\n            tone_check: tone_check::ToneCheck::default(),\n            blocks: 0,')
    source = replace_once(source, '            "cpurst" => {', '            "acapture" => { self.profile.start_capture(); self.tone_check.start(); }\n            "aprof_on" => { self.tone_check.cancel(); self.profile.start(); }\n            "aprof_off" => { self.profile.enabled = false; self.tone_check.cancel(); }\n            "cpurst" => {\n                if self.profile.enabled { self.profile.start(); }')
    source = replace_once(source, 's.push_str(&self.chains.cost_status());', 's.push_str(&self.chains.cost_status());\n                s.push_str(&self.profile.status());\n                s.push_str(&self.tone_check.status());')
    source = replace_once(source, 'host::log(&format!("cpu:{}", self.chains.cost_status()));', 'host::log(&format!("cpu:{}{}{}", self.chains.cost_status(), self.profile.status(), self.tone_check.status()));')
    source = replace_once(source, '        self.blocks += 1;', '        let mut profile_stamp = self.profile.begin();\n        let mut profile_spans = [0u64; 7];\n        self.blocks += 1;')
    source = replace_once(source, '        if let Some((running, beat, bpm)) = host::transport_snapshot() {', '        self.profile.mark(&mut profile_stamp, &mut profile_spans, 0);\n        if let Some((running, beat, bpm)) = host::transport_snapshot() {')
    source = replace_once(source, '        // Musical metadata changes', '        self.profile.mark(&mut profile_stamp, &mut profile_spans, 1);\n        // Musical metadata changes')
    source = replace_once(source, '        self.engine.shared_transport(&mut self.out);', '        self.profile.mark(&mut profile_stamp, &mut profile_spans, 2);\n        self.engine.shared_transport(&mut self.out);')
    source = replace_once(source, '        // Every conductor sees', '        self.profile.mark(&mut profile_stamp, &mut profile_spans, 3);\n        // Every conductor sees')
    source = replace_once(source, '        self.click.render(out_audio);', '        self.profile.mark(&mut profile_stamp, &mut profile_spans, 4);\n        self.click.render(out_audio);')
    source = replace_once(source, '        self.chains.render(out_audio);', '        self.profile.mark(&mut profile_stamp, &mut profile_spans, 5);\n        self.chains.render(out_audio);')
    source = replace_once(source, '        hb_record::QUEUE.drain(|_,_,_,_|{});', '        hb_record::QUEUE.drain(|_,_,_,_|{});\n        self.tone_check.render(out_audio, host::sample_rate());\n        self.tone_check.verify(out_audio);\n        self.profile.mark(&mut profile_stamp, &mut profile_spans, 6);\n        self.profile.finish(profile_spans, out_audio.len()/2, host::sample_rate(), self.chains.profile_top());\n        if !self.profile.enabled { self.tone_check.cancel(); }')
    path.write_text(source)
    path = root / 'src/seq/state.ts'
    source = path.read_text().replace('    cpuCost: string;', '    cpuTone: string;\n    cpuRequests: string;\n    cpuProfile: string;\n    cpuCost: string;').replace("        cpuCost: '',", "        cpuTone: '',\n        cpuRequests: '',\n        cpuProfile: '',\n        cpuCost: '',")
    path.write_text(source)
    path = root / 'src/seq/engine.ts'
    source = path.read_text().replace("    seqState.cpuCost = '';", "    seqState.cpuTone = '';\n    seqState.cpuRequests = '';\n    seqState.cpuProfile = '';\n    seqState.cpuCost = '';")
    source = source.replace("else if (key === 'chcost')", "else if (key === 'tonecheck') seqState.cpuTone = val;\n        else if (key === 'aprof') seqState.cpuProfile = val;\n        else if (key === 'rprof') seqState.cpuRequests = val;\n        else if (key === 'chcost')")
    path.write_text(source)
    path = root / 'src/seq/cpu-page.ts'
    source = path.read_text().replace('export function cpuPageActive()', 'export const cpuDetail = { page: 0 };\nexport function toggleCpuDetail(): void { cpuDetail.page = (cpuDetail.page + 1) % 3; }\n\nexport function cpuPageActive()')
    source = source.replace("    seqCmd('cpurst');", "    seqCmd('cpurst');\n    seqCmd('aprof_on');")
    source = source.replace('export function clearCpuPage(): void {}', "export function clearCpuPage(): void {\n    if (cpuPageActive()) seqCmd('aprof_off');\n    cpuDetail.page = 0;\n}")
    source = "import { cancelPreviewTest, previewTestVisible, keepQuickCapture } from './preview-test.js';\n" + source
    source = replace_once(source, 'export function toggleCpuDetail(): void {', 'export function toggleCpuDetail(): void { if (previewTestVisible()) return;')
    source = replace_once(source, 'export function openCpuPage(): void {', 'export function openCpuPage(): void {\n    if (keepQuickCapture()) { openParamPage(VIEW_CPU); return; }\n    cancelPreviewTest();')
    source = replace_once(source, 'export function clearCpuPage(): void {', 'export function clearCpuPage(): void {\n    if (keepQuickCapture()) { cpuDetail.page = 0; return; }\n    cancelPreviewTest();')
    path.write_text(source)
    path = root / 'src/midi/router.ts'
    source = path.read_text().replace("import { cpuPageActive }", "import { cpuPageActive, toggleCpuDetail }")
    source = replace_once(source, 'if (cpuPageActive()) return;   // sixteen columns fit; nothing to scroll', 'if (cpuPageActive()) { toggleCpuDetail(); appState.dirty = true; return; }')
    source = "import { clickPreviewTest } from '../seq/preview-test.js';\n" + source
    source = replace_once(source, 'if (flagsPageActive()) return;', 'if (flagsPageActive() || cpuPageActive()) return;')
    source = replace_once(source, 'if (d1 === MoveMainButton && d2 > 0) {', 'if (d1 === MoveMainButton && d2 > 0) {\n        if (cpuPageActive()) { clickPreviewTest(Date.now(), appState.shiftHeld, !appState.shiftHeld); return; }')
    path.write_text(source)
    path = root / 'src/renderer/cpu-view.ts'
    source = path.read_text()
    source = "import { renderPreviewTest } from './preview-test-view.js';\nimport { cpuDetail } from '../seq/cpu-page.js';\nimport { seqState } from '../seq/state.js';\n" + source
    source = replace_once(source, '    clear_screen();', '''    clear_screen();
    if (cpuDetail.page === 2) {
        const values = seqState.cpuRequests.split(',');
        const compactKey = (key: string): string => key.replace(/^ch(\\d+):midi_fx(\\d+):/, (_, track, slot) => 'T' + (Number(track)+1) + '/FX' + slot + ':').toUpperCase().replace(/_/g, '-').slice(0, 31);
        drawHeader('UI/MIDI PEAK', 'US');
        fontPrint5x3(0, 9, 'READ ' + (values[3] || 0), 1);
        fontPrint5x3(0, 17, compactKey(values[4] || '-'), 1);
        fontPrint5x3(0, 25, 'WRITE ' + (values[5] || 0), 1);
        fontPrint5x3(0, 33, compactKey(values[6] || '-'), 1);
        fontPrint5x3(0, 41, 'MIDI ' + (values[7] || 0), 1);
        fontPrint5x3(0, 49, 'BURST ' + (values[1] || 0) + ' / ' + (values[2] || 0) + ' CALLS', 1);
        fontPrint5x3(0, 59, 'BETWEEN RENDERS - JOG:TRACKS', 1);
        return;
    }
    if (cpuDetail.page === 1) {
        const values = seqState.cpuProfile.split(',').map(Number);
        drawHeader('AUDIO PEAK', (values[2] || 0) + ' OVER');
        const names = ['INPUT/CONFIG','SEQUENCER','CLIP METADATA','MIDI/CONTEXT','HB PREPARE','CLICK/LOAD','CHAIN RENDER'];
        fontPrint5x3(0, 9, 'WORST ' + (values[4] || 0) + '/' + (values[5] || 0) + 'US', 1);
        for (let index = 0; index < names.length; index++) {
            fontPrint5x3(0, 17 + index * 6, names[index], 1);
            const value = String(values[6 + index] || 0);
            fontPrint5x3(W - fontWidth5x3(value), 17 + index * 6, value, 1);
        }
        fontPrint5x3(0, 59, 'PEAK T' + (values[20] || '-') + ' ' + (values[21] || 0) + 'US JOG:MORE', 1);
        return;
    }''')
    source = replace_once(source, '    clear_screen();', '    clear_screen();\n    if (renderPreviewTest()) return;')
    source = replace_once(source, "drawHeader('CPU',", "drawHeader('CPU CLICK:TEST',")
    path.write_text(source)
    path = root / 'src/app/tick.ts'
    source = path.read_text().replace("import { cpuPageActive }", "import { cpuPageActive, cpuDetail }")
    source = source.replace("+ '|' + seqState.cpuSend;", "+ '|' + seqState.cpuSend + ('|' + cpuDetail.page + (cpuDetail.page === 1 ? '|' + seqState.cpuProfile : cpuDetail.page === 2 ? '|' + seqState.cpuRequests : ''));")
    source = source.replace("+ vm.scaleUs + '|' + cols.join(',') + '|' + snd.join(',');", "+ vm.scaleUs + '|' + cols.join(',') + '|' + snd.join(',') + ('|' + cpuDetail.page + (cpuDetail.page === 1 ? '|' + seqState.cpuProfile.split(',').slice(2).join(',') : cpuDetail.page === 2 ? '|' + seqState.cpuRequests : ''));")
    source = "import { tickPreviewTest, previewTestVisible } from '../seq/preview-test.js';\n" + source
    source = replace_once(source, 'export function tick(): void {', 'export function tick(): void {\n    tickPreviewTest();')
    source = replace_once(source, 'if (!cpuPageActive()) return;', 'if (!cpuPageActive() || previewTestVisible()) return;')
    path.write_text(source)
    path = root / 'src/app/unload.ts'
    source = "import { cancelPreviewTest } from '../seq/preview-test.js';\n" + path.read_text()
    source = replace_once(source, 'export function onUnload(): void {', 'export function onUnload(): void {\n    cancelPreviewTest();')
    path.write_text(source)
    path = root / 'build/browser.mjs'
    source = replace_once(path.read_text(), '    entryPoints: [', "    entryPoints: [\n        resolve(root, 'src/seq/preview-test.ts'),\n        resolve(root, 'src/renderer/preview-test-view.ts'),")
    path.write_text(source)
