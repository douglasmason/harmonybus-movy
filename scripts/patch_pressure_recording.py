"""Store note-relative poly pressure and replay it before HarmonyBus arp ticks."""
from pathlib import Path
import re
from patch_responsive_persistence import replace_once


def patch_pressure_recording(root: Path) -> None:
    """Extend notes, capture, persistence and MIDI playback with pressure curves."""
    path: Path = root / 'engine/crates/seq-core/src/clip.rs'
    source: str = path.read_text()
    source = replace_once(source, '#[derive(Debug, Clone, Copy, PartialEq)]\npub struct Note', '#[derive(Debug, Clone, PartialEq)]\npub struct Note')
    source = replace_once(source, '    pub vel: u8,', '    pub vel: u8,\n    /// Sparse (ticks after note start, poly-pressure) curve.\n    pub pressure: Vec<(u32, u8)>,')
    source = source.replace('rendered: n.rendered,', 'rendered: n.rendered, pressure: n.pressure.clone(),')
    source = source.replace('rendered: false,', 'rendered: false, pressure: Vec::new(),').replace('rendered: false }', 'rendered: false, pressure: Vec::new() }')
    source = source.replace('*c.notes.iter().find(|n| n.pitch == pitch).expect("the note was not added")', 'c.notes.iter().find(|n| n.pitch == pitch).expect("the note was not added").clone()')
    source = re.sub(r'(let \w+ = [^;\n]*\.notes\[[^\]]+\]);', r'\1.clone();', source)
    source = re.sub(r'\*c\.notes\.([^;\n]+);', r'c.notes.\1.clone();', source)
    path.write_text(source)
    path = root / 'engine/crates/seq-core/src/clip_tools.rs'
    source = path.read_text().replace('rendered: false }', 'rendered: false, pressure: Vec::new() }')
    path.write_text(source)
    path = root / 'engine/crates/seq-core/src/engine.rs'
    source = path.read_text()
    source = replace_once(source, '    NoteOff { track: u8, pitch: u8 },', '    NoteOff { track: u8, pitch: u8 },\n    PolyPressure { track: u8, pitch: u8, value: u8 },')
    source = replace_once(source, 'struct RecPending {', 'struct RecPending {\n    pressure: Vec<(u32, u8)>,')
    source = replace_once(source, '#[derive(Debug, Clone, Copy)]\nstruct Gate {', '#[derive(Debug, Clone)]\nstruct Gate {\n    pressure: Vec<(u32, u8)>,\n    pressure_index: usize,\n    elapsed: u32,')
    source = replace_once(source, '#[derive(Clone, Copy)]\nstruct ClipboardNote {', '#[derive(Clone)]\nstruct ClipboardNote {\n    pressure: Vec<(u32, u8)>,')
    source = replace_once(source, '            .map(|n| ClipboardNote {', '            .map(|n| ClipboardNote {\n                pressure: n.pressure.clone(),')
    source = replace_once(source, '        for cn in cb {\n            clip.add_note_raw(', '        for cn in cb {\n            let before = clip.notes.len();\n            clip.add_note_raw(')
    source = replace_once(source, '                cn.vel,\n            );', '                cn.vel,\n            );\n            if clip.notes.len()>before { clip.notes.last_mut().unwrap().pressure=cn.pressure; }')
    source = replace_once(source, '        self.rec_pending.push(RecPending {', '        self.rec_pending.push(RecPending {\n            pressure: Vec::new(),')
    source = replace_once(source, '        if p.rendered&&clip.notes.len()>count {', '''        if clip.notes.len()>count {
            clip.notes.last_mut().unwrap().pressure=p.pressure.into_iter()
                .filter(|(offset,_)| *offset<gate).collect();
        }
        if p.rendered&&clip.notes.len()>count {''')
    source = replace_once(source, '    /// Capture only the post-HB event stream for a generated conductor note.', '''    /// Record pressure for the owned input note, including a held recording tail.
    pub fn live_poly_pressure(&mut self, track: usize, pitch: u8, value: u8) {
        if track>=NUM_TRACKS { return; }
        let now=self.preroll_offset().map(i64::from).unwrap_or(self.tracks[track].pos_tick as i64);
        let cycle=self.tracks[track].cycle;
        let pending=self.rec_pending.iter_mut().chain(self.rec_tail.iter_mut())
            .filter(|note| note.track==track&&note.pitch==pitch&&!note.rendered).last();
        let Some(note)=pending else { return; };
        let span=self.tracks[track].clips[note.slot].length_ticks().max(1) as i64;
        let offset=(cycle.wrapping_sub(note.start_cycle).min(64) as i64*span
            +now-note.start_tick.max(0) as i64).max(0) as u32;
        let value=value.min(127);
        if let Some(last)=note.pressure.last_mut() {
            if last.0==offset { last.1=value; return; }
            if last.1==value { return; }
        }
        // Bound one held gesture while retaining the latest pressure on saturation.
        if note.pressure.len()<4096 { note.pressure.push((offset,value)); }
        else { *note.pressure.last_mut().unwrap()=(offset,value); }
    }

    /// Capture only the post-HB event stream for a generated conductor note.''')
    source = replace_once(source, '            gi += 1;\n        }\n        {\n            let muted', '''            if self.gates[gi].track==ti as u8 {
                let gate=&mut self.gates[gi];
                gate.elapsed+=1;
                while let Some(&(offset,value))=gate.pressure.get(gate.pressure_index) {
                    if offset>gate.elapsed { break; }
                    if !self.tracks[ti].muted {
                        out.push(OutEvent::PolyPressure {track:gate.track,pitch:gate.pitch,value});
                    }
                    gate.pressure_index+=1;
                }
            }
            gi += 1;
        }
        {
            let muted''')
    source = replace_once(source, '                        let n = self.tracks[ti].clips[slot].notes[ni];', '                        let n = &self.tracks[ti].clips[slot].notes[ni];')
    source = replace_once(source, '                        // Claimed before the trig decision:', '                        let n = n.clone();\n                        // Claimed before the trig decision:')
    source = replace_once(source, '                        self.gates.push(Gate {', '''                        let mut pressure_index=0;
                        while let Some(&(offset,value))=n.pressure.get(pressure_index) {
                            if offset>0 { break; }
                            out.push(OutEvent::PolyPressure {track:ti as u8,pitch:emit_pitch,value});
                            pressure_index+=1;
                        }
                        self.gates.push(Gate {
                            pressure:n.pressure, pressure_index, elapsed:0,''')
    source = re.sub(r'(let \w+ = [^;\n]*\.notes\[[^\]]+\]);', r'\1.clone();', source)
    source = re.sub(r'(let \w+ = )\*([^;\n]*\.notes\.[^;\n]*);', r'\1\2.clone();', source)
    path.write_text(source)
    path = root / 'engine/crates/seq-core/src/persist.rs'
    source = path.read_text()
    source = replace_once(source, '            if !c.locks.is_empty() {', '''            for (index,note) in c.notes.iter().enumerate() {
                if !note.pressure.is_empty() {
                    s.push_str(&format!("pa {} {} {}",ti,ci,index));
                    for (offset,value) in &note.pressure { s.push_str(&format!(" {}:{}",offset,value)); }
                    s.push('\\n');
                }
            }
            if !c.locks.is_empty() {''')
    source = replace_once(source, '            Some("cl") => load_clip(engine, &mut it),', '''            Some("cl") => load_clip(engine, &mut it),
            Some("pa") => {
                let track=it.next().and_then(|v| v.parse::<usize>().ok());
                let slot=it.next().and_then(|v| v.parse::<usize>().ok());
                let index=it.next().and_then(|v| v.parse::<usize>().ok());
                if let (Some(track),Some(slot),Some(index))=(track,slot,index) {
                    if let Some(note)=engine.tracks.get_mut(track)
                        .and_then(|track| track.clips.get_mut(slot)).and_then(|clip| clip.notes.get_mut(index)) {
                        note.pressure.clear();
                        for event in it.take(4096) {
                            let Some((offset,value))=event.split_once(':') else { continue; };
                            let (Ok(offset),Ok(value))=(offset.parse::<u32>(),value.parse::<u8>()) else { continue; };
                            if offset>=note.gate||value>127 { continue; }
                            if note.pressure.last().is_some_and(|last| last.0>=offset) { continue; }
                            note.pressure.push((offset,value));
                        }
                    }
                }
            }''')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source = path.read_text()
    source = replace_once(source, '                        self.chains.on_midi(chain, &[0xA0, pitch, pressure], MOVE_MIDI_SOURCE_INTERNAL);', '''                        self.engine.live_poly_pressure(chain,pitch,pressure);
                        self.chains.on_midi(chain, &[0xA0, pitch, pressure], MOVE_MIDI_SOURCE_INTERNAL);''')
    source = replace_once(source, '                OutEvent::Click { accent } => {', '''                OutEvent::PolyPressure { track,pitch,value } => {
                    match chain_for(track,self.movy_tracks) {
                        None => { host::midi_send_internal(0xA0|track,pitch,value); }
                        Some(chain) => { self.chains.on_midi(chain,&[0xA0,pitch,value],MOVE_MIDI_SOURCE_INTERNAL); }
                    }
                }
                OutEvent::Click { accent } => {''')
    path.write_text(source)
    # Capture ON commands must reach the engine before same-tick pressure.
    path = root / 'src/track/pad-route.ts'
    source = path.read_text()
    pressure_block: str = '''    if (pressure.size) {
        send('padpressure', Array.from(pressure, ([pad, value]) => pad + ',' + value).join(';'));
        pressure.clear();
    }
'''
    assert pressure_block in source
    source = source.replace(pressure_block,'')
    source += '\nexport function flushPadPressure(send: (key: string, value: string) => void): void {\n'+pressure_block+'}\n'
    path.write_text(source)
    path = root / 'src/seq/engine.ts'
    source = path.read_text().replace('resetPadRoute, syncPadRoute','resetPadRoute, syncPadRoute, flushPadPressure')
    source = replace_once(source, '    seqCmdFlush();', '    seqCmdFlush();\n    flushPadPressure(engineSet);')
    path.write_text(source)
    path = root / 'browser-test/logic/tracks-chain.mjs'
    source = path.read_text().replace('engineOwnsPads, queuePadPressure','engineOwnsPads, flushPadPressure, queuePadPressure')
    source = source.replace('  syncPadRoute(send);\n  eq(\'pressure coalesces', '  syncPadRoute(send); flushPadPressure(send);\n  eq(\'pressure coalesces')
    path.write_text(source)

    path = root / 'engine/crates/seq-core/src/engine.rs'
    source = path.read_text()
    source += (Path(__file__).resolve().parent.parent / 'integration/pressure-recording.rs').read_text()
    path.write_text(source)
