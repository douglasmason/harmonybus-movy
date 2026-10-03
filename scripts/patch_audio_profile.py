"""Extend the existing CPU page with opt-in whole-callback stage timing."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_audio_profile(root: Path) -> None:
    """Install fixed-size timing counters and reuse the normal status poll."""
    assets: Path = Path(__file__).resolve().parent.parent / 'integration/audio-profile'
    (root / 'engine/crates/movy-dsp/src/audio_profile.rs').write_text((assets / 'audio_profile.rs').read_text())
    path: Path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source: str = path.read_text()
    source = replace_once(source, 'mod click;', 'mod click;\nmod audio_profile;')
    source = replace_once(source, '            "cmd" => {', '            "cmd" => {\n                for operation in val.split(\';\').map(str::trim) {\n                    if matches!(operation, "cpurst" | "cpulog" | "aprof_on" | "aprof_off") {\n                        self.set_param(operation, "1");\n                    }\n                }')
    source = replace_once(source, '    blocks: u64,', '    profile: audio_profile::AudioProfile,\n    blocks: u64,')
    source = replace_once(source, '            blocks: 0,', '            profile: audio_profile::AudioProfile::default(),\n            blocks: 0,')
    source = replace_once(source, '            "cpurst" => {', '            "aprof_on" => { self.profile.start(); }\n            "aprof_off" => { self.profile.enabled = false; }\n            "cpurst" => {\n                if self.profile.enabled { self.profile.start(); }')
    source = replace_once(source, 's.push_str(&self.chains.cost_status());', 's.push_str(&self.chains.cost_status());\n                s.push_str(&self.profile.status());')
    source = replace_once(source, 'host::log(&format!("cpu:{}", self.chains.cost_status()));', 'host::log(&format!("cpu:{}{}", self.chains.cost_status(), self.profile.status()));')
    source = replace_once(source, '        self.blocks += 1;', '        let mut profile_stamp = self.profile.stamp();\n        let mut profile_spans = [0u64; 7];\n        self.blocks += 1;')
    source = replace_once(source, '        if let Some((running, beat, bpm)) = host::transport_snapshot() {', '        self.profile.mark(&mut profile_stamp, &mut profile_spans, 0);\n        if let Some((running, beat, bpm)) = host::transport_snapshot() {')
    source = replace_once(source, '        // Musical metadata changes', '        self.profile.mark(&mut profile_stamp, &mut profile_spans, 1);\n        // Musical metadata changes')
    source = replace_once(source, '        self.engine.shared_transport(&mut self.out);', '        self.profile.mark(&mut profile_stamp, &mut profile_spans, 2);\n        self.engine.shared_transport(&mut self.out);')
    source = replace_once(source, '        // Every conductor sees', '        self.profile.mark(&mut profile_stamp, &mut profile_spans, 3);\n        // Every conductor sees')
    source = replace_once(source, '        self.click.render(out_audio);', '        self.profile.mark(&mut profile_stamp, &mut profile_spans, 4);\n        self.click.render(out_audio);')
    source = replace_once(source, '        self.chains.render(out_audio);', '        self.profile.mark(&mut profile_stamp, &mut profile_spans, 5);\n        self.chains.render(out_audio);')
    source = replace_once(source, '        hb_record::QUEUE.drain(|_,_,_,_|{});', '        hb_record::QUEUE.drain(|_,_,_,_|{});\n        self.profile.mark(&mut profile_stamp, &mut profile_spans, 6);\n        self.profile.finish(profile_spans, out_audio.len()/2, host::sample_rate());')
    path.write_text(source)
    path = root / 'src/seq/state.ts'
    source = path.read_text().replace('    cpuCost: string;', '    cpuProfile: string;\n    cpuCost: string;').replace("        cpuCost: '',", "        cpuProfile: '',\n        cpuCost: '',")
    path.write_text(source)
    path = root / 'src/seq/engine.ts'
    source = path.read_text().replace("    seqState.cpuCost = '';", "    seqState.cpuProfile = '';\n    seqState.cpuCost = '';")
    source = source.replace("else if (key === 'chcost')", "else if (key === 'aprof') seqState.cpuProfile = val;\n        else if (key === 'chcost')")
    path.write_text(source)
    path = root / 'src/seq/cpu-page.ts'
    source = path.read_text().replace('export function cpuPageActive()', 'export const cpuDetail = { active: false };\nexport function toggleCpuDetail(): void { cpuDetail.active = !cpuDetail.active; }\n\nexport function cpuPageActive()')
    source = source.replace("    seqCmd('cpurst');", "    seqCmd('cpurst');\n    seqCmd('aprof_on');")
    source = source.replace('export function clearCpuPage(): void {}', "export function clearCpuPage(): void {\n    if (cpuPageActive()) seqCmd('aprof_off');\n    cpuDetail.active = false;\n}")
    path.write_text(source)
    path = root / 'src/midi/router.ts'
    source = path.read_text().replace("import { cpuPageActive }", "import { cpuPageActive, toggleCpuDetail }")
    source = replace_once(source, 'if (cpuPageActive()) return;   // sixteen columns fit; nothing to scroll', 'if (cpuPageActive()) { toggleCpuDetail(); appState.dirty = true; return; }')
    path.write_text(source)
    path = root / 'src/renderer/cpu-view.ts'
    source = path.read_text()
    source = "import { cpuDetail } from '../seq/cpu-page.js';\nimport { seqState } from '../seq/state.js';\n" + source
    source = replace_once(source, '    clear_screen();', '''    clear_screen();
    if (cpuDetail.active) {
        const values = seqState.cpuProfile.split(',').map(Number);
        drawHeader('AUDIO PEAK', (values[2] || 0) + ' OVER');
        const names = ['INPUT/CONFIG','SEQUENCER','CLIP METADATA','MIDI/CONTEXT','HB PREPARE','CLICK/LOAD','CHAIN RENDER'];
        fontPrint5x3(0, 9, 'WORST ' + (values[4] || 0) + '/' + (values[5] || 0) + 'US', 1);
        for (let index = 0; index < names.length; index++) {
            fontPrint5x3(0, 17 + index * 6, names[index], 1);
            const value = String(values[6 + index] || 0);
            fontPrint5x3(W - fontWidth5x3(value), 17 + index * 6, value, 1);
        }
        fontPrint5x3(0, 59, '>70%: ' + (values[3] || 0) + '  DIAL: TRACKS', 1);
        return;
    }''')
    path.write_text(source)
    path = root / 'src/app/tick.ts'
    source = path.read_text().replace("import { cpuPageActive }", "import { cpuPageActive, cpuDetail }")
    source = source.replace("+ '|' + seqState.cpuSend;", "+ '|' + seqState.cpuSend + (cpuDetail.active ? '|' + seqState.cpuProfile : '');")
    source = source.replace("+ vm.scaleUs + '|' + cols.join(',') + '|' + snd.join(',');", "+ vm.scaleUs + '|' + cols.join(',') + '|' + snd.join(',') + (cpuDetail.active ? '|' + seqState.cpuProfile.split(',').slice(2,13).join(',') : '');")
    path.write_text(source)
