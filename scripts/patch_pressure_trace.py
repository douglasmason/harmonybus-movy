"""Add an opt-in pressure isolation capture to the existing thread diagnostic."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_pressure_trace(root: Path) -> None:
    """Keep pressure gating and restoration native; reuse the single-report UI."""
    assets: Path = Path(__file__).resolve().parent.parent / 'integration/audio-profile'
    native: Path = root / 'engine/crates/movy-dsp/src'
    (native / 'pressure_trace.rs').write_text((assets / 'pressure_trace.rs').read_text())
    path: Path = native / 'lib.rs'
    source: str = path.read_text().replace('mod thread_profile;', 'mod thread_profile;\nmod pressure_trace;')
    source = source.replace('self.chains.thread_profile.stop();', 'self.chains.thread_profile.stop(); pressure_trace::stop();')
    source = replace_once(source, 'self.chains.thread_profile.start();', 'self.chains.thread_profile.start(); pressure_trace::start();')
    source = replace_once(source, 'self.tone_check.start_long();', 'self.tone_check.start_pressure();')
    source = replace_once(source, '        let thread_block_start', '        pressure_trace::block();\n        let thread_block_start')
    source = replace_once(source, 's.push_str(&self.chains.thread_profile.status());', 's.push_str(&self.chains.thread_profile.status()); s.push_str(&pressure_trace::status());')
    source = replace_once(source, '                if let Some((chain, pitch, vel, on)) = i.pads.route', '                pressure_trace::note(0, status & 15, status, d1, d2);\n                if let Some((chain, pitch, vel, on)) = i.pads.route')
    source = replace_once(source, '                    i.chains.on_midi(chain, &m, MOVE_MIDI_SOURCE_INTERNAL);', '                    pressure_trace::note(2, chain as u8, m[0], m[1], m[2]);\n                    i.chains.on_midi(chain, &m, MOVE_MIDI_SOURCE_INTERNAL);')
    source = replace_once(source, '        if event.status == 0xa0 {', '        if event.status == 0xa0 && !pressure_trace::pressure(track as u8,event.pitch,event.value) { self.engine.live_poly_pressure(track,event.pitch,event.value); return; }\n        if event.status == 0xa0 {')
    source = replace_once(source, '                        self.engine.live_poly_pressure(chain,pitch,pressure);', '                        self.engine.live_poly_pressure(chain,pitch,pressure);\n                        if !pressure_trace::pressure(chain as u8,pitch,pressure) { continue; }')
    source = replace_once(source, '                OutEvent::PolyPressure { track,pitch,value } => {', '                OutEvent::PolyPressure { track,pitch,value } => {\n                    if !pressure_trace::pressure(track,pitch,value) { continue; }')
    path.write_text(source)
    path = native / 'chain_host.rs'
    source = path.read_text()
    source = replace_once(source, '        let status = packet[1] & 0xf0;', '        let status = packet[1] & 0xf0;\n        if packet[0] >> 4 == 2 { crate::pressure_trace::note(6,packet[1]&15,packet[1],packet[2],packet[3]); }')
    path.write_text(source)
    path = native / 'audio_profile.rs'
    source = path.read_text().replace('65_000_000_000', '85_000_000_000').replace('from_secs(65)', 'from_secs(85)').replace('at_65_seconds', 'at_85_seconds')
    path.write_text(source)
    path = native / 'tone_check.rs'
    source = path.read_text().replace('    pub fn start_long', '    pub fn start_pressure(&mut self) { self.start(); self.seconds = 80; }\n    pub fn start_long')
    path.write_text(source)
    for name in ('state.ts','engine.ts'):
        path = root / 'src/seq' / name
        source = path.read_text()
        if name == 'state.ts':
            source = source.replace('    cpuThread: string;', '    cpuPressure: string;\n    cpuThread: string;').replace("        cpuThread: '',", "        cpuPressure: '',\n        cpuThread: '',")
        else:
            source = source.replace("    seqState.cpuThread = '';", "    seqState.cpuPressure = '';\n    seqState.cpuThread = '';")
            source = source.replace("else if (key === 'threadprof')", "else if (key === 'pressuretrace') seqState.cpuPressure = val;\n        else if (key === 'threadprof')")
        path.write_text(source)
